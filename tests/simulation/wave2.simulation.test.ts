// Kymider — Wave 2 simulation against the local devnet (or a public testnet).
//
// Drives LoanClient through real transactions with real ZK proofs:
//
//   Loan A: the borrower proves the tier, the lender offers 110% (a re-quote
//           that would wipe the tier is refused), the borrower accepts,
//           repays two installments, and the lender records the repayment.
//   Loan B: no proof, so a 150% offer the borrower accepts; one installment;
//           recorded by a second lender.
//   Loan C: a new application. The borrower proves two repaid loans to the
//           directory without saying which, and the directory records "2".
//
// Plus the refusals that matter on-chain: a lender cannot re-quote away a live
// VERIFIED tier or disburse before the borrower accepts, a lender cannot
// repay, a borrower cannot disburse, and the same repaid loan cannot be
// counted twice.
//
// Requires the devnet: `npm run env:up`. Run with `npm run test:simulation`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { buildProviders } from '../../client/providers.js';
import { KymiderClient } from '../../client/index.js';
import { LoanClient } from '../../client/loans.js';
import {
  NO_FACTS_SALT,
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
} from '../../contracts/witnesses.js';
import { ListingStatus, LoanStatus, Tier } from '../../contracts/index.js';
import type { MidnightWalletProvider } from '../../client/wallet.js';
import { connectRoles, logger, network } from './support/wallets.js';

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const QUOTE = { thresholdNetWorth: 500_000n, maxDti: 40n, ttlSeconds: 3_600n };
const TERMS_A = { principal: 1_000n, interestBps: 1_000n, installments: 2n, periodSeconds: 86_400n };
const TERMS_B = { principal: 2_000n, interestBps: 500n, installments: 1n, periodSeconds: 86_400n };
const TERMS_C = { principal: 5_000n, interestBps: 800n, installments: 4n, periodSeconds: 86_400n };

