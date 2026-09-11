import { Op, Transaction, WhereOptions } from 'sequelize';
import {
  sequelize,
  Request,
  RiskAssessment,
  RiskFactor,
  User,
  Role,
  Department,
  WorkflowInstance,
  WorkflowInstanceStep,
  WorkflowDefinition,
  ApprovalAction,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { AUDIT_ACTIONS, RequestType, RequestStatus } from '../types/domain';
import { assessAndPersist, evaluateRisk } from './risk/riskEngine';
import { buildWorkflowPlan, createWorkflowInstance } from './workflow/workflowEngine';
import * as auditService from './auditService';
import { presentRequest } from '../utils/presenters';

const REQUESTER_INCLUDE = {
  model: User,
  as: 'requester',
  include: [
    { model: Role, as: 'role' },
    { model: Department, as: 'department' },
  ],
};

const RISK_INCLUDE = {
  model: RiskAssessment,
  as: 'riskAssessments',
  include: [{ model: RiskFactor, as: 'factors' }],
};

const WORKFLOW_INCLUDE = {
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
};

/** Pulls the next readable request number (REQ-1001, REQ-1002, ...) from a DB sequence. */
async function nextRequestNumber(transaction?: Transaction): Promise<string> {
  const [rows] = await sequelize.query("SELECT nextval('request_number_seq') AS value", {
    transaction,
  });
  const value = (rows as Array<{ value: string }>)[0].value;
  return `REQ-${value}`;
}

export interface CreateRequestInput {
  type: RequestType;
  title: string;
  description?: string | null;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export async function createRequest(userId: number, input: CreateRequestInput) {
  const request = await sequelize.transaction(async (transaction) => {
    const created = await Request.create(
      {
        requestNumber: await nextRequestNumber(transaction),
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount ?? 0,
        metadata: (input.metadata ?? {}) as Record<string, unknown>,
        requestedBy: userId,
        status: 'DRAFT',
      },
      { transaction }
    );

    await auditService.record(
      {
        userId,
        action: AUDIT_ACTIONS.REQUEST_CREATED,
        entityType: 'REQUEST',
        entityId: created.id,
        metadata: { requestNumber: created.requestNumber, type: created.type },
      },
      transaction
    );

    return created;
  });

  return getRequestById(request.id, { id: userId, role: 'EMPLOYEE' }, { skipAccessCheck: true });
}

export interface ListRequestFilters {
  status?: RequestStatus;
  type?: RequestType;
  search?: string;
  mine?: boolean;
}

/**
 * Employees see only their own requests. Approver roles and ADMIN see every
 * request; `mine=true` narrows that back down to their own.
 */
export async function listRequests(
  actor: { id: number; role: string },
  filters: ListRequestFilters = {}
) {
  const where: WhereOptions = {};
  const restrictedToOwn = actor.role === 'EMPLOYEE' || filters.mine === true;

  if (restrictedToOwn) Object.assign(where, { requestedBy: actor.id });
  if (filters.status) Object.assign(where, { status: filters.status });
  if (filters.type) Object.assign(where, { type: filters.type });
  if (filters.search) {
    Object.assign(where, {
      [Op.or]: [
        { title: { [Op.iLike]: `%${filters.search}%` } },
        { requestNumber: { [Op.iLike]: `%${filters.search}%` } },
      ],
    });
  }

  const requests = await Request.findAll({
    where,
    include: [REQUESTER_INCLUDE, RISK_INCLUDE, WORKFLOW_INCLUDE],
    order: [['createdAt', 'DESC']],
  });

  return requests.map((request) => presentRequest(request));
}

export async function findRequestModel(id: number) {
  const request = await Request.findByPk(id, {
    include: [REQUESTER_INCLUDE, RISK_INCLUDE, WORKFLOW_INCLUDE],
  });
  if (!request) throw ApiError.notFound(`Request ${id} not found`);
  return request;
}

/**
 * A request is visible to its owner, to ADMIN, and to any approver role that
 * appears in the request's workflow.
 */
function assertCanView(request: Request, actor: { id: number; role: string }) {
  if (request.requestedBy === actor.id) return;
  if (actor.role === 'ADMIN') return;

  const instance = (request.workflowInstances ?? [])[0];
  const rolesInWorkflow = (instance?.steps ?? []).map((step) => step.approverRole);
  if (rolesInWorkflow.includes(actor.role)) return;

  throw ApiError.forbidden('You do not have access to this request');
}

export async function getRequestById(
  id: number,
  actor: { id: number; role: string },
  options: { skipAccessCheck?: boolean } = {}
) {
  const request = await findRequestModel(id);
  if (!options.skipAccessCheck) assertCanView(request, actor);
  return presentRequest(request, { detailed: true });
}

export async function updateDraft(
  id: number,
  actor: { id: number; role: string },
  input: Partial<CreateRequestInput>
) {
  const request = await Request.findByPk(id);
  if (!request) throw ApiError.notFound(`Request ${id} not found`);
  if (request.requestedBy !== actor.id) {
    throw ApiError.forbidden('You can only edit your own requests');
  }
  if (request.status !== 'DRAFT' && request.status !== 'REJECTED') {
    throw ApiError.conflict(`A request in status ${request.status} can no longer be edited`);
  }

  await request.update({
    type: input.type ?? request.type,
    title: input.title ?? request.title,
    description: input.description ?? request.description,
    amount: input.amount ?? request.amount,
    metadata: (input.metadata ?? request.metadata) as Record<string, unknown>,
  });

  await auditService.record({
    userId: actor.id,
    action: AUDIT_ACTIONS.REQUEST_UPDATED,
    entityType: 'REQUEST',
    entityId: request.id,
    metadata: { requestNumber: request.requestNumber },
  });

  return getRequestById(request.id, actor);
}

/**
 * Submit pipeline: risk assessment -> workflow selection -> instance creation ->
 * first stage activated -> request moves to IN_REVIEW. All inside one transaction.
 */
export async function submitRequest(
  id: number,
  actor: { id: number; role: string },
  options: { resubmit?: boolean } = {}
) {
  await sequelize.transaction(async (transaction) => {
    const request = await Request.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!request) throw ApiError.notFound(`Request ${id} not found`);

    if (request.requestedBy !== actor.id) {
      throw ApiError.forbidden('You can only submit your own requests');
    }

    const allowedStatuses: RequestStatus[] = options.resubmit ? ['REJECTED', 'DRAFT'] : ['DRAFT'];
    if (!allowedStatuses.includes(request.status)) {
      throw ApiError.conflict(
        options.resubmit
          ? `Only a REJECTED or DRAFT request can be resubmitted (current status: ${request.status})`
          : `Only a DRAFT request can be submitted (current status: ${request.status})`
      );
    }

    // Any earlier attempt is closed out so the request has exactly one live workflow.
    await WorkflowInstance.update(
      { status: 'CANCELLED', completedAt: new Date() },
      { where: { requestId: request.id, status: 'IN_PROGRESS' }, transaction }
    );

    const { result: risk } = await assessAndPersist(
      {
        id: request.id,
        type: request.type,
        amount: Number(request.amount),
        metadata: request.metadata as Record<string, any>,
      },
      transaction
    );

    await auditService.record(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.RISK_CALCULATED,
        entityType: 'REQUEST',
        entityId: request.id,
        metadata: { score: risk.score, level: risk.level, factors: risk.factors.map((f) => f.factor) },
      },
      transaction
    );

    const plan = await buildWorkflowPlan({
      type: request.type,
      amount: Number(request.amount),
      metadata: request.metadata as Record<string, any>,
      riskLevel: risk.level,
      riskScore: risk.score,
    });

    const instance = await createWorkflowInstance(request.id, plan, transaction);

    await auditService.record(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.WORKFLOW_CREATED,
        entityType: 'WORKFLOW_INSTANCE',
        entityId: instance.id,
        metadata: {
          requestId: request.id,
          workflow: plan.name,
          steps: plan.steps.map((step) => step.approverRole),
        },
      },
      transaction
    );

    await request.update({ status: 'IN_REVIEW' }, { transaction });

    await auditService.record(
      {
        userId: actor.id,
        action: options.resubmit ? AUDIT_ACTIONS.REQUEST_RESUBMITTED : AUDIT_ACTIONS.REQUEST_SUBMITTED,
        entityType: 'REQUEST',
        entityId: request.id,
        metadata: { requestNumber: request.requestNumber, workflow: plan.name },
      },
      transaction
    );
  });

  return getRequestById(id, actor);
}

