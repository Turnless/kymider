// Kymider — the claims PROOF.md makes, checked against decoded ledger state.
//
// Pure: takes the deployments file and the public ledger state of each
// contract (already read from an indexer and decoded with the compiled
// contracts' `ledger()`), and returns one PASS/FAIL row per claim. The network
// reads live in onchain.ts, so the unit tests can feed this states produced
// offline by the compiled contracts.

import { encodeContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  AttestationStatus,
  BorrowStatus,
  ClaimStatus,
  ListingStatus,
  LoanStatus,
  Tier,
  type LoanDirectoryLedger,
  type LoanLedger,
  type RegistryLedger,
  type SolvencyLedger,
} from '../../contracts/index.js';
import { collateralFor } from '../../client/proof/loanMath.js';
import { bytesEqual, bytesToHex } from '../../client/utils.js';
import type { Deployments, DeploymentTx } from './deployments.js';
import { LOAN_SHORT_NAMES } from './flow.js';

export type OnchainStates = {
  solvencyProof: SolvencyLedger | null;
  registry: RegistryLedger | null;
  loanDirectory: LoanDirectoryLedger | null;
  /** Same order as `contracts.loans`; null where the indexer has no state. */
  loans: (LoanLedger | null)[];
};

/** What the indexer returned for one transaction hash. */
export type TxLookup = {
  /** Block heights of the transactions found under this hash (empty if none). */
  blockHeights: number[];
  /** transactionResult.status of each, where the indexer reports one. */
  statuses: string[];
};

export type ClaimResult = {
  claim: string;
  expected: string;
  actual: string;
  pass: boolean;
};

const result = (claim: string, expected: string, actual: string, pass: boolean): ClaimResult => ({
  claim,
  expected,
  actual,
  pass,
});

const missing = (claim: string, expected: string, what: string): ClaimResult =>
  result(claim, expected, `no contract state for ${what}`, false);

export const attestationName = (a: AttestationStatus): string =>
  a === AttestationStatus.PASS ? 'PASS' : a === AttestationStatus.FAIL ? 'FAIL' : 'NONE';

export const claimStatusName = (s: ClaimStatus): string =>
  s === ClaimStatus.PENDING ? 'PENDING' : s === ClaimStatus.APPROVED ? 'APPROVED' : 'REJECTED';

export const loanStatusName = (s: LoanStatus): string => LoanStatus[s] ?? String(s);
export const tierLabel = (t: Tier): string => Tier[t] ?? String(t);
export const listingStatusName = (s: ListingStatus): string => ListingStatus[s] ?? String(s);

const addressBytes = (address: string): Uint8Array | null => {
  try {
    return encodeContractAddress(address);
  } catch {
    return null;
  }
};

// --- Wave 1 ----------------------------------------------------------------------

function solvencyClaims(d: Deployments, s: OnchainStates): ClaimResult[] {
  const out: ClaimResult[] = [];
  const sp = s.solvencyProof;

  const c1 = 'SolvencyProof: one lender attestation, PASS';
  const c2 = 'SolvencyProof: the attested lender\'s claim is APPROVED';
  if (!sp) {
    out.push(missing(c1, 'PASS', 'SolvencyProof'), missing(c2, 'APPROVED', 'SolvencyProof'));
  } else {
    const attestations = [...sp.attestations];
    const verdicts = attestations.map(([, a]) => attestationName(a));
    out.push(
      result(
        c1,
        '1 attestation: PASS',
        `${attestations.length} attestation(s): ${verdicts.join(', ') || 'none'}`,
        attestations.length === 1 && attestations[0]![1] === AttestationStatus.PASS,
      ),
    );
    const lender = attestations[0]?.[0];
    if (lender === undefined || !sp.claims.member(lender)) {
      out.push(result(c2, 'APPROVED', 'no claim for the attested lender', false));
    } else {
      const status = sp.claims.lookup(lender).status;
      out.push(result(c2, 'APPROVED', claimStatusName(status), status === ClaimStatus.APPROVED));
    }
  }

  const c3 = 'Registry: the borrower\'s row points at the SolvencyProof instance and its commitment';
  if (!sp || !s.registry) {
    out.push(missing(c3, 'ACTIVE row, matching', !sp ? 'SolvencyProof' : 'Registry'));
  } else {
    const reg = s.registry;
    const row = reg.borrowers.member(sp.owner) ? reg.borrowers.lookup(sp.owner) : null;
    const instance = addressBytes(d.contracts.solvencyProof);
    if (!row) {
      out.push(result(c3, 'ACTIVE row, matching', 'no row under the instance owner\'s key', false));
    } else {
      const pointsAt = instance !== null && bytesEqual(row.instanceAddr, instance);
      const commits = bytesEqual(row.commitment, sp.commitment);
      const active = row.status === BorrowStatus.ACTIVE;
      out.push(
        result(
          c3,
          'ACTIVE row, matching',
          `${BorrowStatus[row.status] ?? row.status}; address ${pointsAt ? 'matches' : 'differs'}; commitment ${commits ? 'matches' : 'differs'}`,
          pointsAt && commits && active,
        ),
      );
    }
  }
  return out;
}

