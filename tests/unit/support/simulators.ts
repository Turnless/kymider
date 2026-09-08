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
import {
  RegistryContract,
  SolvencyProofContract,
  registryLedger,
  solvencyLedger,
  solvencyPureCircuits,
  type RegistryLedger,
  type SolvencyLedger,
} from '../../../contracts/index.js';
import {
  createRegistryPrivateState,
  createSolvencyPrivateState,
  registryWitnesses,
  solvencyWitnesses,
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