/** Risk + workflow preview for a request that does not exist yet. */
export async function simulate(input: {
  type: RequestType;
  amount?: number;
  metadata?: Record<string, any>;
}) {
  const risk = evaluateRisk({
    type: input.type,
    amount: input.amount ?? 0,
    metadata: input.metadata ?? {},
  });

  const plan = await buildWorkflowPlan({
    type: input.type,
    amount: Number(input.amount ?? 0),
    metadata: input.metadata ?? {},
    riskLevel: risk.level,
    riskScore: risk.score,
  });

  return {
    risk: {
      score: risk.score,
      level: risk.level,
      factors: risk.factors,
      engineVersion: risk.engineVersion,
    },
    workflow: {
      name: plan.name,
      description: plan.description,
      version: plan.version,
      steps: plan.steps.map((step) => ({
        stepOrder: step.stepOrder,
        name: step.name,
        approverRole: step.approverRole,
        approvalMode: step.approvalMode,
        required: step.required,
      })),
      path: plan.steps.map((step) => step.approverRole),
    },
  };
}

export async function statsFor(actor: { id: number; role: string }) {
  const requests = await Request.findAll({
    where: actor.role === 'EMPLOYEE' ? { requestedBy: actor.id } : {},
    attributes: ['id', 'status'],
  });

  const count = (status: RequestStatus) => requests.filter((r) => r.status === status).length;

  return {
    total: requests.length,
    draft: count('DRAFT'),
    pending: count('SUBMITTED') + count('IN_REVIEW'),
    approved: count('APPROVED') + count('COMPLETED'),
    rejected: count('REJECTED'),
  };
}
