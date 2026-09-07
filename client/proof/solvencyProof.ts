// Kymider — solvency proof math (Wave 1).
//
// This module is the reference implementation of the arithmetic compiled into
// the `proveSolvency` circuit in contracts/solvencyProof.compact. It is the
// single place the client derives the facts/claim inputs passed to the circuit,
// and the single place unit tests exercise the circuit's edge cases (DTI = 0,
// boundary thresholds, zero income, net worth flooring).
//
// Keep this file in lock-step with the Compact code:
//   - netWorth = balance >= debts ? balance - debts : 0
//   - DTI criterion (exact, no division — Compact has no `/` operator):
//     PASS iff netWorth >= thresholdNetWorth && debts * 100 <= maxDti * income
//
// The circuit enforces the same semantics over Uint<64>, with range guards in
// the contract (constructor/updateFacts bound facts to 2^50; requestClaim
// bounds maxDti to 10000) so the `* 100` products cannot overflow 64 bits.

export interface FinancialFacts {
  balance: bigint;
  debts: bigint;
  income: bigint;
}

export interface ClaimParams {
  thresholdNetWorth: bigint;
  maxDti: bigint;
}

export type SolvencyVerdict = 'PASS' | 'FAIL';

export const UINT64_MAX = (1n << 64n) - 1n;

export function computeNetWorth(facts: FinancialFacts): bigint {
  return facts.balance >= facts.debts ? facts.balance - facts.debts : 0n;
}

// Display helper only — the verdict uses the cross-multiplied DTI check
// (no truncation), while this returns the classic truncated percentage.
export function computeDti(facts: FinancialFacts): bigint {
  if (facts.income <= 0n) {
    return UINT64_MAX;
  }
  return (facts.debts * 100n) / facts.income;
}

export function computeSolvency(facts: FinancialFacts, claim: ClaimParams): SolvencyVerdict {
  if (facts.income <= 0n) {
    return 'FAIL';
  }
  const netWorth = computeNetWorth(facts);
  const dtiQualified = facts.debts * 100n <= claim.maxDti * facts.income;
  return netWorth >= claim.thresholdNetWorth && dtiQualified ? 'PASS' : 'FAIL';
}