import { buildWorkflowPlan } from '../../src/services/workflow/workflowEngine';
import { definitionPriority } from '../../src/services/workflow/ruleEvaluator';
import { WorkflowDefinition, WorkflowRule } from '../../src/models';
import { evaluateRisk } from '../../src/services/risk/riskEngine';
import type { WorkflowPlan } from '../../src/types/domain';
import {
  extendedLeave,
  highRiskLaptop,
  highRiskTravel,
  lowRiskLaptop,
  lowRiskTravel,
  mediumRiskLaptop,
  RequestFixture,
} from '../helpers/fixtures';

/** Scores a fixture with the real risk engine, then asks for its workflow. */
async function planFor(fixture: RequestFixture): Promise<WorkflowPlan> {
  const risk = evaluateRisk(fixture);
  return buildWorkflowPlan({
    type: fixture.type,
    amount: fixture.amount,
    metadata: fixture.metadata,
    riskLevel: risk.level,
    riskScore: risk.score,
  });
}

const roles = (plan: WorkflowPlan) => plan.steps.map((step) => step.approverRole);

describe('Workflow engine - selection by risk level', () => {
  it('routes a LOW risk laptop request to the standard manager-and-IT chain', async () => {
    const plan = await planFor(lowRiskLaptop());

    expect(plan.name).toBe('Laptop - Standard Approval');
    expect(roles(plan)).toEqual(['MANAGER', 'IT']);
  });

  it('routes a MEDIUM risk laptop request to the same standard chain', async () => {
    const plan = await planFor(mediumRiskLaptop());

    expect(plan.name).toBe('Laptop - Standard Approval');
    expect(roles(plan)).toEqual(['MANAGER', 'IT']);
  });

  it('escalates a HIGH risk laptop request through Finance, Compliance and the Director', async () => {
    const plan = await planFor(highRiskLaptop());

    expect(plan.name).toBe('Laptop - High Risk Approval');
    expect(roles(plan)).toEqual(['MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR']);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps.map((step) => step.stepOrder)).toEqual([1, 2, 3, 4]);
  });

  it('names the high-risk laptop steps in approval order', async () => {
    const plan = await planFor(highRiskLaptop());

    expect(plan.steps.map((step) => step.name)).toEqual([
      'Manager Approval',
      'Finance Review',
      'Compliance Review',
      'Director Sign-off',
    ]);
    expect(plan.steps.every((step) => step.required)).toBe(true);
  });
});

describe('Workflow engine - selection by request type', () => {
  it('gives a LOW risk travel request manager approval only', async () => {
    const plan = await planFor(lowRiskTravel());

    expect(plan.name).toBe('Travel - Standard Approval');
    expect(roles(plan)).toEqual(['MANAGER']);
  });

  it('gives a HIGH risk travel request a parallel Finance and Compliance stage', async () => {
    const plan = await planFor(highRiskTravel());

    expect(plan.name).toBe('Travel - High Risk Approval');
    expect(roles(plan)).toEqual(['MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR']);

    // Finance and Compliance share step order 2, which is what makes them concurrent.
    const stageTwo = plan.steps.filter((step) => step.stepOrder === 2);
    expect(stageTwo.map((step) => step.approverRole).sort()).toEqual(['COMPLIANCE', 'FINANCE']);
    expect(stageTwo.every((step) => step.approvalMode === 'PARALLEL')).toBe(true);
  });

  it('routes the same HIGH risk level to different chains for different request types', async () => {
    const laptop = await planFor(highRiskLaptop());
    const travel = await planFor(highRiskTravel());

    expect(laptop.name).not.toBe(travel.name);
    expect(laptop.steps.map((step) => step.stepOrder)).toEqual([1, 2, 3, 4]);
    expect(travel.steps.map((step) => step.stepOrder)).toEqual([1, 2, 2, 3]);
  });

  it('routes leave on duration rather than on a monetary amount', async () => {
    const short = await planFor({
      type: 'LEAVE',
      title: 'Annual leave',
      amount: 0,
      metadata: { leaveType: 'ANNUAL', durationDays: 3 },
    });
    const long = await planFor(extendedLeave());

    expect(short.name).toBe('Leave - Short Duration');
    expect(roles(short)).toEqual(['MANAGER']);
    expect(long.name).toBe('Leave - Extended Duration');
    expect(roles(long)).toEqual(['MANAGER', 'DIRECTOR']);
  });
});

describe('Workflow engine - rule priority', () => {
  it('prefers the more specific high-risk definition when both variants match', async () => {
    // Both "Expense - Standard" (priority 10) and "Expense - High Risk" (priority 20)
    // are candidates by type; only risk level separates them.
    const standard = await planFor({
      type: 'EXPENSE',
      title: 'Team lunch',
      amount: 4_000,
      metadata: { category: 'MEALS', receiptProvided: true },
    });
    const escalated = await planFor({
      type: 'EXPENSE',
      title: 'Client entertainment without receipt',
      amount: 120_000,
      metadata: { category: 'ENTERTAINMENT', receiptProvided: false, urgency: 'HIGH' },
    });

    expect(standard.name).toBe('Expense - Standard Approval');
    expect(roles(standard)).toEqual(['MANAGER', 'FINANCE']);
    expect(escalated.name).toBe('Expense - High Risk Approval');
    expect(roles(escalated)).toEqual(['MANAGER', 'FINANCE', 'COMPLIANCE']);
  });

  it('still routes a request whose optional metadata is missing, rather than leaving it unapprovable', async () => {
    // No durationDays recorded: the engine must not drop the request on the floor.
    const plan = await planFor({
      type: 'LEAVE',
      title: 'Leave with no duration recorded',
      amount: 0,
      metadata: {},
    });

    expect(plan.steps.length).toBeGreaterThan(0);
    expect(roles(plan)).toContain('MANAGER');
  });

  it('ranks the rule-free catch-all below every rule-bearing definition', async () => {
    const definitions = await WorkflowDefinition.findAll({
      where: { status: 'ACTIVE' },
      include: [{ model: WorkflowRule, as: 'rules' }],
    });

    const catchAll = definitions.find((definition) => (definition.rules ?? []).length === 0);
    expect(catchAll).toBeDefined();
    expect(definitionPriority(catchAll!.rules ?? [])).toBe(0);

    definitions
      .filter((definition) => (definition.rules ?? []).length > 0)
      .forEach((definition) => {
        expect(definitionPriority(definition.rules ?? [])).toBeGreaterThan(0);
      });
  });
});
