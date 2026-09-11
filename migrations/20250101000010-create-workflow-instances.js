'use strict';

/** A running workflow for one request. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workflow_instances', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      request_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      workflow_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workflow_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.ENUM('IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'IN_PROGRESS',
      },
      current_step: { type: Sequelize.INTEGER, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('workflow_instances', ['request_id'], { name: 'workflow_instances_request_idx' });
    await queryInterface.addIndex('workflow_instances', ['status'], { name: 'workflow_instances_status_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_instances');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_instances_status";');
  },
};
