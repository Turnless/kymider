// Kymider — offline contract simulators.
//
// The compiled Compact programs can be executed locally: build a constructor
// context, run circuits against a QueryContext, and read the ledger back. That
// exercises the REAL contract logic — asserts, commitment checks, caller
// authorization — with no Docker, no proof server and no network, so the
// negative-authorization and tamper cases can run in CI in milliseconds.
//
// The devnet simulation (tests/simulation) still covers what this cannot: real
// ZK proof generation, network verification and transaction submission.
//
// Pattern adapted from midnightntwrk/example-battleship (Apache-2.0).

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
import {
  LoanContract,
  LoanDirectoryContract,
  loanDirectoryLedger,
  loanDirectoryPureCircuits,
  loanLedger,
  type ListingStatus,
  type LoanDirectoryLedger,
  type LoanLedger,
  type LoanTerms,
  RegistryContract,
  SolvencyProofContract,
  registryLedger,
  solvencyLedger,
  solvencyPureCircuits,
  type RegistryLedger,
  type SolvencyLedger,
} from '../../../contracts/index.js';
import {
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  createRegistryPrivateState,
  createSolvencyPrivateState,
  loanDirectoryWitnesses,
  loanWitnesses,
  registryWitnesses,
  solvencyWitnesses,
  type LoanDirectoryPrivateState,
  type LoanPrivateState,
  type RegistryPrivateState,
  type SolvencyPrivateState,
} from '../../../contracts/witnesses.js';
import type { ClaimParams, FinancialFacts } from '../../../client/proof/solvencyProof.js';

// The Zswap coin public key is irrelevant to these circuits (none of them move
// coins), so a fixed placeholder keeps the simulators deterministic.
const COIN_PUBLIC_KEY = '0'.repeat(64);

export const pubKeyOf = (sk: Uint8Array): Uint8Array => solvencyPureCircuits.getDappPubKey(sk);

export const skFrom = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

/**
 * A single deployed SolvencyProof instance, driven offline.
 *
 * `as(sk)` switches which wallet is making the next call: the caller identity
 * comes from the `localSk` witness, i.e. the private state, which is exactly
 * how a second wallet acting on the same instance behaves on-chain.
 */
export class SolvencySimulator {
  readonly address: ContractAddress;
  private readonly contract: SolvencyProofContract<SolvencyPrivateState>;
  private ctx: CircuitContext<SolvencyPrivateState>;

  constructor(facts: FinancialFacts, ownerSk: Uint8Array) {
    this.contract = new SolvencyProofContract<SolvencyPrivateState>(solvencyWitnesses);
    const initialPrivateState = createSolvencyPrivateState(
      facts.balance,
      facts.debts,
      facts.income,
      ownerSk,
    );
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(initialPrivateState, COIN_PUBLIC_KEY),
      facts.balance,
      facts.debts,
      facts.income,
    );
    this.address = sampleContractAddress();
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): SolvencyLedger {
    return solvencyLedger(this.ctx.currentQueryContext.state);
  }

  facts(): FinancialFacts {
    const { balance, debts, income } = this.ctx.currentPrivateState;
    return { balance, debts, income };
  }

  /** Make the next call as the wallet holding `sk`. */
  as(sk: Uint8Array): this {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
    return this;
  }

  addLender(lender: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.addLender(this.ctx, lender).context;
    return this;
  }

  /**
   * Commit new facts. Mirrors KymiderClient.updateFacts: the facts are circuit
   * ARGUMENTS, so the private state must be written back by the caller or the
   * next proof is built on stale facts.
   */
  updateFacts(facts: FinancialFacts): this {
    const { context } = this.contract.impureCircuits.updateFacts(
      this.ctx,
      facts.balance,
      facts.debts,
      facts.income,
    );
    this.ctx = {
      ...context,
      currentPrivateState: {
        ...context.currentPrivateState,
        balance: facts.balance,
        debts: facts.debts,
        income: facts.income,
      },
    };
    return this;
  }

  requestClaim(lender: Uint8Array, claim: ClaimParams): this {
    this.ctx = this.contract.impureCircuits.requestClaim(
      this.ctx,
      lender,
      claim.thresholdNetWorth,
      claim.maxDti,
    ).context;
    return this;
  }

  /** Prove against the current private facts, or against `override` to tamper. */
  proveSolvency(lender: Uint8Array, override?: FinancialFacts): this {
    const facts = override ?? this.facts();
    this.ctx = this.contract.impureCircuits.proveSolvency(
      this.ctx,
      lender,
      facts.balance,
      facts.debts,
      facts.income,
    ).context;
    return this;
  }

  approve(lender: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.approve(this.ctx, lender).context;
    return this;
  }

  reject(lender: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.reject(this.ctx, lender).context;
    return this;
  }
}

