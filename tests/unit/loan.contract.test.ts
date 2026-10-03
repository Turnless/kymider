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
import { LoanStatus, Tier, loanPureCircuits } from '../../contracts/index.js';
import { MIN_QUOTE_SECONDS } from '../../contracts/loanMath.js';
import { loanPaymentNonce } from '../../contracts/witnesses.js';
import {
  LoanSimulator,
  SolvencySimulator,
  T0,
  commitFacts,
  TEST_SALT,
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
  new LoanSimulator(BORROWER_SK, LENDER_PK, terms, commitFacts(FACTS, TEST_SALT), HISTORY_SEED);

const quoted = (): LoanSimulator =>
  deploy().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);

const verified = (): LoanSimulator => quoted().as(BORROWER_SK).proveTier(FACTS);

// A quote this borrower's facts do not clear (net worth 700,000 < 800,000):
// the proof answers it STANDARD.
const quotedHigh = (): LoanSimulator =>
  deploy().as(LENDER_SK).quoteTerms(800_000n, BAR.maxDti, T0 + QUOTE_TTL);
const standard = (): LoanSimulator => quotedHigh().as(BORROWER_SK).proveTier(FACTS);

// The borrower answers the quote without proving: the 150% route.
const waived = (): LoanSimulator => quoted().as(BORROWER_SK).waiveProof();

// The lender offers 110% and the borrower accepts: ACTIVE, ready to disburse.
// Left acting as the lender.
const active = (): LoanSimulator =>
  verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK).accept().as(LENDER_SK);

const disbursed = (): LoanSimulator => active().disburse(T0, OWED, INSTALLMENT);

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
    expect(hex(state.factsCommitment)).toBe(hex(commitFacts(FACTS, TEST_SALT)));
    expect(state.status).toBe(LoanStatus.APPLIED);
    expect(state.tier).toBe(Tier.NONE);
    expect(state.quoted).toBe(false);
    expect(state.disbursed).toBe(false);
  });

  it("carries over the commitment published by the borrower's SolvencyProof instance", () => {
    const solvency = new SolvencySimulator(FACTS, BORROWER_SK);
    expect(hex(solvency.ledger().commitment)).toBe(hex(commitFacts(FACTS, TEST_SALT)));
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
      () => new LoanSimulator(BORROWER_SK, BORROWER_PK, TERMS, commitFacts(FACTS, TEST_SALT), HISTORY_SEED),
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

  it('refuses a quote that holds less than 30 minutes, to the second', () => {
    sim.as(LENDER_SK);
    expect(() => sim.quoteTerms(1n, 40n, T0)).toThrow(/quote must hold at least 30 minutes/);
    expect(() => sim.quoteTerms(1n, 40n, T0 - 1n)).toThrow(/quote must hold at least 30 minutes/);
    expect(() => sim.quoteTerms(1n, 40n, T0 + 2n)).toThrow(/quote must hold at least 30 minutes/);
    expect(() => sim.quoteTerms(1n, 40n, T0 + 1_799n)).toThrow(/quote must hold at least 30 minutes/);
    // An expiry below 30 minutes past the epoch must not underflow the check.
    expect(() => sim.quoteTerms(1n, 40n, 0n)).toThrow(/quote must hold at least 30 minutes/);
    expect(() => sim.quoteTerms(1n, 40n, 1_799n)).toThrow(/quote must hold at least 30 minutes/);
    expect(sim.ledger().quotesIssued).toBe(0n);
    sim.quoteTerms(1n, 40n, T0 + 1_800n);
    expect(sim.ledger().quote.expiresAt).toBe(T0 + 1_800n);
  });

  it('reads the 30-minute floor from the contract', () => {
    expect(loanPureCircuits.minQuoteSeconds()).toBe(MIN_QUOTE_SECONDS);
  });

  it('refuses a DTI limit above 10000%', () => {
    expect(() => sim.as(LENDER_SK).quoteTerms(1n, 10_001n, T0 + QUOTE_TTL)).toThrow(
      /max DTI limit too high/,
    );
  });

  it('a new quote clears a STANDARD tier proven against the old one', () => {
    const s = standard();
    expect(s.ledger().tier).toBe(Tier.STANDARD);
    s.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);
    expect(s.ledger().tier).toBe(Tier.NONE);
  });

  it('a live VERIFIED tier cannot be re-quoted away, up to its last second', () => {
    const s = verified().as(LENDER_SK);
    expect(() => s.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL)).toThrow(
      /a verified tier is live until it lapses/,
    );
    s.at(T0 + QUOTE_TTL - 1n);
    expect(() => s.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 2n * QUOTE_TTL)).toThrow(
      /a verified tier is live until it lapses/,
    );
    expect(s.ledger().tier).toBe(Tier.VERIFIED);
    expect(s.ledger().quotesIssued).toBe(1n);
    // Once it lapses the lender may quote again; the borrower may prove again.
    s.at(T0 + QUOTE_TTL).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 2n * QUOTE_TTL);
    expect(s.ledger().tier).toBe(Tier.NONE);
    expect(s.as(BORROWER_SK).proveTier(FACTS).ledger().tier).toBe(Tier.VERIFIED);
  });
});

