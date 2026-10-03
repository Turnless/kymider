// Kymider — the live console's chain reader, tested offline.
//
// The console reads deployed contracts from a Midnight indexer, which serves
// each contract's state as the hex of `ContractState.serialize()`. These tests
// produce that exact payload from the REAL compiled contracts (driven through
// the offline simulators), push it through the console's decode layer and its
// GraphQL reader (with a stubbed fetch), and check every public field against
// the ledger the simulator holds. Only the network hop is missing; CI's devnet
// job can run the same reader against a live indexer (see the report in
// frontend/src/lib/live/chainReader.ts).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ContractState, type ChargedState } from '@midnight-ntwrk/compact-runtime';
import { encodeContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {

  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  AttestationStatus,
  BorrowStatus,
  ClaimStatus,
  ListingStatus,
  LoanStatus,
  Tier,
  loanDirectoryLedger,
  loanLedger,
  registryLedger,
  solvencyLedger,
} from '../../contracts/index.js';
import {
  LoanDirectorySimulator,
  LoanSimulator,
  RegistrySimulator,
  SolvencySimulator,
  T0,
  commitFacts,
  TEST_SALT,
  loanAddr,
  pubKeyOf,
  repaidLeaf,
  skFrom,
} from './support/simulators.js';
import {
  ATTESTATION_LABELS,
  BORROW_LABELS,
  CLAIM_LABELS,
  DecodeError,
  LISTING_LABELS,
  LOAN_STATUS_LABELS,
  TIER_LABELS,
  bytesToHex,
  decodeContractState,
  hexToBytes,
  normalizeAddress,
  type StateCodec,
} from '../../frontend/src/lib/live/decode.js';
import { createChainReader } from '../../frontend/src/lib/live/chainReader.js';
import {
  deployedContracts,
  deploymentUrl,
  loadDeployment,
  parseDeployment,
  DeploymentFormatError,
} from '../../frontend/src/lib/live/deployments.js';
import { bech32mDecode, midnightKeyToHex } from '../../frontend/src/lib/live/address.js';

// --- the indexer's wire format, produced from real contract state ----------

/** The codec the console uses, wired to the root package's runtime copy. */
const codec: StateCodec<ChargedState> = {
  deserialize: (bytes) => ContractState.deserialize(bytes),
  ledgers: {
    solvencyProof: solvencyLedger,
    registry: registryLedger,
    loan: loanLedger,
    loanDirectory: loanDirectoryLedger,
  },
};

type HasCtx = { ctx: { currentQueryContext: { state: ChargedState } } };

/**
 * What `contractAction(address) { state }` returns for a simulator's current
 * ledger: hex of a serialized ContractState whose data is that ledger. The
 * simulators keep their context private; reading it here is test-only.
 */
const indexerStateHex = (sim: object): string => {
  const cs = new ContractState();
  cs.data = (sim as unknown as HasCtx).ctx.currentQueryContext.state;
  return Buffer.from(cs.serialize()).toString('hex');
};

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2);
const LENDER_B_SK = skFrom(3);
const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_PK = pubKeyOf(LENDER_SK);
const LENDER_B_PK = pubKeyOf(LENDER_B_SK);

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };
const TERMS = { principal: 1_000n, interestBps: 1_000n, installments: 3n, periodSeconds: 86_400n };
const HISTORY_SEED = new Uint8Array(32).fill(9);

const activeLoan = (): LoanSimulator =>
  new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(FACTS, TEST_SALT), HISTORY_SEED)
    .as(LENDER_SK)
    .quoteTerms(CLAIM.thresholdNetWorth, CLAIM.maxDti, T0 + 7n * 86_400n)
    .as(BORROWER_SK)
    .proveTier(FACTS)
    .as(LENDER_SK)
    .underwrite(1_100n)
    .as(BORROWER_SK)
    .accept()
    .as(LENDER_SK)
    .disburse(T0, 1_100n, 367n)
    .as(BORROWER_SK)
    .repay(367n);

