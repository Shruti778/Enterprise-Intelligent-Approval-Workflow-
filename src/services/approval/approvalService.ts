import { Op, Transaction } from 'sequelize';
import {
  sequelize,
  ApprovalAction,
  Request,
  Role,
  Department,
  RiskAssessment,
  RiskFactor,
  User,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowInstanceStep,
} from '../../models';
import { ApiError } from '../../utils/ApiError';
import { AUDIT_ACTIONS } from '../../types/domain';
import * as auditService from '../auditService';
import { activateStage } from '../workflow/workflowEngine';
import { presentRequest } from '../../utils/presenters';

export interface Actor {
  id: number;
  role: string;
}

/**
 * Steps the caller can act on right now: PENDING, addressed to the caller's
 * role, on a live workflow, and not on a request the caller raised.
 */
export async function listPendingApprovals(actor: Actor) {
  const steps = await WorkflowInstanceStep.findAll({
    where: { status: 'PENDING', approverRole: actor.role },
    include: [
      {
        model: WorkflowInstance,
        as: 'instance',
        required: true,
        where: { status: 'IN_PROGRESS' },
        include: [
          { model: WorkflowDefinition, as: 'definition' },
          {
            model: Request,
            as: 'request',
            required: true,
            where: { requestedBy: { [Op.ne]: actor.id } },
            include: [
              {
                model: User,
                as: 'requester',
                include: [
                  { model: Role, as: 'role' },
                  { model: Department, as: 'department' },
                ],
              },
              { model: RiskAssessment, as: 'riskAssessments', include: [{ model: RiskFactor, as: 'factors' }] },
            ],
          },
        ],
      },
    ],
    order: [['createdAt', 'ASC']],
  });

  return steps.map((step) => {
    const request = step.instance?.request as Request;
    return {
      stepId: step.id,
      stepName: step.name,
      stepOrder: step.stepOrder,
      approverRole: step.approverRole,
      approvalMode: step.approvalMode,
      startedAt: step.startedAt,
      workflowInstanceId: step.workflowInstanceId,
      workflowName: step.instance?.definition?.name ?? null,
      request: request ? presentRequest(request) : null,
    };
  });
}

/** Loads the step and its workflow with a row lock held for the transaction. */
async function loadStepForUpdate(stepId: number, transaction: Transaction) {
  const step = await WorkflowInstanceStep.findByPk(stepId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!step) throw ApiError.notFound(`Approval step ${stepId} not found`);

  const instance = await WorkflowInstance.findByPk(step.workflowInstanceId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!instance) throw ApiError.notFound('Workflow instance not found');

  const request = await Request.findByPk(instance.requestId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!request) throw ApiError.notFound('Request not found');

  return { step, instance, request };
}

/** Backend-enforced authorization: only the step's own role may act on it. */
function assertCanAct(step: WorkflowInstanceStep, request: Request, actor: Actor) {
  if (step.approverRole !== actor.role) {
    throw ApiError.forbidden(
      `This step requires the ${step.approverRole} role; you are signed in as ${actor.role}`
    );
  }
  if (request.requestedBy === actor.id) {
    throw ApiError.forbidden('You cannot approve your own request');
  }
  if (step.status !== 'PENDING') {
    throw ApiError.conflict(`This step is ${step.status} and is no longer actionable`);
  }
}

/**
 * Advances the workflow after a step is approved.
 * A stage completes only when every required step sharing its step_order is
 * approved, which is what makes PARALLEL branches wait for each other.
 */
async function advanceWorkflow(
  instance: WorkflowInstance,
  request: Request,
  stepOrder: number,
  actor: Actor,
  transaction: Transaction
): Promise<'STAGE_PENDING' | 'ADVANCED' | 'COMPLETED'> {
  const siblings = await WorkflowInstanceStep.findAll({
    where: { workflowInstanceId: instance.id, stepOrder },
    transaction,
  });

  const stageComplete = siblings
    .filter((step) => step.required)
    .every((step) => step.status === 'APPROVED');

  if (!stageComplete) return 'STAGE_PENDING';

  const nextStep = await WorkflowInstanceStep.findOne({
    where: { workflowInstanceId: instance.id, stepOrder: { [Op.gt]: stepOrder }, status: 'WAITING' },
    order: [['stepOrder', 'ASC']],
    transaction,
  });

  if (nextStep) {
    await activateStage(instance.id, nextStep.stepOrder, transaction);
    instance.currentStep = nextStep.stepOrder;
    await instance.save({ transaction });
    return 'ADVANCED';
  }

  instance.status = 'APPROVED';
  instance.completedAt = new Date();
  instance.currentStep = null;
  await instance.save({ transaction });

  await request.update({ status: 'APPROVED' }, { transaction });

  await auditService.record(
    {
      userId: actor.id,
      action: AUDIT_ACTIONS.REQUEST_APPROVED,
      entityType: 'REQUEST',
      entityId: request.id,
      metadata: { requestNumber: request.requestNumber, workflowInstanceId: instance.id },
    },
    transaction
  );

  return 'COMPLETED';
}

