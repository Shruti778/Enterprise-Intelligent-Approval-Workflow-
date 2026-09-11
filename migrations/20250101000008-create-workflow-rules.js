'use strict';

/**
 * Matching rules for a definition. All rules of a definition must pass (AND).
 * `priority` expresses specificity - the highest-priority matching definition wins.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workflow_rules', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      workflow_definition_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workflow_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // REQUEST_TYPE | AMOUNT | RISK_LEVEL | RISK_SCORE | METADATA.<path>
      condition_type: { type: Sequelize.STRING(60), allowNull: false },
      condition_operator: {
        type: Sequelize.ENUM('EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GT', 'GTE', 'LT', 'LTE', 'IS_TRUE', 'IS_FALSE'),
        allowNull: false,
      },
      condition_value: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('workflow_rules', ['workflow_definition_id'], { name: 'workflow_rules_definition_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_rules');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_workflow_rules_condition_operator";');
  },
};
