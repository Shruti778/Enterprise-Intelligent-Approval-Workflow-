import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import type { WorkflowRule } from './WorkflowRule';
import type { WorkflowStepDefinition } from './WorkflowStepDefinition';

export class WorkflowDefinition extends Model<
  InferAttributes<WorkflowDefinition>,
  InferCreationAttributes<WorkflowDefinition>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string | null;
  declare version: CreationOptional<number>;
  declare status: CreationOptional<'ACTIVE' | 'INACTIVE'>;
  declare createdBy: ForeignKey<User['id']> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare rules?: NonAttribute<WorkflowRule[]>;
  declare stepDefinitions?: NonAttribute<WorkflowStepDefinition[]>;
}

WorkflowDefinition.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'workflow_definitions', modelName: 'WorkflowDefinition', underscored: true }
);
