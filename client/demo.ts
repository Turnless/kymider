// Kymider — Wave 1 end-to-end demo.
//
// Runs the full vertical slice against the local devnet:
//
//   Borrower deploys own SolvencyProof instance  ->  registers in Registry
//   Lender is authorized, requests a claim       ->  borrower proves solvency (ZK)
//   Midnight network verifies the proof          ->  attestation PASS/FAIL
//   Lender approves                              ->  off-chain record check
//
// If `.midnight-state.json` holds a deployment for this network (written by
// `npm run deploy`), the demo acts on THAT instance instead of deploying a new
// one — which only works because the borrower's owner key and private facts now
// survive the process that deployed them.
//
// The lender identity is fresh on every run, so re-running the demo against an
// existing instance always gets a clean claim slot.
//
// Raw financial facts never leave the borrower's machine.

import './env.js';

import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { connectWallet } from './context.js';
import { buildProviders } from './providers.js';
import { KymiderClient } from './index.js';
import { getConfig } from './config.js';
import { loadOrCreateDappSk } from './identity.js';
import {
  factsFromState,
  factsToState,
  readDeploymentState,
  writeDeploymentState,
} from './state.js';
import { createRegistryPrivateState, createSolvencyPrivateState } from '../contracts/witnesses.js';
import { AttestationStatus, ClaimStatus } from '../contracts/index.js';
import { bytesToHex } from './utils.js';

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

// Demo (self-reported) financials and the lender's requested claim.
const DEFAULT_FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };

const show = (label: string, value: unknown): void =>
  console.log(`${label.padEnd(46)} ${String(value)}`);

const config = getConfig();
const prior = readDeploymentState(config.networkId);
const FACTS = prior ? factsFromState(prior) : DEFAULT_FACTS;

console.log('\n== Kymider Wave 1 demo — proof of solvency ==\n');
console.log(
  'Facts (private — never leave the borrower\'s machine):',
  JSON.stringify(FACTS, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
);
console.log(
  'Claim requested by the lender:',
  JSON.stringify(CLAIM, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
);

const borrowerCtx = await connectWallet(logger, { kind: 'seed', value: borrowerSeed });
const lenderCtx = await connectWallet(logger, { kind: 'seed', value: lenderSeed });

const borrower = new KymiderClient(logger, buildProviders(borrowerCtx.wallet, config));
const lender = new KymiderClient(logger, buildProviders(lenderCtx.wallet, config));

const { sk: borrowerSk, source } = loadOrCreateDappSk();
const lenderSk = new Uint8Array(randomBytes(32));

let registryAddress: string;
let solvencyAddress: string;

if (prior) {
  console.log('\n--- borrower: reusing the deployment in .midnight-state.json ---');
  registryAddress = prior.registryAddress;
  solvencyAddress = prior.solvencyAddress;
  // Re-bind the owner identity + facts to this instance. Nothing here touches
  // the chain: it restores the private state a previous process wrote.
  await borrower.bindSolvencyPrivateState(
    solvencyAddress,
    createSolvencyPrivateState(FACTS.balance, FACTS.debts, FACTS.income, borrowerSk),
  );
  await borrower.bindRegistryPrivateState(registryAddress, createRegistryPrivateState(borrowerSk));
} else {
  console.log('\n--- borrower: deploy + register ---');
  registryAddress = await borrower.deployRegistry(borrowerSk);
  solvencyAddress = await borrower.deploySolvencyProof(FACTS, borrowerSk);
  await borrower.registerWithRegistry(registryAddress, solvencyAddress);
  await writeDeploymentState({
    network: config.networkId,
    solvencyAddress,
    registryAddress,
    facts: factsToState(FACTS),
  });
}

show('Borrower dapp identity', source);
show('Registry', registryAddress);
show('SolvencyProof instance', solvencyAddress);
show('Registry indexes borrowers', (await borrower.listBorrowers(registryAddress)).length);

console.log('\n--- lender: authorize + request claim ---');
const lenderPubKey = lender.solvencyPubKeyOf(lenderSk);
await borrower.authorizeLender(solvencyAddress, lenderPubKey);
await lender.bindSolvencyPrivateState(
  solvencyAddress,
  createSolvencyPrivateState(0n, 0n, 0n, lenderSk),
);
await lender.requestClaim(solvencyAddress, CLAIM);
show('Lender pubkey', `${bytesToHex(lenderPubKey).slice(0, 16)}...`);

console.log('\n--- borrower: prove solvency (ZK, verified by network) ---');
await borrower.proveSolvency(solvencyAddress, lenderPubKey);
const attestation = await borrower.attestationFor(solvencyAddress, lenderPubKey);
show('Network-verified attestation', attestationName(attestation));

console.log('\n--- lender: approve + off-chain record check ---');
await lender.decideClaim(solvencyAddress, true);
const claim = await borrower.claimFor(solvencyAddress, lenderPubKey);
show('Claim status', claimStatusName(claim.status));

const { verified, verdict } = await lender.verifyOffChain(
  solvencyAddress,
  registryAddress,
  lenderPubKey,
);
show('Off-chain record check', `${verified ? 'verified' : 'inconsistent'}: ${attestationName(verdict)}`);

console.log('\nRaw financial facts were never revealed to the lender or the network.\n');

await borrowerCtx.wallet.stop();
await lenderCtx.wallet.stop();
process.exit(0);

function attestationName(a: AttestationStatus): string {
  if (a === AttestationStatus.PASS) return 'PASS';
  if (a === AttestationStatus.FAIL) return 'FAIL';
  return 'NONE';
}

function claimStatusName(s: ClaimStatus): string {
  if (s === ClaimStatus.PENDING) return 'PENDING';
  if (s === ClaimStatus.APPROVED) return 'APPROVED';
  return 'REJECTED';
}
