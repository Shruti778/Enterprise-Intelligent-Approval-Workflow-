'use strict';

/**
 * Materialised copy of each step definition for one instance. The blueprint can
 * change later without rewriting the history of a running or finished workflow.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workflow_instance_steps', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      workflow_instance_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workflow_instances', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      step_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'workflow_step_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      step_order: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      approver_role: { type: Sequelize.STRING(50), allowNull: false },
      // Filled in when a specific user acts on the step.
      approver_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      approval_mode: { type: Sequelize.ENUM('SEQUENTIAL', 'PARALLEL'), allowNull: false, defaultValue: 'SEQUENTIAL' },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      status: {
        type: Sequelize.ENUM('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'),
        allowNull: false,
        defaultValue: 'WAITING',
      },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('workflow_instance_steps', ['workflow_instance_id', 'step_order'], {
      name: 'workflow_instance_steps_instance_order_idx',
    });
    await queryInterface.addIndex('workflow_instance_steps', ['status', 'approver_role'], {
      name: 'workflow_instance_steps_status_role_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_instance_steps');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_instance_steps_approval_mode";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_instance_steps_status";');
  },
};
