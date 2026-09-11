import { Transaction } from 'sequelize';
import {
  WorkflowDefinition,
  WorkflowRule,
  WorkflowStepDefinition,
  WorkflowInstance,
  WorkflowInstanceStep,
} from '../../models';
import { RequestType, RiskLevel, WorkflowPlan, WorkflowStepPlan } from '../../types/domain';
import { ApiError } from '../../utils/ApiError';
import { WorkflowMatchContext, definitionMatches, definitionPriority } from './ruleEvaluator';

export interface WorkflowSelectionInput {
  type: RequestType;
  amount: number;
  metadata: Record<string, any>;
  riskLevel: RiskLevel;
  riskScore: number;
}

/**
 * Picks the most specific ACTIVE workflow definition whose rules all match.
 * Ties are broken by the highest version, then the newest definition.
 */
export async function selectWorkflowDefinition(
  input: WorkflowSelectionInput,
  transaction?: Transaction
): Promise<WorkflowDefinition | null> {
  const definitions = await WorkflowDefinition.findAll({
    where: { status: 'ACTIVE' },
    include: [
      { model: WorkflowRule, as: 'rules' },
      { model: WorkflowStepDefinition, as: 'stepDefinitions' },
    ],
    order: [
      ['version', 'DESC'],
      ['id', 'DESC'],
      [{ model: WorkflowStepDefinition, as: 'stepDefinitions' }, 'step_order', 'ASC'],
      [{ model: WorkflowStepDefinition, as: 'stepDefinitions' }, 'id', 'ASC'],
    ],
    transaction,
  });

  const ctx: WorkflowMatchContext = {
    type: input.type,
    amount: Number(input.amount ?? 0),
    metadata: input.metadata ?? {},
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
  };

  const matches = definitions
    .filter((definition) => definitionMatches(definition.rules ?? [], ctx))
    .sort((a, b) => {
      const priorityDiff = definitionPriority(b.rules ?? []) - definitionPriority(a.rules ?? []);
      if (priorityDiff !== 0) return priorityDiff;
      return b.version - a.version;
    });

  return matches[0] ?? null;
}

/** Selection without any persistence - used by the simulator and the create form. */
export async function buildWorkflowPlan(input: WorkflowSelectionInput): Promise<WorkflowPlan> {
  const definition = await selectWorkflowDefinition(input);

  if (!definition) {
    throw ApiError.unprocessable(
      'No active workflow definition matches this request. Check the workflow configuration.'
    );
  }

  const steps: WorkflowStepPlan[] = (definition.stepDefinitions ?? [])
    .slice()
    .sort((a, b) => a.stepOrder - b.stepOrder || a.id - b.id)
    .map((step) => ({
      stepDefinitionId: step.id,
      stepOrder: step.stepOrder,
      name: step.name,
      approverRole: step.approverRole,
      approvalMode: step.approvalMode,
      required: step.required,
    }));

  return {
    definitionId: definition.id,
    name: definition.name,
    description: definition.description,
    version: definition.version,
    steps,
  };
}

/**
 * Materialises a workflow instance for a request and activates the first stage.
 * Every step definition is copied so later edits to the blueprint cannot
 * rewrite the history of a workflow that is already running.
 */
export async function createWorkflowInstance(
  requestId: number,
  plan: WorkflowPlan,
  transaction: Transaction
): Promise<WorkflowInstance> {
  if (!plan.definitionId || plan.steps.length === 0) {
    throw ApiError.unprocessable('Selected workflow has no approval steps configured');
  }

  const instance = await WorkflowInstance.create(
    {
      requestId,
      workflowDefinitionId: plan.definitionId,
      status: 'IN_PROGRESS',
      currentStep: null,
      startedAt: new Date(),
      completedAt: null,
    },
    { transaction }
  );

  await WorkflowInstanceStep.bulkCreate(
    plan.steps.map((step) => ({
      workflowInstanceId: instance.id,
      stepDefinitionId: step.stepDefinitionId ?? null,
      stepOrder: step.stepOrder,
      name: step.name,
      approverRole: step.approverRole,
      approverId: null,
      approvalMode: step.approvalMode,
      required: step.required,
      status: 'WAITING' as const,
      startedAt: null,
      completedAt: null,
    })),
    { transaction }
  );

  const firstOrder = Math.min(...plan.steps.map((step) => step.stepOrder));
  await activateStage(instance.id, firstOrder, transaction);

  instance.currentStep = firstOrder;
  await instance.save({ transaction });

  return instance;
}

/** Moves every step of one stage from WAITING to PENDING. */
export async function activateStage(
  workflowInstanceId: number,
  stepOrder: number,
  transaction: Transaction
): Promise<void> {
  await WorkflowInstanceStep.update(
    { status: 'PENDING', startedAt: new Date() },
    { where: { workflowInstanceId, stepOrder, status: 'WAITING' }, transaction }
  );
}