describe('Loan — tier proof', () => {
  it('a borrower whose facts clear the bar earns the VERIFIED tier, until the quote lapses', () => {
    const state = verified().ledger();
    expect(state.tier).toBe(Tier.VERIFIED);
    expect(state.tierExpiresAt).toBe(T0 + QUOTE_TTL);
  });

  it('a borrower below the net-worth bar gets STANDARD, a usable answer rather than a refusal', () => {
    expect(standard().ledger().tier).toBe(Tier.STANDARD);
  });

  it('a borrower above the DTI limit gets STANDARD', () => {
    const sim = deploy().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, 20n, T0 + QUOTE_TTL);
    sim.as(BORROWER_SK).proveTier(FACTS);
    expect(sim.ledger().tier).toBe(Tier.STANDARD);
  });

  it('an insolvent borrower gets STANDARD even against a zero net-worth bar', () => {
    const insolvent = { balance: 100n, debts: 500n, income: 1_000_000n };
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(insolvent, TEST_SALT), HISTORY_SEED)
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

  it('refuses a proof while an offer is standing, and once the loan is active', () => {
    const sim = waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL);
    expect(() => sim.as(BORROWER_SK).proveTier(FACTS)).toThrow(/loan is no longer open to proofs/);
    expect(() => active().as(BORROWER_SK).proveTier(FACTS)).toThrow(/loan is no longer open to proofs/);
  });

  it('after declining a 150% offer on a lapsed quote, a new quote lets the borrower prove', () => {
    const sim = quoted().advance(QUOTE_TTL).as(LENDER_SK).underwrite(STANDARD_COLLATERAL);
    sim.as(BORROWER_SK).declineOffer();
    sim.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, sim.now + QUOTE_TTL);
    expect(sim.as(BORROWER_SK).proveTier(FACTS).ledger().tier).toBe(Tier.VERIFIED);
  });
});