// --- bytes ----------------------------------------------------------------

describe('decode — bytes', () => {
  it('round-trips hex and bytes, with or without 0x', () => {
    const b = new Uint8Array([0, 1, 15, 16, 255]);
    expect(bytesToHex(b)).toBe('00010f10ff');
    expect(Array.from(hexToBytes('00010f10ff'))).toEqual(Array.from(b));
    expect(Array.from(hexToBytes('0x00010F10FF'))).toEqual(Array.from(b));
  });

  it('refuses odd-length and non-hex input', () => {
    expect(() => hexToBytes('abc')).toThrow(DecodeError);
    expect(() => hexToBytes('zz')).toThrow(DecodeError);
  });

  it('normalizes contract addresses to bare lowercase hex', () => {
    expect(normalizeAddress(' 0xABcd01 ')).toBe('abcd01');
    expect(() => normalizeAddress('')).toThrow(DecodeError);
    expect(() => normalizeAddress('0xnothex')).toThrow(DecodeError);
  });
});

describe('decode — label tables match the compiled enums', () => {
  const pin = (table: readonly string[], e: Record<string, string | number>) => {
    for (const name of table) expect(e[name]).toBe(table.indexOf(name));
    expect(Object.keys(e).filter((k) => Number.isNaN(Number(k)))).toHaveLength(table.length);
  };
  it('pins every status table', () => {
    pin(ATTESTATION_LABELS, AttestationStatus);
    pin(CLAIM_LABELS, ClaimStatus);
    pin(BORROW_LABELS, BorrowStatus);
    pin(LOAN_STATUS_LABELS, LoanStatus);
    pin(TIER_LABELS, Tier);
    pin(LISTING_LABELS, ListingStatus);
  });
});

// --- state → view, per contract -------------------------------------------

describe('decode — SolvencyProof', () => {
  it('reads owner, commitment, lenders, claims and verdicts from serialized state', () => {
    const sim = new SolvencySimulator(FACTS, BORROWER_SK)
      .as(BORROWER_SK)
      .addLender(LENDER_PK)
      .addLender(LENDER_B_PK)
      .as(LENDER_SK)
      .requestClaim(LENDER_PK, CLAIM)
      .as(BORROWER_SK)
      .proveSolvency(LENDER_PK);

    const v = decodeContractState(codec, 'solvencyProof', indexerStateHex(sim));
    const l = sim.ledger();

    expect(v.kind).toBe('solvencyProof');
    expect(v.owner).toBe(hex(BORROWER_PK));
    expect(v.commitment).toBe(hex(l.commitment));
    expect(v.verifierKey).toBe(hex(l.verifierKey));
    expect(v.lenderCount).toBe(2);
    expect(v.claimCount).toBe(1);
    expect(v.claims[0]).toMatchObject({ lender: hex(LENDER_PK), ...CLAIM });
    expect(v.claims[0]!.status).toBe(CLAIM_LABELS[l.claims.lookup(LENDER_PK).status]);
    expect(v.openClaimCount).toBe(Number(l.openClaims.size()));
    expect(v.attestations).toEqual([{ lender: hex(LENDER_PK), verdict: 'PASS' }]);
    expect(v.passCount).toBe(1);
    expect(v.failCount).toBe(0);
  });

  it('reads a freshly deployed instance as empty', () => {
    const v = decodeContractState(codec, 'solvencyProof', indexerStateHex(new SolvencySimulator(FACTS, BORROWER_SK)));
    expect(v).toMatchObject({ lenderCount: 0, claimCount: 0, attestationCount: 0, openClaimCount: 0 });
  });
});

