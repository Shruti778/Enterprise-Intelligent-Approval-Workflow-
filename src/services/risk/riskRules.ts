import { RequestType, RiskFactorResult } from '../../types/domain';
import { formatINR } from '../../utils/currency';

export interface RiskEvaluationInput {
  type: RequestType;
  amount: number;
  metadata: Record<string, any>;
}

export interface RiskRule {
  factor: string;
  /** Returns the factor (with its score) when the rule fires, otherwise null. */
  evaluate(input: RiskEvaluationInput): RiskFactorResult | null;
}

/** Expense categories treated as inherently high risk when no explicit flag is set. */
export const HIGH_RISK_CATEGORIES = ['ENTERTAINMENT', 'GIFTS', 'CONSULTING', 'MISCELLANEOUS'];

const isTrue = (value: unknown): boolean => value === true || value === 'true';

const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

/**
 * Ordered rule set. Each rule is independent and explainable: the score of an
 * assessment is exactly the sum of the factors it produced.
 */
export const RISK_RULES: RiskRule[] = [
  {
    factor: 'HIGH_AMOUNT',
    evaluate: ({ amount }) =>
      amount > 100_000
        ? {
            factor: 'HIGH_AMOUNT',
            description: `Request amount ${formatINR(amount)} exceeds ${formatINR(100_000)}`,
            score: 30,
          }
        : null,
  },
  {
    factor: 'ELEVATED_AMOUNT',
    evaluate: ({ amount }) =>
      amount > 50_000 && amount <= 100_000
        ? {
            factor: 'ELEVATED_AMOUNT',
            description: `Request amount ${formatINR(amount)} exceeds ${formatINR(50_000)}`,
            score: 15,
          }
        : null,
  },
  {
    factor: 'INTERNATIONAL',
    evaluate: ({ metadata }) =>
      isTrue(metadata.international)
        ? { factor: 'INTERNATIONAL', description: 'International transaction', score: 20 }
        : null,
  },
  {
    factor: 'NEW_VENDOR',
    evaluate: ({ metadata }) =>
      isTrue(metadata.newVendor)
        ? { factor: 'NEW_VENDOR', description: 'Vendor has no prior purchase history', score: 25 }
        : null,
  },
  {
    factor: 'URGENT',
    evaluate: ({ metadata }) =>
      String(metadata.urgency ?? '').toUpperCase() === 'HIGH'
        ? { factor: 'URGENT', description: 'Marked as high urgency, reduces due-diligence time', score: 10 }
        : null,
  },
  {
    factor: 'HIGH_RISK_CATEGORY',
    evaluate: ({ metadata }) => {
      const category = String(metadata.category ?? '').toUpperCase();
      const flagged = isTrue(metadata.highRiskCategory) || HIGH_RISK_CATEGORIES.includes(category);
      return flagged
        ? {
            factor: 'HIGH_RISK_CATEGORY',
            description: category
              ? `Spend category "${category}" is classified as high risk`
              : 'Request belongs to a high-risk category',
            score: 15,
          }
        : null;
    },
  },
  {
    // Compounding rule: cross-border money movement at high value is materially
    // riskier than either signal alone.
    factor: 'CROSS_BORDER_HIGH_VALUE',
    evaluate: ({ amount, metadata }) =>
      isTrue(metadata.international) && amount > 100_000
        ? {
            factor: 'CROSS_BORDER_HIGH_VALUE',
            description: 'High-value international spend requires enhanced scrutiny',
            score: 15,
          }
        : null,
  },
  {
    factor: 'MISSING_RECEIPT',
    evaluate: ({ type, metadata }) =>
      type === 'EXPENSE' && metadata.receiptProvided === false
        ? { factor: 'MISSING_RECEIPT', description: 'No receipt attached to the expense claim', score: 15 }
        : null,
  },
  {
    factor: 'BACKDATED_EXPENSE',
    evaluate: ({ type, metadata }) => {
      if (type !== 'EXPENSE' || !metadata.expenseDate) return null;
      const expenseDate = new Date(String(metadata.expenseDate));
      if (Number.isNaN(expenseDate.getTime())) return null;
      const age = daysBetween(new Date(), expenseDate);
      return age > 90
        ? {
            factor: 'BACKDATED_EXPENSE',
            description: `Expense is ${Math.round(age)} days old, beyond the 90-day claim window`,
            score: 10,
          }
        : null;
    },
  },
  {
    factor: 'EXTENDED_LEAVE',
    evaluate: ({ type, metadata }) => {
      if (type !== 'LEAVE') return null;
      const days = Number(metadata.durationDays ?? 0);
      return days > 15
        ? {
            factor: 'EXTENDED_LEAVE',
            description: `Leave of ${days} days exceeds the 15-day threshold`,
            score: 20,
          }
        : null;
    },
  },
];
