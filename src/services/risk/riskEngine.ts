import { Transaction } from 'sequelize';
import { RiskAssessment, RiskFactor } from '../../models';
import { RiskLevel, RiskResult, RiskFactorResult, RequestType } from '../../types/domain';
import { RISK_RULES, RiskEvaluationInput } from './riskRules';

export const RISK_ENGINE_VERSION = '1.0.0';

const MAX_SCORE = 100;

export const RISK_THRESHOLDS = {
  LOW_MAX: 30,
  MEDIUM_MAX: 60,
};

export function classify(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.LOW_MAX) return 'LOW';
  if (score <= RISK_THRESHOLDS.MEDIUM_MAX) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Pure evaluation: no database access, no approval logic. Given the attributes
 * of a request it returns a score, a level and the factors that explain them.
 */
export function evaluateRisk(input: {
  type: RequestType;
  amount?: number | null;
  metadata?: Record<string, any> | null;
}): RiskResult {
  const normalised: RiskEvaluationInput = {
    type: input.type,
    amount: Number(input.amount ?? 0),
    metadata: input.metadata ?? {},
  };

  const factors: RiskFactorResult[] = [];
  for (const rule of RISK_RULES) {
    const hit = rule.evaluate(normalised);
    if (hit) factors.push(hit);
  }

  const rawScore = factors.reduce((total, factor) => total + factor.score, 0);
  const score = Math.min(rawScore, MAX_SCORE);

  return { score, level: classify(score), factors, engineVersion: RISK_ENGINE_VERSION };
}

/** Evaluates a request and persists the assessment together with its factors. */
export async function assessAndPersist(
  request: { id: number; type: RequestType; amount: number; metadata: Record<string, any> },
  transaction?: Transaction
): Promise<{ result: RiskResult; assessment: RiskAssessment }> {
  const result = evaluateRisk(request);

  const assessment = await RiskAssessment.create(
    {
      requestId: request.id,
      score: result.score,
      level: result.level,
      evaluatedAt: new Date(),
      engineVersion: result.engineVersion,
    },
    { transaction }
  );

  if (result.factors.length > 0) {
    await RiskFactor.bulkCreate(
      result.factors.map((factor) => ({
        riskAssessmentId: assessment.id,
        factor: factor.factor,
        description: factor.description,
        score: factor.score,
      })),
      { transaction }
    );
  }

  return { result, assessment };
}
