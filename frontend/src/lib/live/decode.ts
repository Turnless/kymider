/**
 * Pure decode layer: contract state as the indexer delivers it → typed public
 * views the Live screen renders.
 *
 * The indexer's `contractAction(address) { state }` field is the hex encoding
 * of `ContractState.serialize()`. midnight-js's own indexer provider decodes it
 * as `ContractState.deserialize(Buffer.from(state, 'hex'))` and the contract's
 * generated `ledger()` reads `contractState.data`; this module does exactly the
 * same, with no network, no DOM and no Buffer.
 *
 * Nothing runtime-specific is imported here. The `ContractState` class and the
 * compiled `ledger()` functions are passed in as a `StateCodec`, because the
 * browser and the Node test suite each load their OWN copy of the wasm
 * runtime, and a state object from one copy cannot be read by the other. The
 * browser wires its codecs in `codecs.ts`; the unit tests wire the root copy.
 *
 * Only types come from the compiled contracts (by relative path, so both the
 * console's and the root's TypeScript resolve them), so a contract change that
 * renames or retypes a ledger field fails the typecheck here.
 */

import type { Ledger as SolvencyLedger } from '../../../../compiled/solvency-proof/contract/index.js';
import type { Ledger as RegistryLedger } from '../../../../compiled/registry/contract/index.js';
import type { Ledger as LoanLedger } from '../../../../compiled/loan/contract/index.js';
import type { Ledger as LoanDirectoryLedger } from '../../../../compiled/loan-directory/contract/index.js';

export type { SolvencyLedger, RegistryLedger, LoanLedger, LoanDirectoryLedger };

// --- bytes ----------------------------------------------------------------

export type Hex = string;

export const bytesToHex = (bytes: Uint8Array): Hex => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

/** Strict hex → bytes. Accepts an optional 0x prefix; rejects odd lengths and non-hex. */
export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new DecodeError(`hex has an odd length (${clean.length})`);
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new DecodeError('hex contains a non-hex character');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Contract addresses as the indexer takes them: bare lowercase hex. */
export const normalizeAddress = (address: string): Hex => {
  const clean = address.trim().replace(/^0x/i, '').toLowerCase();
  if (clean.length === 0 || !/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new DecodeError(`not a hex contract address: "${address}"`);
  }
  return clean;
};

export class DecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DecodeError';
  }
}

// --- codecs ---------------------------------------------------------------

/**
 * What decoding needs from a wasm runtime copy: `ContractState.deserialize`
 * and one generated `ledger()` per contract. `S` is that copy's ChargedState.
 */
export type StateCodec<S> = {
  deserialize: (bytes: Uint8Array) => { data: S };
  ledgers: {
    solvencyProof: (state: S) => SolvencyLedger;
    registry: (state: S) => RegistryLedger;
    loan: (state: S) => LoanLedger;
    loanDirectory: (state: S) => LoanDirectoryLedger;
  };
};

export type ContractKind = keyof StateCodec<unknown>['ledgers'];

// --- views ----------------------------------------------------------------

export type AttestationLabel = 'NONE' | 'PASS' | 'FAIL';
export type ClaimLabel = 'PENDING' | 'APPROVED' | 'REJECTED';
export type BorrowLabel = 'UNREGISTERED' | 'ACTIVE' | 'SUSPENDED';
export type LoanStatusLabel = 'APPLIED' | 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'DECLINED' | 'OFFERED';
export type TierLabel = 'NONE' | 'VERIFIED' | 'STANDARD';
export type ListingLabel = 'OPEN' | 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'CLOSED';

// The compiled enums are numeric and their order is the Compact declaration
// order. Tables rather than imports keep this module free of runtime code; the
// unit tests pin each table against the compiled enum.
export const ATTESTATION_LABELS: readonly AttestationLabel[] = ['NONE', 'PASS', 'FAIL'];
export const CLAIM_LABELS: readonly ClaimLabel[] = ['PENDING', 'APPROVED', 'REJECTED'];
export const BORROW_LABELS: readonly BorrowLabel[] = ['UNREGISTERED', 'ACTIVE', 'SUSPENDED'];
export const LOAN_STATUS_LABELS: readonly LoanStatusLabel[] = [
  'APPLIED',
  'ACTIVE',
  'REPAID',
  'DEFAULTED',
  'DECLINED',
  // Appended in the contract, after DECLINED: the lender's offer awaiting the borrower.
  'OFFERED',
];
export const TIER_LABELS: readonly TierLabel[] = ['NONE', 'VERIFIED', 'STANDARD'];
export const LISTING_LABELS: readonly ListingLabel[] = [
  'OPEN',
  'ACTIVE',
  'REPAID',
  'DEFAULTED',
  'CLOSED',
];

