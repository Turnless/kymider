// Kymider — the on-chain proof tooling, offline.
//
// Covers the pure parts of `prove:onchain` and `verify:onchain`:
//   - receipts: only public tx fields, labelled by step, emitted by the clients;
//   - the deployments file: exact shape, and validation on the way back in;
//   - verify's claim checks, fed ledger states produced by the COMPILED
//     contracts driven offline (tests/unit/support/simulators.ts), honest and
//     tampered;
//   - PROOF.md rendering from a receipt list;
//   - which wallets a run uses, and the missing-secret message.
//
// The hashes here are fixtures for the renderer, never written to PROOF.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

// The clients' wiring is checked against a stubbed midnight-js: deploy and
// call return finalized data carrying public AND private fields, and the
// receipt must keep only the public ones.
const finalized = (n: number) => ({
  txId: `id${n}`,
  txHash: `hash${n}`,
  blockHeight: 100 + n,
  blockHash: `block${n}`,
  blockTimestamp: 1_700_000_000 + n,
  status: 'SucceedEntirely' as const,
  identifiers: [`id${n}`],
  fees: { paidFees: '42', estimatedFees: '50' },
  tx: { secret: 'serialized transaction' },
});
let txCounter = 0;
vi.mock('@midnight-ntwrk/midnight-js-contracts', () => ({
  deployContract: vi.fn(async () => {
    txCounter += 1;
    return {
      deployTxData: {
        public: { ...finalized(txCounter), contractAddress: `addr${txCounter}` },
        private: { signingKey: 'SECRET-SIGNING-KEY', initialPrivateState: { sk: 'SECRET' } },
      },
    };
  }),
  submitCallTx: vi.fn(async () => {
    txCounter += 1;
    return { public: finalized(txCounter), private: { input: 'SECRET-INPUT' } };
  }),
}));

import { ListingStatus, Tier } from '../../contracts/index.js';
import { KymiderClient } from '../../client/index.js';
import { LoanClient } from '../../client/loans.js';
import { TxLog, emitReceipt, receiptOf, type TxReceipt } from '../../client/txlog.js';
import { amountDue, collateralFor, installmentFor, owedFor } from '../../client/proof/loanMath.js';
import type { KymiderProviders } from '../../client/providers.js';
import {
  LoanDirectorySimulator,
  LoanSimulator,
  RegistrySimulator,
  SolvencySimulator,
  T0,
  pubKeyOf,
  repaidLeaf,
  skFrom,
} from './support/simulators.js';
import {
  CLAIM,
  FACTS,
  QUOTE,
  STEPS,
  STEP_LIST,
  TERMS_A,
  TERMS_B,
  TERMS_C,
} from '../../scripts/lib/flow.js';
import {
  buildDeployments,
  deploymentsPath,
  parseDeployments,
  serializeDeployments,
  type Deployments,
} from '../../scripts/lib/deployments.js';
import {
  allPass,
  checkClaims,
  checkContractsCoverTxs,
  checkTransactions,
  renderClaimTable,
  summarizeTransactions,
  type ClaimResult,
  type OnchainStates,
} from '../../scripts/lib/claims.js';
import { explorerTemplate, renderProofMd } from '../../scripts/lib/proof-md.js';
import { TX_BY_HASH_QUERY } from '../../scripts/lib/onchain-query.js';
import {
  LOCAL_BORROWER_SEED,
  LOCAL_LENDER_SEED,
  parseWalletSecret,
  resolveProveWallets,
} from '../../scripts/lib/wallets.js';

const silent = { info: () => undefined } as never;

// --- an offline world: the same run prove:onchain makes, on the compiled contracts -------

const BORROWER_SK = skFrom(1);
const LENDER_A_SK = skFrom(2);
const LENDER_B_SK = skFrom(3);
const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_A_PK = pubKeyOf(LENDER_A_SK);
const LENDER_B_PK = pubKeyOf(LENDER_B_SK);
const SEED = new Uint8Array(32).fill(7);

