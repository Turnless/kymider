// Kymider — Loan arithmetic, computed off-chain.
//
// Compact has no division, so the Loan circuit never divides: the caller
// passes each quotient in and the circuit checks it is exactly the floor (or
// ceiling) of the true value. These are the figures it will accept. Anything
// else is refused on-chain ("collateral does not match the tier", "owed does
// not match the terms", "installment does not match the terms").

import {
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import { Tier, type LoanLedger, type LoanTerms } from '../../contracts/index.js';
import type { FinancialFacts } from './solvencyProof.js';

export const VERIFIED_RATIO_BPS = 11_000n; // 110%
export const STANDARD_RATIO_BPS = 15_000n; // 150%
export const GRACE_SECONDS = 259_200n; // 3 days
export const MAX_PRINCIPAL = 1n << 40n;

// floor(principal * ratioBps / 10000), the circuit's isFloorOfBps.
const floorOfBps = (principal: bigint, ratioBps: bigint): bigint => (principal * ratioBps) / 10_000n;

/** The collateral the circuit accepts for a tier: 110% if VERIFIED, else 150%. */
export const collateralFor = (principal: bigint, tier: Tier): bigint =>
  floorOfBps(principal, tier === Tier.VERIFIED ? VERIFIED_RATIO_BPS : STANDARD_RATIO_BPS);

/** Principal plus flat interest, floored. */
export const owedFor = (terms: LoanTerms): bigint =>
  floorOfBps(terms.principal, 10_000n + terms.interestBps);

/** Equal installments, rounded up; the last one takes the remainder. */
export const installmentFor = (owed: bigint, installments: bigint): bigint =>
  (owed + installments - 1n) / installments;

/** What the next repayment must be: the installment, or the remainder if smaller. */
export const amountDue = (state: Pick<LoanLedger, 'balanceOwed' | 'installmentAmount'>): bigint =>
  state.balanceOwed < state.installmentAmount ? state.balanceOwed : state.installmentAmount;

/** Whether the tier proven on a loan still holds at `now` (seconds). */
export const tierIsLive = (state: Pick<LoanLedger, 'tier' | 'tierExpiresAt'>, now: bigint): boolean =>
  state.tier === Tier.VERIFIED && now < state.tierExpiresAt;

/** The first second at which the lender may call a default. */
export const defaultableFrom = (state: Pick<LoanLedger, 'nextDueAt'>): bigint =>
  state.nextDueAt + GRACE_SECONDS + 1n;

const u64x3 = new CompactTypeVector(3, new CompactTypeUnsignedInteger((1n << 64n) - 1n, 8));

/**
 * SolvencyProof.commitFacts, computed off-chain. A Loan instance is deployed
 * with the commitment its borrower's SolvencyProof instance publishes; this
 * gives the same bytes from the facts.
 */
export const commitFacts = (facts: FinancialFacts): Uint8Array =>
  persistentHash(u64x3, [facts.balance, facts.debts, facts.income]);

/** The wall clock in seconds, as block time is measured. */
export const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
