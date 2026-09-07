// Kymider — Wave 1 simulation against the local devnet (or a public testnet).
//
// Runs the full vertical slice: deploy a per-borrower SolvencyProof instance +
// the shared Registry, register, authorize a lender, request a claim, prove
// solvency (network-verified ZK), approve, plus negative authorization tests
// and a commitment-tamper test.
//
// Requires the devnet: `npm run env:up` (docker-compose.yml). Run with
// `npm run test:simulation`.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { waitForFunds } from '@midnight-ntwrk/testkit-js';
import { getConfig } from '../../client/config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../../client/wallet.js';
import { buildProviders } from '../../client/providers.js';
import { KymiderClient } from '../../client/index.js';
import { createSolvencyPrivateState } from '../../contracts/witnesses.js';
import {
  AttestationStatus,
  ClaimStatus,
  BorrowStatus,
} from '../../contracts/index.js';

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

type Role = 'BORROWER' | 'LENDER';

// Genesis seeds for the local dev node — pre-funded, used only on `local`.
const LOCAL_SEEDS: Record<Role, string> = {
  BORROWER: '0000000000000000000000000000000000000000000000000000000000000001',
  LENDER: '0000000000000000000000000000000000000000000000000000000000000002',
};

function resolveSecret(net: string, role: Role): WalletSecret {
  if (net === 'local') {
    return { kind: 'seed', value: LOCAL_SEEDS[role] };
  }
  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_${role}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_${role}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();
  if (mnemonic && seedHex) {
    throw new Error(`Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`);
  }
  if (mnemonic) {
    return { kind: 'mnemonic', value: mnemonic };
  }
  if (seedHex) {
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(`Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'.`);
}

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
const isRemote = network !== 'local';
const syncTimeoutMs = Number(
  process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
    (isRemote ? 3 * 60 * 60_000 : 10 * 60_000),
);

// Demo (self-reported) financials.
const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };

describe(`Kymider Wave 1 simulation (${network})`, () => {
  let borrowerWallet: MidnightWalletProvider;
  let lenderWallet: MidnightWalletProvider;
  let borrower: KymiderClient;
  let lender: KymiderClient;
  let borrowerSk: Uint8Array;
  let lenderSk: Uint8Array;
  let lenderPubKey: Uint8Array;
  let registryAddress: ContractAddress;
  let solvencyAddress: ContractAddress;

  beforeAll(async () => {
    const config = getConfig();
    setNetworkId(config.networkId);
    const env: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    borrowerWallet = await MidnightWalletProvider.build(logger, env, resolveSecret(network, 'BORROWER'));
    await borrowerWallet.start();
    await syncWallet(logger, borrowerWallet.wallet, syncTimeoutMs);

    lenderWallet = await MidnightWalletProvider.build(logger, env, resolveSecret(network, 'LENDER'));
    await lenderWallet.start();
    await syncWallet(logger, lenderWallet.wallet, syncTimeoutMs);

    if (isRemote) {
      for (const [name, w] of [
        ['BORROWER', borrowerWallet],
        ['LENDER', lenderWallet],
      ] as const) {
        const balance = await waitForFunds(w.wallet, env, false, w.unshieldedKeystore);
        logger.info(`${name} NIGHT balance on '${network}': ${balance}`);
      }
    }

    borrower = new KymiderClient(logger, buildProviders(borrowerWallet, config));
    lender = new KymiderClient(logger, buildProviders(lenderWallet, config));

    borrowerSk = randomBytes(32);
    lenderSk = randomBytes(32);
    lenderPubKey = lender.solvencyPubKeyOf(lenderSk);

    logger.info(`Providers initialized on '${network}', ready to test.`);
  });

  afterAll(async () => {
    await borrowerWallet?.stop();
    await lenderWallet?.stop();
  });

  it('deploys the shared Registry and a per-borrower SolvencyProof instance', async () => {
    registryAddress = await borrower.deployRegistry(borrowerSk);
    expect(registryAddress).toBeDefined();

    solvencyAddress = await borrower.deploySolvencyProof(FACTS, borrowerSk);
    expect(solvencyAddress).toBeDefined();
    expect(solvencyAddress).not.toBe(registryAddress);

    const state = await borrower.solvencyState(solvencyAddress);
    expect(state.commitment).toBeDefined();
    expect(state.owner).toBeDefined();
  });

  it('registers the instance in the public Registry', async () => {
    await borrower.registerWithRegistry(registryAddress, solvencyAddress);
    const borrowers = await borrower.listBorrowers(registryAddress);
    expect(borrowers).toHaveLength(1);
    expect(borrowers[0].instanceAddress).toBe(solvencyAddress);
    expect(borrowers[0].status).toEqual(BorrowStatus.ACTIVE);
  });

  it('authorizes the lender, who then requests a claim', async () => {
    await borrower.authorizeLender(solvencyAddress, lenderPubKey);

    await lender.bindSolvencyPrivateState(
      solvencyAddress,
      createSolvencyPrivateState(0n, 0n, 0n, lenderSk),
    );
    await lender.requestClaim(solvencyAddress, CLAIM);

    const claim = await borrower.claimFor(solvencyAddress, lenderPubKey);
    expect(claim.status).toEqual(ClaimStatus.PENDING);
    expect(claim.thresholdNetWorth).toBe(CLAIM.thresholdNetWorth);
    expect(claim.maxDti).toBe(CLAIM.maxDti);
  });

  it('borrower proves solvency; network-verified attestation is PASS', async () => {
    await borrower.proveSolvency(solvencyAddress, lenderPubKey);
    const attestation = await borrower.attestationFor(solvencyAddress, lenderPubKey);
    expect(attestation).toEqual(AttestationStatus.PASS);
  });

  it('lender approves the claim', async () => {
    await lender.decideClaim(solvencyAddress, true);
    const claim = await borrower.claimFor(solvencyAddress, lenderPubKey);
    expect(claim.status).toEqual(ClaimStatus.APPROVED);
  });

  it('off-chain record check confirms commitment is consistent with the Registry', async () => {
    const { verified, verdict } = await lender.verifyOffChain(
      solvencyAddress,
      registryAddress,
      lenderPubKey,
    );
    expect(verified).toBe(true);
    expect(verdict).toEqual(AttestationStatus.PASS);
  });

  it('negative auth: the lender cannot call borrower-only addLender', async () => {
    await expect(
      lender.authorizeLender(solvencyAddress, lenderPubKey),
    ).rejects.toThrow();
  });

  it('negative auth: the borrower cannot decide a lender claim (approve is lender-only)', async () => {
    await expect(borrower.decideClaim(solvencyAddress, true)).rejects.toThrow();
  });

  it('tamper: a proof built on facts that do not match the commitment is rejected', async () => {
    // Same lender, fabricated facts: the circuit recomputes the commitment and
    // fails, so the network proof is invalid.
    await expect(
      borrower.submitSolvencyCall(solvencyAddress, 'proveSolvency', [
        lenderPubKey,
        999_999_999n,
        1n,
        1n,
      ]),
    ).rejects.toThrow();
  });

  // Ordered BEFORE updateFacts on purpose: the claim from the earlier tests is
  // APPROVED, so this must fail on the PENDING guard specifically. Running it
  // after a fact update would also fail on a stale-commitment mismatch, which
  // would make the test pass for the wrong reason.
  it('proveSolvency rejects re-proving an already-decided claim', async () => {
    await expect(
      borrower.proveSolvency(solvencyAddress, lenderPubKey),
    ).rejects.toThrow();
  });

  // The full refresh cycle, which is where the stale-private-state and stale
  // Registry-commitment bugs used to bite: after updateFacts the borrower must
  // still be able to prove (facts written back into private state), and the
  // Registry must index the new commitment (so verifyOffChain still holds).
  it('updateFacts re-commits, syncs the Registry, and a fresh lender can still be underwritten', async () => {
    const secondLenderSk = randomBytes(32);
    const secondLenderPubKey = lender.solvencyPubKeyOf(secondLenderSk);
    const newFacts = { balance: 2_000_000n, debts: 200_000n, income: 1_000_000n };

    await borrower.authorizeLender(solvencyAddress, secondLenderPubKey);
    await lender.bindSolvencyPrivateState(
      solvencyAddress,
      createSolvencyPrivateState(0n, 0n, 0n, secondLenderSk),
    );
    await lender.requestClaim(solvencyAddress, CLAIM);

    const before = await borrower.solvencyState(solvencyAddress);
    await borrower.updateFacts(solvencyAddress, newFacts, registryAddress);
    const after = await borrower.solvencyState(solvencyAddress);
    expect(after.commitment).not.toEqual(before.commitment);

    // The Registry followed the instance rather than pinning the old hash.
    const rows = await borrower.listBorrowers(registryAddress);
    const row = rows.find((r) => r.instanceAddress === solvencyAddress);
    expect(row).toBeDefined();
    expect(row?.commitment).toEqual(after.commitment);

    // Proving against the UPDATED facts still succeeds: the client wrote them
    // back to private state, so the in-circuit commitment check passes.
    await borrower.proveSolvency(solvencyAddress, secondLenderPubKey);
    expect(await borrower.attestationFor(solvencyAddress, secondLenderPubKey)).toEqual(
      AttestationStatus.PASS,
    );

    await lender.decideClaim(solvencyAddress, true);
    const { verified, verdict } = await lender.verifyOffChain(
      solvencyAddress,
      registryAddress,
      secondLenderPubKey,
    );
    expect(verified).toBe(true);
    expect(verdict).toEqual(AttestationStatus.PASS);
  });
});
