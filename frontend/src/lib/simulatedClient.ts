/**
 * A KymiderClient backed by the real compiled Compact contracts.
 *
 * Every borrower here is an actual `SolvencyProof` contract instance and the
 * directory is an actual `Registry` instance, both executed in the browser
 * through compact-runtime. Authorization asserts, commitment binding and
 * verdict derivation are the contract's, not this file's — so the console
 * cannot show a state the chain would refuse.
 *
 * What it does NOT do: generate ZK proofs, submit transactions, or talk to a
 * node. Those arrive with the wallet-backed implementation.
 */

import {
  createCircuitContext,
  createConstructorContext,
  encodeContractAddress,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import {
  AttestationStatus,
  BorrowStatus,
  ClaimStatus,
  RegistryContract,
  SolvencyProofContract,
  createRegistryPrivateState,
  createSolvencyPrivateState,
  registryLedger,
  registryWitnesses,
  solvencyLedger,
  solvencyPureCircuits,
  solvencyWitnesses,
  type RegistryPrivateState,
  type SolvencyPrivateState,
} from './contracts';
import type {
  ClaimState,
  ClaimTerms,
  DirectoryRow,
  FinancialFacts,
  InstanceDetail,
  KymiderClient,
  Lender,
  LenderRequest,
  PublicRecord,
  Verdict,
} from './client';

const COIN_PUBLIC_KEY = '0'.repeat(64);

const hex = (b: Uint8Array): string =>
  '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const skFrom = (seed: number): Uint8Array => new Uint8Array(32).fill(seed);

const pubKeyOf = (sk: Uint8Array): Uint8Array => solvencyPureCircuits.getDappPubKey(sk);

const LENDER_SEEDS: ReadonlyArray<{
  id: string;
  name: string;
  initials: string;
  kind: Lender['kind'];
  seed: number;
}> = [
  { id: 'nova', name: 'Nova Capital', initials: 'NC', kind: 'On-chain protocol', seed: 21 },
  { id: 'harbor', name: 'Harbor Bank', initials: 'HB', kind: 'Institutional', seed: 22 },
  { id: 'meridian', name: 'Meridian Credit Union', initials: 'MC', kind: 'Institutional', seed: 23 },
  { id: 'atlas', name: 'Atlas Lending', initials: 'AL', kind: 'On-chain protocol', seed: 24 },
];

/** One deployed SolvencyProof instance, driven offline. */
class Instance {
  readonly address: string;
  readonly addressBytes: Uint8Array;
  readonly ownerSk: Uint8Array;
  lastUpdate: Date;
  /** When each lender asked, keyed by their public key — one time per claim,
   *  not one per instance, or every row reads "just now" after any action. */
  readonly askedAt = new Map<string, Date>();
  /**
   * The commitment each attestation was proved against, keyed by lender.
   *
   * The ledger keeps a verdict but not the statement it came from, so once the
   * borrower commits new facts an old PASS still sits there looking current.
   * Holding the commitment lets both consoles say so.
   */
  readonly provedAgainst = new Map<string, string>();
  private readonly contract: SolvencyProofContract<SolvencyPrivateState>;
  private ctx: CircuitContext<SolvencyPrivateState>;

  constructor(facts: FinancialFacts, ownerSk: Uint8Array) {
    this.ownerSk = ownerSk;
    this.contract = new SolvencyProofContract<SolvencyPrivateState>(solvencyWitnesses);
    const seedState = createSolvencyPrivateState(facts.balance, facts.debts, facts.income, ownerSk);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(seedState, COIN_PUBLIC_KEY),
      facts.balance,
      facts.debts,
      facts.income,
    );
    this.address = sampleContractAddress();
    this.addressBytes = encodeContractAddress(this.address);
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
    this.lastUpdate = new Date();
  }

  ledger() {
    return solvencyLedger(this.ctx.currentQueryContext.state);
  }

  facts(): FinancialFacts {
    const { balance, debts, income } = this.ctx.currentPrivateState;
    return { balance, debts, income };
  }

  /** Act as the wallet holding `sk` — the caller identity is the private-state sk. */
  private as(sk: Uint8Array): void {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
  }

  addLender(lender: Uint8Array): void {
    this.as(this.ownerSk);
    this.ctx = this.contract.impureCircuits.addLender(this.ctx, lender).context;
  }

  /**
   * Facts are circuit ARGUMENTS, so the new values must be written back into
   * private state or every later proof is built on the old ones. That was a
   * real bug in the Node client; keeping the write-back here stops the browser
   * reintroducing it.
   */
  updateFacts(facts: FinancialFacts): void {
    this.as(this.ownerSk);
    const { context } = this.contract.impureCircuits.updateFacts(
      this.ctx,
      facts.balance,
      facts.debts,
      facts.income,
    );
    this.ctx = {
      ...context,
      currentPrivateState: { ...context.currentPrivateState, ...facts },
    };
    this.lastUpdate = new Date();
  }

  requestClaim(lenderSk: Uint8Array, lender: Uint8Array, terms: ClaimTerms, askedAt?: Date): void {
    this.as(lenderSk);
    this.ctx = this.contract.impureCircuits.requestClaim(
      this.ctx,
      lender,
      terms.thresholdNetWorth,
      terms.maxDti,
    ).context;
    this.askedAt.set(hex(lender), askedAt ?? new Date());
    // The contract resets the attestation to NONE on a new request, so there is
    // no longer a verdict to call superseded.
    this.provedAgainst.delete(hex(lender));
    this.lastUpdate = new Date();
  }

  proveSolvency(lender: Uint8Array): void {
    this.as(this.ownerSk);
    const f = this.facts();
    this.ctx = this.contract.impureCircuits.proveSolvency(
      this.ctx,
      lender,
      f.balance,
      f.debts,
      f.income,
    ).context;
    this.provedAgainst.set(hex(lender), hex(this.ledger().commitment));
    this.lastUpdate = new Date();
  }

  decide(lenderSk: Uint8Array, lender: Uint8Array, approve: boolean): void {
    this.as(lenderSk);
    const circuits = this.contract.impureCircuits;
    this.ctx = approve
      ? circuits.approve(this.ctx, lender).context
      : circuits.reject(this.ctx, lender).context;
    this.lastUpdate = new Date();
  }
}

