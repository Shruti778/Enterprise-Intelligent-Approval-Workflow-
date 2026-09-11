'use strict';

/** Append-only approval history. Rows are never updated or deleted. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('approval_actions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      workflow_step_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workflow_instance_steps', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      actor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      action: { type: Sequelize.ENUM('APPROVED', 'REJECTED'), allowNull: false },
      comment: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('approval_actions', ['workflow_step_id'], { name: 'approval_actions_step_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('approval_actions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_approval_actions_action";');
  },
};
