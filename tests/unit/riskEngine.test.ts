import { evaluateRisk, classify, RISK_THRESHOLDS } from '../../src/services/risk/riskEngine';
import {
  lowRiskLaptop,
  mediumRiskLaptop,
  highRiskLaptop,
  highRiskTravel,
} from '../helpers/fixtures';

/** Convenience: the score a single named factor contributed, or 0. */
const scoreOf = (result: ReturnType<typeof evaluateRisk>, factor: string) =>
  result.factors.find((candidate) => candidate.factor === factor)?.score ?? 0;

const factorNames = (result: ReturnType<typeof evaluateRisk>) =>
  result.factors.map((factor) => factor.factor);

describe('Risk engine - overall classification', () => {
  it('classifies a routine, low-value request as LOW risk', () => {
    const result = evaluateRisk(lowRiskLaptop());

    expect(result.level).toBe('LOW');
    expect(result.score).toBe(0);
    expect(result.factors).toHaveLength(0);
  });

  it('classifies a request with several moderate signals as MEDIUM risk', () => {
    const result = evaluateRisk(mediumRiskLaptop());

    expect(result.level).toBe('MEDIUM');
    expect(result.score).toBe(50);
  });

  it('classifies a high-value request from a new vendor as HIGH risk', () => {
    const result = evaluateRisk(highRiskLaptop());

    expect(result.level).toBe('HIGH');
    expect(result.score).toBe(65);
  });
});

describe('Risk engine - individual risk factors', () => {
  it('adds the high-amount factor when the amount exceeds 1,00,000', () => {
    const result = evaluateRisk({ type: 'LAPTOP', amount: 150_000, metadata: {} });

    expect(factorNames(result)).toContain('HIGH_AMOUNT');
    expect(scoreOf(result, 'HIGH_AMOUNT')).toBe(30);
    expect(factorNames(result)).not.toContain('ELEVATED_AMOUNT');
  });

  it('adds the elevated-amount factor between 50,000 and 1,00,000 instead of the high-amount one', () => {
    const result = evaluateRisk({ type: 'LAPTOP', amount: 75_000, metadata: {} });

    expect(scoreOf(result, 'ELEVATED_AMOUNT')).toBe(15);
    expect(factorNames(result)).not.toContain('HIGH_AMOUNT');
  });

  it('adds the international factor for cross-border requests', () => {
    const result = evaluateRisk({
      type: 'TRAVEL',
      amount: 10_000,
      metadata: { international: true },
    });

    expect(scoreOf(result, 'INTERNATIONAL')).toBe(20);
  });

  it('adds the urgency factor only when urgency is HIGH', () => {
    const urgent = evaluateRisk({ type: 'LAPTOP', amount: 0, metadata: { urgency: 'HIGH' } });
    const routine = evaluateRisk({ type: 'LAPTOP', amount: 0, metadata: { urgency: 'LOW' } });

    expect(scoreOf(urgent, 'URGENT')).toBe(10);
    expect(factorNames(routine)).not.toContain('URGENT');
  });

  it('adds the new-vendor factor when the vendor has no purchase history', () => {
    const result = evaluateRisk({ type: 'LAPTOP', amount: 0, metadata: { newVendor: true } });

    expect(scoreOf(result, 'NEW_VENDOR')).toBe(25);
  });

  it('flags an expense claim submitted without a receipt', () => {
    const result = evaluateRisk({
      type: 'EXPENSE',
      amount: 5_000,
      metadata: { receiptProvided: false },
    });

    expect(scoreOf(result, 'MISSING_RECEIPT')).toBe(15);
  });

  it('flags leave longer than fifteen days', () => {
    const result = evaluateRisk({ type: 'LEAVE', amount: 0, metadata: { durationDays: 30 } });

    expect(scoreOf(result, 'EXTENDED_LEAVE')).toBe(20);
  });

  it('does not apply expense-only or leave-only rules to other request types', () => {
    const laptop = evaluateRisk({
      type: 'LAPTOP',
      amount: 0,
      metadata: { receiptProvided: false, durationDays: 30 },
    });

    expect(laptop.factors).toHaveLength(0);
  });
});

describe('Risk engine - combining factors', () => {
  it('sums every factor that fires into the total score', () => {
    const result = evaluateRisk(highRiskLaptop());

    expect(factorNames(result).sort()).toEqual(['HIGH_AMOUNT', 'NEW_VENDOR', 'URGENT']);
    const sum = result.factors.reduce((total, factor) => total + factor.score, 0);
    expect(result.score).toBe(sum);
  });

  it('adds the compounding cross-border factor on top of its two triggers', () => {
    const result = evaluateRisk(highRiskTravel());

    expect(factorNames(result).sort()).toEqual([
      'CROSS_BORDER_HIGH_VALUE',
      'HIGH_AMOUNT',
      'INTERNATIONAL',
    ]);
    expect(result.score).toBe(65);
    expect(result.level).toBe('HIGH');
  });

  it('caps the score at 100 no matter how many factors fire', () => {
    const result = evaluateRisk({
      type: 'EXPENSE',
      amount: 500_000,
      metadata: {
        international: true,
        newVendor: true,
        urgency: 'HIGH',
        category: 'ENTERTAINMENT',
        receiptProvided: false,
        expenseDate: '2020-01-01',
      },
    });

    expect(result.factors.length).toBeGreaterThan(5);
    expect(result.score).toBe(100);
    expect(result.level).toBe('HIGH');
  });
});

describe('Risk engine - level boundaries', () => {
  it.each([
    [0, 'LOW'],
    [RISK_THRESHOLDS.LOW_MAX, 'LOW'],
    [RISK_THRESHOLDS.LOW_MAX + 1, 'MEDIUM'],
    [RISK_THRESHOLDS.MEDIUM_MAX, 'MEDIUM'],
    [RISK_THRESHOLDS.MEDIUM_MAX + 1, 'HIGH'],
    [100, 'HIGH'],
  ])('classifies a score of %i as %s', (score, level) => {
    expect(classify(score as number)).toBe(level);
  });

  it('places a request scoring exactly on the LOW ceiling in LOW, not MEDIUM', () => {
    // NEW_VENDOR 25 + no other factor = 25; adding URGENT 10 crosses into MEDIUM.
    const atCeiling = evaluateRisk({
      type: 'LAPTOP',
      amount: 10_000,
      metadata: { newVendor: true },
    });
    const justOver = evaluateRisk({
      type: 'LAPTOP',
      amount: 10_000,
      metadata: { newVendor: true, urgency: 'HIGH' },
    });

    expect(atCeiling.score).toBe(25);
    expect(atCeiling.level).toBe('LOW');
    expect(justOver.score).toBe(35);
    expect(justOver.level).toBe('MEDIUM');
  });
});

describe('Risk engine - responsibility boundary', () => {
  it('only scores a request: it never decides an approval outcome', () => {
    const result = evaluateRisk(highRiskLaptop());

    expect(Object.keys(result).sort()).toEqual(['engineVersion', 'factors', 'level', 'score']);
    expect(JSON.stringify(result)).not.toMatch(/APPROVED|REJECTED|approve|reject/i);
  });

  it('is pure: the same input always yields the same assessment', () => {
    const input = highRiskLaptop();

    expect(evaluateRisk(input)).toEqual(evaluateRisk(input));
  });

  it('explains every point it awards through a named factor', () => {
    const result = evaluateRisk(mediumRiskLaptop());

    result.factors.forEach((factor) => {
      expect(factor.description).toEqual(expect.any(String));
      expect(factor.description.length).toBeGreaterThan(0);
      expect(factor.score).toBeGreaterThan(0);
    });
  });
});
