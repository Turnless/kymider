// Kymider — Loan contract tests, executed offline.
//
// These drive the COMPILED Compact program through the whole lifecycle: the
// tier proof that buys 110% collateral instead of 150%, the arithmetic checks
// on collateral, owed and installments, repayment and default timing against
// block time, and every caller-authorization assert. The refusals are the
// product: each one is a promise a lender or borrower can rely on.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import { LoanStatus, Tier } from '../../contracts/index.js';
import { loanPaymentNonce } from '../../contracts/witnesses.js';
import {
  LoanSimulator,
  SolvencySimulator,
  T0,
  commitFacts,
  pubKeyOf,
  skFrom,
} from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2);
const STRANGER_SK = skFrom(3);

const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_PK = pubKeyOf(LENDER_SK);

const HISTORY_SEED = new Uint8Array(32).fill(9);

// 1,000 principal, 10% flat interest, 3 installments a day apart.
// Owed 1,100; installments ceil(1100 / 3) = 367, 367, then 366.
const TERMS = { principal: 1_000n, interestBps: 1_000n, installments: 3n, periodSeconds: 86_400n };
const OWED = 1_100n;
const INSTALLMENT = 367n;
const VERIFIED_COLLATERAL = 1_100n; // 110%
const STANDARD_COLLATERAL = 1_500n; // 150%

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const BAR = { thresholdNetWorth: 500_000n, maxDti: 40n }; // net worth 700,000; DTI 30%
const QUOTE_TTL = 7n * 86_400n;
const GRACE = 259_200n; // 3 days

const deploy = (terms = TERMS): LoanSimulator =>
  new LoanSimulator(BORROWER_SK, LENDER_PK, terms, commitFacts(FACTS), HISTORY_SEED);

const quoted = (): LoanSimulator =>
  deploy().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);

const verified = (): LoanSimulator => quoted().as(BORROWER_SK).proveTier(FACTS);

const disbursed = (): LoanSimulator =>
  verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).disburse(T0, OWED, INSTALLMENT);

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

// The history chain, rebuilt off-chain the way the borrower would open it to
// an auditor: from the seed and the public payment records alone.
const bytes32 = new CompactTypeBytes(32);
const u64 = new CompactTypeUnsignedInteger((1n << 64n) - 1n, 8);
const pad32 = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s));
  return out;
};
const rebuildHistory = (payments: { amount: bigint; onTime: boolean }[]): Uint8Array =>
  payments.reduce(
    (head, p) =>
      persistentHash(new CompactTypeVector(4, bytes32), [
        head,
        persistentHash(new CompactTypeVector(1, u64), [p.amount]),
        pad32(p.onTime ? 'kymider:ontime' : 'kymider:late'),
        loanPaymentNonce(HISTORY_SEED, head),
      ]),
    persistentHash(new CompactTypeVector(1, bytes32), [pad32('kymider:loan:history:')]),
  );

describe('Loan — deployment', () => {
  it('records both parties, the terms and the facts commitment, and opens as APPLIED', () => {
    const state = deploy().ledger();

    expect(hex(state.borrower)).toBe(hex(BORROWER_PK));
    expect(hex(state.lender)).toBe(hex(LENDER_PK));
    expect(state.terms).toEqual(TERMS);
    expect(hex(state.factsCommitment)).toBe(hex(commitFacts(FACTS)));
    expect(state.status).toBe(LoanStatus.APPLIED);
    expect(state.tier).toBe(Tier.NONE);
    expect(state.quoted).toBe(false);
    expect(state.disbursed).toBe(false);
  });

  it("carries over the commitment published by the borrower's SolvencyProof instance", () => {
    const solvency = new SolvencySimulator(FACTS, BORROWER_SK);
    expect(hex(solvency.ledger().commitment)).toBe(hex(commitFacts(FACTS)));
  });

  it('refuses terms it cannot honour', () => {
    expect(() => deploy({ ...TERMS, principal: 0n })).toThrow(/principal must be non-zero/);
    expect(() => deploy({ ...TERMS, principal: (1n << 40n) + 1n })).toThrow(
      /principal exceeds supported range/,
    );
    expect(() => deploy({ ...TERMS, installments: 0n })).toThrow(/at least one installment/);
    expect(() => deploy({ ...TERMS, periodSeconds: 0n })).toThrow(/period must be non-zero/);
    expect(() => deploy({ ...TERMS, interestBps: 10_001n })).toThrow(
      /interest above 100% is not supported/,
    );
  });

  it('refuses a borrower lending to themselves', () => {
    expect(
      () => new LoanSimulator(BORROWER_SK, BORROWER_PK, TERMS, commitFacts(FACTS), HISTORY_SEED),
    ).toThrow(/borrower and lender must differ/);
  });
});

