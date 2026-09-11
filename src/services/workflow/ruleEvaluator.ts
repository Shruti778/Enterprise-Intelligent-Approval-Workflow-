import { WorkflowRule } from '../../models';
import { RequestType, RiskLevel } from '../../types/domain';

export interface WorkflowMatchContext {
  type: RequestType;
  amount: number;
  metadata: Record<string, any>;
  riskLevel: RiskLevel;
  riskScore: number;
}

/** Resolves the left-hand side of a rule from the request context. */
function resolveOperand(conditionType: string, ctx: WorkflowMatchContext): unknown {
  const key = conditionType.toUpperCase();

  if (key === 'REQUEST_TYPE') return ctx.type;
  if (key === 'AMOUNT') return ctx.amount;
  if (key === 'RISK_LEVEL') return ctx.riskLevel;
  if (key === 'RISK_SCORE') return ctx.riskScore;

  if (key.startsWith('METADATA.')) {
    const path = conditionType.slice('METADATA.'.length);
    return path
      .split('.')
      .reduce<any>((acc, segment) => (acc == null ? undefined : acc[segment]), ctx.metadata);
  }

  return undefined;
}

const toList = (value: string | null): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const asNumber = (value: unknown): number => Number(value ?? 0);

const asBoolean = (value: unknown): boolean => value === true || value === 'true';

export function evaluateRule(rule: WorkflowRule, ctx: WorkflowMatchContext): boolean {
  const operand = resolveOperand(rule.conditionType, ctx);
  const expected = rule.conditionValue;

  switch (rule.conditionOperator) {
    case 'EQUALS':
      return String(operand ?? '') === String(expected ?? '');
    case 'NOT_EQUALS':
      return String(operand ?? '') !== String(expected ?? '');
    case 'IN':
      return toList(expected).includes(String(operand ?? ''));
    case 'NOT_IN':
      return !toList(expected).includes(String(operand ?? ''));
    case 'GT':
      return asNumber(operand) > asNumber(expected);
    case 'GTE':
      return asNumber(operand) >= asNumber(expected);
    case 'LT':
      return asNumber(operand) < asNumber(expected);
    case 'LTE':
      return asNumber(operand) <= asNumber(expected);
    case 'IS_TRUE':
      return asBoolean(operand);
    case 'IS_FALSE':
      return !asBoolean(operand);
    default:
      return false;
  }
}

/** A definition matches only when every one of its rules passes (logical AND). */
export function definitionMatches(rules: WorkflowRule[], ctx: WorkflowMatchContext): boolean {
  if (rules.length === 0) return true; // catch-all definition
  return rules.every((rule) => evaluateRule(rule, ctx));
}

/** Specificity of a definition - the highest priority among its rules. */
export function definitionPriority(rules: WorkflowRule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.priority), 0);
}