describe('Loan — underwriting (the lender offers)', () => {
  it('a verified borrower is offered 110% collateral, and nothing is binding yet', () => {
    const state = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).ledger();
    expect(state.status).toBe(LoanStatus.OFFERED);
    expect(state.offeredTier).toBe(Tier.VERIFIED);
    expect(state.offeredCollateral).toBe(VERIFIED_COLLATERAL);
    expect(state.collateralRequired).toBe(0n);
  });

  it('the lender can only offer a verified borrower the 110% figure', () => {
    expect(() => verified().as(LENDER_SK).underwrite(STANDARD_COLLATERAL)).toThrow(
      /collateral does not match the tier/,
    );
  });

  it('a borrower who waived the proof is offered 150%, and only 150%', () => {
    expect(() => waived().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL)).toThrow(
      /collateral does not match the tier/,
    );
    const state = waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).ledger();
    expect(state.offeredTier).toBe(Tier.STANDARD);
    expect(state.offeredCollateral).toBe(STANDARD_COLLATERAL);
    // The waiver is not a tier, and an offer does not rewrite it.
    expect(state.tier).toBe(Tier.NONE);
  });

  it('a borrower who never answered is offered 150% once the quote lapses, and only 150%', () => {
    const sim = quoted().advance(QUOTE_TTL).as(LENDER_SK);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(STANDARD_COLLATERAL).ledger().offeredTier).toBe(Tier.STANDARD);
  });

  it('a STANDARD proof is offered 150%', () => {
    const sim = standard().as(LENDER_SK);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(STANDARD_COLLATERAL).ledger().offeredTier).toBe(Tier.STANDARD);
  });

  it('a lapsed tier falls back to 150%', () => {
    const sim = verified().advance(QUOTE_TTL).as(LENDER_SK);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(STANDARD_COLLATERAL).ledger().offeredTier).toBe(Tier.STANDARD);
  });

  it('accepts only the exact floor of the ratio', () => {
    const odd = { ...TERMS, principal: 1_001n }; // 110% = 1101.1, floored to 1101
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, odd, commitFacts(FACTS, TEST_SALT), HISTORY_SEED)
      .as(LENDER_SK)
      .quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL)
      .as(BORROWER_SK)
      .proveTier(FACTS)
      .as(LENDER_SK);
    expect(() => sim.underwrite(1_102n)).toThrow(/collateral does not match the tier/);
    expect(() => sim.underwrite(1_100n)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(1_101n).ledger().offeredCollateral).toBe(1_101n);
    expect(sim.as(BORROWER_SK).accept().ledger().collateralRequired).toBe(1_101n);
  });

  it('refuses underwriting from the borrower', () => {
    expect(() => verified().as(BORROWER_SK).underwrite(VERIFIED_COLLATERAL)).toThrow(
      /only the lender may underwrite/,
    );
  });

  it('refuses a second offer while one is standing', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/loan is not awaiting underwriting/);
  });

  it('lets the lender decline, which closes the loan', () => {
    const sim = quoted().as(LENDER_SK).decline();
    expect(sim.ledger().status).toBe(LoanStatus.DECLINED);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/loan is not awaiting underwriting/);
  });

  it('lets the lender withdraw an offer the borrower has not accepted', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).decline();
    expect(sim.ledger().status).toBe(LoanStatus.DECLINED);
    expect(() => sim.as(BORROWER_SK).accept()).toThrow(/there is no offer to accept/);
  });

  it('refuses a decline from the borrower, and once the loan is active', () => {
    expect(() => quoted().as(BORROWER_SK).decline()).toThrow(/only the lender may decline/);
    expect(() => active().decline()).toThrow(/loan is not awaiting underwriting/);
  });
});

