// Kymider — the track-record step, executed offline.
//
// A borrower who has repaid two earlier Kymider loans proves it on the new
// Loan (proveRepaidHistory) with Merkle paths to the LoanDirectory's records,
// and the contract lowers every collateral figure a step: 150% to 130%, 110%
// to 105%. These tests take real paths from a LoanDirectory simulator and run
// them through the compiled Loan, so the leaf encoding, the root check and the
// collateral arithmetic are the contracts' own.

import { describe, it, expect } from 'vitest';
import { ListingStatus, LoanStatus, Tier, loanPureCircuits } from '../../contracts/index.js';
import {
  STANDARD_HISTORY_RATIO_BPS,
  STANDARD_RATIO_BPS,
  VERIFIED_HISTORY_RATIO_BPS,
  VERIFIED_RATIO_BPS,
  collateralFor,
} from '../../contracts/loanMath.js';
import {
  LoanDirectorySimulator,
  LoanSimulator,
  T0,
  TEST_SALT,
  commitFacts,
  listingKey,
  loanAddr,
  pubKeyOf,
  repaidLeaf,
  skFrom,
  type RepaidRecordInput,
} from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2); // the new loan's lender
const LENDER_A_SK = skFrom(3); // lenders of the two earlier loans
const LENDER_B_SK = skFrom(4);
const OTHER_BORROWER_SK = skFrom(5);

const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_PK = pubKeyOf(LENDER_SK);
const LENDER_A_PK = pubKeyOf(LENDER_A_SK);
const LENDER_B_PK = pubKeyOf(LENDER_B_SK);
const OTHER_BORROWER_PK = pubKeyOf(OTHER_BORROWER_SK);

const LOAN_A = loanAddr(0xa1);
const LOAN_B = loanAddr(0xb2);
const LOAN_C = loanAddr(0xc3); // a third repaid loan, recorded later
const LOAN_OTHER = loanAddr(0xd4); // another borrower's repaid loan

const TERMS = { principal: 1_000n, interestBps: 1_000n, installments: 3n, periodSeconds: 86_400n };
const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const BAR = { thresholdNetWorth: 500_000n, maxDti: 40n }; // these facts clear it
const HIGH_BAR = 800_000n; // these facts do not
const QUOTE_TTL = 7n * 86_400n;

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

/** List `loan` as `borrowerSk`, let its lender take it ACTIVE and record it repaid. */
const recordRepaid = (
  dir: LoanDirectorySimulator,
  borrowerSk: Uint8Array,
  loan: Uint8Array,
  lenderSk: Uint8Array,
): void => {
  const key = listingKey(loan, pubKeyOf(borrowerSk));
  dir.as(borrowerSk).list(loan, pubKeyOf(lenderSk), 1_000n);
  dir.as(lenderSk).updateStatus(key, ListingStatus.ACTIVE).recordRepaid(key);
};

/** A directory holding the borrower's two repaid loans A and B (and another borrower's). */
const directory = (): LoanDirectorySimulator => {
  const dir = new LoanDirectorySimulator(BORROWER_SK);
  recordRepaid(dir, OTHER_BORROWER_SK, LOAN_OTHER, LENDER_A_SK);
  recordRepaid(dir, BORROWER_SK, LOAN_A, LENDER_A_SK);
  recordRepaid(dir, BORROWER_SK, LOAN_B, LENDER_B_SK);
  return dir;
};

const record = (
  dir: LoanDirectorySimulator,
  loan: Uint8Array,
  lender: Uint8Array,
  borrower: Uint8Array = BORROWER_PK,
): RepaidRecordInput => ({ loan, lender, path: dir.pathFor(repaidLeaf(borrower, loan, lender)) });

const deploy = (): LoanSimulator =>
  new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(FACTS, TEST_SALT), new Uint8Array(32).fill(9));

/** A new application whose borrower has proven loans A and B. Acting as the borrower. */
const withHistory = (dir = directory()): LoanSimulator =>
  deploy().as(BORROWER_SK).proveRepaidHistory(record(dir, LOAN_A, LENDER_A_PK), record(dir, LOAN_B, LENDER_B_PK));

const quote = (loan: LoanSimulator, bar = BAR.thresholdNetWorth): LoanSimulator =>
  loan.as(LENDER_SK).quoteTerms(bar, BAR.maxDti, T0 + QUOTE_TTL);

