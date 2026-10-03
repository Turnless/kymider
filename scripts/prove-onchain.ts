// Kymider — prove it on-chain: run every flow, keep every receipt.
//
//   npm run prove:onchain                              (local devnet)
//   MIDNIGHT_NETWORK=preprod npm run prove:onchain     (Preprod; PREPROD_WALLET_SEED)
//
// Deploys fresh SolvencyProof, Registry and LoanDirectory instances and runs:
//
//   Wave 1  borrower commits facts, authorizes a lender; the lender requests a
//           claim; the borrower proves solvency in ZK (PASS); the lender approves.
//   Wave 2  loan A: tier proof, underwritten at 110%, disbursed, repaid, recorded.
//           loan B: no proof, underwritten at 150%, disbursed, repaid, recorded.
//           loan C: a new application that proves "two repaid loans".
//
// Every finalized transaction's public data (tx id, hash, block) is recorded
// through the clients' receipt sink, then written to:
//
//   PROOF.md                                     the judge-readable record
//   frontend/public/deployments/<network>.json   the console's record
//
// Before writing PROOF.md, the run reads every contract back from the indexer
// and checks the claims it makes (the same checks as `verify:onchain`). The
// files are written even when a check fails, so the failure can be read; the
// exit code is non-zero then.
//
// One funded wallet is enough on a public network: it pays for both roles,
// while the borrower and the lenders keep separate dapp secret keys, which is
// the identity every circuit checks. See scripts/lib/wallets.ts.

import '../client/env.js';

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { waitForFunds } from '@midnight-ntwrk/testkit-js';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { connectWallet } from '../client/context.js';
import { getConfig } from '../client/config.js';
import { buildProviders } from '../client/providers.js';
import { KymiderClient } from '../client/index.js';
import { LoanClient, tierName } from '../client/loans.js';
import { TxLog } from '../client/txlog.js';
import type { WalletSecret } from '../client/wallet.js';
import {
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  createSolvencyPrivateState,
} from '../contracts/witnesses.js';
import { AttestationStatus, LoanStatus, Tier, type LoanTerms } from '../contracts/index.js';
import { CLAIM, FACTS, QUOTE, STEPS, TERMS_A, TERMS_B, TERMS_C, type StepInfo } from './lib/flow.js';
import { buildDeployments, deploymentsPath, writeDeployments } from './lib/deployments.js';
import { renderProofMd, explorerTemplate } from './lib/proof-md.js';
import { allPass, renderClaimTable, summarizeTransactions } from './lib/claims.js';
import { verifyDeployments } from './lib/onchain.js';
import { resolveProveWallets, waitForDust, type ProveWallets } from './lib/wallets.js';

// Workflow logs of a public repository are public. The wallet builder logs a
// prefix of the master seed; redact anything shaped like that before it is
// written.
const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
  hooks: {
    logMethod(args, method) {
      const redacted = args.map((a) =>
        typeof a === 'string' ? a.replace(/(master seed|mnemonic|seed)(:\s*)\S+/gi, '$1$2[redacted]') : a,
      ) as typeof args;
      method.apply(this, redacted);
    },
  },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
const isRemote = network !== 'local';
const config = getConfig();

// A remote wallet syncs from far back, so give it hours (as the simulations
// do); the devnet syncs in seconds. DUST accrues from registered NIGHT.
const syncTimeoutMs = Number(
  process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? (isRemote ? 3 * 60 * 60_000 : 10 * 60_000),
);
const dustTimeoutMs = Number(
  process.env['KYMIDER_DUST_TIMEOUT_MS'] ?? (isRemote ? 60 * 60_000 : 3 * 60_000),
);
const minDust = BigInt(process.env['KYMIDER_MIN_DUST'] ?? '1');

const proofFile = path.resolve(process.cwd(), 'PROOF.md');
const deploymentsFile = deploymentsPath(network);

let wallets: ProveWallets;
try {
  wallets = resolveProveWallets(network);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const show = (label: string, value: unknown): void => console.log(`${label.padEnd(44)} ${String(value)}`);

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`run check failed: ${message}`);
}

async function connect(role: string, secret: WalletSecret) {
  logger.info(`Connecting the ${role} wallet to '${network}'...`);
  const ctx = await connectWallet(logger, secret, syncTimeoutMs);
  // Logs the wallet's public address, registers NIGHT for DUST if needed.
  const night = await waitForFunds(ctx.wallet.wallet, ctx.env, false, ctx.wallet.unshieldedKeystore);
  if (night === 0n) {
    throw new Error(
      `the ${role} wallet holds no NIGHT on '${network}'. Fund the address logged above` +
        (config.faucet ? ` at ${config.faucet}` : '') +
        ', then run again.',
    );
  }
  await waitForDust(logger, ctx.wallet, minDust, dustTimeoutMs);
  return ctx;
}

