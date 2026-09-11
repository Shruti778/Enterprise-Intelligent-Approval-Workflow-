import { WorkflowRule, ConditionOperator } from '../../src/models/WorkflowRule';
import {
  evaluateRule,
  definitionMatches,
  definitionPriority,
  WorkflowMatchContext,
} from '../../src/services/workflow/ruleEvaluator';

/** An unsaved rule instance - the evaluator only reads its condition fields. */
const rule = (
  conditionType: string,
  conditionOperator: ConditionOperator,
  conditionValue: string | null,
  priority = 10
): WorkflowRule =>
  WorkflowRule.build({ workflowDefinitionId: 1, conditionType, conditionOperator, conditionValue, priority });

const context = (overrides: Partial<WorkflowMatchContext> = {}): WorkflowMatchContext => ({
  type: 'LAPTOP',
  amount: 200_000,
  metadata: { international: true, newVendor: true, durationDays: 30 },
  riskLevel: 'HIGH',
  riskScore: 65,
  ...overrides,
});

describe('Workflow rule evaluation', () => {
  it('matches a request type with EQUALS', () => {
    expect(evaluateRule(rule('REQUEST_TYPE', 'EQUALS', 'LAPTOP'), context())).toBe(true);
    expect(evaluateRule(rule('REQUEST_TYPE', 'EQUALS', 'TRAVEL'), context())).toBe(false);
  });

  it('matches a risk level against a comma-separated list with IN', () => {
    const lowOrMedium = rule('RISK_LEVEL', 'IN', 'LOW,MEDIUM');

    expect(evaluateRule(lowOrMedium, context({ riskLevel: 'MEDIUM' }))).toBe(true);
    expect(evaluateRule(lowOrMedium, context({ riskLevel: 'HIGH' }))).toBe(false);
  });

  it('compares amounts numerically rather than as strings', () => {
    // "90000" > "100000" lexicographically, so a string comparison would be wrong.
    expect(evaluateRule(rule('AMOUNT', 'GT', '100000'), context({ amount: 90_000 }))).toBe(false);
    expect(evaluateRule(rule('AMOUNT', 'GT', '100000'), context({ amount: 150_000 }))).toBe(true);
  });

  it('treats GTE and LTE as inclusive at the boundary', () => {
    expect(evaluateRule(rule('RISK_SCORE', 'GTE', '65'), context({ riskScore: 65 }))).toBe(true);
    expect(evaluateRule(rule('RISK_SCORE', 'LTE', '65'), context({ riskScore: 65 }))).toBe(true);
    expect(evaluateRule(rule('RISK_SCORE', 'LT', '65'), context({ riskScore: 65 }))).toBe(false);
  });

  it('reads nested values out of the request metadata', () => {
    const ctx = context({ metadata: { durationDays: 30 } });

    expect(evaluateRule(rule('METADATA.durationDays', 'GT', '15'), ctx)).toBe(true);
    expect(evaluateRule(rule('METADATA.durationDays', 'LTE', '15'), ctx)).toBe(false);
  });

  it('evaluates boolean metadata flags with IS_TRUE and IS_FALSE', () => {
    const international = context({ metadata: { international: true } });
    const domestic = context({ metadata: { international: false } });

    expect(evaluateRule(rule('METADATA.international', 'IS_TRUE', null), international)).toBe(true);
    expect(evaluateRule(rule('METADATA.international', 'IS_TRUE', null), domestic)).toBe(false);
    expect(evaluateRule(rule('METADATA.international', 'IS_FALSE', null), domestic)).toBe(true);
  });

  it('treats a missing metadata key as not matching a positive condition', () => {
    const ctx = context({ metadata: {} });

    expect(evaluateRule(rule('METADATA.international', 'IS_TRUE', null), ctx)).toBe(false);
    expect(evaluateRule(rule('METADATA.category', 'EQUALS', 'GIFTS'), ctx)).toBe(false);
    expect(evaluateRule(rule('METADATA.category', 'NOT_EQUALS', 'GIFTS'), ctx)).toBe(true);
  });
});

describe('Workflow definition matching', () => {
  it('requires every rule of a definition to pass', () => {
    const rules = [
      rule('REQUEST_TYPE', 'EQUALS', 'LAPTOP'),
      rule('RISK_LEVEL', 'EQUALS', 'HIGH'),
    ];

    expect(definitionMatches(rules, context())).toBe(true);
    expect(definitionMatches(rules, context({ riskLevel: 'LOW' }))).toBe(false);
  });

  it('treats a definition with no rules as a catch-all that always matches', () => {
    expect(definitionMatches([], context())).toBe(true);
    expect(definitionMatches([], context({ type: 'LEAVE', riskLevel: 'LOW' }))).toBe(true);
  });

  it('ranks a definition by the highest priority among its rules', () => {
    const highRiskVariant = [
      rule('REQUEST_TYPE', 'EQUALS', 'LAPTOP', 20),
      rule('RISK_LEVEL', 'EQUALS', 'HIGH', 20),
    ];
    const standardVariant = [rule('REQUEST_TYPE', 'EQUALS', 'LAPTOP', 10)];

    expect(definitionPriority(highRiskVariant)).toBe(20);
    expect(definitionPriority(standardVariant)).toBe(10);
    // The catch-all must always lose to any rule-bearing definition.
    expect(definitionPriority([])).toBe(0);
  });
});