describe('Loan — quote', () => {
  let sim: LoanSimulator;

  beforeEach(() => {
    sim = deploy();
  });

  it('lets the lender name the bar and its expiry', () => {
    sim.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);
    const state = sim.ledger();
    expect(state.quoted).toBe(true);
    expect(state.quote).toEqual({ ...BAR, expiresAt: T0 + QUOTE_TTL });
  });

  it('refuses a quote from the borrower or a stranger', () => {
    expect(() => sim.as(BORROWER_SK).quoteTerms(1n, 40n, T0 + QUOTE_TTL)).toThrow(
      /only the lender may quote/,
    );
    expect(() => sim.as(STRANGER_SK).quoteTerms(1n, 40n, T0 + QUOTE_TTL)).toThrow(
      /only the lender may quote/,
    );
  });

  it('refuses a quote that has already expired', () => {
    expect(() => sim.as(LENDER_SK).quoteTerms(1n, 40n, T0)).toThrow(
      /quote would already have expired/,
    );
  });

  it('refuses a DTI limit above 10000%', () => {
    expect(() => sim.as(LENDER_SK).quoteTerms(1n, 10_001n, T0 + QUOTE_TTL)).toThrow(
      /max DTI limit too high/,
    );
  });

  it('a new quote clears a tier proven against the old one', () => {
    const s = verified();
    expect(s.ledger().tier).toBe(Tier.VERIFIED);
    s.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);
    expect(s.ledger().tier).toBe(Tier.NONE);
  });
});

describe('Loan — tier proof', () => {
  it('a borrower whose facts clear the bar earns the VERIFIED tier, until the quote lapses', () => {
    const state = verified().ledger();
    expect(state.tier).toBe(Tier.VERIFIED);
    expect(state.tierExpiresAt).toBe(T0 + QUOTE_TTL);
  });

  it('a borrower below the net-worth bar gets STANDARD, a usable answer rather than a refusal', () => {
    const sim = quoted().as(LENDER_SK).quoteTerms(800_000n, BAR.maxDti, T0 + QUOTE_TTL);
    sim.as(BORROWER_SK).proveTier(FACTS);
    expect(sim.ledger().tier).toBe(Tier.STANDARD);
  });

  it('a borrower above the DTI limit gets STANDARD', () => {
    const sim = quoted().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, 20n, T0 + QUOTE_TTL);
    sim.as(BORROWER_SK).proveTier(FACTS);
    expect(sim.ledger().tier).toBe(Tier.STANDARD);
  });

  it('an insolvent borrower gets STANDARD even against a zero net-worth bar', () => {
    const insolvent = { balance: 100n, debts: 500n, income: 1_000_000n };
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(insolvent), HISTORY_SEED)
      .as(LENDER_SK)
      .quoteTerms(0n, 100n, T0 + QUOTE_TTL)
      .as(BORROWER_SK)
      .proveTier(insolvent);
    expect(sim.ledger().tier).toBe(Tier.STANDARD);
  });

  it('refuses facts that do not match the commitment', () => {
    expect(() => quoted().as(BORROWER_SK).proveTier({ ...FACTS, balance: 9_000_000n })).toThrow(
      /facts do not match committed facts/,
    );
  });

  it('refuses a proof before the lender has quoted', () => {
    expect(() => deploy().as(BORROWER_SK).proveTier(FACTS)).toThrow(
      /the lender has not quoted yet/,
    );
  });

  it('refuses a proof against an expired quote', () => {
    expect(() => quoted().advance(QUOTE_TTL).as(BORROWER_SK).proveTier(FACTS)).toThrow(
      /quote has expired/,
    );
  });

  it('refuses a proof from anyone but the borrower', () => {
    expect(() => quoted().as(LENDER_SK).proveTier(FACTS)).toThrow(
      /only the borrower may prove a tier/,
    );
  });

  it('refuses a proof once the loan is underwritten', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.as(BORROWER_SK).proveTier(FACTS)).toThrow(
      /loan is no longer open to proofs/,
    );
  });
});