describe('Loan — the track-record ratios', () => {
  it('are read from the contract: 110% / 150%, and 105% / 130% with two repaid loans', () => {
    expect(loanPureCircuits.verifiedRatioBps()).toBe(VERIFIED_RATIO_BPS);
    expect(loanPureCircuits.standardRatioBps()).toBe(STANDARD_RATIO_BPS);
    expect(loanPureCircuits.verifiedHistoryRatioBps()).toBe(VERIFIED_HISTORY_RATIO_BPS);
    expect(loanPureCircuits.standardHistoryRatioBps()).toBe(STANDARD_HISTORY_RATIO_BPS);
    expect(collateralFor(1_000n, Tier.VERIFIED, true)).toBe(1_050n);
    expect(collateralFor(1_000n, Tier.STANDARD, true)).toBe(1_300n);
  });

  it("uses the directory's leaf encoding, so a directory path verifies on the Loan unchanged", () => {
    expect(hex(loanPureCircuits.repaidLeaf(BORROWER_PK, LOAN_A, LENDER_A_PK))).toBe(
      hex(repaidLeaf(BORROWER_PK, LOAN_A, LENDER_A_PK)),
    );
  });

  it('a new loan starts with no track record', () => {
    expect(deploy().ledger().priorRepaidProven).toBe(false);
  });
});

describe('Loan — proving two repaid loans', () => {
  it('records the proof and the directory root it was made against, nothing else', () => {
    const dir = directory();
    const state = withHistory(dir).ledger();
    expect(state.priorRepaidProven).toBe(true);
    expect(state.priorRepaidRoot).toEqual(dir.ledger().repaid.root());
    // The lender's check: the published root is one of the directory's.
    expect(dir.ledger().repaid.checkRoot(state.priorRepaidRoot)).toBe(true);
    expect(state.status).toBe(LoanStatus.APPLIED);
    expect(state.tier).toBe(Tier.NONE);
  });

  it('a verified borrower with a track record is offered 105%, and only 105%', () => {
    const loan = quote(withHistory()).as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK);
    expect(() => loan.underwrite(1_100n)).toThrow('collateral does not match the tier');
    loan.underwrite(1_050n).as(BORROWER_SK).accept(1_050n);
    const state = loan.ledger();
    expect(state.status).toBe(LoanStatus.ACTIVE);
    expect(state.tier).toBe(Tier.VERIFIED);
    expect(state.collateralRequired).toBe(1_050n);
  });

  it('a borrower who waives the solvency proof is offered 130% instead of 150%', () => {
    const loan = quote(withHistory()).as(BORROWER_SK).waiveProof().as(LENDER_SK);
    expect(() => loan.underwrite(1_500n)).toThrow('collateral does not match the tier');
    loan.underwrite(1_300n);
    expect(loan.ledger().offeredCollateral).toBe(1_300n);
    expect(loan.ledger().offeredTier).toBe(Tier.STANDARD);
  });

  it('a STANDARD proof with a track record is offered 130%', () => {
    const loan = quote(withHistory(), HIGH_BAR).as(BORROWER_SK).proveTier(FACTS);
    expect(loan.ledger().tier).toBe(Tier.STANDARD);
    loan.as(LENDER_SK).underwrite(1_300n);
    expect(loan.ledger().offeredCollateral).toBe(1_300n);
  });

  it('the lender cannot quote the discount away: it is in the ratio, not in the bar', () => {
    // Whatever bar the lender names, the figure for each answer is fixed.
    const loan = quote(withHistory(), 10n ** 15n).as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK);
    expect(() => loan.underwrite(1_500n)).toThrow('collateral does not match the tier');
    loan.underwrite(1_300n);
  });

  it('may be proven after the quote, while no offer stands', () => {
    const dir = directory();
    const loan = quote(deploy())
      .as(BORROWER_SK)
      .proveTier(FACTS)
      .proveRepaidHistory(record(dir, LOAN_A, LENDER_A_PK), record(dir, LOAN_B, LENDER_B_PK))
      .as(LENDER_SK)
      .underwrite(1_050n);
    expect(loan.ledger().offeredCollateral).toBe(1_050n);
  });

  it('is refused while an offer stands, and once the loan is active, so an offer never changes under the borrower', () => {
    const dir = directory();
    const a = record(dir, LOAN_A, LENDER_A_PK);
    const b = record(dir, LOAN_B, LENDER_B_PK);
    const loan = quote(deploy()).as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK).underwrite(1_100n).as(BORROWER_SK);
    expect(() => loan.proveRepaidHistory(a, b)).toThrow('loan is no longer open to proofs');
    loan.accept(1_100n);
    expect(() => loan.proveRepaidHistory(a, b)).toThrow('loan is no longer open to proofs');
    expect(loan.ledger().collateralRequired).toBe(1_100n);
  });

  it('a borrower who declines a 110% offer can prove the record and be offered 105%', () => {
    const dir = directory();
    const loan = quote(deploy()).as(BORROWER_SK).proveTier(FACTS).as(LENDER_SK).underwrite(1_100n);
    loan
      .as(BORROWER_SK)
      .declineOffer()
      .proveRepaidHistory(record(dir, LOAN_A, LENDER_A_PK), record(dir, LOAN_B, LENDER_B_PK))
      .as(LENDER_SK);
    expect(() => loan.underwrite(1_100n)).toThrow('collateral does not match the tier');
    loan.underwrite(1_050n);
  });

  it('is proven once per loan', () => {
    const dir = directory();
    const loan = withHistory(dir);
    expect(() =>
      loan.proveRepaidHistory(record(dir, LOAN_A, LENDER_A_PK), record(dir, LOAN_B, LENDER_B_PK)),
    ).toThrow('repayment history already proven');
  });

  it("is the borrower's alone", () => {
    const dir = directory();
    const a = record(dir, LOAN_A, LENDER_A_PK);
    const b = record(dir, LOAN_B, LENDER_B_PK);
    expect(() => deploy().as(LENDER_SK).proveRepaidHistory(a, b)).toThrow(
      'only the borrower may prove a repayment history',
    );
    expect(() => deploy().as(OTHER_BORROWER_SK).proveRepaidHistory(a, b)).toThrow(
      'only the borrower may prove a repayment history',
    );
  });
});