describe('decode — Registry', () => {
  it('reads each borrower row and the count', () => {
    const instance = new SolvencySimulator(FACTS, BORROWER_SK);
    const instanceAddr = encodeContractAddress(instance.address);
    const registry = new RegistrySimulator(BORROWER_SK)
      .as(BORROWER_SK)
      .register(instanceAddr, instance.ledger().commitment);

    const v = decodeContractState(codec, 'registry', indexerStateHex(registry));
    expect(v.borrowerCount).toBe(1n);
    expect(v.borrowers).toEqual([
      {
        owner: hex(BORROWER_PK),
        instance: hex(instanceAddr),
        commitment: hex(instance.ledger().commitment),
        status: 'ACTIVE',
      },
    ]);
  });
});

describe('decode — Loan', () => {
  it('reads an application before any quote', () => {
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(FACTS, TEST_SALT), HISTORY_SEED);
    const v = decodeContractState(codec, 'loan', indexerStateHex(sim));
    expect(v).toMatchObject({
      kind: 'loan',
      status: 'APPLIED',
      tier: 'NONE',
      quoted: false,
      quote: null,
      disbursed: false,
      collateralRequired: 0n,
      paymentsMade: 0n,
      borrower: hex(BORROWER_PK),
      lender: hex(LENDER_PK),
      factsCommitment: hex(commitFacts(FACTS, TEST_SALT)),
    });
    expect(v.terms).toEqual(TERMS);
  });

  it('reads the verified tier, 110% collateral, one payment and the history head', () => {
    const sim = activeLoan();
    const l = sim.ledger();
    const v = decodeContractState(codec, 'loan', indexerStateHex(sim));

    expect(v.status).toBe('ACTIVE');
    expect(v.tier).toBe('VERIFIED');
    expect(v.tierExpiresAt).toBe(l.tierExpiresAt);
    expect(v.quoted).toBe(true);
    expect(v.quote).toEqual({ ...CLAIM, expiresAt: T0 + 7n * 86_400n });
    expect(v.collateralRequired).toBe(1_100n);
    expect(v.balanceOwed).toBe(1_100n - 367n);
    expect(v.installmentAmount).toBe(367n);
    expect(v.paymentsMade).toBe(1n);
    expect(v.latePayments).toBe(0n);
    expect(v.disbursed).toBe(true);
    expect(v.nextDueAt).toBe(l.nextDueAt);
    expect(v.nextDueAt).toBeGreaterThan(T0);
    expect(v.historyCommitment).toBe(hex(l.historyCommitment));
    expect(v.offeredCollateral).toBe(1_100n);
    expect(v.offeredTier).toBe('VERIFIED');
  });

  it("reads a standing offer the borrower has not accepted", () => {
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(FACTS, TEST_SALT), HISTORY_SEED)
      .as(LENDER_SK)
      .quoteTerms(CLAIM.thresholdNetWorth, CLAIM.maxDti, T0 + 7n * 86_400n)
      .underwrite(1_500n);
    const v = decodeContractState(codec, 'loan', indexerStateHex(sim));
    expect(v.status).toBe('OFFERED');
    expect(v.offeredTier).toBe('STANDARD');
    expect(v.offeredCollateral).toBe(1_500n);
    expect(v.tier).toBe('NONE');
    expect(v.collateralRequired).toBe(0n);
  });
});

