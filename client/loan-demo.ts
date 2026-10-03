// Kymider — Wave 2 end-to-end demo: a loan at 110% collateral instead of 150%.
//
//   Borrower opens a Loan bound to their SolvencyProof facts, lists it
//   Lender checks the binding, quotes a bar      ->  borrower proves the tier (ZK)
//   Lender underwrites at 110% (150% without it) ->  disburses
//   Borrower repays every installment            ->  lender records the repayment
//
// Each run repays one loan and records it in the shared LoanDirectory. Once
// two are recorded, the run also opens a new application and proves "this
// borrower has repaid two Kymider loans" without saying which.
//
// Reuses `.midnight-state.json` (the Wave 1 SolvencyProof instance) and
// `.midnight-loans.json` (the directory) when present for this network, and
// deploys what is missing. Lender identities are fresh on every run.
//
// Raw financial facts never leave the borrower's machine.

import './env.js';

import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { connectWallet } from './context.js';
import { buildProviders } from './providers.js';
import { KymiderClient } from './index.js';
import { LoanClient, tierName } from './loans.js';
import { getConfig } from './config.js';
import { loadOrCreateDappSk } from './identity.js';
import {
  factsFromState,
  factsToState,
  readDeploymentState,
  readLoanState,
  writeDeploymentState,
  writeLoanState,
} from './state.js';
import {
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  createSolvencyPrivateState,
} from '../contracts/witnesses.js';
import { ListingStatus, Tier } from '../contracts/index.js';
import { collateralFor } from './proof/loanMath.js';
import { bytesToHex, hexToBytes } from './utils.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const borrowerSeed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';
const lenderSeed =
  process.env['KYMIDER_LENDER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000002';

const DEFAULT_FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const QUOTE = { thresholdNetWorth: 500_000n, maxDti: 40n, ttlSeconds: 3_600n };
const TERMS = { principal: 10_000n, interestBps: 800n, installments: 3n, periodSeconds: 30n * 86_400n };

const show = (label: string, value: unknown): void =>
  console.log(`${label.padEnd(46)} ${String(value)}`);

const config = getConfig();
const priorSolvency = readDeploymentState(config.networkId);
const priorLoans = readLoanState(config.networkId);
const FACTS = priorSolvency ? factsFromState(priorSolvency) : DEFAULT_FACTS;

console.log('\n== Kymider Wave 2 demo — a loan at 110% collateral ==\n');

const borrowerCtx = await connectWallet(logger, { kind: 'seed', value: borrowerSeed });
const lenderCtx = await connectWallet(logger, { kind: 'seed', value: lenderSeed });

// One provider set per wallet: a private-state store opens once per process.
const borrowerProviders = buildProviders(borrowerCtx.wallet, config);
const borrower = new LoanClient(logger, borrowerProviders);
const solvency = new KymiderClient(logger, borrowerProviders);
const lender = new LoanClient(logger, buildProviders(lenderCtx.wallet, config));

const { sk: borrowerSk, source } = loadOrCreateDappSk();
const lenderSk = new Uint8Array(randomBytes(32));
const lenderPk = lender.pubKeyOf(lenderSk);
show('Borrower dapp identity', source);

// --- the borrower's committed facts (Wave 1) ---------------------------------

let solvencyAddress: string;
if (priorSolvency) {
  solvencyAddress = priorSolvency.solvencyAddress;
  await solvency.bindSolvencyPrivateState(
    solvencyAddress,
    createSolvencyPrivateState(FACTS.balance, FACTS.debts, FACTS.income, borrowerSk),
  );
} else {
  solvencyAddress = await solvency.deploySolvencyProof(FACTS, borrowerSk);
  const registryAddress = await solvency.deployRegistry(borrowerSk);
  await solvency.registerWithRegistry(registryAddress, solvencyAddress);
  await writeDeploymentState({
    network: config.networkId,
    solvencyAddress,
    registryAddress,
    facts: factsToState(FACTS),
  });
}
show('SolvencyProof instance (facts committed)', solvencyAddress);

// --- the shared directory -------------------------------------------------------

let directory: string;
let repaid = priorLoans?.repaid ?? [];
if (priorLoans) {
  directory = priorLoans.directoryAddress;
  await borrower.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(borrowerSk));
} else {
  directory = await borrower.deployLoanDirectory(borrowerSk);
  await writeLoanState({ network: config.networkId, directoryAddress: directory, repaid });
}
show('LoanDirectory', directory);

// --- apply ----------------------------------------------------------------------

console.log('\n--- borrower: open a loan bound to the committed facts, and list it ---');
const commitment = (await solvency.solvencyState(solvencyAddress)).commitment;
const loan = await borrower.deployLoan({ sk: borrowerSk, lenderPk, terms: TERMS, commitment });
await borrower.listLoan(directory, loan);
show('Loan instance', loan);
show('Principal', TERMS.principal);

console.log('\n--- lender: check the binding, then quote ---');
await lender.bindLoanPrivateState(loan, createLoanPrivateState(lenderSk, new Uint8Array(32)));
show('Facts match the SolvencyProof instance', await lender.factsMatchSolvencyProof(loan, solvencyAddress));
await lender.quote(loan, QUOTE);
show('Bar: net worth >= / DTI <= (%)', `${QUOTE.thresholdNetWorth} / ${QUOTE.maxDti}`);

// A history proof needs two repaid loans recorded under this borrower.
if (repaid.length >= 2) {
  console.log('\n--- borrower: prove two repaid loans, without naming them ---');
  const [a, b] = repaid.slice(-2).map((r) => ({ loan: r.loan, lenderPk: hexToBytes(r.lenderPk) }));
  await borrower.proveTwoRepaid(directory, loan, a!, b!);
  show('Directory records for this application', `${await lender.historyProofCount(directory, loan)} repaid loans`);
}

console.log('\n--- borrower: prove the tier (ZK, verified by the network) ---');
const tier = await borrower.proveTier(loan, FACTS);
show('Tier on the ledger', tierName(tier));

console.log('\n--- lender: underwrite and disburse ---');
const { collateral } = await lender.underwrite(loan);
show('Collateral required', `${collateral} (150% would be ${collateralFor(TERMS.principal, Tier.STANDARD)})`);
await lender.updateListingStatus(directory, loan, ListingStatus.ACTIVE);
const { owed, installment } = await lender.disburse(loan);
show('Owed / installment', `${owed} / ${installment}`);

console.log('\n--- borrower: repay every installment ---');
let state = await borrower.loanState(loan);
while (state.balanceOwed > 0n) {
  const paid = await borrower.repay(loan);
  state = await borrower.loanState(loan);
  show(`Paid ${paid}`, `${state.balanceOwed} left`);
}
show('Payments / late', `${state.paymentsMade} / ${state.latePayments}`);
show('History commitment', `${bytesToHex(state.historyCommitment).slice(0, 16)}...`);

console.log('\n--- lender: record the repayment in the directory ---');
await lender.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(lenderSk));
await lender.recordRepaid(directory, loan);
repaid = [...repaid, { loan, lenderPk: bytesToHex(lenderPk) }];
await writeLoanState({ network: config.networkId, directoryAddress: directory, repaid });
show('Repaid loans recorded for this borrower', repaid.length);
if (repaid.length < 2) {
  console.log('Run the demo again: with two recorded, the next application proves its history.');
}

console.log('\nThe lender learned the tier, never the balance, debts or income behind it.\n');

await borrowerCtx.wallet.stop();
await lenderCtx.wallet.stop();
process.exit(0);
