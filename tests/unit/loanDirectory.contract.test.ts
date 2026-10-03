// Kymider — LoanDirectory contract tests, executed offline.
//
// The public loan index, and the private repayment record: a lender records a
// repaid loan as a Merkle leaf, and the borrower later proves two such leaves
// to a new lender without saying which loans, lenders or amounts they were.

import { describe, it, expect, beforeEach } from 'vitest';
import { ListingStatus } from '../../contracts/index.js';
import {
  LoanDirectorySimulator,
  loanAddr,
  pubKeyOf,
  repaidLeaf,
  skFrom,
} from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_A_SK = skFrom(2);
const LENDER_B_SK = skFrom(3);
const OTHER_BORROWER_SK = skFrom(4);
const STRANGER_SK = skFrom(5);

const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_A_PK = pubKeyOf(LENDER_A_SK);
const LENDER_B_PK = pubKeyOf(LENDER_B_SK);
const OTHER_BORROWER_PK = pubKeyOf(OTHER_BORROWER_SK);

const LOAN_A = loanAddr(0xa1);
const LOAN_B = loanAddr(0xb2);
const LOAN_OTHER = loanAddr(0xc3); // another borrower's repaid loan
const APPLICATION = loanAddr(0xd4); // the new loan the history is for
const UNRECORDED = loanAddr(0xe5); // listed, never repaid

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('LoanDirectory — index', () => {
  let dir: LoanDirectorySimulator;

  beforeEach(() => {
    dir = new LoanDirectorySimulator(BORROWER_SK);
  });

  it('lists a loan under the caller as borrower, OPEN, and counts it', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    const state = dir.ledger();
    const listing = state.listings.lookup(LOAN_A);
    expect(hex(listing.borrower)).toBe(hex(BORROWER_PK));
    expect(hex(listing.lender)).toBe(hex(LENDER_A_PK));
    expect(listing.principal).toBe(1_000n);
    expect(listing.status).toBe(ListingStatus.OPEN);
    expect(state.listingCount).toBe(1n);
  });

  it('refuses listing the same loan twice', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    expect(() => dir.as(STRANGER_SK).list(LOAN_A, LENDER_A_PK, 1_000n)).toThrow(
      /loan is already listed/,
    );
  });

  it('refuses a listing that names the caller as lender', () => {
    expect(() => dir.as(BORROWER_SK).list(LOAN_A, BORROWER_PK, 1_000n)).toThrow(
      /borrower and lender must differ/,
    );
  });

  const statusOf = (loan: Uint8Array): ListingStatus => dir.ledger().listings.lookup(loan).status;

  it('the lender moves a listing OPEN to ACTIVE, then ACTIVE to DEFAULTED', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE);
    expect(statusOf(LOAN_A)).toBe(ListingStatus.ACTIVE);
    dir.updateStatus(LOAN_A, ListingStatus.DEFAULTED);
    expect(statusOf(LOAN_A)).toBe(ListingStatus.DEFAULTED);
  });

  it('the lender may close an open listing (a declined application)', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.CLOSED);
    expect(statusOf(LOAN_A)).toBe(ListingStatus.CLOSED);
  });

  it('the borrower may withdraw an open listing, and do nothing else', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n).list(LOAN_B, LENDER_A_PK, 1_000n);
    for (const s of [ListingStatus.ACTIVE, ListingStatus.DEFAULTED, ListingStatus.OPEN]) {
      expect(() => dir.as(BORROWER_SK).updateStatus(LOAN_A, s)).toThrow(
        /the borrower may only withdraw an open listing/,
      );
    }
    dir.as(BORROWER_SK).updateStatus(LOAN_A, ListingStatus.CLOSED);
    expect(statusOf(LOAN_A)).toBe(ListingStatus.CLOSED);
    // Not from ACTIVE: once the lender has moved it on, it is not the borrower's to close.
    dir.as(LENDER_A_SK).updateStatus(LOAN_B, ListingStatus.ACTIVE);
    expect(() => dir.as(BORROWER_SK).updateStatus(LOAN_B, ListingStatus.CLOSED)).toThrow(
      /the borrower may only withdraw an open listing/,
    );
    expect(statusOf(LOAN_B)).toBe(ListingStatus.ACTIVE);
  });

  it('nobody sets REPAID by hand: not the borrower, not the lender', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    expect(() => dir.as(BORROWER_SK).updateStatus(LOAN_A, ListingStatus.REPAID)).toThrow(
      /a repayment is recorded with recordRepaid, not set/,
    );
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE);
    expect(() => dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.REPAID)).toThrow(
      /a repayment is recorded with recordRepaid, not set/,
    );
    expect(statusOf(LOAN_A)).toBe(ListingStatus.ACTIVE);
  });

  it('refuses every other lender move', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    const lenderRefuses = (s: ListingStatus) =>
      expect(() => dir.as(LENDER_A_SK).updateStatus(LOAN_A, s)).toThrow(
        /the lender may only move OPEN to ACTIVE or CLOSED, or ACTIVE to DEFAULTED/,
      );
    // From OPEN: not straight to DEFAULTED, and not to OPEN again.
    lenderRefuses(ListingStatus.DEFAULTED);
    lenderRefuses(ListingStatus.OPEN);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE);
    // From ACTIVE: not back to OPEN, not CLOSED, not ACTIVE again.
    lenderRefuses(ListingStatus.OPEN);
    lenderRefuses(ListingStatus.CLOSED);
    lenderRefuses(ListingStatus.ACTIVE);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.DEFAULTED);
    // DEFAULTED is final.
    lenderRefuses(ListingStatus.ACTIVE);
    lenderRefuses(ListingStatus.CLOSED);
    expect(statusOf(LOAN_A)).toBe(ListingStatus.DEFAULTED);
  });

  it('a closed listing stays closed', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n).updateStatus(LOAN_A, ListingStatus.CLOSED);
    expect(() => dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE)).toThrow(
      /the lender may only move OPEN to ACTIVE or CLOSED, or ACTIVE to DEFAULTED/,
    );
    expect(() => dir.as(LENDER_A_SK).recordRepaid(LOAN_A)).toThrow(
      /only an active listing can be recorded as repaid/,
    );
  });

  it('refuses a status change from a stranger, or for an unlisted loan', () => {
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    expect(() => dir.as(STRANGER_SK).updateStatus(LOAN_A, ListingStatus.DEFAULTED)).toThrow(
      /only the loan's parties may update it/,
    );
    expect(() => dir.as(BORROWER_SK).updateStatus(LOAN_B, ListingStatus.ACTIVE)).toThrow(
      /loan is not listed/,
    );
  });
});