/** The shared, public-only Registry. */
class Registry {
  readonly address: string;
  private readonly contract: RegistryContract<RegistryPrivateState>;
  private ctx: CircuitContext<RegistryPrivateState>;

  constructor(callerSk: Uint8Array) {
    this.contract = new RegistryContract<RegistryPrivateState>(registryWitnesses);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(createRegistryPrivateState(callerSk), COIN_PUBLIC_KEY),
    );
    this.address = sampleContractAddress();
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger() {
    return registryLedger(this.ctx.currentQueryContext.state);
  }

  private as(sk: Uint8Array): void {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
  }

  // Rows are keyed on the caller's dapp pubkey, so `sk` alone decides whose row
  // is written — there is no way to address anyone else's.
  register(sk: Uint8Array, addr: Uint8Array, commitment: Uint8Array): void {
    this.as(sk);
    this.ctx = this.contract.impureCircuits.register(this.ctx, addr, commitment).context;
  }

  updateCommitment(sk: Uint8Array, commitment: Uint8Array): void {
    this.as(sk);
    this.ctx = this.contract.impureCircuits.updateCommitment(this.ctx, commitment).context;
  }

  suspend(sk: Uint8Array): void {
    this.as(sk);
    this.ctx = this.contract.impureCircuits.suspend(this.ctx).context;
  }
}