const label = <T extends string>(table: readonly T[], value: number, what: string): T => {
  const out = table[value];
  if (out === undefined) throw new DecodeError(`unknown ${what} value ${value}`);
  return out;
};

export type SolvencyProofView = {
  kind: 'solvencyProof';
  owner: Hex;
  commitment: Hex;
  /** A circuit-set label, not a verification key (see the contract). */
  verifierKey: Hex;
  lenderCount: number;
  claimCount: number;
  openClaimCount: number;
  attestationCount: number;
  passCount: number;
  failCount: number;
  claims: { lender: Hex; thresholdNetWorth: bigint; maxDti: bigint; status: ClaimLabel }[];
  attestations: { lender: Hex; verdict: AttestationLabel }[];
};

export type RegistryView = {
  kind: 'registry';
  borrowerCount: bigint;
  borrowers: { owner: Hex; instance: Hex; commitment: Hex; status: BorrowLabel }[];
};

export type LoanView = {
  kind: 'loan';
  borrower: Hex;
  lender: Hex;
  status: LoanStatusLabel;
  tier: TierLabel;
  tierExpiresAt: bigint;
  terms: { principal: bigint; interestBps: bigint; installments: bigint; periodSeconds: bigint };
  factsCommitment: Hex;
  quoted: boolean;
  quote: { thresholdNetWorth: bigint; maxDti: bigint; expiresAt: bigint } | null;
  /** Quotes made on the loan (the contract caps them at 3). */
  quotesIssued: bigint;
  /** A tier was proven against the current quote (one proof per quote). */
  tierProven: boolean;
  /** Binding collateral: set when the borrower accepts the offer. */
  collateralRequired: bigint;
  /** The lender's standing offer (status OFFERED); 0 / NONE otherwise. */
  offeredCollateral: bigint;
  offeredTier: TierLabel;
  balanceOwed: bigint;
  installmentAmount: bigint;
  /** Unix seconds; 0 until disbursed. */
  nextDueAt: bigint;
  paymentsMade: bigint;
  latePayments: bigint;
  disbursed: boolean;
  historyCommitment: Hex;
};

export type LoanDirectoryView = {
  kind: 'loanDirectory';
  listingCount: bigint;
  listings: { loan: Hex; borrower: Hex; lender: Hex; principal: bigint; status: ListingLabel }[];
  /** Repaid loans recorded in the Merkle tree (one leaf each). */
  recordedCount: number;
  /** Leaves used in the repaid-records tree. */
  repaidLeaves: bigint;
  /** New loan → number of prior repaid loans its borrower proved. */
  historyProofs: { loan: Hex; proven: bigint }[];
};

export type ContractView = SolvencyProofView | RegistryView | LoanView | LoanDirectoryView;

// --- ledger → view --------------------------------------------------------

export function solvencyProofView(l: SolvencyLedger): SolvencyProofView {
  const claims = [...l.claims].map(([lender, c]) => ({
    lender: bytesToHex(lender),
    thresholdNetWorth: c.thresholdNetWorth,
    maxDti: c.maxDti,
    status: label(CLAIM_LABELS, c.status, 'claim status'),
  }));
  const attestations = [...l.attestations].map(([lender, v]) => ({
    lender: bytesToHex(lender),
    verdict: label(ATTESTATION_LABELS, v, 'attestation'),
  }));
  return {
    kind: 'solvencyProof',
    owner: bytesToHex(l.owner),
    commitment: bytesToHex(l.commitment),
    verifierKey: bytesToHex(l.verifierKey),
    lenderCount: Number(l.authorizedLenders.size()),
    claimCount: claims.length,
    openClaimCount: Number(l.openClaims.size()),
    attestationCount: attestations.length,
    passCount: attestations.filter((a) => a.verdict === 'PASS').length,
    failCount: attestations.filter((a) => a.verdict === 'FAIL').length,
    claims,
    attestations,
  };
}

