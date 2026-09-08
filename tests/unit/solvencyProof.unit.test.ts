// Kymider — unit tests for the solvency circuit math.
//
// These tests exercise the reference implementation in client/proof/solvencyProof.ts,
// which is kept in lock-step with the arithmetic compiled into the `proveSolvency`
// circuit (contracts/solvencyProof.compact). They cover the circuit's edge
// cases: DTI = 0, boundary thresholds, zero income, net-worth flooring and
// Uint<64> overflow.

import { describe, it, expect } from 'vitest';
import {
  computeSolvency,
  computeNetWorth,
  computeDti,
  UINT64_MAX,
} from '../../client/proof/solvencyProof.js';

const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };

describe('computeNetWorth', () => {
  it('returns balance - debts when solvent', () => {
    expect(computeNetWorth({ balance: 1_000_000n, debts: 200_000n, income: 0n })).toBe(800_000n);
  });

  it('floors at 0 when debts exceed balance (no negative net worth)', () => {
    expect(computeNetWorth({ balance: 100n, debts: 200n, income: 0n })).toBe(0n);
  });

  it('is 0 when balance equals debts', () => {
    expect(computeNetWorth({ balance: 200n, debts: 200n, income: 0n })).toBe(0n);
  });
});

describe('computeDti', () => {
  it('computes integer/truncating DTI percentage', () => {
    expect(computeDti({ balance: 0n, debts: 200_000n, income: 10_000n })).toBe(2000n);
    expect(computeDti({ balance: 0n, debts: 10_000n, income: 10_000n })).toBe(100n);
  });

  it('is 0 when debts are 0 (DTI = 0 edge case)', () => {
    expect(computeDti({ balance: 0n, debts: 0n, income: 10_000n })).toBe(0n);
  });

  it('saturates for zero income (income must be > 0 in-circuit)', () => {
    expect(computeDti({ balance: 0n, debts: 100n, income: 0n })).toBe(UINT64_MAX);
  });
});

describe('computeSolvency (mirrors proveSolvency circuit)', () => {
  it('PASS when net worth >= threshold and DTI <= max', () => {
    expect(computeSolvency({ balance: 1_000_000n, debts: 300_000n, income: 1_000_000n }, CLAIM)).toBe('PASS');
  });

  it('FAIL when net worth is below threshold', () => {
    expect(computeSolvency({ balance: 400_000n, debts: 0n, income: 10_000n }, CLAIM)).toBe('FAIL');
  });

  it('FAIL when DTI exceeds the limit', () => {
    expect(computeSolvency({ balance: 1_000_000n, debts: 600_000n, income: 10_000n }, CLAIM)).toBe('FAIL');
  });

  it('FAIL when both criteria miss', () => {
    expect(computeSolvency({ balance: 10_000n, debts: 8_000n, income: 5_000n }, CLAIM)).toBe('FAIL');
  });

  it('FAIL when income is zero (in-circuit guard)', () => {
    expect(computeSolvency({ balance: 1_000_000n, debts: 0n, income: 0n }, CLAIM)).toBe('FAIL');
  });

  it('FAIL for debt levels that would overflow the circuit\'s Uint<64> DTI arithmetic', () => {
    const hugeDebts = 2n ** 60n;
    expect(computeSolvency({ balance: hugeDebts * 2n, debts: hugeDebts, income: hugeDebts }, CLAIM)).toBe('FAIL');
  });

  it('boundary: exactly at the threshold is PASS', () => {
    expect(computeSolvency({ balance: 500_000n, debts: 0n, income: 10_000n }, CLAIM)).toBe('PASS');
  });

  it('boundary: DTI exactly at max is PASS', () => {
    expect(computeSolvency({ balance: 1_000_000n, debts: 400_000n, income: 1_000_000n }, CLAIM)).toBe('PASS');
  });

  it('boundary: one unit above max DTI is FAIL', () => {
    expect(computeSolvency({ balance: 1_000_000n, debts: 400_100n, income: 10_000n }, CLAIM)).toBe('FAIL');
  });

  // Net worth floors at zero, so without an explicit solvency check an
  // insolvent borrower clears a zero threshold: 0 >= 0 holds.
  it('FAIL when debts exceed balance, even against a zero threshold', () => {
    const zeroThreshold = { thresholdNetWorth: 0n, maxDti: 40n };
    expect(
      computeSolvency({ balance: 10_000n, debts: 90_000n, income: 1_000_000n }, zeroThreshold),
    ).toBe('FAIL');
  });

  it('PASS at exactly break-even against a zero threshold', () => {
    const zeroThreshold = { thresholdNetWorth: 0n, maxDti: 40n };
    expect(
      computeSolvency({ balance: 90_000n, debts: 90_000n, income: 1_000_000n }, zeroThreshold),
    ).toBe('PASS');
  });
});