describe('Loan — underwriting', () => {
  it('a verified borrower is underwritten at 110% collateral', () => {
    const state = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).ledger();
    expect(state.status).toBe(LoanStatus.ACTIVE);
    expect(state.tier).toBe(Tier.VERIFIED);
    expect(state.collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('a lender cannot quietly ask a verified borrower for 150%', () => {
    expect(() => verified().as(LENDER_SK).underwrite(STANDARD_COLLATERAL)).toThrow(
      /collateral does not match the tier/,
    );
  });

  it('a borrower who never proved is underwritten at 150%, and only 150%', () => {
    expect(() => quoted().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL)).toThrow(
      /collateral does not match the tier/,
    );
    const state = quoted().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).ledger();
    expect(state.tier).toBe(Tier.STANDARD);
    expect(state.collateralRequired).toBe(STANDARD_COLLATERAL);
  });

  it('a STANDARD proof is underwritten at 150%', () => {
    const sim = quoted().as(LENDER_SK).quoteTerms(800_000n, BAR.maxDti, T0 + QUOTE_TTL);
    sim.as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(STANDARD_COLLATERAL).ledger().tier).toBe(Tier.STANDARD);
  });

  it('a lapsed tier falls back to 150%', () => {
    const sim = verified().advance(QUOTE_TTL).as(LENDER_SK);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(STANDARD_COLLATERAL).ledger().tier).toBe(Tier.STANDARD);
  });

  it('accepts only the exact floor of the ratio', () => {
    const odd = { ...TERMS, principal: 1_001n }; // 110% = 1101.1, floored to 1101
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, odd, commitFacts(FACTS), HISTORY_SEED)
      .as(LENDER_SK)
      .quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL)
      .as(BORROWER_SK)
      .proveTier(FACTS)
      .as(LENDER_SK);
    expect(() => sim.underwrite(1_102n)).toThrow(/collateral does not match the tier/);
    expect(() => sim.underwrite(1_100n)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(1_101n).ledger().collateralRequired).toBe(1_101n);
  });

  it('refuses underwriting from the borrower', () => {
    expect(() => verified().as(BORROWER_SK).underwrite(VERIFIED_COLLATERAL)).toThrow(
      /only the lender may underwrite/,
    );
  });

  it('lets the lender decline, which closes the loan', () => {
    const sim = quoted().as(LENDER_SK).decline();
    expect(sim.ledger().status).toBe(LoanStatus.DECLINED);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/loan is not awaiting underwriting/);
  });

  it('refuses a decline from the borrower', () => {
    expect(() => quoted().as(BORROWER_SK).decline()).toThrow(/only the lender may decline/);
  });
});

describe('Loan — disbursement', () => {
  let sim: LoanSimulator;

  beforeEach(() => {
    sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
  });

  it('sets the balance, the installment and the first due date', () => {
    const state = sim.disburse(T0, OWED, INSTALLMENT).ledger();
    expect(state.disbursed).toBe(true);
    expect(state.balanceOwed).toBe(OWED);
    expect(state.installmentAmount).toBe(INSTALLMENT);
    expect(state.nextDueAt).toBe(T0 + TERMS.periodSeconds);
  });

  it('refuses an owed figure that does not match the terms', () => {
    expect(() => sim.disburse(T0, OWED + 1n, INSTALLMENT)).toThrow(/owed does not match the terms/);
  });

  it('refuses an installment that does not match the terms', () => {
    expect(() => sim.disburse(T0, OWED, 366n)).toThrow(/installment does not match the terms/);
    expect(() => sim.disburse(T0, OWED, 368n)).toThrow(/installment does not match the terms/);
  });

  it('refuses a start time in the future or more than an hour old', () => {
    expect(() => sim.disburse(T0 + 1n, OWED, INSTALLMENT)).toThrow(/start time is in the future/);
    expect(() => sim.disburse(T0 - 3_600n, OWED, INSTALLMENT)).toThrow(/start time is stale/);
  });

  it('refuses a second disbursement', () => {
    sim.disburse(T0, OWED, INSTALLMENT);
    expect(() => sim.disburse(T0, OWED, INSTALLMENT)).toThrow(/already disbursed/);
  });

  it('refuses a disbursement from the borrower', () => {
    expect(() => sim.as(BORROWER_SK).disburse(T0, OWED, INSTALLMENT)).toThrow(
      /only the lender may disburse/,
    );
  });

  it('refuses a disbursement before underwriting', () => {
    expect(() => quoted().as(LENDER_SK).disburse(T0, OWED, INSTALLMENT)).toThrow(
      /loan is not active/,
    );
  });
});

