'use strict';

/** Reusable approval blueprint. Instances are created from these. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workflow_definitions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addConstraint('workflow_definitions', {
      fields: ['name', 'version'],
      type: 'unique',
      name: 'workflow_definitions_name_version_uq',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_definitions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_definitions_status";');
  },
};