/** The shared, public-only Registry, driven offline. */
export class RegistrySimulator {
  readonly address: ContractAddress;
  private readonly contract: RegistryContract<RegistryPrivateState>;
  private ctx: CircuitContext<RegistryPrivateState>;

  constructor(callerSk: Uint8Array) {
    this.contract = new RegistryContract<RegistryPrivateState>(registryWitnesses);
    const initialPrivateState = createRegistryPrivateState(callerSk);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(initialPrivateState, COIN_PUBLIC_KEY),
    );
    this.address = sampleContractAddress();
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): RegistryLedger {
    return registryLedger(this.ctx.currentQueryContext.state);
  }

  as(sk: Uint8Array): this {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
    return this;
  }

  // Rows are keyed on the caller's dapp pubkey, so none of these take an owner
  // or an address to act on: `as(sk)` alone decides whose row is written.
  register(instanceAddr: Uint8Array, commitment: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.register(this.ctx, instanceAddr, commitment).context;
    return this;
  }

  updateCommitment(commitment: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.updateCommitment(this.ctx, commitment).context;
    return this;
  }

  suspend(): this {
    this.ctx = this.contract.impureCircuits.suspend(this.ctx).context;
    return this;
  }
}

// --- Wave 2 ---------------------------------------------------------------

export { commitFacts } from '../../../client/proof/loanMath.js';

/** A fixed, recent block time, so the time-dependent cases are reproducible. */
export const T0 = 1_800_000_000n;

/**
 * A single Loan instance, driven offline, with a block clock the test owns.
 *
 * `createCircuitContext` stamps the block with the wall clock; here every call
 * runs at `now`, moved with `at` and `advance`, so quote expiry, late
 * payments and the default grace period can be tested exactly.
 */
export class LoanSimulator {
  readonly address: ContractAddress;
  private readonly contract: LoanContract<LoanPrivateState>;
  private ctx: CircuitContext<LoanPrivateState>;
  private readonly log: { amount: bigint; onTime: boolean }[] = [];
  now: bigint = T0;