type WorldOptions = {
  /** Facts the borrower commits (default: the run's FACTS, which qualify). */
  facts?: typeof FACTS;
  /** Loan A's borrower proves the tier (default true). */
  proveTierA?: boolean;
  /** Loan B's lender records the repayment (default true). */
  recordB?: boolean;
  /** The borrower attaches the two-loan proof to loan C (default true). */
  historyC?: boolean;
  /** The Registry row points at a different instance. */
  registryElsewhere?: boolean;
  /** Loan A's borrower accepts the 110% offer (default true); if not, A stops at OFFERED. */
  acceptA?: boolean;
};

function repayAll(loan: LoanSimulator): LoanSimulator {
  loan.as(BORROWER_SK);
  while (loan.ledger().balanceOwed > 0n) loan.advance(60n).repay(amountDue(loan.ledger()));
  return loan;
}

function runLoan(
  terms: typeof TERMS_A,
  lenderSk: Uint8Array,
  proveTier: boolean,
  facts = FACTS,
  accept = true,
): LoanSimulator {
  const loan = new LoanSimulator(BORROWER_SK, pubKeyOf(lenderSk), terms, commitmentOf(facts), SEED);
  loan.as(lenderSk).quoteTerms(QUOTE.thresholdNetWorth, QUOTE.maxDti, T0 + QUOTE.ttlSeconds);
  if (proveTier) loan.as(BORROWER_SK).proveTier(facts);
  const tier = proveTier && loan.ledger().tier === Tier.VERIFIED ? Tier.VERIFIED : Tier.STANDARD;
  const owed = owedFor(terms);
  loan.as(lenderSk).advance(30n).underwrite(collateralFor(terms.principal, tier));
  if (!accept) return loan;
  loan
    .as(BORROWER_SK)
    .accept()
    .as(lenderSk)
    .disburse(loan.now, owed, installmentFor(owed, terms.installments));
  return repayAll(loan);
}

const commitments = new Map<string, Uint8Array>();
function commitmentOf(facts: typeof FACTS): Uint8Array {
  const key = `${facts.balance}/${facts.debts}/${facts.income}`;
  if (!commitments.has(key)) commitments.set(key, new SolvencySimulator(facts, BORROWER_SK).ledger().commitment);
  return commitments.get(key)!;
}

