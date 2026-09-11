import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { Request } from './Request';
import { WorkflowDefinition } from './WorkflowDefinition';
import { WorkflowInstanceStatus } from '../types/domain';
import type { WorkflowInstanceStep } from './WorkflowInstanceStep';

export class WorkflowInstance extends Model<
  InferAttributes<WorkflowInstance>,
  InferCreationAttributes<WorkflowInstance>
> {
  declare id: CreationOptional<number>;
  declare requestId: ForeignKey<Request['id']>;
  declare workflowDefinitionId: ForeignKey<WorkflowDefinition['id']>;
  declare status: CreationOptional<WorkflowInstanceStatus>;
  declare currentStep: number | null;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare steps?: NonAttribute<WorkflowInstanceStep[]>;
  declare definition?: NonAttribute<WorkflowDefinition>;
  declare request?: NonAttribute<Request>;
}

WorkflowInstance.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requestId: { type: DataTypes.INTEGER, allowNull: false, field: 'request_id' },
    workflowDefinitionId: { type: DataTypes.INTEGER, allowNull: false, field: 'workflow_definition_id' },
    status: {
      type: DataTypes.ENUM('IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED'),
      allowNull: false, defaultValue: 'IN_PROGRESS',
    },
    currentStep: { type: DataTypes.INTEGER, allowNull: true, field: 'current_step' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'workflow_instances', modelName: 'WorkflowInstance', underscored: true }
);
