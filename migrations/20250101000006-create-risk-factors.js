'use strict';

/** Explainability: every point of a risk score traces back to a factor row. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('risk_factors', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      risk_assessment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'risk_assessments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      factor: { type: Sequelize.STRING(60), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: false },
      score: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('risk_factors', ['risk_assessment_id'], { name: 'risk_factors_assessment_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('risk_factors');
  },
};