export async function approveStep(stepId: number, actor: Actor, comment?: string | null) {
  const requestId = await sequelize.transaction(async (transaction) => {
    const { step, instance, request } = await loadStepForUpdate(stepId, transaction);

    if (instance.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`This workflow is already ${instance.status}`);
    }
    assertCanAct(step, request, actor);

    // History first: the action row is the permanent record of the decision.
    await ApprovalAction.create(
      {
        workflowStepId: step.id,
        actorId: actor.id,
        action: 'APPROVED',
        comment: comment?.trim() || null,
      },
      { transaction }
    );

    step.status = 'APPROVED';
    step.approverId = actor.id;
    step.completedAt = new Date();
    await step.save({ transaction });

    await auditService.record(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.APPROVAL_APPROVED,
        entityType: 'WORKFLOW_STEP',
        entityId: step.id,
        metadata: { requestId: request.id, stepName: step.name, role: step.approverRole },
      },
      transaction
    );

    await advanceWorkflow(instance, request, step.stepOrder, actor, transaction);

    return request.id;
  });

  return loadRequestView(requestId);
}

export async function rejectStep(stepId: number, actor: Actor, comment: string) {
  if (!comment || comment.trim().length === 0) {
    throw ApiError.badRequest('A comment is required when rejecting a request');
  }

  const requestId = await sequelize.transaction(async (transaction) => {
    const { step, instance, request } = await loadStepForUpdate(stepId, transaction);

    if (instance.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`This workflow is already ${instance.status}`);
    }
    assertCanAct(step, request, actor);

    await ApprovalAction.create(
      {
        workflowStepId: step.id,
        actorId: actor.id,
        action: 'REJECTED',
        comment: comment.trim(),
      },
      { transaction }
    );

    step.status = 'REJECTED';
    step.approverId = actor.id;
    step.completedAt = new Date();
    await step.save({ transaction });

    // A rejection ends the workflow; everything still open is closed as SKIPPED.
    await WorkflowInstanceStep.update(
      { status: 'SKIPPED', completedAt: new Date() },
      {
        where: {
          workflowInstanceId: instance.id,
          status: { [Op.in]: ['WAITING', 'PENDING'] },
          id: { [Op.ne]: step.id },
        },
        transaction,
      }
    );

    instance.status = 'REJECTED';
    instance.completedAt = new Date();
    instance.currentStep = null;
    await instance.save({ transaction });

    await request.update({ status: 'REJECTED' }, { transaction });

    await auditService.record(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.APPROVAL_REJECTED,
        entityType: 'WORKFLOW_STEP',
        entityId: step.id,
        metadata: { requestId: request.id, stepName: step.name, comment: comment.trim() },
      },
      transaction
    );

    await auditService.record(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.REQUEST_REJECTED,
        entityType: 'REQUEST',
        entityId: request.id,
        metadata: { requestNumber: request.requestNumber, rejectedAt: step.name },
      },
      transaction
    );

    return request.id;
  });

  return loadRequestView(requestId);
}

async function loadRequestView(requestId: number) {
  const request = await Request.findByPk(requestId, {
    include: [
      {
        model: User,
        as: 'requester',
        include: [
          { model: Role, as: 'role' },
          { model: Department, as: 'department' },
        ],
      },
      { model: RiskAssessment, as: 'riskAssessments', include: [{ model: RiskFactor, as: 'factors' }] },
      {
        model: WorkflowInstance,
        as: 'workflowInstances',
        include: [
          { model: WorkflowDefinition, as: 'definition' },
          {
            model: WorkflowInstanceStep,
            as: 'steps',
            include: [
              { model: User, as: 'approver', include: [{ model: Role, as: 'role' }] },
              {
                model: ApprovalAction,
                as: 'actions',
                include: [{ model: User, as: 'actor', include: [{ model: Role, as: 'role' }] }],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!request) throw ApiError.notFound('Request not found');
  return presentRequest(request, { detailed: true });
}

/** Count used by the approver dashboard badge. */
export async function pendingCount(actor: Actor): Promise<number> {
  const pending = await listPendingApprovals(actor);
  return pending.length;
}
