import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/database';
import { RiskAssessment } from './RiskAssessment';

export class RiskFactor extends Model<InferAttributes<RiskFactor>, InferCreationAttributes<RiskFactor>> {
  declare id: CreationOptional<number>;
  declare riskAssessmentId: ForeignKey<RiskAssessment['id']>;
  declare factor: string;
  declare description: string;
  declare score: number;
  declare createdAt: CreationOptional<Date>;
}

RiskFactor.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    riskAssessmentId: { type: DataTypes.INTEGER, allowNull: false, field: 'risk_assessment_id' },
    factor: { type: DataTypes.STRING(60), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize, tableName: 'risk_factors', modelName: 'RiskFactor', underscored: true,
    timestamps: true, updatedAt: false,
  }
);
