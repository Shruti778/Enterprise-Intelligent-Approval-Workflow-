'use strict';

/**
 * Approval blueprints. A definition is selected when EVERY one of its rules
 * matches; among the matches the one with the highest rule priority wins, so
 * priority encodes specificity (high-risk variants outrank standard ones).
 *
 * Steps that share a step_order and use PARALLEL mode run concurrently; the
 * next stage only opens once every required step of the stage is approved.
 */
const DEFINITIONS = [
  {
    name: 'Laptop - Standard Approval',
    description: 'Low and medium risk equipment requests: line manager sign-off, then IT provisioning.',
    priority: 10,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'LAPTOP' },
      { conditionType: 'RISK_LEVEL', operator: 'IN', value: 'LOW,MEDIUM' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'IT Verification', role: 'IT', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Laptop - High Risk Approval',
    description: 'High risk equipment: full sequential chain through Finance, Compliance and Director.',
    priority: 20,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'LAPTOP' },
      { conditionType: 'RISK_LEVEL', operator: 'EQUALS', value: 'HIGH' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Finance Review', role: 'FINANCE', mode: 'SEQUENTIAL' },
      { order: 3, name: 'Compliance Review', role: 'COMPLIANCE', mode: 'SEQUENTIAL' },
      { order: 4, name: 'Director Sign-off', role: 'DIRECTOR', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Travel - Standard Approval',
    description: 'Low risk domestic travel needs only line manager approval.',
    priority: 10,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'TRAVEL' },
      { conditionType: 'RISK_LEVEL', operator: 'EQUALS', value: 'LOW' },
    ],
    steps: [{ order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' }],
  },
  {
    name: 'Travel - Finance Review',
    description: 'Medium risk travel adds a Finance budget check.',
    priority: 15,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'TRAVEL' },
      { conditionType: 'RISK_LEVEL', operator: 'EQUALS', value: 'MEDIUM' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Finance Review', role: 'FINANCE', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Travel - High Risk Approval',
    description:
      'High risk travel: Finance and Compliance review in parallel, then Director sign-off.',
    priority: 20,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'TRAVEL' },
      { conditionType: 'RISK_LEVEL', operator: 'EQUALS', value: 'HIGH' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Finance Review', role: 'FINANCE', mode: 'PARALLEL' },
      { order: 2, name: 'Compliance Review', role: 'COMPLIANCE', mode: 'PARALLEL' },
      { order: 3, name: 'Director Sign-off', role: 'DIRECTOR', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Expense - Standard Approval',
    description: 'Routine expense claims: manager then Finance.',
    priority: 10,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'EXPENSE' },
      { conditionType: 'RISK_LEVEL', operator: 'IN', value: 'LOW,MEDIUM' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Finance Review', role: 'FINANCE', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Expense - High Risk Approval',
    description: 'High risk expense claims additionally need a Compliance review.',
    priority: 20,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'EXPENSE' },
      { conditionType: 'RISK_LEVEL', operator: 'EQUALS', value: 'HIGH' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Finance Review', role: 'FINANCE', mode: 'SEQUENTIAL' },
      { order: 3, name: 'Compliance Review', role: 'COMPLIANCE', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Leave - Short Duration',
    description: 'Leave of 15 days or less is approved by the line manager.',
    priority: 10,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'LEAVE' },
      { conditionType: 'METADATA.durationDays', operator: 'LTE', value: '15' },
    ],
    steps: [{ order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' }],
  },
  {
    name: 'Leave - Extended Duration',
    description: 'Leave longer than 15 days escalates to the Director.',
    priority: 20,
    rules: [
      { conditionType: 'REQUEST_TYPE', operator: 'EQUALS', value: 'LEAVE' },
      { conditionType: 'METADATA.durationDays', operator: 'GT', value: '15' },
    ],
    steps: [
      { order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' },
      { order: 2, name: 'Director Sign-off', role: 'DIRECTOR', mode: 'SEQUENTIAL' },
    ],
  },
  {
    name: 'Default Manager Approval',
    description: 'Catch-all so no request can ever be left without an approver.',
    priority: 1,
    rules: [],
    steps: [{ order: 1, name: 'Manager Approval', role: 'MANAGER', mode: 'SEQUENTIAL' }],
  },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [admins] = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@company.com' LIMIT 1"
    );
    const createdBy = admins.length ? admins[0].id : null;

    for (const definition of DEFINITIONS) {
      const [inserted] = await queryInterface.bulkInsert(
        'workflow_definitions',
        [
          {
            name: definition.name,
            description: definition.description,
            version: 1,
            status: 'ACTIVE',
            created_by: createdBy,
            created_at: now,
            updated_at: now,
          },
        ],
        { returning: ['id'] }
      );

      const definitionId = inserted.id;

      if (definition.rules.length > 0) {
        await queryInterface.bulkInsert(
          'workflow_rules',
          definition.rules.map((rule) => ({
            workflow_definition_id: definitionId,
            priority: definition.priority,
            condition_type: rule.conditionType,
            condition_operator: rule.operator,
            condition_value: rule.value,
            created_at: now,
            updated_at: now,
          })),
          {}
        );
      }

      await queryInterface.bulkInsert(
        'workflow_step_definitions',
        definition.steps.map((step) => ({
          workflow_definition_id: definitionId,
          step_order: step.order,
          name: step.name,
          approver_role: step.role,
          approval_mode: step.mode,
          required: true,
          created_at: now,
          updated_at: now,
        })),
        {}
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('workflow_step_definitions', null, {});
    await queryInterface.bulkDelete('workflow_rules', null, {});
    await queryInterface.bulkDelete('workflow_definitions', null, {});
  },
};
