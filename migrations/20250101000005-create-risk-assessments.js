'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('risk_assessments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      request_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'requests', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      score: { type: Sequelize.INTEGER, allowNull: false },
      level: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH'), allowNull: false },
      evaluated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      engine_version: { type: Sequelize.STRING(20), allowNull: false, defaultValue: '1.0.0' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('risk_assessments', ['request_id'], { name: 'risk_assessments_request_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('risk_assessments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_risk_assessments_level";');
  },
};
