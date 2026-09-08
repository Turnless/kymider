/**
 * The contract the UI talks to.
 *
 * Screens depend on this interface and nothing below it. Today it is satisfied
 * by `SimulatedKymiderClient`, which drives the REAL compiled Compact contracts
 * in the browser — same asserts, same ledger, same verdicts as the chain, minus
 * ZK proving and network submission. A wallet-backed implementation (Lace via
 * `@midnight-ntwrk/dapp-connector-api`, a fetch ZK-config provider and an
 * IndexedDB private-state provider) drops in behind the same surface without
 * the screens changing.
 */

export type FinancialFacts = { balance: bigint; debts: bigint; income: bigint };
export type ClaimTerms = { thresholdNetWorth: bigint; maxDti: bigint };

export type Verdict = 'NONE' | 'PASS' | 'FAIL';
export type ClaimState = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type InstanceStatus = 'ACTIVE' | 'SUSPENDED';

export type LenderKind = 'Institutional' | 'On-chain protocol';

export type Lender = {
  id: string;
  name: string;
  initials: string;
  kind: LenderKind;
  /** Hex of the lender's dapp public key — the map key on-chain. */
  pubKey: string;
};

/** One lender's standing against a borrower instance. */
export type LenderRequest = {
  lender: Lender;
  authorized: boolean;
  terms: ClaimTerms | null;
  claimState: ClaimState;
  verdict: Verdict;
  requestedAt: string | null;
  /**
   * True when the borrower has committed a new statement since this verdict was
   * recorded. The ledger keeps the verdict but not the statement behind it, so
   * a stale PASS otherwise reads as current — for the borrower and, worse, for
   * a lender deciding on it.
   */
  stale: boolean;
};

/** Everything the ledger says publicly about one instance. */
export type PublicRecord = {
  instance: string;
  commitment: string;
  /**
   * NOTE: this is a label, not a verification key — the contract stores
   * `persistentHash("kymider:sp:vk:")`. See docs/scaffold.md.
   */
  verifierKey: string;
  status: InstanceStatus;
  attestationCount: number;
  passCount: number;
  /** Attestations recorded against a statement the borrower has since replaced. */
  staleCount: number;
  lastUpdate: string;
};

export type DirectoryRow = PublicRecord & {
  /** Whether the registry entry's commitment still matches the instance. */
  matchesInstance: boolean;
};

export type InstanceDetail = {
  record: PublicRecord;
  requests: LenderRequest[];
};

export interface KymiderClient {
  /** The borrower instance this browser owns. */
  myAddress(): string;
  /** The lender persona the lender console acts as. */
  me(): Lender;
  lenders(): Lender[];

  facts(): FinancialFacts;
  commitFacts(facts: FinancialFacts): Promise<void>;

  myRecord(): PublicRecord;
  myRequests(): LenderRequest[];
  /** Run the borrower's proof for one lender and return the recorded verdict. */
  proveFor(lenderId: string): Promise<Verdict>;

  directory(): DirectoryRow[];
  instance(address: string): InstanceDetail | null;
  requestClaim(address: string, terms: ClaimTerms): Promise<void>;
  decide(address: string, approve: boolean): Promise<void>;

  /** Fires whenever ledger or private state changed. */
  subscribe(fn: () => void): () => void;
}

// --- pure helpers ---------------------------------------------------------
//
// These mirror `proveSolvency` in contracts/solvencyProof.compact exactly, so
// what a borrower previews while typing is what the circuit will conclude.
// They are a preview only: a real verdict comes back from `proveFor`, which
// runs the contract.

/** Net worth floors at zero, as the circuit does. */
export const netWorthOf = ({ balance, debts }: FinancialFacts): bigint =>
  balance >= debts ? balance - debts : 0n;

/**
 * Debt-to-income as a percentage, or null when income is zero. The circuit
 * never divides — it cross-multiplies — so this is for display only; the
 * comparison below is the one that must match.
 */
export const dtiPercentOf = ({ debts, income }: FinancialFacts): number | null =>
  income > 0n ? Number((debts * 10_000n) / income) / 100 : null;

/** The verdict the circuit would reach, cross-multiplied rather than divided. */
export const previewVerdict = (facts: FinancialFacts, terms: ClaimTerms): Verdict => {
  // Solvency is checked outright, not left to the floored net worth: 0 >= 0
  // would otherwise clear a zero threshold for a borrower whose debts exceed
  // their balance.
  const solvent = facts.balance >= facts.debts;
  const netWorthHolds = netWorthOf(facts) >= terms.thresholdNetWorth;
  const dtiHolds = facts.income > 0n && facts.debts * 100n <= terms.maxDti * facts.income;
  return solvent && netWorthHolds && dtiHolds ? 'PASS' : 'FAIL';
};

// --- formatting -----------------------------------------------------------

export const money = (n: bigint): string => '$' + n.toLocaleString('en-US');

export const shortHex = (hex: string, lead = 6, tail = 4): string =>
  hex.length <= lead + tail + 1 ? hex : `${hex.slice(0, lead)}…${hex.slice(-tail)}`;

export const termsLabel = (t: ClaimTerms): string =>
  `Net worth ≥ ${money(t.thresholdNetWorth)} · DTI ≤ ${t.maxDti}%`;
