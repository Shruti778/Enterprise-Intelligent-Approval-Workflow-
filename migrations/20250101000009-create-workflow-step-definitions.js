'use strict';

/** Steps sharing a step_order with mode PARALLEL run concurrently. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workflow_step_definitions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      workflow_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workflow_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      step_order: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      approver_role: { type: Sequelize.STRING(50), allowNull: false },
      approval_mode: { type: Sequelize.ENUM('SEQUENTIAL', 'PARALLEL'), allowNull: false, defaultValue: 'SEQUENTIAL' },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('workflow_step_definitions', ['workflow_definition_id', 'step_order'], {
      name: 'workflow_step_definitions_definition_order_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_step_definitions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_step_definitions_approval_mode";');
  },
};