describe('Loan — borrower consent (accept or decline the offer)', () => {
  it('accepting makes the offer binding: ACTIVE at the offered tier and collateral', () => {
    const state = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK).accept().ledger();
    expect(state.status).toBe(LoanStatus.ACTIVE);
    expect(state.tier).toBe(Tier.VERIFIED);
    expect(state.collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('accepting a 150% offer records the STANDARD tier', () => {
    const state = waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).as(BORROWER_SK).accept().ledger();
    expect(state.tier).toBe(Tier.STANDARD);
    expect(state.collateralRequired).toBe(STANDARD_COLLATERAL);
  });

  it('declining clears the offer and reopens the application', () => {
    const state = waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).as(BORROWER_SK).declineOffer().ledger();
    expect(state.status).toBe(LoanStatus.APPLIED);
    expect(state.offeredCollateral).toBe(0n);
    expect(state.offeredTier).toBe(Tier.NONE);
    expect(state.collateralRequired).toBe(0n);
  });

  it('only the borrower may accept or decline the offer', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.as(LENDER_SK).accept()).toThrow(/only the borrower may accept an offer/);
    expect(() => sim.as(STRANGER_SK).accept()).toThrow(/only the borrower may accept an offer/);
    expect(() => sim.as(LENDER_SK).declineOffer()).toThrow(/only the borrower may decline an offer/);
    expect(() => sim.as(STRANGER_SK).declineOffer()).toThrow(/only the borrower may decline an offer/);
    expect(sim.ledger().status).toBe(LoanStatus.OFFERED);
  });

  it('there is nothing to accept or decline before an offer, or after accepting', () => {
    expect(() => quoted().as(BORROWER_SK).accept()).toThrow(/there is no offer to accept/);
    expect(() => quoted().as(BORROWER_SK).declineOffer()).toThrow(/there is no offer to decline/);
    const sim = active().as(BORROWER_SK);
    expect(() => sim.accept()).toThrow(/there is no offer to accept/);
    expect(() => sim.declineOffer()).toThrow(/there is no offer to decline/);
  });

  it('refuses a disbursement before the borrower accepts', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.disburse(T0, OWED, INSTALLMENT)).toThrow(/loan is not active/);
    expect(() => sim.as(BORROWER_SK).repay(INSTALLMENT)).toThrow(/loan is not active/);
  });

  it('the borrower names the figure they accept; any other is refused ("offer changed")', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK);
    for (const wrong of [STANDARD_COLLATERAL, VERIFIED_COLLATERAL - 1n, VERIFIED_COLLATERAL + 1n, 0n]) {
      expect(() => sim.accept(wrong)).toThrow(/offer changed/);
    }
    expect(sim.ledger().status).toBe(LoanStatus.OFFERED);
    expect(sim.ledger().collateralRequired).toBe(0n);
    const state = sim.accept(VERIFIED_COLLATERAL).ledger();
    expect(state.status).toBe(LoanStatus.ACTIVE);
    expect(state.collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('a consent given for one offer does not carry to the next: decline 150%, the lender re-offers, the old figure is refused', () => {
    const sim = quoted().advance(QUOTE_TTL).as(LENDER_SK).underwrite(STANDARD_COLLATERAL);
    sim.as(BORROWER_SK).declineOffer();
    sim.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, sim.now + QUOTE_TTL);
    sim.as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.as(BORROWER_SK).accept(STANDARD_COLLATERAL)).toThrow(/offer changed/);
    expect(sim.accept(VERIFIED_COLLATERAL).ledger().collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('after a decline the lender may offer again, still only the tier figure', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK).declineOffer();
    sim.as(LENDER_SK);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.underwrite(VERIFIED_COLLATERAL).ledger().status).toBe(LoanStatus.OFFERED);
  });
});

// The bypasses a review reproduced against the previous contract, where
// underwriting activated the loan and the lender controlled the tier. Each is
// now refused, or ends in an offer the borrower declines.
describe('Loan — a lender cannot impose 150% on a verified borrower', () => {
  it('re-quoting after a VERIFIED proof is refused, so the tier stands and 150% is refused', () => {
    const sim = verified().as(LENDER_SK);
    expect(() => sim.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL)).toThrow(
      /a verified tier is live until it lapses/,
    );
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/collateral does not match the tier/);
    expect(sim.ledger().status).toBe(LoanStatus.APPLIED);
    expect(sim.ledger().tier).toBe(Tier.VERIFIED);
  });

  it('a quote short enough to lapse before underwriting is refused', () => {
    const sim = deploy().as(LENDER_SK);
    expect(() => sim.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 2n)).toThrow(
      /quote must hold at least 30 minutes/,
    );
    expect(sim.ledger().quoted).toBe(false);
  });

  it('a 150% offer once the shortest allowed quote lapses binds no one: the borrower declines', () => {
    const sim = deploy()
      .as(LENDER_SK)
      .quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 1_800n)
      .as(BORROWER_SK)
      .proveTier(FACTS)
      .advance(1_800n)
      .as(LENDER_SK)
      .underwrite(STANDARD_COLLATERAL);
    expect(sim.ledger().status).toBe(LoanStatus.OFFERED);
    sim.as(BORROWER_SK).declineOffer();
    expect(sim.ledger().status).toBe(LoanStatus.APPLIED);
    expect(() => sim.as(LENDER_SK).disburse(sim.now, OWED, INSTALLMENT)).toThrow(/loan is not active/);
  });

  it('a 150% offer before the borrower can prove is refused: the proof lands, and 110% is the only offer', () => {
    const sim = quoted().as(LENDER_SK);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    expect(sim.ledger().status).toBe(LoanStatus.APPLIED);
    sim.as(BORROWER_SK).proveTier(FACTS);
    sim.as(LENDER_SK);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/collateral does not match the tier/);
    sim.underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK).accept();
    expect(sim.ledger().collateralRequired).toBe(VERIFIED_COLLATERAL);
    expect(sim.ledger().tier).toBe(Tier.VERIFIED);
  });

  it('after the tier lapsed, a re-quote opens a new proof window: no 150% until the borrower answers', () => {
    const sim = verified().at(T0 + QUOTE_TTL).as(LENDER_SK);
    sim.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 2n * QUOTE_TTL);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    expect(sim.ledger().status).toBe(LoanStatus.APPLIED);
    sim.as(BORROWER_SK).proveTier(FACTS);
    expect(sim.ledger().tier).toBe(Tier.VERIFIED);
    expect(() => sim.as(LENDER_SK).quoteTerms(1n, 40n, T0 + 3n * QUOTE_TTL)).toThrow(
      /a verified tier is live until it lapses/,
    );
  });
});

