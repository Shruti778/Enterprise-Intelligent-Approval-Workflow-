'use strict';

/**
 * One generic requests table for every request type. Type-specific payload
 * lives in the JSONB `metadata` column so new request types need no schema change.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Readable, gap-free-ish request numbers: REQ-1001, REQ-1002, ...
    await queryInterface.sequelize.query(
      'CREATE SEQUENCE IF NOT EXISTS request_number_seq START WITH 1001 INCREMENT BY 1;'
    );

    await queryInterface.createTable('requests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      request_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      type: { type: Sequelize.ENUM('LAPTOP', 'TRAVEL', 'EXPENSE', 'LEAVE'), allowNull: false },
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      requested_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('requests', ['requested_by'], { name: 'requests_requested_by_idx' });
    await queryInterface.addIndex('requests', ['status'], { name: 'requests_status_idx' });
    await queryInterface.addIndex('requests', ['type'], { name: 'requests_type_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('requests');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_requests_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_requests_status";');
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS request_number_seq;');
  },
};