// --- Wave 2 ----------------------------------------------------------------------

function loanClaims(d: Deployments, s: OnchainStates): ClaimResult[] {
  const out: ClaimResult[] = [];
  const [a, b, c] = [0, 1, 2].map((i) => s.loans[i] ?? null);
  const name = (i: number) => LOAN_SHORT_NAMES[i]!;

  out.push(
    result(
      'Deployments: three loans recorded (A, B, C)',
      '3',
      String(d.contracts.loans.length),
      d.contracts.loans.length === 3,
    ),
  );

  // Every loan binds the facts the SolvencyProof instance commits.
  const bound = 'Loans A, B and C bind the SolvencyProof facts commitment';
  if (!s.solvencyProof || !a || !b || !c) {
    out.push(missing(bound, 'all three match', 'a loan or the SolvencyProof instance'));
  } else {
    const commitment = s.solvencyProof.commitment;
    const matches = [a, b, c].map((l) => bytesEqual(l.factsCommitment, commitment));
    out.push(
      result(
        bound,
        'all three match',
        matches.map((m, i) => `${name(i)} ${m ? 'matches' : 'differs'}`).join('; '),
        matches.every(Boolean),
      ),
    );
  }

  // Loan A: the headline. VERIFIED, exactly 110%, repaid.
  const tierA = `${name(0)}: tier VERIFIED, collateral 110% of principal`;
  if (!a) {
    out.push(missing(tierA, '110%', name(0)));
  } else {
    const want = collateralFor(a.terms.principal, Tier.VERIFIED);
    out.push(
      result(
        tierA,
        `VERIFIED, ${want} on ${a.terms.principal}`,
        `${tierLabel(a.tier)}, ${a.collateralRequired} on ${a.terms.principal} (150% would be ${collateralFor(a.terms.principal, Tier.STANDARD)})`,
        a.tier === Tier.VERIFIED && a.collateralRequired === want && want > 0n,
      ),
    );
  }

  // Loan B: the counterfactual. No proof, STANDARD, exactly 150%.
  const tierB = `${name(1)}: tier STANDARD, collateral 150% of principal`;
  if (!b) {
    out.push(missing(tierB, '150%', name(1)));
  } else {
    const want = collateralFor(b.terms.principal, Tier.STANDARD);
    out.push(
      result(
        tierB,
        `STANDARD, ${want} on ${b.terms.principal}`,
        `${tierLabel(b.tier)}, ${b.collateralRequired} on ${b.terms.principal}`,
        b.tier === Tier.STANDARD && b.collateralRequired === want && want > 0n,
      ),
    );
  }

  // Both repaid in full, on time.
  for (const [i, l] of [a, b].entries()) {
    const claim = `${name(i)}: REPAID in full, no late payments`;
    if (!l) {
      out.push(missing(claim, 'REPAID', name(i)));
      continue;
    }
    out.push(
      result(
        claim,
        'REPAID, 0 owed, 0 late',
        `${loanStatusName(l.status)}, ${l.balanceOwed} owed, ${l.paymentsMade} paid, ${l.latePayments} late`,
        l.status === LoanStatus.REPAID &&
          l.disbursed &&
          l.balanceOwed === 0n &&
          l.paymentsMade > 0n &&
          l.latePayments === 0n,
      ),
    );
  }

  // Directory: both recorded as repaid, by their lenders, and C carries "2".
  const dir = s.loanDirectory;
  const listed = 'LoanDirectory: loans A, B and C are listed with their lenders';
  const recorded = 'LoanDirectory: loans A and B are recorded as repaid';
  const history = `LoanDirectory: ${name(2)} carries a history proof of 2 repaid loans`;
  if (!dir) {
    out.push(
      missing(listed, 'listed', 'LoanDirectory'),
      missing(recorded, 'REPAID', 'LoanDirectory'),
      missing(history, '2', 'LoanDirectory'),
    );
    return out;
  }

  const keys = d.contracts.loans.map(addressBytes);
  const listings = keys.map((k) => (k && dir.listings.member(k) ? dir.listings.lookup(k) : null));
  const lendersMatch = [a, b, c].map(
    (l, i) => l !== null && listings[i] !== null && bytesEqual(listings[i]!.lender, l.lender),
  );
  out.push(
    result(
      listed,
      '3 listings, lenders match the loans',
      listings
        .slice(0, 3)
        .map((l, i) => `${name(i)} ${l ? (lendersMatch[i] ? 'listed' : 'lender differs') : 'not listed'}`)
        .join('; ') || 'no loans',
      listings.length === 3 && lendersMatch.every(Boolean),
    ),
  );

  const repaid = [0, 1].map((i) => {
    const k = keys[i];
    const l = listings[i];
    return k != null && l != null && l.status === ListingStatus.REPAID && dir.recordedLoans.member(k);
  });
  out.push(
    result(
      recorded,
      'both REPAID and recorded',
      [0, 1]
        .map((i) => `${name(i)} ${listings[i] ? listingStatusName(listings[i]!.status) : 'not listed'}${repaid[i] ? ', recorded' : ''}`)
        .join('; '),
      repaid.every(Boolean) && dir.repaid.firstFree() >= 2n,
    ),
  );

  const keyC = keys[2];
  const count = keyC && dir.historyProofs.member(keyC) ? dir.historyProofs.lookup(keyC) : 0n;
  out.push(result(history, '2', String(count), count === 2n));

  return out;
}