describe('decode — LoanDirectory', () => {
  it('reads listings, repaid records and a two-loan history proof', () => {
    const LOAN_A = loanAddr(0xa1);
    const LOAN_B = loanAddr(0xb2);
    const APPLICATION = loanAddr(0xd4);
    const dir = new LoanDirectorySimulator(BORROWER_SK);
    dir.as(BORROWER_SK).list(LOAN_A, LENDER_PK, 1_000n).list(LOAN_B, LENDER_B_PK, 2_000n);
    dir.as(LENDER_SK).updateStatus(LOAN_A, ListingStatus.ACTIVE).recordRepaid(LOAN_A);
    dir.as(LENDER_B_SK).updateStatus(LOAN_B, ListingStatus.ACTIVE).recordRepaid(LOAN_B);
    dir.as(BORROWER_SK).list(APPLICATION, LENDER_B_PK, 10_000n);
    dir.as(BORROWER_SK).proveTwoRepaid(
      APPLICATION,
      { loan: LOAN_A, lender: LENDER_PK, path: dir.pathFor(repaidLeaf(BORROWER_PK, LOAN_A, LENDER_PK)) },
      { loan: LOAN_B, lender: LENDER_B_PK, path: dir.pathFor(repaidLeaf(BORROWER_PK, LOAN_B, LENDER_B_PK)) },
    );

    const v = decodeContractState(codec, 'loanDirectory', indexerStateHex(dir));
    expect(v.listingCount).toBe(3n);
    expect(v.recordedCount).toBe(2);
    expect(v.repaidLeaves).toBe(2n);
    expect(v.historyProofs).toEqual([{ loan: hex(APPLICATION), proven: 2n }]);
    const byLoan = Object.fromEntries(v.listings.map((x) => [x.loan, x]));
    expect(byLoan[hex(LOAN_A)]).toEqual({
      loan: hex(LOAN_A),
      borrower: hex(BORROWER_PK),
      lender: hex(LENDER_PK),
      principal: 1_000n,
      status: 'REPAID',
    });
    expect(byLoan[hex(APPLICATION)]!.status).toBe('OPEN');
  });
});

describe('decode — refusals', () => {
  it('refuses empty, malformed or truncated state', () => {
    expect(() => decodeContractState(codec, 'loan', '')).toThrow(DecodeError);
    expect(() => decodeContractState(codec, 'loan', 'not hex')).toThrow(DecodeError);
    expect(() => decodeContractState(codec, 'loan', 'deadbeef')).toThrow(DecodeError);
    const good = indexerStateHex(activeLoan());
    expect(() => decodeContractState(codec, 'loan', good.slice(0, good.length / 2))).toThrow(DecodeError);
  });

  it("refuses to read one contract's state with another contract's layout", () => {
    const loanState = indexerStateHex(activeLoan());
    expect(() => decodeContractState(codec, 'loanDirectory', loanState)).toThrow(
      /does not have the loanDirectory ledger layout/,
    );
  });
});

// --- the GraphQL reader, against a stubbed indexer ------------------------

type Call = { url: string; body: { query: string; variables: Record<string, unknown> } };