const relative = (d: Date): string => {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

const claimStateOf = (status: ClaimStatus): ClaimState =>
  status === ClaimStatus.APPROVED
    ? 'APPROVED'
    : status === ClaimStatus.REJECTED
      ? 'REJECTED'
      : 'PENDING';

const verdictOf = (a: AttestationStatus | undefined): Verdict =>
  a === AttestationStatus.PASS ? 'PASS' : a === AttestationStatus.FAIL ? 'FAIL' : 'NONE';

export class SimulatedKymiderClient implements KymiderClient {
  private readonly registry: Registry;
  private readonly instances = new Map<string, Instance>();
  private readonly lenderList: Lender[];
  private readonly lenderSk = new Map<string, Uint8Array>();
  private readonly lenderPk = new Map<string, Uint8Array>();
  private readonly mine: Instance;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.lenderList = LENDER_SEEDS.map(({ seed, ...rest }) => {
      const sk = skFrom(seed);
      const pk = pubKeyOf(sk);
      this.lenderSk.set(rest.id, sk);
      this.lenderPk.set(rest.id, pk);
      return { ...rest, pubKey: hex(pk) };
    });

    const registrar = skFrom(1);
    this.registry = new Registry(registrar);

    // The borrower this browser owns.
    this.mine = this.deploy({ balance: 1_000_000n, debts: 300_000n, income: 1_000_000n }, 101);
    this.authorizeAll(this.mine);
    // Three lenders have already been answered; Harbor Bank's request is still
    // open, so the borrower console opens with something to do.
    this.ask(this.mine, 'nova', { thresholdNetWorth: 500_000n, maxDti: 40n }, true, 2);
    this.ask(this.mine, 'meridian', { thresholdNetWorth: 250_000n, maxDti: 45n }, true, 5);
    this.ask(this.mine, 'atlas', { thresholdNetWorth: 900_000n, maxDti: 30n }, true, 9);
    this.ask(this.mine, 'harbor', { thresholdNetWorth: 750_000n, maxDti: 35n }, false, 0);

    // Five more instances so the lender directory has something to underwrite.
    const others: Array<{
      facts: FinancialFacts;
      seed: number;
      askers: string[];
      /** How stale the directory should show this instance as being. */
      ageHours: number;
      suspend?: boolean;
    }> = [
      {
        facts: { balance: 820_000n, debts: 120_000n, income: 640_000n },
        seed: 102,
        askers: ['nova'],
        ageHours: 3,
      },
      {
        facts: { balance: 2_400_000n, debts: 900_000n, income: 1_800_000n },
        seed: 103,
        askers: ['nova', 'meridian'],
        ageHours: 26,
      },
      {
        facts: { balance: 310_000n, debts: 280_000n, income: 240_000n },
        seed: 104,
        askers: ['atlas'],
        ageHours: 52,
      },
      {
        facts: { balance: 1_150_000n, debts: 400_000n, income: 950_000n },
        seed: 105,
        askers: [],
        ageHours: 96,
      },
      {
        facts: { balance: 640_000n, debts: 210_000n, income: 520_000n },
        seed: 106,
        askers: ['meridian'],
        ageHours: 148,
        suspend: true,
      },
    ];
    for (const { facts, seed, askers, ageHours, suspend } of others) {
      const inst = this.deploy(facts, seed);
      this.authorizeAll(inst);
      askers.forEach((id, i) => {
        this.ask(inst, id, { thresholdNetWorth: 250_000n, maxDti: 45n }, true, 3 + i * 4);
      });
      // Only the record's own owner may suspend it — the registrar has no such
      // power, which is the contract's rule, not this file's.
      if (suspend) this.registry.suspend(inst.ownerSk);
      // Seeding all six instances in the same millisecond would otherwise show
      // a directory where every row was touched "just now".
      inst.lastUpdate = new Date(Date.now() - ageHours * 3_600_000);
    }
  }

  // --- seeding helpers ----------------------------------------------------

  private deploy(facts: FinancialFacts, seed: number): Instance {
    const inst = new Instance(facts, skFrom(seed));
    this.instances.set(inst.address, inst);
    const led = inst.ledger();
    this.registry.register(inst.ownerSk, inst.addressBytes, led.commitment);
    return inst;
  }

  private authorizeAll(inst: Instance): void {
    for (const l of this.lenderList) inst.addLender(this.lenderPk.get(l.id)!);
  }

  /** A lender asks, and optionally the borrower has already answered. */
  private ask(
    inst: Instance,
    lenderId: string,
    terms: ClaimTerms,
    answered: boolean,
    daysAgo = 0,
  ): void {
    const pk = this.lenderPk.get(lenderId)!;
    const askedAt = new Date(Date.now() - daysAgo * 86_400_000);
    inst.requestClaim(this.lenderSk.get(lenderId)!, pk, terms, askedAt);
    if (answered) inst.proveSolvency(pk);
  }

  // --- change notification ------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  // --- identity -----------------------------------------------------------

  myAddress(): string {
    return this.mine.address;
  }

  /** The lender console acts as Harbor Bank. */
  me(): Lender {
    return this.lenderList.find((l) => l.id === 'harbor')!;
  }

  lenders(): Lender[] {
    return this.lenderList;
  }

  // --- borrower side ------------------------------------------------------

  facts(): FinancialFacts {
    return this.mine.facts();
  }

  async commitFacts(facts: FinancialFacts): Promise<void> {
    this.mine.updateFacts(facts);
    // The registry entry would otherwise still advertise the old commitment,
    // and an honest borrower would fail off-chain verification.
    this.registry.updateCommitment(this.mine.ownerSk, this.mine.ledger().commitment);
    this.changed();
  }

  myRecord(): PublicRecord {
    return this.directoryRecord(this.mine);
  }

  myRequests(): LenderRequest[] {
    return this.requestsFor(this.mine);
  }

  async proveFor(lenderId: string): Promise<Verdict> {
    const pk = this.lenderPk.get(lenderId)!;
    this.mine.proveSolvency(pk);
    this.changed();
    return verdictOf(this.mine.ledger().attestations.lookup(pk));
  }

  // --- lender side --------------------------------------------------------

  directory(): DirectoryRow[] {
    const reg = this.registry.ledger();
    const rows: DirectoryRow[] = [];
    // Rows are keyed on the owner's dapp pubkey and carry the instance they
    // point at. Anyone may claim any address, so `matchesInstance` is the check
    // that matters: the row must be under the instance's OWN owner key and
    // carry that instance's current commitment.
    for (const [ownerKey, rec] of reg.borrowers) {
      const inst = this.findByBytes(rec.instanceAddr);
      if (!inst) continue;
      const record = this.recordFor(inst);
      const genuine =
        hex(inst.ledger().owner) === hex(ownerKey) && hex(rec.commitment) === record.commitment;
      rows.push({
        ...record,
        status: rec.status === BorrowStatus.SUSPENDED ? 'SUSPENDED' : 'ACTIVE',
        matchesInstance: genuine,
      });
    }
    return rows;
  }

  instance(address: string): InstanceDetail | null {
    const inst = this.instances.get(address);
    if (!inst) return null;
    return { record: this.directoryRecord(inst), requests: this.requestsFor(inst) };
  }

  async requestClaim(address: string, terms: ClaimTerms): Promise<void> {
    const inst = this.instances.get(address);
    if (!inst) throw new Error(`no such instance: ${address}`);
    const me = this.me();
    inst.requestClaim(this.lenderSk.get(me.id)!, this.lenderPk.get(me.id)!, terms);
    // The borrower answers by proving. On a real network that is their move,
    // not the lender's, and the console would wait for it to land.
    inst.proveSolvency(this.lenderPk.get(me.id)!);
    this.changed();
  }

  async decide(address: string, approve: boolean): Promise<void> {
    const inst = this.instances.get(address);
    if (!inst) throw new Error(`no such instance: ${address}`);
    const me = this.me();
    inst.decide(this.lenderSk.get(me.id)!, this.lenderPk.get(me.id)!, approve);
    this.changed();
  }

  // --- projections --------------------------------------------------------

  private findByBytes(addrBytes: Uint8Array): Instance | undefined {
    const want = hex(addrBytes);
    for (const inst of this.instances.values()) {
      if (hex(inst.addressBytes) === want) return inst;
    }
    return undefined;
  }

  private recordFor(inst: Instance): PublicRecord {
    const led = inst.ledger();
    const currentCommitment = hex(led.commitment);
    let attestationCount = 0;
    let passCount = 0;
    let staleCount = 0;
    for (const [lender, status] of led.attestations) {
      // A re-request resets the entry to NONE, so the map holds placeholders as
      // well as verdicts. Only a real verdict counts as an attestation.
      if (status === AttestationStatus.NONE) continue;
      attestationCount += 1;
      if (status === AttestationStatus.PASS) passCount += 1;
      const provedAgainst = inst.provedAgainst.get(hex(lender));
      if (provedAgainst !== undefined && provedAgainst !== currentCommitment) staleCount += 1;
    }
    return {
      instance: inst.address,
      commitment: currentCommitment,
      verifierKey: hex(led.verifierKey),
      status: 'ACTIVE',
      attestationCount,
      passCount,
      staleCount,
      lastUpdate: relative(inst.lastUpdate),
    };
  }

  private directoryRecord(inst: Instance): PublicRecord {
    const record = this.recordFor(inst);
    const reg = this.registry.ledger();
    // The instance's own owner key is the only row that can speak for it.
    const ownerKey = inst.ledger().owner;
    if (reg.borrowers.member(ownerKey)) {
      const rec = reg.borrowers.lookup(ownerKey);
      record.status = rec.status === BorrowStatus.SUSPENDED ? 'SUSPENDED' : 'ACTIVE';
    }
    return record;
  }

  private requestsFor(inst: Instance): LenderRequest[] {
    const led = inst.ledger();
    const currentCommitment = hex(led.commitment);
    return this.lenderList.map((lender) => {
      const pk = this.lenderPk.get(lender.id)!;
      const key = hex(pk);
      const claim = led.claims.member(pk) ? led.claims.lookup(pk) : null;
      const verdict = led.attestations.member(pk) ? verdictOf(led.attestations.lookup(pk)) : 'NONE';
      const provedAgainst = inst.provedAgainst.get(key);
      return {
        lender,
        authorized: led.authorizedLenders.member(pk),
        terms: claim ? { thresholdNetWorth: claim.thresholdNetWorth, maxDti: claim.maxDti } : null,
        claimState: claim ? claimStateOf(claim.status) : 'NONE',
        verdict,
        requestedAt: claim ? relative(inst.askedAt.get(key) ?? inst.lastUpdate) : null,
        stale:
          verdict !== 'NONE' &&
          provedAgainst !== undefined &&
          provedAgainst !== currentCommitment,
      };
    });
  }
}