function world(opts: WorldOptions = {}): { deployments: Deployments; states: OnchainStates } {
  const facts = opts.facts ?? FACTS;

  const sp = new SolvencySimulator(facts, BORROWER_SK);
  sp.as(BORROWER_SK).addLender(LENDER_A_PK);
  sp.as(LENDER_A_SK).requestClaim(LENDER_A_PK, CLAIM);
  sp.as(BORROWER_SK).proveSolvency(LENDER_A_PK);
  sp.as(LENDER_A_SK).approve(LENDER_A_PK);

  const registry = new RegistrySimulator(BORROWER_SK);
  const pointsAt = opts.registryElsewhere ? new SolvencySimulator(facts, BORROWER_SK).address : sp.address;
  registry.as(BORROWER_SK).register(encodeContractAddress(pointsAt), sp.ledger().commitment);

  const a = runLoan(TERMS_A, LENDER_A_SK, opts.proveTierA ?? true, facts, opts.acceptA ?? true);
  const b = runLoan(TERMS_B, LENDER_B_SK, false, facts);
  const c = new LoanSimulator(BORROWER_SK, LENDER_A_PK, TERMS_C, commitmentOf(facts), SEED);
  const [addrA, addrB, addrC] = [a, b, c].map((l) => encodeContractAddress(l.address));

  const dir = new LoanDirectorySimulator(BORROWER_SK);
  dir.as(BORROWER_SK).list(addrA!, LENDER_A_PK, TERMS_A.principal);
  dir.as(BORROWER_SK).list(addrB!, LENDER_B_PK, TERMS_B.principal);
  dir.as(BORROWER_SK).list(addrC!, LENDER_A_PK, TERMS_C.principal);
  // Each lender marks its listing ACTIVE (as prove:onchain does once the
  // borrower accepts); a repayment can be recorded only from ACTIVE.
  if (opts.acceptA ?? true) dir.as(LENDER_A_SK).updateStatus(addrA!, ListingStatus.ACTIVE).recordRepaid(addrA!);
  dir.as(LENDER_B_SK).updateStatus(addrB!, ListingStatus.ACTIVE);
  if (opts.recordB ?? true) dir.as(LENDER_B_SK).recordRepaid(addrB!);
  if ((opts.historyC ?? true) && (opts.recordB ?? true) && (opts.acceptA ?? true)) {
    dir.as(BORROWER_SK).proveTwoRepaid(
      addrC!,
      { loan: addrA!, lender: LENDER_A_PK, path: dir.pathFor(repaidLeaf(BORROWER_PK, addrA!, LENDER_A_PK)) },
      { loan: addrB!, lender: LENDER_B_PK, path: dir.pathFor(repaidLeaf(BORROWER_PK, addrB!, LENDER_B_PK)) },
    );
  }

  const contracts = {
    solvencyProof: sp.address,
    registry: registry.address,
    loanDirectory: dir.address,
    loans: [a.address, b.address, c.address],
  };
  const receipts: TxReceipt[] = [
    receiptOf('SolvencyProof', sp.address, 'deploy', fixtureTx(1), STEPS.deploySolvency.label),
    receiptOf('Loan', a.address, 'underwrite', fixtureTx(2), STEPS.underwriteA.label),
    receiptOf('LoanDirectory', dir.address, 'proveTwoRepaid', fixtureTx(3), STEPS.proveHistoryC.label),
  ];
  return {
    deployments: buildDeployments({
      network: 'local',
      indexer: 'http://127.0.0.1:8088/api/v4/graphql',
      indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
      generatedAt: new Date('2026-10-03T12:00:00Z'),
      contracts,
      receipts,
    }),
    states: {
      solvencyProof: sp.ledger(),
      registry: registry.ledger(),
      loanDirectory: dir.ledger(),
      loans: [a.ledger(), b.ledger(), c.ledger()],
    },
  };
}

function fixtureTx(n: number) {
  return {
    txId: `00${String(n).padStart(2, '0')}`.padEnd(64, 'a'),
    txHash: `${String(n).padStart(2, '0')}`.padEnd(64, 'f'),
    blockHeight: 1_000 + n,
    blockHash: 'b'.repeat(64),
    blockTimestamp: 1_800_000_000 + n,
    status: 'SucceedEntirely' as const,
    fees: { paidFees: '1' },
  };
}

const byClaim = (rows: ClaimResult[], fragment: string): ClaimResult => {
  const row = rows.find((r) => r.claim.includes(fragment));
  if (!row) throw new Error(`no claim row containing "${fragment}"`);
  return row;
};
const failing = (rows: ClaimResult[]) => rows.filter((r) => !r.pass).map((r) => r.claim);

// --- receipts --------------------------------------------------------------------------