describe('LoanDirectory — repayment record', () => {
  let dir: LoanDirectorySimulator;

  beforeEach(() => {
    dir = new LoanDirectorySimulator(BORROWER_SK);
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE);
  });

  it("the lender records a repaid loan as a leaf binding borrower, loan and lender", () => {
    dir.as(LENDER_A_SK).recordRepaid(LOAN_A);
    const state = dir.ledger();
    expect(state.listings.lookup(LOAN_A).status).toBe(ListingStatus.REPAID);
    expect(state.recordedLoans.member(LOAN_A)).toBe(true);
    expect(state.repaid.findPathForLeaf(repaidLeaf(BORROWER_PK, LOAN_A, LENDER_A_PK))).toBeDefined();
  });

  it('refuses a record from the borrower, who could otherwise vouch for themselves', () => {
    expect(() => dir.as(BORROWER_SK).recordRepaid(LOAN_A)).toThrow(
      /only the loan's lender may record a repayment/,
    );
  });

  it('refuses a second record for the same loan', () => {
    dir.as(LENDER_A_SK).recordRepaid(LOAN_A);
    expect(() => dir.recordRepaid(LOAN_A)).toThrow(/repayment already recorded/);
  });

  it('refuses a record for an unlisted loan', () => {
    expect(() => dir.as(LENDER_A_SK).recordRepaid(LOAN_B)).toThrow(/loan is not listed/);
  });

  it('refuses a record for a listing that is not ACTIVE: never activated, closed or defaulted', () => {
    dir.as(BORROWER_SK).list(LOAN_B, LENDER_A_PK, 1_000n);
    expect(() => dir.as(LENDER_A_SK).recordRepaid(LOAN_B)).toThrow(
      /only an active listing can be recorded as repaid/,
    );
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.DEFAULTED);
    expect(() => dir.recordRepaid(LOAN_A)).toThrow(/only an active listing can be recorded as repaid/);
    expect(dir.ledger().recordedLoans.member(LOAN_B)).toBe(false);
    expect(dir.ledger().repaid.firstFree()).toBe(0n);
  });
});