  constructor(
    borrowerSk: Uint8Array,
    lenderPk: Uint8Array,
    terms: LoanTerms,
    commitment: Uint8Array,
    historySeed: Uint8Array,
  ) {
    this.contract = new LoanContract<LoanPrivateState>(loanWitnesses);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(createLoanPrivateState(borrowerSk, historySeed), COIN_PUBLIC_KEY),
      lenderPk,
      terms,
      commitment,
    );
    this.address = sampleContractAddress();
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): LoanLedger {
    return loanLedger(this.ctx.currentQueryContext.state);
  }

  /** Make the next call as the wallet holding `sk`. */
  as(sk: Uint8Array): this {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
    return this;
  }

  at(seconds: bigint): this {
    this.now = seconds;
    return this;
  }

  advance(seconds: bigint): this {
    return this.at(this.now + seconds);
  }

  private run(call: (ctx: CircuitContext<LoanPrivateState>) => { context: CircuitContext<LoanPrivateState> }): this {
    const q = this.ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: this.now };
    this.ctx = call(this.ctx).context;
    return this;
  }

  quoteTerms(thresholdNetWorth: bigint, maxDti: bigint, expiresAt: bigint): this {
    return this.run((c) => this.contract.impureCircuits.quoteTerms(c, thresholdNetWorth, maxDti, expiresAt));
  }

  proveTier(facts: FinancialFacts): this {
    return this.run((c) =>
      this.contract.impureCircuits.proveTier(c, facts.balance, facts.debts, facts.income),
    );
  }

  underwrite(collateral: bigint): this {
    return this.run((c) => this.contract.impureCircuits.underwrite(c, collateral));
  }

  decline(): this {
    return this.run((c) => this.contract.impureCircuits.decline(c));
  }

  disburse(start: bigint, owed: bigint, installment: bigint): this {
    return this.run((c) => this.contract.impureCircuits.disburse(c, start, owed, installment));
  }

  repay(amount: bigint): this {
    const lateBefore = this.ledger().latePayments;
    this.run((c) => this.contract.impureCircuits.repay(c, amount));
    // Reached only if the circuit accepted the payment. The lateness is the
    // contract's own verdict, read off its counter, not the test's guess.
    this.log.push({ amount, onTime: this.ledger().latePayments === lateBefore });
    return this;
  }

  /**
   * The borrower's private record of accepted repayments, in order, as the
   * borrower's machine would keep it (an auditor disclosure is built from it).
   */
  paymentLog(): { amount: bigint; onTime: boolean }[] {
    return this.log.map((p) => ({ ...p }));
  }

  /** The borrower's history seed, from the private state the witnesses read. */
  historySeed(): Uint8Array {
    return this.ctx.currentPrivateState.historySeed;
  }

  markDefault(): this {
    return this.run((c) => this.contract.impureCircuits.markDefault(c));
  }
}

export const repaidLeaf = (borrowerPk: Uint8Array, loanAddr: Uint8Array, lenderPk: Uint8Array): Uint8Array =>
  loanDirectoryPureCircuits.repaidLeaf(borrowerPk, loanAddr, lenderPk);

/** Stand-in for a Loan instance's 32-byte address, as the directory keys it. */
export const loanAddr = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

/** The shared LoanDirectory, driven offline. */
export class LoanDirectorySimulator {
  readonly address: ContractAddress;
  private readonly contract: LoanDirectoryContract<LoanDirectoryPrivateState>;
  private ctx: CircuitContext<LoanDirectoryPrivateState>;

  constructor(callerSk: Uint8Array) {
    this.contract = new LoanDirectoryContract<LoanDirectoryPrivateState>(loanDirectoryWitnesses);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(createLoanDirectoryPrivateState(callerSk), COIN_PUBLIC_KEY),
    );
    this.address = sampleContractAddress();
    this.ctx = createCircuitContext(
      this.address,
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): LoanDirectoryLedger {
    return loanDirectoryLedger(this.ctx.currentQueryContext.state);
  }

  as(sk: Uint8Array): this {
    this.ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
    return this;
  }

  /** The Merkle path a borrower would build for a recorded repayment. */
  pathFor(leaf: Uint8Array): MerkleTreePath<Uint8Array> {
    const path = this.ledger().repaid.findPathForLeaf(leaf);
    if (!path) throw new Error('no such leaf in the directory');
    return path;
  }

  list(loan: Uint8Array, lenderPk: Uint8Array, principal: bigint): this {
    this.ctx = this.contract.impureCircuits.list(this.ctx, loan, lenderPk, principal).context;
    return this;
  }

  updateStatus(loan: Uint8Array, status: ListingStatus): this {
    this.ctx = this.contract.impureCircuits.updateStatus(this.ctx, loan, status).context;
    return this;
  }

  recordRepaid(loan: Uint8Array): this {
    this.ctx = this.contract.impureCircuits.recordRepaid(this.ctx, loan).context;
    return this;
  }

  proveTwoRepaid(
    forLoan: Uint8Array,
    a: { loan: Uint8Array; lender: Uint8Array; path: MerkleTreePath<Uint8Array> },
    b: { loan: Uint8Array; lender: Uint8Array; path: MerkleTreePath<Uint8Array> },
  ): this {
    this.ctx = this.contract.impureCircuits.proveTwoRepaid(
      this.ctx,
      forLoan,
      a.loan,
      a.lender,
      a.path,
      b.loan,
      b.lender,
      b.path,
    ).context;
    return this;
  }
}