export function registryView(l: RegistryLedger): RegistryView {
  return {
    kind: 'registry',
    borrowerCount: l.borrowerCount,
    borrowers: [...l.borrowers].map(([owner, r]) => ({
      owner: bytesToHex(owner),
      instance: bytesToHex(r.instanceAddr),
      commitment: bytesToHex(r.commitment),
      status: label(BORROW_LABELS, r.status, 'borrower status'),
    })),
  };
}

export function loanView(l: LoanLedger): LoanView {
  return {
    kind: 'loan',
    borrower: bytesToHex(l.borrower),
    lender: bytesToHex(l.lender),
    status: label(LOAN_STATUS_LABELS, l.status, 'loan status'),
    tier: label(TIER_LABELS, l.tier, 'tier'),
    tierExpiresAt: l.tierExpiresAt,
    terms: { ...l.terms },
    factsCommitment: bytesToHex(l.factsCommitment),
    quoted: l.quoted,
    quote: l.quoted ? { ...l.quote } : null,
    quotesIssued: l.quotesIssued,
    tierProven: l.tierProven,
    collateralRequired: l.collateralRequired,
    offeredCollateral: l.offeredCollateral,
    offeredTier: label(TIER_LABELS, l.offeredTier, 'offered tier'),
    balanceOwed: l.balanceOwed,
    installmentAmount: l.installmentAmount,
    nextDueAt: l.nextDueAt,
    paymentsMade: l.paymentsMade,
    latePayments: l.latePayments,
    disbursed: l.disbursed,
    historyCommitment: bytesToHex(l.historyCommitment),
  };
}

export function loanDirectoryView(l: LoanDirectoryLedger): LoanDirectoryView {
  return {
    kind: 'loanDirectory',
    listingCount: l.listingCount,
    listings: [...l.listings].map(([loan, x]) => ({
      loan: bytesToHex(loan),
      borrower: bytesToHex(x.borrower),
      lender: bytesToHex(x.lender),
      principal: x.principal,
      status: label(LISTING_LABELS, x.status, 'listing status'),
    })),
    recordedCount: Number(l.recordedLoans.size()),
    repaidLeaves: l.repaid.firstFree(),
    historyProofs: [...l.historyProofs].map(([loan, proven]) => ({
      loan: bytesToHex(loan),
      proven,
    })),
  };
}

// --- state hex → view -----------------------------------------------------

/** Deserialize indexer state hex into the runtime's ChargedState. */
export function chargedStateFromHex<S>(codec: StateCodec<S>, stateHex: string): S {
  const bytes = hexToBytes(stateHex);
  if (bytes.length === 0) throw new DecodeError('empty contract state');
  try {
    return codec.deserialize(bytes).data;
  } catch (cause) {
    throw new DecodeError('the indexer state is not a serialized ContractState', { cause });
  }
}

export function decodeContractState<S>(
  codec: StateCodec<S>,
  kind: 'solvencyProof',
  stateHex: string,
): SolvencyProofView;
export function decodeContractState<S>(
  codec: StateCodec<S>,
  kind: 'registry',
  stateHex: string,
): RegistryView;
export function decodeContractState<S>(codec: StateCodec<S>, kind: 'loan', stateHex: string): LoanView;
export function decodeContractState<S>(
  codec: StateCodec<S>,
  kind: 'loanDirectory',
  stateHex: string,
): LoanDirectoryView;
export function decodeContractState<S>(
  codec: StateCodec<S>,
  kind: ContractKind,
  stateHex: string,
): ContractView;
export function decodeContractState<S>(
  codec: StateCodec<S>,
  kind: ContractKind,
  stateHex: string,
): ContractView {
  const state = chargedStateFromHex(codec, stateHex);
  // A state from a DIFFERENT contract usually still deserializes; the
  // generated ledger() then reads the wrong cells and throws. Say so plainly.
  try {
    switch (kind) {
      case 'solvencyProof':
        return solvencyProofView(codec.ledgers.solvencyProof(state));
      case 'registry':
        return registryView(codec.ledgers.registry(state));
      case 'loan':
        return loanView(codec.ledgers.loan(state));
      case 'loanDirectory':
        return loanDirectoryView(codec.ledgers.loanDirectory(state));
    }
  } catch (cause) {
    if (cause instanceof DecodeError) throw cause;
    throw new DecodeError(`this state does not have the ${kind} ledger layout`, { cause });
  }
}
