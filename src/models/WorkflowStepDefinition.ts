import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/database';
import { WorkflowDefinition } from './WorkflowDefinition';
import { ApprovalMode } from '../types/domain';

export class WorkflowStepDefinition extends Model<
  InferAttributes<WorkflowStepDefinition>,
  InferCreationAttributes<WorkflowStepDefinition>
> {
  declare id: CreationOptional<number>;
  declare workflowDefinitionId: ForeignKey<WorkflowDefinition['id']>;
  declare stepOrder: number;
  declare name: string;
  declare approverRole: string;
  declare approvalMode: CreationOptional<ApprovalMode>;
  declare required: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WorkflowStepDefinition.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workflowDefinitionId: { type: DataTypes.INTEGER, allowNull: false, field: 'workflow_definition_id' },
    stepOrder: { type: DataTypes.INTEGER, allowNull: false, field: 'step_order' },
    name: { type: DataTypes.STRING(120), allowNull: false },
    approverRole: { type: DataTypes.STRING(50), allowNull: false, field: 'approver_role' },
    approvalMode: {
      type: DataTypes.ENUM('SEQUENTIAL', 'PARALLEL'),
      allowNull: false, defaultValue: 'SEQUENTIAL', field: 'approval_mode',
    },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'workflow_step_definitions', modelName: 'WorkflowStepDefinition', underscored: true }
);
