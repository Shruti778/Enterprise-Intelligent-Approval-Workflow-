import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { WorkflowInstanceStep } from './WorkflowInstanceStep';
import { User } from './User';
import { ApprovalActionType } from '../types/domain';

/** Append-only: rows are inserted, never updated. */
export class ApprovalAction extends Model<
  InferAttributes<ApprovalAction>,
  InferCreationAttributes<ApprovalAction>
> {
  declare id: CreationOptional<number>;
  declare workflowStepId: ForeignKey<WorkflowInstanceStep['id']>;
  declare actorId: ForeignKey<User['id']>;
  declare action: ApprovalActionType;
  declare comment: string | null;
  declare createdAt: CreationOptional<Date>;

  declare actor?: NonAttribute<User>;
  declare step?: NonAttribute<WorkflowInstanceStep>;
}

ApprovalAction.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workflowStepId: { type: DataTypes.INTEGER, allowNull: false, field: 'workflow_step_id' },
    actorId: { type: DataTypes.INTEGER, allowNull: false, field: 'actor_id' },
    action: { type: DataTypes.ENUM('APPROVED', 'REJECTED'), allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize, tableName: 'approval_actions', modelName: 'ApprovalAction', underscored: true,
    timestamps: true, updatedAt: false,
  }
);