describe('Loan — repayment', () => {
  let sim: LoanSimulator;

  beforeEach(() => {
    sim = disbursed();
  });

  it('three on-time installments, the last one smaller, repay the loan', () => {
    sim.as(BORROWER_SK).repay(367n).repay(367n);
    expect(sim.ledger().balanceOwed).toBe(366n);
    sim.repay(366n);

    const state = sim.ledger();
    expect(state.status).toBe(LoanStatus.REPAID);
    expect(state.balanceOwed).toBe(0n);
    expect(state.paymentsMade).toBe(3n);
    expect(state.latePayments).toBe(0n);
  });

  it('commits to the payment history, and the borrower can rebuild it from the seed', () => {
    sim.as(BORROWER_SK).repay(367n).repay(367n).repay(366n);
    const expected = rebuildHistory([
      { amount: 367n, onTime: true },
      { amount: 367n, onTime: true },
      { amount: 366n, onTime: true },
    ]);
    expect(hex(sim.ledger().historyCommitment)).toBe(hex(expected));
  });

  it('a payment after its due date counts as late, by block time', () => {
    sim.as(BORROWER_SK).advance(TERMS.periodSeconds + 1n).repay(367n);
    const state = sim.ledger();
    expect(state.latePayments).toBe(1n);
    expect(state.nextDueAt).toBe(T0 + 2n * TERMS.periodSeconds);
    expect(hex(state.historyCommitment)).toBe(hex(rebuildHistory([{ amount: 367n, onTime: false }])));
  });

  it('a payment exactly on its due date is on time', () => {
    sim.as(BORROWER_SK).advance(TERMS.periodSeconds).repay(367n);
    expect(sim.ledger().latePayments).toBe(0n);
  });

  it('refuses anything but the installment due', () => {
    expect(() => sim.as(BORROWER_SK).repay(366n)).toThrow(/repay exactly the installment due/);
    expect(() => sim.as(BORROWER_SK).repay(OWED)).toThrow(/repay exactly the installment due/);
  });

  it('refuses a repayment from the lender or a stranger', () => {
    expect(() => sim.as(LENDER_SK).repay(367n)).toThrow(/only the borrower may repay/);
    expect(() => sim.as(STRANGER_SK).repay(367n)).toThrow(/only the borrower may repay/);
  });

  it('refuses a repayment before disbursement', () => {
    const s = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => s.as(BORROWER_SK).repay(367n)).toThrow(/nothing was disbursed/);
  });

  it('refuses a repayment once the loan is repaid', () => {
    sim.as(BORROWER_SK).repay(367n).repay(367n).repay(366n);
    expect(() => sim.repay(366n)).toThrow(/loan is not active/);
  });
});

describe('Loan — default', () => {
  let sim: LoanSimulator;

  beforeEach(() => {
    sim = disbursed();
  });

  it('the lender can call a default once an installment is past its grace period', () => {
    sim.at(T0 + TERMS.periodSeconds + GRACE + 1n).as(LENDER_SK).markDefault();
    expect(sim.ledger().status).toBe(LoanStatus.DEFAULTED);
    expect(() => sim.as(BORROWER_SK).repay(367n)).toThrow(/loan is not active/);
  });

  it('refuses a default within the grace period, up to its last second', () => {
    sim.as(LENDER_SK);
    expect(() => sim.at(T0 + TERMS.periodSeconds + 1n).markDefault()).toThrow(
      /installment is not past its grace period/,
    );
    expect(() => sim.at(T0 + TERMS.periodSeconds + GRACE).markDefault()).toThrow(
      /installment is not past its grace period/,
    );
  });

  it('an on-time payment moves the default clock to the next installment', () => {
    sim.as(BORROWER_SK).repay(367n);
    sim.at(T0 + TERMS.periodSeconds + GRACE + 1n).as(LENDER_SK);
    expect(() => sim.markDefault()).toThrow(/installment is not past its grace period/);
  });

  it('refuses a default called by the borrower', () => {
    sim.at(T0 + TERMS.periodSeconds + GRACE + 1n);
    expect(() => sim.as(BORROWER_SK).markDefault()).toThrow(/only the lender may call a default/);
  });

  it('refuses a default on a loan never disbursed', () => {
    const s = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => s.markDefault()).toThrow(/nothing was disbursed/);
  });
});