/** A fake indexer answering the two queries the reader sends. */
function fakeIndexer(opts: {
  states?: Record<string, string>;
  txs?: Record<string, { height: number }>;
  status?: number;
  errors?: string[];
}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Call['body'];
    calls.push({ url, body });
    if (opts.status && opts.status !== 200) return new Response('nope', { status: opts.status });
    if (opts.errors) return Response.json({ errors: opts.errors.map((message) => ({ message })) });
    if (body.query.includes('contractAction')) {
      const state = opts.states?.[String(body.variables['address'])];
      return Response.json({
        data: {
          contractAction: state
            ? {
                __typename: 'ContractCall',
                state,
                transaction: { hash: 'ab'.repeat(32), block: { height: 42, timestamp: 1_700_000_000_000 } },
              }
            : null,
        },
      });
    }
    const offset = body.variables['offset'] as { hash?: string; identifier?: string };
    const key = offset.hash ?? offset.identifier ?? '';
    const tx = opts.txs?.[key];
    return Response.json({
      data: { transactions: tx ? [{ hash: key, block: { height: tx.height, timestamp: 1 } }] : [] },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('chainReader — indexer reads', () => {
  const LOAN = 'aa'.repeat(32);
  const DIRECTORY = 'bb'.repeat(32);
  const MISSING = 'cc'.repeat(32);
  const endpoint = { indexer: 'http://127.0.0.1:8088/api/v4/graphql' };

  it('reads and decodes each deployed contract, anchored to the latest tx', async () => {
    const dir = new LoanDirectorySimulator(BORROWER_SK);
    dir.as(BORROWER_SK).list(loanAddr(0xa1), LENDER_PK, 1_000n);
    const { fetchImpl, calls } = fakeIndexer({
      states: { [LOAN]: indexerStateHex(activeLoan()), [DIRECTORY]: indexerStateHex(dir) },
    });
    const reader = createChainReader({ endpoint, codec, fetchImpl });

    const [loan, directory, missing] = await reader.readAll([
      { kind: 'loan', address: '0x' + LOAN.toUpperCase() },
      { kind: 'loanDirectory', address: DIRECTORY },
      { kind: 'loan', address: MISSING },
    ]);

    expect(loan!.status).toBe('ok');
    if (loan!.status === 'ok' && loan!.view.kind === 'loan') {
      expect(loan!.view.tier).toBe('VERIFIED');
      expect(loan!.view.collateralRequired).toBe(1_100n);
      expect(loan!.anchor).toEqual({
        txHash: 'ab'.repeat(32),
        blockHeight: 42,
        blockTimestamp: 1_700_000_000_000,
        action: 'ContractCall',
      });
    }
    expect(directory!.status === 'ok' && directory!.view.kind === 'loanDirectory' && directory!.view.listingCount).toBe(1n);
    expect(missing!.status).toBe('not-found');

    // The address goes to the indexer as bare lowercase hex, by POST to the endpoint.
    expect(calls[0]!.url).toBe(endpoint.indexer);
    expect(calls[0]!.body.variables).toEqual({ address: LOAN });
    expect(calls[0]!.body.query).toMatch(/contractAction\(address: \$address\)/);
  });

  it('reports GraphQL errors, HTTP failures and undecodable state as errors, not views', async () => {
    const gql = createChainReader({ endpoint, codec, fetchImpl: fakeIndexer({ errors: ['bad address'] }).fetchImpl });
    expect(await gql.readContract('loan', LOAN)).toEqual({
      status: 'error',
      kind: 'loan',
      address: LOAN,
      error: 'bad address',
    });

    const http = createChainReader({ endpoint, codec, fetchImpl: fakeIndexer({ status: 502 }).fetchImpl });
    expect(await http.readContract('loan', LOAN)).toMatchObject({ status: 'error', error: 'indexer answered HTTP 502' });

    const wrong = createChainReader({
      endpoint,
      codec,
      fetchImpl: fakeIndexer({ states: { [LOAN]: indexerStateHex(activeLoan()) } }).fetchImpl,
    });
    expect(await wrong.readContract('registry', LOAN)).toMatchObject({ status: 'error' });

    const down = createChainReader({
      endpoint,
      codec,
      fetchImpl: (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch,
    });
    expect(await down.readContract('loan', LOAN)).toMatchObject({
      status: 'error',
      error: `indexer unreachable at ${endpoint.indexer}`,
    });
  });

  it('looks up recorded transactions by hash or id', async () => {
    const { fetchImpl, calls } = fakeIndexer({ txs: { ['12'.repeat(32)]: { height: 7 } } });
    const reader = createChainReader({ endpoint, codec, fetchImpl });
    expect(await reader.lookupTx({ txHash: '0x' + '12'.repeat(32) })).toEqual({
      status: 'found',
      hash: '12'.repeat(32),
      blockHeight: 7,
      blockTimestamp: 1,
    });
    expect(calls[0]!.body.variables).toEqual({ offset: { hash: '12'.repeat(32) } });
    expect(await reader.lookupTx({ txId: '34'.repeat(32) })).toEqual({ status: 'not-found' });
    expect(calls[1]!.body.variables).toEqual({ offset: { identifier: '34'.repeat(32) } });
    expect(await reader.lookupTx({})).toMatchObject({ status: 'error' });
  });
});

// --- deployment files -----------------------------------------------------

describe('deployments', () => {
  const example = JSON.parse(
    readFileSync(new URL('../../frontend/public/deployments/example.json', import.meta.url), 'utf8'),
  ) as unknown;

  it('parses the committed example and lists its contracts in display order', () => {
    const d = parseDeployment(example);
    expect(d.network).toBe('preprod');
    expect(deployedContracts(d).map((c) => [c.kind, c.label])).toEqual([
      ['solvencyProof', 'SolvencyProof'],
      ['registry', 'Registry'],
      ['loanDirectory', 'LoanDirectory'],
      ['loan', 'Loan 1'],
    ]);
    expect(d.txs[0]).toMatchObject({ txHash: '11'.repeat(32), blockHeight: 0 });
    expect(d.txs[1]!.txHash).toBeUndefined();
  });

  it('normalizes addresses and refuses malformed files', () => {
    const base = { network: 'local', indexer: 'x', indexerWS: 'y', generatedAt: 'z', txs: [] };
    expect(parseDeployment({ ...base, contracts: { loans: ['0xAB'] } }).contracts.loans).toEqual(['ab']);
    expect(() => parseDeployment({ ...base, contracts: { registry: 'zz' } })).toThrow(DeploymentFormatError);
    expect(() => parseDeployment({ ...base, contracts: {}, txs: [{ label: 'x', blockHeight: -1 }] })).toThrow(
      DeploymentFormatError,
    );
    expect(() => parseDeployment({ ...base, network: '', contracts: {} })).toThrow(/network/);
    expect(() => parseDeployment([])).toThrow(DeploymentFormatError);
  });

  it('treats a 404 or an SPA fallback page as "not deployed", honouring the base path', async () => {
    expect(deploymentUrl('preprod', '/kymider/')).toBe('/kymider/deployments/preprod.json');
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadDeployment('preprod', { fetchImpl: notFound })).toEqual({
      state: 'missing',
      url: '/deployments/preprod.json',
    });
    const spa = (async () =>
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect((await loadDeployment('local', { fetchImpl: spa })).state).toBe('missing');
    const ok = (async () => Response.json(example)) as unknown as typeof fetch;
    expect((await loadDeployment('preprod', { fetchImpl: ok })).state).toBe('found');
    const bad = (async () => Response.json({ contracts: 1 })) as unknown as typeof fetch;
    expect((await loadDeployment('preprod', { fetchImpl: bad })).state).toBe('invalid');
  });
});

// --- wallet key format ----------------------------------------------------

describe('address — Bech32m keys from the DApp connector', () => {
  const CPK = '5a'.repeat(16) + '0f'.repeat(16);
  const EPK = 'c3'.repeat(32);

  it("decodes the wallet SDK's own encoding of coin and encryption keys to hex", () => {
    const cpk = ShieldedCoinPublicKey.codec.encode('preprod', ShieldedCoinPublicKey.fromHexString(CPK)).asString();
    const epk = ShieldedEncryptionPublicKey.codec.encode('preprod', ShieldedEncryptionPublicKey.fromHexString(EPK)).asString();
    expect(cpk.startsWith('mn_shield-cpk_preprod1')).toBe(true);
    expect(midnightKeyToHex(cpk, 'shield-cpk')).toEqual({ hex: CPK, network: 'preprod' });
    expect(midnightKeyToHex(epk, 'shield-epk')).toEqual({ hex: EPK, network: 'preprod' });
    expect(midnightKeyToHex(cpk.toUpperCase(), 'shield-cpk').hex).toBe(CPK);
  });

  it('passes hex through and refuses the wrong key type or a bad checksum', () => {
    expect(midnightKeyToHex('0x' + CPK.toUpperCase(), 'shield-cpk')).toEqual({ hex: CPK, network: null });
    const cpk = ShieldedCoinPublicKey.codec.encode('preview', ShieldedCoinPublicKey.fromHexString(CPK)).asString();
    expect(() => midnightKeyToHex(cpk, 'shield-epk')).toThrow(/expected a shield-epk key/);
    const last = cpk.at(-1) === 'q' ? 'p' : 'q';
    expect(() => bech32mDecode(cpk.slice(0, -1) + last)).toThrow(/checksum/);
  });
});