describe('tx receipts', () => {
  it('keep only the public fields of finalized tx data', () => {
    const r = receiptOf('Loan', 'addr', 'repay', {
      ...finalized(1),
      // extra, private-looking fields must not survive
      ...({ private: { secret: 'x' } } as object),
    } as never);
    expect(Object.keys(r).sort()).toEqual(
      [
        'blockHash',
        'blockHeight',
        'blockTimestamp',
        'circuit',
        'contract',
        'contractName',
        'label',
        'paidFees',
        'status',
        'txHash',
        'txId',
      ].sort(),
    );
    expect(r).toMatchObject({ label: 'Loan.repay', txId: 'id1', txHash: 'hash1', blockHeight: 101, paidFees: '42' });
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('TxLog labels receipts by step, restores the label after, and keeps order', async () => {
    const seen: string[] = [];
    const log = new TxLog((r) => seen.push(r.label));
    const emit = (n: number) => log.sink(receiptOf('Registry', 'r', 'register', finalized(n)));
    emit(1);
    await log.step('outer', async () => {
      emit(2);
      await log.step('inner', async () => emit(3));
      emit(4);
    });
    await expect(log.step('failing', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    emit(5);
    expect(log.receipts.map((r) => r.label)).toEqual(['Registry.register', 'outer', 'inner', 'outer', 'Registry.register']);
    expect(seen).toHaveLength(5);
  });

  it('a throwing sink never fails the call that already landed', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      emitReceipt(() => { throw new Error('sink broke'); }, 'Loan', 'a', 'repay', finalized(1)),
    ).not.toThrow();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    expect(() => emitReceipt(undefined, 'Loan', 'a', 'repay', finalized(1))).not.toThrow();
  });
});

describe('clients report what they submit', () => {
  const store = () => {
    const data = new Map<string, unknown>();
    let scope = '';
    return {
      setContractAddress: (a: string) => { scope = a; },
      set: async (id: string, v: unknown) => { data.set(`${scope}/${id}`, v); },
      get: async (id: string) => data.get(`${scope}/${id}`) ?? null,
    };
  };
  const providers = () =>
    ({
      solvency: { privateStateProvider: store() },
      registry: { privateStateProvider: store() },
      loan: { privateStateProvider: store() },
      loanDirectory: { privateStateProvider: store() },
    }) as unknown as KymiderProviders;

  beforeEach(() => {
    txCounter = 0;
  });

  it('KymiderClient: deploys and calls, with circuit and contract', async () => {
    const log = new TxLog();
    const client = new KymiderClient(silent, providers(), undefined, undefined, log.sink);
    const registry = await log.step('deploy registry', () => client.deployRegistry(BORROWER_SK));
    expect(registry).toBe('addr1'); // return type unchanged: the address
    const result = await client.submitRegistryCall(registry, 'suspend', []);
    expect(result).toBeUndefined(); // still Promise<void>
    expect(log.receipts).toEqual([
      expect.objectContaining({ label: 'deploy registry', contractName: 'Registry', circuit: 'deploy', contract: 'addr1', txHash: 'hash1', blockHeight: 101 }),
      expect.objectContaining({ label: 'Registry.suspend', contractName: 'Registry', circuit: 'suspend', contract: 'addr1', txHash: 'hash2', blockHeight: 102 }),
    ]);
    expect(JSON.stringify(log.receipts)).not.toContain('SECRET');
  });

  it('LoanClient: deploys and calls, with circuit and contract', async () => {
    const log = new TxLog();
    const client = new LoanClient(silent, providers(), undefined, undefined, log.sink);
    const directory = await client.deployLoanDirectory(BORROWER_SK);
    await client.callDirectory(directory, 'recordRepaid', [new Uint8Array(32)]);
    await client.callLoan('loan9', 'decline', []);
    expect(log.receipts.map((r) => [r.contractName, r.circuit, r.contract, r.txHash])).toEqual([
      ['LoanDirectory', 'deploy', 'addr1', 'hash1'],
      ['LoanDirectory', 'recordRepaid', 'addr1', 'hash2'],
      ['Loan', 'decline', 'loan9', 'hash3'],
    ]);
  });

  it('without a sink, the clients behave as before', async () => {
    const client = new LoanClient(silent, providers());
    await expect(client.deployLoanDirectory(BORROWER_SK)).resolves.toBe('addr1');
  });
});

// --- the deployments file -------------------------------------------------------------

describe('deployments JSON', () => {
  const { deployments } = world();

  it('has exactly the agreed shape, in order', () => {
    expect(Object.keys(deployments)).toEqual(['network', 'indexer', 'indexerWS', 'generatedAt', 'contracts', 'txs']);
    expect(Object.keys(deployments.contracts)).toEqual(['solvencyProof', 'registry', 'loanDirectory', 'loans']);
    expect(deployments.contracts.loans).toHaveLength(3);
    for (const tx of deployments.txs) {
      expect(Object.keys(tx)).toEqual(['label', 'txId', 'txHash', 'blockHeight', 'contract']);
      expect(typeof tx.blockHeight).toBe('number');
    }
    expect(deployments.generatedAt).toBe('2026-10-03T12:00:00.000Z');
    expect(deployments.txs[0]).toEqual({
      label: STEPS.deploySolvency.label,
      txId: fixtureTx(1).txId,
      txHash: fixtureTx(1).txHash,
      blockHeight: 1_001,
      contract: deployments.contracts.solvencyProof,
    });
  });

  it('round-trips through JSON and validation', () => {
    const text = serializeDeployments(deployments);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseDeployments(JSON.parse(text))).toEqual(deployments);
  });

  it('refuses a malformed file, naming the field', () => {
    const bad = (mutate: (d: Record<string, unknown>) => void) => {
      const d = JSON.parse(serializeDeployments(deployments)) as Record<string, unknown>;
      mutate(d);
      return () => parseDeployments(d);
    };
    expect(bad((d) => delete d['indexer'])).toThrow(/deployments\.indexer/);
    expect(bad((d) => ((d['contracts'] as Record<string, unknown>)['loans'] = 'x'))).toThrow(/contracts\.loans/);
    expect(bad((d) => ((d['txs'] as Record<string, unknown>[])[0]!['blockHeight'] = '12'))).toThrow(/txs\[0\]\.blockHeight/);
    expect(bad((d) => ((d['txs'] as Record<string, unknown>[])[1]!['txHash'] = ''))).toThrow(/txs\[1\]\.txHash/);
    expect(() => parseDeployments(null)).toThrow();
  });

  it('lives at frontend/public/deployments/<network>.json', () => {
    expect(deploymentsPath('preprod', '/repo')).toBe('/repo/frontend/public/deployments/preprod.json');
    expect(() => deploymentsPath('../etc')).toThrow();
  });
});

// --- verify's claim checks ------------------------------------------------------------

describe('verify:onchain claim checks, on states from the compiled contracts', () => {
  it('an honest run passes every claim', () => {
    const { deployments, states } = world();
    const rows = checkClaims(deployments, states);
    expect(failing(rows)).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(byClaim(rows, 'Loan A: tier VERIFIED').actual).toContain('1100 on 1000');
    expect(byClaim(rows, 'Loan B: tier STANDARD').actual).toContain('3000 on 2000');
    expect(byClaim(rows, 'history proof').actual).toBe('2');
    expect(checkContractsCoverTxs(deployments).pass).toBe(true);
  });

  it('loan A without a tier proof is held to 150%, and the 110% claim fails', () => {
    const { deployments, states } = world({ proveTierA: false });
    const rows = checkClaims(deployments, states);
    expect(failing(rows)).toEqual(['Loan A: tier VERIFIED, collateral 110% of principal, accepted by the borrower']);
    expect(byClaim(rows, 'Loan A: tier VERIFIED').actual).toMatch(/^STANDARD, 1500 on 1000/);
  });

  it('an offer at 110% the borrower never accepted does not pass for the 110% loan', () => {
    const { deployments, states } = world({ acceptA: false });
    const rows = checkClaims(deployments, states);
    expect(failing(rows)).toEqual([
      'Loan A: tier VERIFIED, collateral 110% of principal, accepted by the borrower',
      'Loan A: REPAID in full, no late payments',
      'LoanDirectory: loans A and B are recorded as repaid',
      'LoanDirectory: Loan C carries a history proof of 2 repaid loans',
    ]);
    expect(states.loans[0]!.offeredCollateral).toBe(1_100n);
    expect(states.loans[0]!.collateralRequired).toBe(0n);
  });

  it('facts that miss the bar give a FAIL attestation, and the claim fails', () => {
    const poor = { balance: 400_000n, debts: 300_000n, income: 1_000_000n }; // net worth 100,000
    const { deployments, states } = world({ facts: poor, proveTierA: true });
    const rows = checkClaims(deployments, states);
    expect(byClaim(rows, 'one lender attestation').pass).toBe(false);
    expect(byClaim(rows, 'one lender attestation').actual).toContain('FAIL');
    // The tier proof against the same bar fails too: STANDARD, so not 110%.
    expect(byClaim(rows, 'Loan A: tier VERIFIED').pass).toBe(false);
  });

  it('a missing repayment record or history proof fails', () => {
    const noRecord = world({ recordB: false });
    const rows = checkClaims(noRecord.deployments, noRecord.states);
    expect(byClaim(rows, 'recorded as repaid').pass).toBe(false);
    expect(byClaim(rows, 'history proof').actual).toBe('0');

    const noHistory = world({ historyC: false });
    const rows2 = checkClaims(noHistory.deployments, noHistory.states);
    expect(failing(rows2)).toEqual(['LoanDirectory: Loan C carries a history proof of 2 repaid loans']);
  });

  it('a Registry row pointing at another instance fails', () => {
    const { deployments, states } = world({ registryElsewhere: true });
    expect(failing(checkClaims(deployments, states))).toEqual([
      "Registry: the borrower's row points at the SolvencyProof instance and its commitment",
    ]);
  });

  it('loans recorded in the wrong order fail rather than pass by accident', () => {
    const { deployments, states } = world();
    const swapped = {
      ...deployments,
      contracts: { ...deployments.contracts, loans: [deployments.contracts.loans[1]!, deployments.contracts.loans[0]!, deployments.contracts.loans[2]!] },
    };
    const swappedStates = { ...states, loans: [states.loans[1]!, states.loans[0]!, states.loans[2]!] };
    const rows = checkClaims(swapped, swappedStates);
    expect(byClaim(rows, 'Loan A: tier VERIFIED').pass).toBe(false);
    expect(byClaim(rows, 'Loan B: tier STANDARD').pass).toBe(false);
  });

  it('a contract with no state on the indexer fails its claims, without throwing', () => {
    const { deployments, states } = world();
    const rows = checkClaims(deployments, { solvencyProof: null, registry: null, loanDirectory: null, loans: [null] });
    expect(rows.every((r) => !r.pass || r.claim.startsWith('Deployments:'))).toBe(true);
    expect(byClaim(rows, 'one lender attestation').actual).toContain('no contract state');
    const partial = checkClaims(deployments, { ...states, loans: [states.loans[0]!, null, states.loans[2]!] });
    expect(byClaim(partial, 'Loan B: REPAID').pass).toBe(false);
    expect(byClaim(partial, 'Loan A: REPAID').pass).toBe(true);
  });

  it('every transaction must be on the indexer, at its block, and successful', () => {
    const { deployments } = world();
    const [t1, t2, t3] = deployments.txs;
    const lookups = new Map([
      [t1!.txHash, { blockHeights: [t1!.blockHeight], statuses: ['SUCCESS'] }],
      [t2!.txHash, { blockHeights: [t2!.blockHeight + 1], statuses: ['SUCCESS'] }],
      [t3!.txHash, { blockHeights: [t3!.blockHeight], statuses: ['FAILURE'] }],
    ]);
    const rows = checkTransactions(deployments.txs, lookups);
    expect(rows.map((r) => r.pass)).toEqual([true, false, false]);
    expect(checkTransactions(deployments.txs, new Map())[0]!.actual).toContain('not found');
    expect(summarizeTransactions(rows).pass).toBe(false);
    expect(summarizeTransactions(rows.slice(0, 1)).pass).toBe(true);
    expect(summarizeTransactions([]).pass).toBe(false);
  });

  it('a transaction on a contract the record does not list fails', () => {
    const { deployments } = world();
    const stray = { ...deployments, txs: [...deployments.txs, { ...deployments.txs[0]!, contract: 'elsewhere' }] };
    expect(checkContractsCoverTxs(stray).pass).toBe(false);
  });

  it('prints a PASS/FAIL table', () => {
    const table = renderClaimTable([
      { claim: 'a', expected: '1', actual: '1', pass: true },
      { claim: 'b', expected: '2', actual: '3', pass: false },
    ]);
    expect(table.split('\n')).toHaveLength(4);
    expect(table).toMatch(/^Result\s+Claim/);
    expect(table).toMatch(/PASS\s+a/);
    expect(table).toMatch(/FAIL\s+b/);
    expect(allPass([{ claim: 'a', expected: '', actual: '', pass: true }])).toBe(true);
  });
});

// --- PROOF.md -----------------------------------------------------------------------------

describe('PROOF.md rendering', () => {
  const { deployments } = world();
  const receipts: TxReceipt[] = [
    receiptOf('Registry', deployments.contracts.registry, 'deploy', fixtureTx(1), STEPS.deployRegistry.label),
    receiptOf('Loan', deployments.contracts.loans[0]!, 'underwrite', fixtureTx(2), STEPS.underwriteA.label),
    receiptOf('Loan', deployments.contracts.loans[0]!, 'repay', fixtureTx(3), STEPS.repayA.label),
    receiptOf('Loan', deployments.contracts.loans[0]!, 'repay', fixtureTx(4), STEPS.repayA.label),
    receiptOf('Loan', deployments.contracts.loans[1]!, 'repay', fixtureTx(5), 'An unlisted | step'),
  ];
  const preprod = { ...deployments, network: 'preprod', indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql' };

  it('has one transaction row per receipt, with hash, block, circuit and contract role', () => {
    const md = renderProofMd({ deployments: preprod, receipts });
    const rows = md.split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(rows).toHaveLength(receipts.length);
    expect(rows[1]).toBe(
      `| 2 | ${STEPS.underwriteA.label} | Loan A | \`underwrite\` | \`${fixtureTx(2).txHash}\` | 1002 |`,
    );
    expect(rows[0]).toContain('| Registry |');
    expect(rows[4]).toContain('An unlisted \\| step'); // pipes escaped
    expect(rows[4]).toContain('| Loan B |');
    for (const r of receipts) expect(md).toContain(r.txHash);
    expect(md).toContain('## Transactions (5)');
  });

  it('explains each step once, in run order, with what stays private', () => {
    const md = renderProofMd({ deployments: preprod, receipts });
    const section = md.slice(md.indexOf('## What each step proves'), md.indexOf('## Check it yourself'));
    expect(section.split(STEPS.repayA.label)).toHaveLength(2); // once, though two repayments
    expect(section.indexOf(STEPS.deployRegistry.label)).toBeLessThan(section.indexOf(STEPS.underwriteA.label));
    expect(section).toContain(STEPS.underwriteA.private);
    expect(section).not.toContain(STEPS.proveSolvency.label); // not in this receipt list
  });

  it('lists the contracts and their roles', () => {
    const md = renderProofMd({ deployments: preprod, receipts });
    expect(md).toContain(`| SolvencyProof (the borrower's instance) | \`${deployments.contracts.solvencyProof}\` |`);
    expect(md).toContain(`| Loan A: VERIFIED tier, 110% collateral | \`${deployments.contracts.loans[0]}\` |`);
    expect(md).toContain('frontend/public/deployments/preprod.json');
  });

  it('marks a local devnet run as not public; a Preprod run as public', () => {
    expect(renderProofMd({ deployments, receipts })).toContain('Local devnet run');
    const md = renderProofMd({ deployments: preprod, receipts });
    expect(md).not.toContain('Local devnet run');
    expect(md).toContain('public Midnight testnet');
    expect(md).toContain('npm run verify:preprod');
  });

  it('adds an explorer column only for a URL pattern, never a guessed one', () => {
    expect(explorerTemplate('preprod')).toBeUndefined();
    expect(explorerTemplate('preprod', 'https://example.invalid/no-placeholder')).toBeUndefined();
    const plain = renderProofMd({ deployments: preprod, receipts });
    expect(plain).not.toContain('| Explorer |');
    expect(plain).toContain('No explorer link column');

    const template = explorerTemplate('preprod', 'https://explorer.example/tx/{txHash}');
    const md = renderProofMd({ deployments: preprod, receipts, explorer: template });
    expect(md).toContain('| Explorer |');
    expect(md).toContain(`[view](https://explorer.example/tx/${fixtureTx(2).txHash})`);
  });

  it('includes the claims table when the run checked them', () => {
    const claims: ClaimResult[] = [
      { claim: 'Loan A: 110%', expected: '1100', actual: '1100', pass: true },
      { claim: 'History', expected: '2', actual: '0', pass: false },
    ];
    const md = renderProofMd({ deployments: preprod, receipts, claims });
    expect(md).toContain('| Loan A: 110% | 1100 | 1100 | PASS |');
    expect(md).toContain('| History | 2 | 0 | **FAIL** |');
    expect(renderProofMd({ deployments: preprod, receipts })).not.toContain('## Claims checked');
  });

  it('shows a judge how to look a hash up on the indexer', () => {
    const md = renderProofMd({ deployments: preprod, receipts });
    expect(md).toContain(`curl -s ${preprod.indexer}`);
    expect(md).toContain(JSON.stringify(TX_BY_HASH_QUERY).slice(1, -1));
    expect(md).toContain(fixtureTx(1).txHash);
  });
});

describe('the run\'s steps', () => {
  it('have unique labels, each with what it proves and what stays private', () => {
    const labels = STEP_LIST.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const s of STEP_LIST) {
      expect(s.proves.length).toBeGreaterThan(10);
      expect(s.private.length).toBeGreaterThan(5);
    }
  });

  it('quote figures match what the claims check', () => {
    expect(collateralFor(TERMS_A.principal, Tier.VERIFIED)).toBe(1_100n);
    expect(collateralFor(TERMS_B.principal, Tier.STANDARD)).toBe(3_000n);
    expect(owedFor(TERMS_A)).toBe(1_100n);
    expect(installmentFor(owedFor(TERMS_A), TERMS_A.installments)).toBe(550n);
    expect(owedFor(TERMS_B)).toBe(2_100n);
  });
});

// --- wallets -----------------------------------------------------------------------------

describe('prove:onchain wallets', () => {
  const MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ');

  it('local: the two genesis wallets', () => {
    const w = resolveProveWallets('local', {});
    expect(w.borrower).toEqual({ kind: 'seed', value: LOCAL_BORROWER_SEED });
    expect(w.lender).toEqual({ kind: 'seed', value: LOCAL_LENDER_SEED });
  });

  it('preprod: PREPROD_WALLET_SEED alone plays both roles', () => {
    const w = resolveProveWallets('preprod', { PREPROD_WALLET_SEED: ` 0x${'AB'.repeat(32)} ` });
    expect(w.borrower).toEqual({ kind: 'seed', value: 'ab'.repeat(32) });
    expect(w.lender).toBeNull();
    expect(w.source).toBe('PREPROD_WALLET_SEED (one wallet, both roles)');
  });

  it('preprod: a mnemonic secret is recognised, and a lender wallet is optional', () => {
    const w = resolveProveWallets('preprod', {
      PREPROD_WALLET_SEED: `  ${MNEMONIC.replace(/ /g, '   ')}\n`,
      MIDNIGHT_PREPROD_LENDER_SEED: 'cd'.repeat(32),
    });
    expect(w.borrower).toEqual({ kind: 'mnemonic', value: MNEMONIC });
    expect(w.lender).toEqual({ kind: 'seed', value: 'cd'.repeat(32) });
    expect(w.source).not.toContain('word');
  });

  it('preprod: the simulation\'s variable names work too', () => {
    const w = resolveProveWallets('preprod', { MIDNIGHT_PREPROD_BORROWER_MNEMONIC: MNEMONIC });
    expect(w.borrower.kind).toBe('mnemonic');
  });

  it('fails clearly when the secret is missing, and never echoes a value', () => {
    expect(() => resolveProveWallets('preprod', {})).toThrow(
      'Add the PREPROD_WALLET_SEED secret: Settings → Secrets → Actions',
    );
    expect(() => resolveProveWallets('preprod', { PREPROD_WALLET_SEED: '   ' })).toThrow(/PREPROD_WALLET_SEED/);
    let message = '';
    try {
      parseWalletSecret('not-a-seed-zz', 'PREPROD_WALLET_SEED');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('PREPROD_WALLET_SEED');
    expect(message).not.toContain('not-a-seed-zz');
    expect(() => parseWalletSecret('abc', 'X')).toThrow(); // odd-length hex
  });
});