// The judge's N1: a lender who cannot impose 150% could still starve the
// borrower's proof (offer 150% before it lands, re-quote while the tier is
// NONE, or offer with no quote at all). A quote now stands until the borrower
// answers it (proveTier or waiveProof) or it lapses.
describe("Loan — the borrower's proof window", () => {
  it('refuses any offer before a quote ("quote first")', () => {
    for (const c of [STANDARD_COLLATERAL, VERIFIED_COLLATERAL]) {
      expect(() => deploy().as(LENDER_SK).underwrite(c)).toThrow(/quote first/);
    }
    // A long wait changes nothing: there is still no question to answer.
    expect(() => deploy().advance(365n * 86_400n).as(LENDER_SK).underwrite(STANDARD_COLLATERAL)).toThrow(
      /quote first/,
    );
  });

  it('refuses 150% while the quote is live and unanswered, to its last second', () => {
    const sim = quoted().as(LENDER_SK);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    // 110% is not a way in either: the window refusal comes first.
    expect(() => sim.underwrite(VERIFIED_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    sim.at(T0 + QUOTE_TTL - 1n);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    expect(sim.ledger().status).toBe(LoanStatus.APPLIED);
    // At expiry the window closes and the 150% offer opens.
    sim.at(T0 + QUOTE_TTL).underwrite(STANDARD_COLLATERAL);
    expect(sim.ledger().status).toBe(LoanStatus.OFFERED);
  });

  it('refuses a re-quote while the quote is live and unanswered, without spending the cap', () => {
    const sim = quoted().as(LENDER_SK);
    expect(() => sim.quoteTerms(1n, 40n, T0 + QUOTE_TTL)).toThrow(/the borrower can prove until the quote lapses/);
    expect(() => sim.at(T0 + QUOTE_TTL - 1n).quoteTerms(1n, 40n, T0 + 2n * QUOTE_TTL)).toThrow(
      /the borrower can prove until the quote lapses/,
    );
    expect(sim.ledger().quotesIssued).toBe(1n);
    expect(sim.ledger().quote.thresholdNetWorth).toBe(BAR.thresholdNetWorth);
  });

  it("the judge's starvation sequence (E) now ends in 110%: neither a front-run nor a re-quote lands", () => {
    const sim = quoted();
    // The lender tries to get in ahead of the proof, both ways.
    expect(() => sim.as(LENDER_SK).underwrite(STANDARD_COLLATERAL)).toThrow(
      /the borrower can prove until the quote lapses/,
    );
    expect(() => sim.as(LENDER_SK).quoteTerms(800_000n, 40n, sim.now + 1_800n)).toThrow(
      /the borrower can prove until the quote lapses/,
    );
    // The borrower's proof lands against the quote it was made for.
    sim.advance(1_799n).as(BORROWER_SK).proveTier(FACTS);
    expect(sim.ledger().tier).toBe(Tier.VERIFIED);
    expect(sim.ledger().quotesIssued).toBe(1n);
    sim.as(LENDER_SK);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/collateral does not match the tier/);
    sim.underwrite(VERIFIED_COLLATERAL).as(BORROWER_SK).accept(VERIFIED_COLLATERAL);
    expect(sim.ledger().collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('a STANDARD proof answers the quote: the 150% offer and a new quote are open at once', () => {
    const sim = standard().as(LENDER_SK);
    sim.quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);
    expect(sim.ledger().quotesIssued).toBe(2n);
    // The new quote opens a new window.
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
    expect(standard().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).ledger().status).toBe(LoanStatus.OFFERED);
  });
});

// The rest of the review's sequences (exploit3 D, F, G), replayed: each is
// refused, or ends in an offer only the borrower can make binding.
describe("Loan — the review's remaining sequences", () => {
  it('D: a tier that lapsed with its 30-minute quote allows a 150% offer, which binds only if accepted', () => {
    const sim = deploy().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + 1_800n);
    sim.as(BORROWER_SK).proveTier(FACTS).advance(1_800n).as(LENDER_SK).underwrite(STANDARD_COLLATERAL);
    expect(sim.ledger().status).toBe(LoanStatus.OFFERED);
    expect(() => sim.disburse(sim.now, OWED, INSTALLMENT)).toThrow(/loan is not active/);
    sim.as(BORROWER_SK).declineOffer();
    // A re-quote costs one more answer, within the cap (the disclosed "up to 3").
    sim.as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, sim.now + 3_600n);
    expect(sim.ledger().quotesIssued).toBe(2n);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/the borrower can prove until the quote lapses/);
  });

  it('F: while an offer stands the lender can neither re-quote nor swap the figure', () => {
    const sim = verified().as(LENDER_SK).underwrite(VERIFIED_COLLATERAL);
    expect(() => sim.quoteTerms(1n, 40n, T0 + QUOTE_TTL)).toThrow(/loan is no longer open to quotes/);
    expect(() => sim.underwrite(STANDARD_COLLATERAL)).toThrow(/loan is not awaiting underwriting/);
    expect(sim.as(BORROWER_SK).accept(VERIFIED_COLLATERAL).ledger().collateralRequired).toBe(VERIFIED_COLLATERAL);
  });

  it('G: an offer with no quote at all is refused', () => {
    expect(() => deploy().as(LENDER_SK).underwrite(STANDARD_COLLATERAL)).toThrow(/quote first/);
  });
});