console.log(`\n== Kymider on-chain proof: ${network} ==\n`);
show('Wallets', wallets.source);

const borrowerCtx = await connect('borrower', wallets.borrower);
const lenderCtx = wallets.lender ? await connect('lender', wallets.lender) : null;

// One provider set per wallet (a private-state store opens once per process).
// With one wallet, both roles share its providers and keep their private
// state apart under different private-state ids.
const borrowerProviders = buildProviders(borrowerCtx.wallet, config);
const lenderProviders = lenderCtx ? buildProviders(lenderCtx.wallet, config) : borrowerProviders;

const log = new TxLog((r) =>
  logger.info(`tx ${r.contractName}.${r.circuit} at block ${r.blockHeight}: ${r.txHash} (${r.label})`),
);
const borrower = new KymiderClient(logger, borrowerProviders, undefined, undefined, log.sink);
const lender = new KymiderClient(logger, lenderProviders, 'solvency-proof-lender', 'registry-lender', log.sink);
const borrowerLoans = new LoanClient(logger, borrowerProviders, undefined, undefined, log.sink);
const lenderLoans = new LoanClient(logger, lenderProviders, 'loan-lender', 'loan-directory-lender', log.sink);

// Fresh dapp identities for this run. Never persisted: the run is complete
// in itself, and the record it leaves is public data only.
const borrowerSk = new Uint8Array(randomBytes(32));
const lenderASk = new Uint8Array(randomBytes(32));
const lenderBSk = new Uint8Array(randomBytes(32));

const step = <T>(s: StepInfo, fn: () => Promise<T>): Promise<T> => {
  console.log(`\n--- ${s.label}`);
  return log.step(s.label, fn);
};