describe('Loan — what a track-record proof cannot do', () => {
  it('count one repaid loan twice', () => {
    const dir = directory();
    const a = record(dir, LOAN_A, LENDER_A_PK);
    expect(() => deploy().as(BORROWER_SK).proveRepaidHistory(a, a)).toThrow('the two loans must differ');
  });

  it('let a loan vouch for itself', () => {
    const loan = deploy();
    const dir = directory();
    recordRepaid(dir, BORROWER_SK, loan.addressBytes(), LENDER_SK);
    const self = record(dir, loan.addressBytes(), LENDER_PK);
    expect(() => loan.as(BORROWER_SK).proveRepaidHistory(self, record(dir, LOAN_A, LENDER_A_PK))).toThrow(
      'a loan cannot vouch for itself',
    );
  });

  it("borrow another borrower's record", () => {
    const dir = directory();
    const theirs = record(dir, LOAN_OTHER, LENDER_A_PK, OTHER_BORROWER_PK);
    expect(() =>
      deploy().as(BORROWER_SK).proveRepaidHistory(theirs, record(dir, LOAN_B, LENDER_B_PK)),
    ).toThrow('first record is not yours');
    expect(() =>
      deploy().as(BORROWER_SK).proveRepaidHistory(record(dir, LOAN_A, LENDER_A_PK), theirs),
    ).toThrow('second record is not yours');
  });

  it('claim a record under the wrong lender', () => {
    const dir = directory();
    const wrongLender = { ...record(dir, LOAN_A, LENDER_A_PK), lender: LENDER_B_PK };
    expect(() =>
      deploy().as(BORROWER_SK).proveRepaidHistory(wrongLender, record(dir, LOAN_B, LENDER_B_PK)),
    ).toThrow('first record is not yours');
  });

  it('mix paths from two directory states', () => {
    const dir = new LoanDirectorySimulator(BORROWER_SK);
    recordRepaid(dir, BORROWER_SK, LOAN_A, LENDER_A_SK);
    const early = record(dir, LOAN_A, LENDER_A_PK); // before B was recorded
    recordRepaid(dir, BORROWER_SK, LOAN_B, LENDER_B_SK);
    expect(() =>
      deploy().as(BORROWER_SK).proveRepaidHistory(early, record(dir, LOAN_B, LENDER_B_PK)),
    ).toThrow('both records must come from one directory root');
  });

  it('a proof against an earlier directory root still checks out: the directory keeps its root history', () => {
    const dir = directory();
    const a = record(dir, LOAN_A, LENDER_A_PK);
    const b = record(dir, LOAN_B, LENDER_B_PK);
    recordRepaid(dir, BORROWER_SK, LOAN_C, LENDER_A_SK); // the tree moves on
    const state = deploy().as(BORROWER_SK).proveRepaidHistory(a, b).ledger();
    expect(state.priorRepaidRoot).not.toEqual(dir.ledger().repaid.root());
    expect(dir.ledger().repaid.checkRoot(state.priorRepaidRoot)).toBe(true);
  });

  it('pass a records tree the borrower built themselves: the Loan accepts it, the lender’s root check does not', () => {
    // The Loan cannot read the directory (no cross-contract reads on
    // Midnight), so a borrower can prove against a private copy holding
    // records nobody wrote. The root it publishes is not the directory's,
    // and the lender's check (LoanClient.priorRepaidRootChecks) catches it.
    const real = directory();
    const forged = new LoanDirectorySimulator(BORROWER_SK);
    recordRepaid(forged, BORROWER_SK, loanAddr(0x11), LENDER_A_SK);
    recordRepaid(forged, BORROWER_SK, loanAddr(0x12), LENDER_A_SK);
    const state = deploy()
      .as(BORROWER_SK)
      .proveRepaidHistory(record(forged, loanAddr(0x11), LENDER_A_PK), record(forged, loanAddr(0x12), LENDER_A_PK))
      .ledger();
    expect(state.priorRepaidProven).toBe(true);
    expect(real.ledger().repaid.checkRoot(state.priorRepaidRoot)).toBe(false);
  });
});