/** Every ledger claim PROOF.md makes, in the order it lists them. */
export function checkClaims(d: Deployments, s: OnchainStates): ClaimResult[] {
  return [...solvencyClaims(d, s), ...loanClaims(d, s)];
}

// --- transactions ------------------------------------------------------------------

const SUCCESS = 'SUCCESS';

/** One row per recorded transaction: on the indexer, at its block, succeeded. */
export function checkTransactions(
  txs: readonly DeploymentTx[],
  lookups: ReadonlyMap<string, TxLookup | null>,
): ClaimResult[] {
  return txs.map((tx, i) => {
    const claim = `Tx ${i + 1}: ${tx.label}`;
    const expected = `on-chain at block ${tx.blockHeight}`;
    const found = lookups.get(tx.txHash);
    if (!found || found.blockHeights.length === 0) {
      return result(claim, expected, `hash ${tx.txHash.slice(0, 16)}... not found`, false);
    }
    const atHeight = found.blockHeights.includes(tx.blockHeight);
    const failed = found.statuses.filter((st) => st !== SUCCESS);
    return result(
      claim,
      expected,
      `block ${found.blockHeights.join(', ')}${found.statuses.length ? `, ${found.statuses.join(', ')}` : ''}`,
      atHeight && failed.length === 0,
    );
  });
}

/** One row standing for all the per-transaction rows (for PROOF.md). */
export function summarizeTransactions(rows: readonly ClaimResult[]): ClaimResult {
  const failed = rows.filter((r) => !r.pass);
  return result(
    'Every transaction above is on the indexer at its block, and succeeded',
    `${rows.length} of ${rows.length}`,
    failed.length === 0
      ? `${rows.length} of ${rows.length}`
      : `${rows.length - failed.length} of ${rows.length}; failing: ${failed.map((r) => r.claim).join('; ')}`,
    failed.length === 0 && rows.length > 0,
  );
}

/** Contracts named in `contracts` must be the ones the transactions touched. */
export function checkContractsCoverTxs(d: Deployments): ClaimResult {
  const known = new Set([
    d.contracts.solvencyProof,
    d.contracts.registry,
    d.contracts.loanDirectory,
    ...d.contracts.loans,
  ]);
  const stray = d.txs.filter((t) => !known.has(t.contract));
  return result(
    'Deployments: every transaction targets a listed contract',
    `${d.txs.length} of ${d.txs.length}`,
    `${d.txs.length - stray.length} of ${d.txs.length}`,
    stray.length === 0 && d.txs.length > 0,
  );
}

// --- rendering ---------------------------------------------------------------------

export const allPass = (rows: readonly ClaimResult[]): boolean => rows.every((r) => r.pass);

/** A fixed-width table for the terminal. */
export function renderClaimTable(rows: readonly ClaimResult[]): string {
  const header = ['Result', 'Claim', 'Expected', 'On-chain'];
  const body = rows.map((r) => [r.pass ? 'PASS' : 'FAIL', r.claim, r.expected, r.actual]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

export const shortHex = (b: Uint8Array): string => `${bytesToHex(b).slice(0, 12)}...`;
