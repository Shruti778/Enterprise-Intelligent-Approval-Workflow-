'use strict';

/**
 * Demo requests are pushed through the REAL risk and workflow engines rather
 * than being hand-written rows, so every seeded risk score, workflow shape and
 * step status is exactly what the running application would produce.
 */
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});

const path = require('path');
const srcPath = (p) => path.resolve(__dirname, '../src', p);

const SCENARIOS = [
  {
    key: 'low-risk-laptop',
    requester: 'employee@company.com',
    type: 'LAPTOP',
    title: 'Standard development laptop',
    description: 'Replacement laptop for day-to-day development work.',
    amount: 30000,
    metadata: {
      specification: 'Dell Latitude 5440, 16GB RAM, 512GB SSD',
      purpose: 'Development',
      urgency: 'LOW',
      newVendor: false,
    },
    submit: true,
    approvals: [], // waits at Manager
  },
  {
    key: 'high-risk-laptop',
    requester: 'employee@company.com',
    type: 'LAPTOP',
    title: 'MacBook Pro M3 Max for ML workloads',
    description: 'High specification machine sourced from a vendor we have not used before.',
    amount: 150000,
    metadata: {
      specification: 'MacBook Pro 16" M3 Max, 64GB RAM, 2TB SSD',
      purpose: 'Machine learning development',
      urgency: 'HIGH',
      newVendor: true,
    },
    submit: true,
    approvals: [{ role: 'MANAGER', comment: 'Justified for the ML roadmap.' }],
  },
  {
    key: 'low-risk-travel',
    requester: 'employee2@company.com',
    type: 'TRAVEL',
    title: 'Client visit - Bengaluru',
    description: 'Two day on-site visit with the Bengaluru account team.',
    amount: 20000,
    metadata: {
      destination: 'Bengaluru',
      international: false,
      startDate: '2026-10-06',
      endDate: '2026-10-08',
      purpose: 'Client meeting',
    },
    submit: true,
    approvals: [{ role: 'MANAGER', comment: 'Approved, budget available.' }], // fully approved
  },
  {
    key: 'high-risk-travel',
    requester: 'employee@company.com',
    type: 'TRAVEL',
    title: 'Partner summit - Berlin',
    description: 'International travel for the annual partner engineering summit.',
    amount: 200000,
    metadata: {
      destination: 'Berlin, Germany',
      international: true,
      startDate: '2026-11-12',
      endDate: '2026-11-19',
      purpose: 'Partner summit',
    },
    submit: true,
    // Parks the request on the parallel Finance + Compliance stage.
    approvals: [{ role: 'MANAGER', comment: 'Strategic account, approved.' }],
  },
  {
    key: 'standard-expense',
    requester: 'employee2@company.com',
    type: 'EXPENSE',
    title: 'Team offsite lunch',
    description: 'Quarterly team lunch for the Sales pod.',
    amount: 12000,
    metadata: {
      category: 'MEALS',
      receiptProvided: true,
      expenseDate: '2026-09-02',
      description: 'Team lunch - 9 attendees',
    },
    submit: true,
    approvals: [],
  },
  {
    key: 'high-risk-expense',
    requester: 'employee@company.com',
    type: 'EXPENSE',
    title: 'Client entertainment - no receipt',
    description: 'Client hospitality expense where the original receipt was lost.',
    amount: 120000,
    metadata: {
      category: 'ENTERTAINMENT',
      receiptProvided: false,
      expenseDate: '2026-08-21',
      description: 'Client hospitality, receipt misplaced',
      urgency: 'HIGH',
    },
    submit: true,
    // Manager approves, Finance rejects - demonstrates the rejection path.
    approvals: [
      { role: 'MANAGER', comment: 'Client relationship spend, passing to Finance.' },
      { role: 'FINANCE', action: 'REJECT', comment: 'Cannot reimburse without a valid receipt.' },
    ],
  },
  {
    key: 'short-leave',
    requester: 'employee2@company.com',
    type: 'LEAVE',
    title: 'Annual leave - 3 days',
    description: 'Short personal leave.',
    amount: 0,
    metadata: {
      leaveType: 'ANNUAL',
      startDate: '2026-09-24',
      endDate: '2026-09-26',
      durationDays: 3,
      reason: 'Family function',
    },
    submit: true,
    approvals: [],
  },
  {
    key: 'extended-leave',
    requester: 'employee@company.com',
    type: 'LEAVE',
    title: 'Sabbatical leave - 30 days',
    description: 'Extended leave for a personal sabbatical.',
    amount: 0,
    metadata: {
      leaveType: 'UNPAID',
      startDate: '2026-12-01',
      endDate: '2026-12-30',
      durationDays: 30,
      reason: 'Personal sabbatical',
    },
    submit: true,
    approvals: [{ role: 'MANAGER', comment: 'Cover arranged within the team.' }],
  },
  {
    key: 'draft-laptop',
    requester: 'employee@company.com',
    type: 'LAPTOP',
    title: 'Spare docking station',
    description: 'Draft request, not submitted yet.',
    amount: 8000,
    metadata: {
      specification: 'USB-C dock, dual 4K output',
      purpose: 'Desk setup',
      urgency: 'LOW',
      newVendor: false,
    },
    submit: false,
    approvals: [],
  },
];

