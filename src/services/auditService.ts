import { Op, Transaction } from 'sequelize';
import { AuditLog } from '../models';

export async function record(
  entry: {
    userId: number | null;
    action: string;
    entityType: string;
    entityId: number | null;
    metadata?: Record<string, unknown>;
  },
  transaction?: Transaction
): Promise<void> {
  await AuditLog.create(
    {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? {},
    },
    { transaction }
  );
}

export async function listForEntity(entityType: string, entityId: number) {
  return AuditLog.findAll({
    where: { entityType, entityId },
    order: [['createdAt', 'ASC']],
    include: [{ association: 'user', attributes: ['id', 'name', 'email'] }],
  });
}

/**
 * The complete trail for one request: entries recorded against the request
 * itself plus the workflow and step entries that reference it in their metadata.
 */
export async function listRequestTrail(requestId: number) {
  return AuditLog.findAll({
    where: {
      [Op.or]: [
        { entityType: 'REQUEST', entityId: requestId },
        { metadata: { requestId } },
      ],
    },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    include: [{ association: 'user', attributes: ['id', 'name', 'email'] }],
  });
}