describe('LoanDirectory — proving two repaid loans', () => {
  let dir: LoanDirectorySimulator;

  const recordA = () => ({
    loan: LOAN_A,
    lender: LENDER_A_PK,
    path: dir.pathFor(repaidLeaf(BORROWER_PK, LOAN_A, LENDER_A_PK)),
  });
  const recordB = () => ({
    loan: LOAN_B,
    lender: LENDER_B_PK,
    path: dir.pathFor(repaidLeaf(BORROWER_PK, LOAN_B, LENDER_B_PK)),
  });

  beforeEach(() => {
    dir = new LoanDirectorySimulator(BORROWER_SK);
    // Two loans repaid by the borrower to two lenders, one by someone else.
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_A_PK, 1_000n);
    dir.as(BORROWER_SK).list(LOAN_B, LENDER_B_PK, 2_000n);
    dir.as(OTHER_BORROWER_SK).list(LOAN_OTHER, LENDER_A_PK, 5_000n);
    dir.as(BORROWER_SK).list(UNRECORDED, LENDER_A_PK, 3_000n);
    dir.as(LENDER_A_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE).recordRepaid(LOAN_A);
    dir.updateStatus(LOAN_OTHER, ListingStatus.ACTIVE).recordRepaid(LOAN_OTHER);
    dir.as(LENDER_B_SK).updateStatus(LOAN_B, ListingStatus.ACTIVE).recordRepaid(LOAN_B);
    // The new application.
    dir.as(BORROWER_SK).list(APPLICATION, LENDER_B_PK, 10_000n);
  });

  it('records only a count against the new application', () => {
    dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), recordB());
    expect(dir.ledger().historyProofs.lookup(APPLICATION)).toBe(2n);
  });

  it('still proves after later repayments change the tree root', () => {
    const a = recordA();
    const b = recordB();
    dir.as(BORROWER_SK).list(loanAddr(0xf6), LENDER_A_PK, 1n);
    dir.as(LENDER_A_SK).updateStatus(loanAddr(0xf6), ListingStatus.ACTIVE).recordRepaid(loanAddr(0xf6));
    dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, a, b);
    expect(dir.ledger().historyProofs.lookup(APPLICATION)).toBe(2n);
  });

  it('refuses the same loan counted twice', () => {
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), recordA())).toThrow(
      /the two loans must differ/,
    );
  });

  it("refuses someone else's repaid loan", () => {
    const other = {
      loan: LOAN_OTHER,
      lender: LENDER_A_PK,
      path: dir.pathFor(repaidLeaf(OTHER_BORROWER_PK, LOAN_OTHER, LENDER_A_PK)),
    };
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), other)).toThrow(
      /second record is not yours/,
    );
  });

  it('refuses a record that was never written, even with a well-formed path', () => {
    const forged = {
      loan: UNRECORDED,
      lender: LENDER_A_PK,
      path: dir.ledger().repaid.pathForLeaf(0n, repaidLeaf(BORROWER_PK, UNRECORDED, LENDER_A_PK)),
    };
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), forged)).toThrow(
      /second record is not in the directory/,
    );
  });

  it('refuses a record claimed under the wrong lender', () => {
    const wrongLender = { ...recordB(), lender: LENDER_A_PK };
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), wrongLender)).toThrow(
      /second record is not yours/,
    );
  });

  it('refuses an application vouching for itself', () => {
    dir.as(LENDER_B_SK).updateStatus(APPLICATION, ListingStatus.ACTIVE).recordRepaid(APPLICATION);
    const self = {
      loan: APPLICATION,
      lender: LENDER_B_PK,
      path: dir.pathFor(repaidLeaf(BORROWER_PK, APPLICATION, LENDER_B_PK)),
    };
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(APPLICATION, recordA(), self)).toThrow(
      /a loan cannot vouch for itself/,
    );
  });

  it("refuses a proof attached to someone else's application", () => {
    dir.as(OTHER_BORROWER_SK).list(loanAddr(0x77), LENDER_B_PK, 1n);
    expect(() =>
      dir.as(BORROWER_SK).proveTwoRepaid(loanAddr(0x77), recordA(), recordB()),
    ).toThrow(/only the applicant may attach a history proof/);
  });

  it('refuses a proof for an unlisted application', () => {
    expect(() => dir.as(BORROWER_SK).proveTwoRepaid(loanAddr(0x99), recordA(), recordB())).toThrow(
      /application is not listed/,
    );
  });
});