module.exports = {
  async up(queryInterface) {
    const { sequelize, User, Role, WorkflowInstanceStep, WorkflowInstance } = require(srcPath('models'));
    const requestService = require(srcPath('services/requestService'));
    const approvalService = require(srcPath('services/approval/approvalService'));

    const users = await User.findAll({ include: [{ model: Role, as: 'role' }] });
    const byEmail = (email) => {
      const user = users.find((u) => u.email === email);
      if (!user) throw new Error(`Seed user ${email} not found - run the user seeder first`);
      return { id: user.id, role: user.role.name };
    };
    const byRole = (roleName) => {
      const user = users.find((u) => u.role && u.role.name === roleName);
      if (!user) throw new Error(`No seed user with role ${roleName}`);
      return { id: user.id, role: roleName };
    };

    for (const scenario of SCENARIOS) {
      const requester = byEmail(scenario.requester);

      const created = await requestService.createRequest(requester.id, {
        type: scenario.type,
        title: scenario.title,
        description: scenario.description,
        amount: scenario.amount,
        metadata: scenario.metadata,
      });

      if (!scenario.submit) continue;

      await requestService.submitRequest(created.id, requester);

      for (const approval of scenario.approvals) {
        const actor = byRole(approval.role);

        const instance = await WorkflowInstance.findOne({
          where: { requestId: created.id, status: 'IN_PROGRESS' },
        });
        if (!instance) break;

        const step = await WorkflowInstanceStep.findOne({
          where: { workflowInstanceId: instance.id, status: 'PENDING', approverRole: approval.role },
        });
        if (!step) break;

        if (approval.action === 'REJECT') {
          await approvalService.rejectStep(step.id, actor, approval.comment);
        } else {
          await approvalService.approveStep(step.id, actor, approval.comment);
        }
      }
    }

    await sequelize.close();
  },

  async down(queryInterface) {
    // Children cascade from requests; workflow instances reference requests too.
    await queryInterface.sequelize.query('DELETE FROM approval_actions');
    await queryInterface.sequelize.query('DELETE FROM workflow_instance_steps');
    await queryInterface.sequelize.query('DELETE FROM workflow_instances');
    await queryInterface.sequelize.query('DELETE FROM risk_factors');
    await queryInterface.sequelize.query('DELETE FROM risk_assessments');
    await queryInterface.sequelize.query('DELETE FROM audit_logs');
    await queryInterface.sequelize.query('DELETE FROM requests');
    await queryInterface.sequelize.query('ALTER SEQUENCE request_number_seq RESTART WITH 1001');
  },
};