describe(`Kymider Wave 2 simulation (${network})`, () => {
  let wallets: Record<'BORROWER' | 'LENDER', MidnightWalletProvider>;
  let borrower: LoanClient;
  let lender: LoanClient;
  let solvency: KymiderClient;

  const borrowerSk = new Uint8Array(randomBytes(32));
  const lenderASk = new Uint8Array(randomBytes(32));
  const lenderBSk = new Uint8Array(randomBytes(32));

  let directory: ContractAddress;
  let solvencyAddress: ContractAddress;
  let loanA: ContractAddress;
  let loanB: ContractAddress;
  let loanC: ContractAddress;

  // The borrower deploys a loan naming `lenderSk`'s identity, lists it, and
  // the lender's client binds that identity to it.
  const openLoan = async (lenderSk: Uint8Array, terms: typeof TERMS_A): Promise<ContractAddress> => {
    const commitment = (await solvency.solvencyState(solvencyAddress)).commitment;
    // The salt that blinds the commitment, from the borrower's private state.
    const { salt: factsSalt } = await solvency.factsOpening(solvencyAddress);
    const loan = await borrower.deployLoan({
      sk: borrowerSk,
      lenderPk: lender.pubKeyOf(lenderSk),
      terms,
      commitment,
      factsSalt,
    });
    await borrower.listLoan(directory, loan);
    await lender.bindLoanPrivateState(loan, createLoanPrivateState(lenderSk, new Uint8Array(32), NO_FACTS_SALT));
    return loan;
  };

  // The lender marks the listing ACTIVE once the borrower has accepted: only
  // the listing's lender may, and a repayment is recorded only from ACTIVE.
  const activateListing = async (loan: ContractAddress, lenderSk: Uint8Array): Promise<void> => {
    await lender.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(lenderSk));
    await lender.updateListingStatus(directory, loan, ListingStatus.ACTIVE);
  };

  // Mark the listing ACTIVE, disburse, repay every installment, record. Lender
  // identity must already be bound to the loan.
  const repayInFull = async (loan: ContractAddress, lenderSk: Uint8Array): Promise<void> => {
    await activateListing(loan, lenderSk);
    await lender.disburse(loan);
    while ((await borrower.loanState(loan)).status === LoanStatus.ACTIVE) {
      await borrower.repay(loan);
    }
    await lender.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(lenderSk));
    await lender.recordRepaid(directory, loan);
  };

  beforeAll(async () => {
    const { config, wallets: w } = await connectRoles();
    wallets = w;
    // One provider set per wallet: each opens that wallet's private-state
    // stores, and a store cannot be opened twice in one process.
    const borrowerProviders = buildProviders(w.BORROWER, config);
    borrower = new LoanClient(logger, borrowerProviders);
    solvency = new KymiderClient(logger, borrowerProviders);
    lender = new LoanClient(logger, buildProviders(w.LENDER, config));
  });

  afterAll(async () => {
    await wallets?.BORROWER.stop();
    await wallets?.LENDER.stop();
  });

  it('deploys a SolvencyProof instance and the shared LoanDirectory', async () => {
    solvencyAddress = await solvency.deploySolvencyProof(FACTS, borrowerSk);
    directory = await borrower.deployLoanDirectory(borrowerSk);
    expect((await borrower.directoryState(directory)).listingCount).toBe(0n);
  });

  it('opens and lists loan A, bound to the facts the SolvencyProof instance commits', async () => {
    loanA = await openLoan(lenderASk, TERMS_A);
    expect(await lender.factsMatchSolvencyProof(loanA, solvencyAddress)).toBe(true);

    const state = await borrower.loanState(loanA);
    expect(state.status).toBe(LoanStatus.APPLIED);
    const rows = await borrower.listings(directory);
    expect(rows.map((r) => r.loan)).toContain(loanA);
  });

  it('a verified borrower is offered 110%, and the tier cannot be re-quoted away', async () => {
    await lender.quote(loanA, QUOTE);
    expect(await borrower.proveTier(loanA, FACTS)).toBe(Tier.VERIFIED);
    expect((await borrower.loanState(loanA)).quotesIssued).toBe(1n);
    // One proof per quote. Called through the raw submission path, past the
    // client's own pre-check, so the refusal is the circuit's.
    await expect(
      borrower.callLoan(loanA, 'proveTier', [FACTS.balance, FACTS.debts, FACTS.income]),
    ).rejects.toThrow();

    // A live VERIFIED tier stands: the client refuses first, and so does the
    // circuit when the raw call goes out anyway.
    await expect(lender.quote(loanA, QUOTE)).rejects.toThrow(/a verified tier is live until it lapses/);
    await expect(
      lender.callLoan(loanA, 'quoteTerms', [QUOTE.thresholdNetWorth, QUOTE.maxDti, (await lender.loanState(loanA)).quote.expiresAt]),
    ).rejects.toThrow();
    expect((await borrower.loanState(loanA)).tier).toBe(Tier.VERIFIED);

    const { tier, collateral } = await lender.underwrite(loanA);
    expect(tier).toBe(Tier.VERIFIED);
    expect(collateral).toBe(1_100n);
    let state = await lender.loanState(loanA);
    expect(state.status).toBe(LoanStatus.OFFERED);
    expect(state.offeredCollateral).toBe(1_100n);
    expect(state.collateralRequired).toBe(0n);

    // Nothing binds until the borrower accepts.
    await expect(lender.disburse(loanA)).rejects.toThrow();
    expect(await borrower.acceptOffer(loanA)).toEqual({ tier: Tier.VERIFIED, collateral: 1_100n });
    state = await lender.loanState(loanA);
    expect(state.status).toBe(LoanStatus.ACTIVE);
    expect(state.collateralRequired).toBe(1_100n);
  });

  it('refuses a borrower disbursing, and a lender repaying', async () => {
    await activateListing(loanA, lenderASk);
    await expect(borrower.disburse(loanA)).rejects.toThrow();
    await lender.disburse(loanA);
    await expect(lender.repay(loanA)).rejects.toThrow();
  });

  it('loan A is repaid in two installments and recorded by its lender', async () => {
    expect(await borrower.repay(loanA)).toBe(550n);
    expect(await borrower.repay(loanA)).toBe(550n);
    const state = await borrower.loanState(loanA);
    expect(state.status).toBe(LoanStatus.REPAID);
    expect(state.paymentsMade).toBe(2n);
    expect(state.latePayments).toBe(0n);

    await lender.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(lenderASk));
    await lender.recordRepaid(directory, loanA);
    const listing = (await borrower.listings(directory)).find((r) => r.loan === loanA);
    expect(listing?.status).toBe(ListingStatus.REPAID);
  });

  it('loan B, with no tier proof, is offered 150%, accepted and repaid', async () => {
    loanB = await openLoan(lenderBSk, TERMS_B);
    await lender.quote(loanB, QUOTE);
    const { tier, collateral } = await lender.underwrite(loanB);
    expect(tier).toBe(Tier.STANDARD);
    expect(collateral).toBe(3_000n);
    await borrower.acceptOffer(loanB);
    await repayInFull(loanB, lenderBSk);
    expect((await borrower.loanState(loanB)).status).toBe(LoanStatus.REPAID);
  });

  it('a new application carries a proof of two repaid loans, and nothing else', async () => {
    loanC = await openLoan(lenderASk, TERMS_C);
    const a = { loan: loanA, lenderPk: lender.pubKeyOf(lenderASk) };
    const b = { loan: loanB, lenderPk: lender.pubKeyOf(lenderBSk) };

    await borrower.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(borrowerSk));
    await expect(borrower.proveTwoRepaid(directory, loanC, a, a)).rejects.toThrow();
    await borrower.proveTwoRepaid(directory, loanC, a, b);
    expect(await lender.historyProofCount(directory, loanC)).toBe(2n);
  });
});
