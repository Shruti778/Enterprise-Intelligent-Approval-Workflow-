import {
  DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']> | null;
  declare action: string;
  declare entityType: string;
  declare entityId: number | null;
  declare metadata: CreationOptional<Record<string, unknown>>;
  declare createdAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    action: { type: DataTypes.STRING(60), allowNull: false },
    entityType: { type: DataTypes.STRING(60), allowNull: false, field: 'entity_type' },
    entityId: { type: DataTypes.INTEGER, allowNull: true, field: 'entity_id' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize, tableName: 'audit_logs', modelName: 'AuditLog', underscored: true,
    timestamps: true, updatedAt: false,
  }
);