let exitCode = 0;
try {
  // --- Wave 1: proof of solvency -------------------------------------------------

  const registry = await step(STEPS.deployRegistry, () => borrower.deployRegistry(borrowerSk));
  const solvency = await step(STEPS.deploySolvency, () => borrower.deploySolvencyProof(FACTS, borrowerSk));
  await step(STEPS.register, () => borrower.registerWithRegistry(registry, solvency));
  show('Registry', registry);
  show('SolvencyProof', solvency);

  const lenderAPk = lender.solvencyPubKeyOf(lenderASk);
  await step(STEPS.addLender, () => borrower.authorizeLender(solvency, lenderAPk));
  await lender.bindSolvencyPrivateState(solvency, createSolvencyPrivateState(0n, 0n, 0n, lenderASk));
  await step(STEPS.requestClaim, () => lender.requestClaim(solvency, CLAIM));
  await step(STEPS.proveSolvency, () => borrower.proveSolvency(solvency, lenderAPk));
  const attestation = await borrower.attestationFor(solvency, lenderAPk);
  check(attestation === AttestationStatus.PASS, `attestation is ${attestation}, expected PASS`);
  show('Attestation', 'PASS');
  await step(STEPS.approve, () => lender.decideClaim(solvency, true));

  // --- Wave 2: the loan lifecycle ------------------------------------------------

  const directory = await step(STEPS.deployDirectory, () => borrowerLoans.deployLoanDirectory(borrowerSk));
  show('LoanDirectory', directory);
  const commitment = (await borrower.solvencyState(solvency)).commitment;

  const openLoan = async (
    deploy: StepInfo,
    list: StepInfo,
    lenderSk: Uint8Array,
    terms: LoanTerms,
  ): Promise<ContractAddress> => {
    const loan = await step(deploy, () =>
      borrowerLoans.deployLoan({ sk: borrowerSk, lenderPk: lenderLoans.pubKeyOf(lenderSk), terms, commitment }),
    );
    await step(list, () => borrowerLoans.listLoan(directory, loan));
    await lenderLoans.bindLoanPrivateState(loan, createLoanPrivateState(lenderSk, new Uint8Array(32)));
    show('Loan', loan);
    return loan;
  };

  const repayAll = async (loan: ContractAddress, repay: StepInfo, installments: bigint): Promise<void> => {
    for (let i = 0n; i <= installments; i++) {
      if ((await borrowerLoans.loanState(loan)).status !== LoanStatus.ACTIVE) break;
      const paid = await step(repay, () => borrowerLoans.repay(loan));
      show('Paid', paid);
    }
    const state = await borrowerLoans.loanState(loan);
    check(state.status === LoanStatus.REPAID, `loan ${loan} is not REPAID (status ${state.status})`);
    check(state.latePayments === 0n, `loan ${loan} has ${state.latePayments} late payments`);
  };

  const record = async (loan: ContractAddress, s: StepInfo, lenderSk: Uint8Array): Promise<void> => {
    await lenderLoans.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(lenderSk));
    await step(s, () => lenderLoans.recordRepaid(directory, loan));
  };

  // Loan A: the borrower proves the tier, so 110%.
  const loanA = await openLoan(STEPS.deployLoanA, STEPS.listA, lenderASk, TERMS_A);
  await step(STEPS.quoteA, () => lenderLoans.quote(loanA, QUOTE));
  const tierA = await step(STEPS.proveTierA, () => borrowerLoans.proveTier(loanA, FACTS));
  check(tierA === Tier.VERIFIED, `loan A tier is ${tierName(tierA)}, expected VERIFIED`);
  const underA = await step(STEPS.underwriteA, () => lenderLoans.underwrite(loanA));
  check(underA.tier === Tier.VERIFIED, `loan A underwritten at ${tierName(underA.tier)}`);
  show('Loan A collateral', `${underA.collateral} on ${TERMS_A.principal} (110%)`);
  await step(STEPS.disburseA, () => lenderLoans.disburse(loanA));
  await repayAll(loanA, STEPS.repayA, TERMS_A.installments);
  await record(loanA, STEPS.recordA, lenderASk);

  // Loan B: no tier proof, so 150%. A second lender.
  const loanB = await openLoan(STEPS.deployLoanB, STEPS.listB, lenderBSk, TERMS_B);
  await step(STEPS.quoteB, () => lenderLoans.quote(loanB, QUOTE));
  const underB = await step(STEPS.underwriteB, () => lenderLoans.underwrite(loanB));
  check(underB.tier === Tier.STANDARD, `loan B underwritten at ${tierName(underB.tier)}`);
  show('Loan B collateral', `${underB.collateral} on ${TERMS_B.principal} (150%)`);
  await step(STEPS.disburseB, () => lenderLoans.disburse(loanB));
  await repayAll(loanB, STEPS.repayB, TERMS_B.installments);
  await record(loanB, STEPS.recordB, lenderBSk);

  // Loan C: a new application proves two repaid loans, naming neither.
  const loanC = await openLoan(STEPS.deployLoanC, STEPS.listC, lenderASk, TERMS_C);
  await borrowerLoans.bindLoanDirectoryPrivateState(directory, createLoanDirectoryPrivateState(borrowerSk));
  await step(STEPS.proveHistoryC, () =>
    borrowerLoans.proveTwoRepaid(
      directory,
      loanC,
      { loan: loanA, lenderPk: lenderLoans.pubKeyOf(lenderASk) },
      { loan: loanB, lenderPk: lenderLoans.pubKeyOf(lenderBSk) },
    ),
  );
  const count = await borrowerLoans.historyProofCount(directory, loanC);
  check(count === 2n, `history proof count is ${count}, expected 2`);
  show('History proof on loan C', `${count} repaid loans`);

  // --- the record ------------------------------------------------------------------

  const deployments = buildDeployments({
    network,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    generatedAt: new Date(),
    contracts: { solvencyProof: solvency, registry, loanDirectory: directory, loans: [loanA, loanB, loanC] },
    receipts: log.receipts,
  });
  writeDeployments(deploymentsFile, deployments);

  console.log('\n--- reading every contract back from the indexer');
  const { claims, transactions } = await verifyDeployments(deployments);
  const rows = [...claims, summarizeTransactions(transactions)];
  console.log(`\n${renderClaimTable([...claims, ...transactions])}\n`);

  fs.writeFileSync(
    proofFile,
    renderProofMd({
      deployments,
      receipts: log.receipts,
      claims: rows,
      explorer: explorerTemplate(network, process.env['KYMIDER_EXPLORER_TX_URL']),
    }),
    'utf8',
  );
  show('Transactions recorded', log.receipts.length);
  show('Wrote', path.relative(process.cwd(), proofFile));
  show('Wrote', path.relative(process.cwd(), deploymentsFile));

  if (!allPass(rows)) {
    console.error('\nSome claims did not hold on-chain; see the table above.');
    exitCode = 1;
  } else {
    console.log('\nEvery claim holds on-chain. The facts never left the borrower.\n');
  }
} catch (err) {
  console.error('\nThe on-chain run failed:', err);
  // Public data only: what did land, so a failed run can still be traced.
  console.error('Receipts so far:', JSON.stringify(log.receipts, null, 2));
  exitCode = 1;
} finally {
  await borrowerCtx.wallet.stop().catch(() => undefined);
  await lenderCtx?.wallet.stop().catch(() => undefined);
}

process.exit(exitCode);
