import type { RequestType } from '../../src/types/domain';

export interface RequestFixture {
  type: RequestType;
  title: string;
  description?: string;
  amount: number;
  metadata: Record<string, any>;
}

/**
 * Scored by the real rules in src/services/risk/riskRules.ts:
 *   HIGH_AMOUNT 30 | ELEVATED_AMOUNT 15 | INTERNATIONAL 20 | NEW_VENDOR 25
 *   URGENT 10 | HIGH_RISK_CATEGORY 15 | CROSS_BORDER_HIGH_VALUE 15
 *   MISSING_RECEIPT 15 | BACKDATED_EXPENSE 10 | EXTENDED_LEAVE 20
 * Levels: score <= 30 LOW, <= 60 MEDIUM, otherwise HIGH.
 */

/** Score 0 -> LOW. Routes to "Laptop - Standard Approval" (MANAGER -> IT). */
export const lowRiskLaptop = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'LAPTOP',
  title: 'Standard development laptop',
  description: 'Replacement machine for day-to-day work.',
  amount: 30_000,
  metadata: {
    specification: 'Dell Latitude 5440, 16GB RAM',
    purpose: 'Development',
    urgency: 'LOW',
    newVendor: false,
  },
  ...overrides,
});

/** ELEVATED_AMOUNT 15 + NEW_VENDOR 25 + URGENT 10 = 50 -> MEDIUM. */
export const mediumRiskLaptop = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'LAPTOP',
  title: 'Workstation for the design team',
  amount: 80_000,
  metadata: {
    specification: 'ThinkPad P1 Gen 6',
    purpose: 'Design',
    urgency: 'HIGH',
    newVendor: true,
  },
  ...overrides,
});

/**
 * HIGH_AMOUNT 30 + NEW_VENDOR 25 + URGENT 10 = 65 -> HIGH.
 * Routes to "Laptop - High Risk Approval":
 * MANAGER -> FINANCE -> COMPLIANCE -> DIRECTOR, all sequential.
 */
export const highRiskLaptop = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'LAPTOP',
  title: 'MacBook Pro M3 Max for ML workloads',
  description: 'High specification machine from a vendor we have not used before.',
  amount: 200_000,
  metadata: {
    specification: 'MacBook Pro 16" M3 Max, 64GB RAM, 2TB SSD',
    purpose: 'Machine learning research',
    urgency: 'HIGH',
    newVendor: true,
  },
  ...overrides,
});

/**
 * HIGH_AMOUNT 30 + INTERNATIONAL 20 + CROSS_BORDER_HIGH_VALUE 15 = 65 -> HIGH.
 * Routes to "Travel - High Risk Approval", whose stage 2 runs
 * FINANCE and COMPLIANCE in PARALLEL before DIRECTOR sign-off.
 */
export const highRiskTravel = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'TRAVEL',
  title: 'Partner summit in Berlin',
  amount: 200_000,
  metadata: {
    destination: 'Berlin',
    international: true,
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    purpose: 'Partner summit',
  },
  ...overrides,
});

/** Score 0 -> LOW. Routes to "Travel - Standard Approval" (MANAGER only). */
export const lowRiskTravel = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'TRAVEL',
  title: 'Client visit in Bengaluru',
  amount: 20_000,
  metadata: {
    destination: 'Bengaluru',
    international: false,
    startDate: '2026-10-05',
    endDate: '2026-10-07',
    purpose: 'Client meeting',
  },
  ...overrides,
});

/** durationDays 30 -> EXTENDED_LEAVE 20, and routes to MANAGER -> DIRECTOR. */
export const extendedLeave = (overrides: Partial<RequestFixture> = {}): RequestFixture => ({
  type: 'LEAVE',
  title: 'Sabbatical leave',
  amount: 0,
  metadata: {
    leaveType: 'UNPAID',
    startDate: '2026-12-01',
    endDate: '2026-12-30',
    durationDays: 30,
    reason: 'Personal sabbatical',
  },
  ...overrides,
});
