import { sequelize } from '../../src/models';

/**
 * Everything a test can create. Reference data (departments, roles, users,
 * workflow definitions) is seeded once by globalSetup and left alone.
 */
const TRANSACTIONAL_TABLES = [
  'approval_actions',
  'workflow_instance_steps',
  'workflow_instances',
  'risk_factors',
  'risk_assessments',
  'audit_logs',
  'requests',
];

export async function resetTransactionalData(): Promise<void> {
  await sequelize.query(
    `TRUNCATE ${TRANSACTIONAL_TABLES.join(', ')} RESTART IDENTITY CASCADE`
  );
  await sequelize.query('ALTER SEQUENCE request_number_seq RESTART WITH 1001');
}
