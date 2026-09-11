import { sequelize } from '../config/database';
import { Department } from './Department';
import { Role } from './Role';
import { User } from './User';
import { Request } from './Request';
import { RiskAssessment } from './RiskAssessment';
import { RiskFactor } from './RiskFactor';
import { WorkflowDefinition } from './WorkflowDefinition';
import { WorkflowRule } from './WorkflowRule';
import { WorkflowStepDefinition } from './WorkflowStepDefinition';
import { WorkflowInstance } from './WorkflowInstance';
import { WorkflowInstanceStep } from './WorkflowInstanceStep';
import { ApprovalAction } from './ApprovalAction';
import { AuditLog } from './AuditLog';

/* ------------------------------ associations ------------------------------ */

Department.hasMany(User, { foreignKey: 'departmentId', as: 'users' });
User.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

User.hasMany(Request, { foreignKey: 'requestedBy', as: 'requests' });
Request.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });

Request.hasMany(RiskAssessment, { foreignKey: 'requestId', as: 'riskAssessments' });
RiskAssessment.belongsTo(Request, { foreignKey: 'requestId', as: 'request' });

RiskAssessment.hasMany(RiskFactor, { foreignKey: 'riskAssessmentId', as: 'factors' });
RiskFactor.belongsTo(RiskAssessment, { foreignKey: 'riskAssessmentId', as: 'assessment' });

WorkflowDefinition.hasMany(WorkflowRule, { foreignKey: 'workflowDefinitionId', as: 'rules' });
WorkflowRule.belongsTo(WorkflowDefinition, { foreignKey: 'workflowDefinitionId', as: 'definition' });

WorkflowDefinition.hasMany(WorkflowStepDefinition, { foreignKey: 'workflowDefinitionId', as: 'stepDefinitions' });
WorkflowStepDefinition.belongsTo(WorkflowDefinition, { foreignKey: 'workflowDefinitionId', as: 'definition' });

WorkflowDefinition.belongsTo(User, { foreignKey: 'createdBy', as: 'author' });

Request.hasMany(WorkflowInstance, { foreignKey: 'requestId', as: 'workflowInstances' });
WorkflowInstance.belongsTo(Request, { foreignKey: 'requestId', as: 'request' });

WorkflowDefinition.hasMany(WorkflowInstance, { foreignKey: 'workflowDefinitionId', as: 'instances' });
WorkflowInstance.belongsTo(WorkflowDefinition, { foreignKey: 'workflowDefinitionId', as: 'definition' });

WorkflowInstance.hasMany(WorkflowInstanceStep, { foreignKey: 'workflowInstanceId', as: 'steps' });
WorkflowInstanceStep.belongsTo(WorkflowInstance, { foreignKey: 'workflowInstanceId', as: 'instance' });

WorkflowStepDefinition.hasMany(WorkflowInstanceStep, { foreignKey: 'stepDefinitionId', as: 'instanceSteps' });
WorkflowInstanceStep.belongsTo(WorkflowStepDefinition, { foreignKey: 'stepDefinitionId', as: 'stepDefinition' });

User.hasMany(WorkflowInstanceStep, { foreignKey: 'approverId', as: 'approvedSteps' });
WorkflowInstanceStep.belongsTo(User, { foreignKey: 'approverId', as: 'approver' });

WorkflowInstanceStep.hasMany(ApprovalAction, { foreignKey: 'workflowStepId', as: 'actions' });
ApprovalAction.belongsTo(WorkflowInstanceStep, { foreignKey: 'workflowStepId', as: 'step' });

User.hasMany(ApprovalAction, { foreignKey: 'actorId', as: 'approvalActions' });
ApprovalAction.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export {
  sequelize,
  Department,
  Role,
  User,
  Request,
  RiskAssessment,
  RiskFactor,
  WorkflowDefinition,
  WorkflowRule,
  WorkflowStepDefinition,
  WorkflowInstance,
  WorkflowInstanceStep,
  ApprovalAction,
  AuditLog,
};