describe('Loan — waiving the proof (the 150% route, at once)', () => {
  it('answers the quote without a tier and opens the 150% offer immediately', () => {
    const state = waived().ledger();
    expect(state.tierProven).toBe(true);
    expect(state.tier).toBe(Tier.NONE);
    expect(state.status).toBe(LoanStatus.APPLIED);
    const offered = waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).ledger();
    expect(offered.status).toBe(LoanStatus.OFFERED);
    expect(offered.offeredCollateral).toBe(STANDARD_COLLATERAL);
  });

  it('is the borrower\'s alone', () => {
    for (const sk of [LENDER_SK, STRANGER_SK]) {
      expect(() => quoted().as(sk).waiveProof()).toThrow(/only the borrower may waive a proof/);
    }
  });

  it('needs a quote, once per quote, and only while the application is open', () => {
    expect(() => deploy().as(BORROWER_SK).waiveProof()).toThrow(/the lender has not quoted yet/);
    expect(() => waived().waiveProof()).toThrow(/already proven against this quote/);
    expect(() => verified().waiveProof()).toThrow(/already proven against this quote/);
    expect(() => waived().as(LENDER_SK).underwrite(STANDARD_COLLATERAL).as(BORROWER_SK).waiveProof()).toThrow(
      /loan is no longer open to proofs/,
    );
  });

  it('a waived quote cannot then be proven: one answer per quote', () => {
    expect(() => waived().proveTier(FACTS)).toThrow(/already proven against this quote/);
  });

  it('a lender may quote again after a waiver; the borrower may then prove', () => {
    const sim = waived().as(LENDER_SK).quoteTerms(BAR.thresholdNetWorth, BAR.maxDti, T0 + QUOTE_TTL);
    expect(sim.ledger().tierProven).toBe(false);
    expect(sim.ledger().quotesIssued).toBe(2n);
    expect(sim.as(BORROWER_SK).proveTier(FACTS).ledger().tier).toBe(Tier.VERIFIED);
  });
});

describe('Loan — disbursement', () => {
  let sim: LoanSimulator;

  beforeEach(() => {
    sim = active();
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
    const s = active();
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
    const s = active();
    expect(() => s.markDefault()).toThrow(/nothing was disbursed/);
  });
});
