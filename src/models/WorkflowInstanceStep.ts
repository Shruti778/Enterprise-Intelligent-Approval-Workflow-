import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { WorkflowInstance } from './WorkflowInstance';
import { WorkflowStepDefinition } from './WorkflowStepDefinition';
import { User } from './User';
import { ApprovalMode, StepStatus } from '../types/domain';
import type { ApprovalAction } from './ApprovalAction';

export class WorkflowInstanceStep extends Model<
  InferAttributes<WorkflowInstanceStep>,
  InferCreationAttributes<WorkflowInstanceStep>
> {
  declare id: CreationOptional<number>;
  declare workflowInstanceId: ForeignKey<WorkflowInstance['id']>;
  declare stepDefinitionId: ForeignKey<WorkflowStepDefinition['id']> | null;
  declare stepOrder: number;
  declare name: string;
  declare approverRole: string;
  declare approverId: ForeignKey<User['id']> | null;
  declare approvalMode: CreationOptional<ApprovalMode>;
  declare required: CreationOptional<boolean>;
  declare status: CreationOptional<StepStatus>;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare actions?: NonAttribute<ApprovalAction[]>;
  declare approver?: NonAttribute<User>;
  declare instance?: NonAttribute<WorkflowInstance>;
}

WorkflowInstanceStep.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workflowInstanceId: { type: DataTypes.INTEGER, allowNull: false, field: 'workflow_instance_id' },
    stepDefinitionId: { type: DataTypes.INTEGER, allowNull: true, field: 'step_definition_id' },
    stepOrder: { type: DataTypes.INTEGER, allowNull: false, field: 'step_order' },
    name: { type: DataTypes.STRING(120), allowNull: false },
    approverRole: { type: DataTypes.STRING(50), allowNull: false, field: 'approver_role' },
    approverId: { type: DataTypes.INTEGER, allowNull: true, field: 'approver_id' },
    approvalMode: {
      type: DataTypes.ENUM('SEQUENTIAL', 'PARALLEL'),
      allowNull: false, defaultValue: 'SEQUENTIAL', field: 'approval_mode',
    },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: {
      type: DataTypes.ENUM('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'),
      allowNull: false, defaultValue: 'WAITING',
    },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'workflow_instance_steps', modelName: 'WorkflowInstanceStep', underscored: true }
);
