export const REQUEST_TYPES = ['LAPTOP', 'TRAVEL', 'EXPENSE', 'LEAVE'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ROLE_NAMES = [
  'EMPLOYEE',
  'MANAGER',
  'FINANCE',
  'COMPLIANCE',
  'DIRECTOR',
  'IT',
  'ADMIN',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export type ApprovalMode = 'SEQUENTIAL' | 'PARALLEL';
export type StepStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
export type WorkflowInstanceStatus = 'IN_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ApprovalActionType = 'APPROVED' | 'REJECTED';

export interface RiskFactorResult {
  factor: string;
  description: string;
  score: number;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactorResult[];
  engineVersion: string;
}

export interface WorkflowStepPlan {
  stepOrder: number;
  name: string;
  approverRole: RoleName | string;
  approvalMode: ApprovalMode;
  required: boolean;
  stepDefinitionId?: number;
}

export interface WorkflowPlan {
  definitionId: number | null;
  name: string;
  description: string | null;
  version: number;
  steps: WorkflowStepPlan[];
}

export const AUDIT_ACTIONS = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  REQUEST_UPDATED: 'REQUEST_UPDATED',
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  REQUEST_RESUBMITTED: 'REQUEST_RESUBMITTED',
  RISK_CALCULATED: 'RISK_CALCULATED',
  WORKFLOW_CREATED: 'WORKFLOW_CREATED',
  APPROVAL_APPROVED: 'APPROVAL_APPROVED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  USER_LOGIN: 'USER_LOGIN',
} as const;
