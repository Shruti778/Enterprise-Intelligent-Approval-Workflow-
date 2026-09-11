import {
  ApprovalAction,
  Request,
  RiskAssessment,
  User,
  WorkflowInstance,
  WorkflowInstanceStep,
} from '../models';

export function presentUser(user?: User | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role?.name ?? null,
    department: user.department?.name ?? null,
  };
}

export function presentRisk(assessment?: RiskAssessment | null) {
  if (!assessment) return null;
  return {
    id: assessment.id,
    score: assessment.score,
    level: assessment.level,
    evaluatedAt: assessment.evaluatedAt,
    engineVersion: assessment.engineVersion,
    factors: (assessment.factors ?? []).map((factor) => ({
      id: factor.id,
      factor: factor.factor,
      description: factor.description,
      score: factor.score,
    })),
  };
}

export function presentAction(action: ApprovalAction) {
  return {
    id: action.id,
    action: action.action,
    comment: action.comment,
    createdAt: action.createdAt,
    actor: presentUser(action.actor),
  };
}

export function presentStep(step: WorkflowInstanceStep) {
  return {
    id: step.id,
    stepOrder: step.stepOrder,
    name: step.name,
    approverRole: step.approverRole,
    approvalMode: step.approvalMode,
    required: step.required,
    status: step.status,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    approver: presentUser(step.approver),
    actions: (step.actions ?? []).map(presentAction),
  };
}

export function presentWorkflow(instance?: WorkflowInstance | null) {
  if (!instance) return null;
  const steps = (instance.steps ?? [])
    .slice()
    .sort((a, b) => a.stepOrder - b.stepOrder || a.id - b.id);

  return {
    id: instance.id,
    status: instance.status,
    currentStep: instance.currentStep,
    startedAt: instance.startedAt,
    completedAt: instance.completedAt,
    definition: instance.definition
      ? {
          id: instance.definition.id,
          name: instance.definition.name,
          description: instance.definition.description,
          version: instance.definition.version,
        }
      : null,
    steps: steps.map(presentStep),
  };
}

/** Human-readable label for the stage a request is waiting on. */
export function currentStageLabel(instance?: WorkflowInstance | null, status?: string): string {
  if (!instance) return status === 'DRAFT' ? 'Not submitted' : '-';
  if (instance.status === 'APPROVED') return 'Completed';
  if (instance.status === 'REJECTED') return 'Rejected';

  const pending = (instance.steps ?? []).filter((step) => step.status === 'PENDING');
  if (pending.length === 0) return '-';
  return pending.map((step) => step.name).join(' + ');
}

export function presentRequest(
  request: Request,
  options: { detailed?: boolean } = {}
) {
  const assessment = (request.riskAssessments ?? [])
    .slice()
    .sort((a, b) => b.id - a.id)[0];
  const instance = (request.workflowInstances ?? [])
    .slice()
    .sort((a, b) => b.id - a.id)[0];

  const base = {
    id: request.id,
    requestNumber: request.requestNumber,
    type: request.type,
    title: request.title,
    description: request.description,
    amount: Number(request.amount),
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    requester: presentUser(request.requester),
    risk: presentRisk(assessment),
    currentStage: currentStageLabel(instance, request.status),
  };

  if (!options.detailed) return base;

  return { ...base, metadata: request.metadata, workflow: presentWorkflow(instance) };
}
