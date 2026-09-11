import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/database';
import { WorkflowDefinition } from './WorkflowDefinition';

export type ConditionOperator =
  | 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN'
  | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IS_TRUE' | 'IS_FALSE';

export class WorkflowRule extends Model<InferAttributes<WorkflowRule>, InferCreationAttributes<WorkflowRule>> {
  declare id: CreationOptional<number>;
  declare workflowDefinitionId: ForeignKey<WorkflowDefinition['id']>;
  declare priority: CreationOptional<number>;
  /** REQUEST_TYPE | AMOUNT | RISK_LEVEL | RISK_SCORE | METADATA.<path> */
  declare conditionType: string;
  declare conditionOperator: ConditionOperator;
  declare conditionValue: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WorkflowRule.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    workflowDefinitionId: { type: DataTypes.INTEGER, allowNull: false, field: 'workflow_definition_id' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    conditionType: { type: DataTypes.STRING(60), allowNull: false, field: 'condition_type' },
    conditionOperator: {
      type: DataTypes.ENUM('EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GT', 'GTE', 'LT', 'LTE', 'IS_TRUE', 'IS_FALSE'),
      allowNull: false,
      field: 'condition_operator',
    },
    conditionValue: { type: DataTypes.STRING(255), allowNull: true, field: 'condition_value' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'workflow_rules', modelName: 'WorkflowRule', underscored: true }
);
