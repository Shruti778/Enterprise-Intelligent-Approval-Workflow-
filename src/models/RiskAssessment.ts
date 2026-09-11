import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { Request } from './Request';
import { RiskLevel } from '../types/domain';
import type { RiskFactor } from './RiskFactor';

export class RiskAssessment extends Model<
  InferAttributes<RiskAssessment>,
  InferCreationAttributes<RiskAssessment>
> {
  declare id: CreationOptional<number>;
  declare requestId: ForeignKey<Request['id']>;
  declare score: number;
  declare level: RiskLevel;
  declare evaluatedAt: CreationOptional<Date>;
  declare engineVersion: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare factors?: NonAttribute<RiskFactor[]>;
}

RiskAssessment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requestId: { type: DataTypes.INTEGER, allowNull: false, field: 'request_id' },
    score: { type: DataTypes.INTEGER, allowNull: false },
    level: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'), allowNull: false },
    evaluatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'evaluated_at' },
    engineVersion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '1.0.0', field: 'engine_version' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'risk_assessments', modelName: 'RiskAssessment', underscored: true }
);
