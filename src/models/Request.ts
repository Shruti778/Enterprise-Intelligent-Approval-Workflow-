import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { RequestStatus, RequestType } from '../types/domain';
import type { RiskAssessment } from './RiskAssessment';
import type { WorkflowInstance } from './WorkflowInstance';

export class Request extends Model<InferAttributes<Request>, InferCreationAttributes<Request>> {
  declare id: CreationOptional<number>;
  declare requestNumber: CreationOptional<string>;
  declare type: RequestType;
  declare title: string;
  declare description: string | null;
  declare amount: CreationOptional<number>;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare requestedBy: ForeignKey<User['id']>;
  declare status: CreationOptional<RequestStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare requester?: NonAttribute<User>;
  declare riskAssessments?: NonAttribute<RiskAssessment[]>;
  declare workflowInstances?: NonAttribute<WorkflowInstance[]>;
}

Request.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requestNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true, field: 'request_number' },
    type: { type: DataTypes.ENUM('LAPTOP', 'TRAVEL', 'EXPENSE', 'LEAVE'), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    // DECIMAL comes back from pg as a string; normalise to number at the boundary.
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      get(): number {
        const raw = this.getDataValue('amount') as unknown as string | number | null;
        return raw === null || raw === undefined ? 0 : Number(raw);
      },
    },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    requestedBy: { type: DataTypes.INTEGER, allowNull: false, field: 'requested_by' },
    status: {
      type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'requests', modelName: 'Request', underscored: true }
);
