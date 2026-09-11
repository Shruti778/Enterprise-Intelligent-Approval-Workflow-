import type { RequestStatus, RiskLevel, StepStatus } from '../../src/types/domain';

/**
 * Shape of the detailed payload returned by presentRequest/the API. The
 * presenter infers a union of its summary and detailed forms, so tests narrow
 * to the detailed one through `detail()` instead of repeating a cast.
 */
export interface PresentedAction {
  id: number;
  action: 'APPROVED' | 'REJECTED';
  comment: string | null;
  actor: { id: number; name: string; role: string | null } | null;
}

export interface PresentedStep {
  id: number;
  stepOrder: number;
  name: string;
  approverRole: string;
  approvalMode: 'SEQUENTIAL' | 'PARALLEL';
  required: boolean;
  status: StepStatus;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  approver: { id: number; name: string; role: string | null } | null;
  actions: PresentedAction[];
}

export interface PresentedRequest {
  id: number;
  requestNumber: string;
  type: string;
  title: string;
  amount: number;
  status: RequestStatus;
  currentStage: string;
  metadata: Record<string, any>;
  requester: { id: number; name: string; role: string | null } | null;
  risk: {
    id: number;
    score: number;
    level: RiskLevel;
    engineVersion: string;
    factors: Array<{ factor: string; description: string; score: number }>;
  } | null;
  workflow: {
    id: number;
    status: string;
    currentStep: number | null;
    definition: { id: number; name: string; version: number } | null;
    steps: PresentedStep[];
  } | null;
}

export const detail = (view: unknown): PresentedRequest => view as PresentedRequest;

export const stepByRole = (view: unknown, role: string): PresentedStep => {
  const step = detail(view).workflow?.steps.find((candidate) => candidate.approverRole === role);
  if (!step) throw new Error(`No ${role} step in the presented workflow`);
  return step;
};
