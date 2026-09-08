// Kymider — off-chain client (MidnightJS).
//
// Facade over the two Wave 1 programs:
//   - one per-borrower SolvencyProof instance (private facts, public attestations)
//   - the shared public Registry index
//
// Instantiate one KymiderClient per wallet. The borrower's wallet deploys and
// proves; a lender's wallet requests claims and decides them. Raw financial
// facts stay in the private-state store and are only ever used to build circuit
// inputs — nothing but proofs, commitments and attestations leave the client.
//
// Private state is scoped by contract address: the provider requires
// `setContractAddress` before any get/set, and that call is what isolates one
// instance's state from another's. Every method that touches private state
// scopes it first rather than relying on whatever was scoped last.

import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import {
  decodeContractAddress,
  encodeContractAddress,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { Logger } from 'pino';
import {
  CompiledRegistryContract,
  CompiledSolvencyProofContract,
  registryLedger,
  registryPureCircuits,
  solvencyLedger,
  solvencyPureCircuits,
  AttestationStatus,
  ClaimStatus,
  BorrowStatus,
  type RegistryLedger,
  type SolvencyLedger,
} from '../contracts/index.js';
import type {
  SolvencyProofContract,
  RegistryContract,
} from '../contracts/index.js';
import {
  createRegistryPrivateState,
  createSolvencyPrivateState,
  type RegistryPrivateState,
  type SolvencyPrivateState,
} from '../contracts/witnesses.js';
import type { KymiderProviders } from './providers.js';
import type { FinancialFacts, ClaimParams } from './proof/solvencyProof.js';
import { computeSolvency } from './proof/solvencyProof.js';
import { bytesToHex, bytesEqual } from './utils.js';

export type BorrowerRow = {
  instanceAddress: ContractAddress;
  owner: Uint8Array;
  commitment: Uint8Array;
  status: BorrowStatus;
};

export const SOLVENCY_PRIVATE_STATE_ID = 'solvency-proof';
export const REGISTRY_PRIVATE_STATE_ID = 'registry';

export class KymiderClient {
  constructor(
    private readonly logger: Logger,
    readonly providers: KymiderProviders,
    private readonly solvencyPrivateStateId: string = SOLVENCY_PRIVATE_STATE_ID,
    private readonly registryPrivateStateId: string = REGISTRY_PRIVATE_STATE_ID,
  ) {}

  // --- identity -----------------------------------------------------------

  // Dapp pubkey derived from a secret key. Same salt as both contracts, so the
  // same key yields the same identity in SolvencyProof and Registry.
  solvencyPubKeyOf(sk: Uint8Array): Uint8Array {
    return solvencyPureCircuits.getDappPubKey(sk);
  }

  async solvencyPubKey(solvencyAddress?: ContractAddress): Promise<Uint8Array> {
    const state = await this.requireSolvencyPrivateState(solvencyAddress);
    return this.solvencyPubKeyOf(state.sk);
  }

  registryPubKeyOf(sk: Uint8Array): Uint8Array {
    return registryPureCircuits.getDappPubKey(sk);
  }

  // --- deployment ---------------------------------------------------------

  async deploySolvencyProof(
    facts: FinancialFacts,
    sk: Uint8Array,
  ): Promise<ContractAddress> {
    const privateState = createSolvencyPrivateState(facts.balance, facts.debts, facts.income, sk);
    const deployed = await deployContract<SolvencyProofContract>(this.providers.solvency, {
      compiledContract: CompiledSolvencyProofContract,
      privateStateId: this.solvencyPrivateStateId,
      initialPrivateState: privateState,
      args: [facts.balance, facts.debts, facts.income],
    });
    const address = deployed.deployTxData.public.contractAddress;
    this.providers.solvency.privateStateProvider.setContractAddress(address);
    await this.providers.solvency.privateStateProvider.set(this.solvencyPrivateStateId, privateState);
    this.logger.info(`SolvencyProof instance deployed at ${address}`);
    return address;
  }

  async deployRegistry(sk: Uint8Array): Promise<ContractAddress> {
    const privateState = createRegistryPrivateState(sk);
    const deployed = await deployContract<RegistryContract>(this.providers.registry, {
      compiledContract: CompiledRegistryContract,
      privateStateId: this.registryPrivateStateId,
      initialPrivateState: privateState,
    });
    const address = deployed.deployTxData.public.contractAddress;
    this.providers.registry.privateStateProvider.setContractAddress(address);
    await this.providers.registry.privateStateProvider.set(this.registryPrivateStateId, privateState);
    this.logger.info(`Registry deployed at ${address}`);
    return address;
  }

  // Bind this wallet's SolvencyProof private state to a specific instance.
  // The borrower's is set by deploySolvencyProof; a lender must call this with
  // their own private state before requestClaim/decideClaim.
  async bindSolvencyPrivateState(
    address: ContractAddress,
    privateState: SolvencyPrivateState,
  ): Promise<void> {
    this.providers.solvency.privateStateProvider.setContractAddress(address);
    await this.providers.solvency.privateStateProvider.set(this.solvencyPrivateStateId, privateState);
  }

  // Bind this wallet's Registry caller identity. The borrower's is set by
  // deployRegistry; any other wallet acting on an existing Registry needs this.
  async bindRegistryPrivateState(
    address: ContractAddress,
    privateState: RegistryPrivateState,
  ): Promise<void> {
    this.providers.registry.privateStateProvider.setContractAddress(address);
    await this.providers.registry.privateStateProvider.set(this.registryPrivateStateId, privateState);
  }

  // --- borrower flows -----------------------------------------------------

  // Index this borrower's SolvencyProof instance in the shared Registry. Reads
  // the commitment from the deployed instance's public state; the row is keyed
  // on the caller's own dapp pubkey, so there is no owner argument to pass and
  // no way to write to anyone else's record.
  async registerWithRegistry(
    registryAddress: ContractAddress,
    solvencyAddress: ContractAddress,
  ): Promise<void> {
    const state = await this.solvencyState(solvencyAddress);
    await this.submitRegistryCall(registryAddress, 'register', [
      encodeContractAddress(solvencyAddress),
      state.commitment,
    ]);
    this.logger.info(`Registered ${solvencyAddress} in registry ${registryAddress}`);
  }

  // Re-point the Registry at the instance's current commitment. Must be called
  // after updateFacts, or the Registry keeps indexing the old commitment and
  // every consistency check against it fails for an honest borrower.
  async updateRegistryCommitment(
    registryAddress: ContractAddress,
    solvencyAddress: ContractAddress,
  ): Promise<void> {
    const state = await this.solvencyState(solvencyAddress);
    await this.submitRegistryCall(registryAddress, 'updateCommitment', [state.commitment]);
    this.logger.info(`Registry commitment updated for ${solvencyAddress}`);
  }

  // Commit new facts. The facts are circuit ARGUMENTS, not witness outputs, so
  // the private-state store is not updated by the call itself — we write them
  // back here. Without that, the next proveSolvency rebuilds the commitment
  // from stale facts and the network rejects the proof.
  //
  // Pass `registryAddress` to keep the Registry's indexed commitment in step
  // (recommended whenever the instance is registered).
  async updateFacts(
    solvencyAddress: ContractAddress,
    facts: FinancialFacts,
    registryAddress?: ContractAddress,
  ): Promise<void> {
    await this.submitSolvencyCall(solvencyAddress, 'updateFacts', [
      facts.balance,
      facts.debts,
      facts.income,
    ]);

    const current = await this.requireSolvencyPrivateState(solvencyAddress);
    await this.providers.solvency.privateStateProvider.set(this.solvencyPrivateStateId, {
      ...current,
      balance: facts.balance,
      debts: facts.debts,
      income: facts.income,
    });

    if (registryAddress) {
      await this.updateRegistryCommitment(registryAddress, solvencyAddress);
    }
  }

  async authorizeLender(
    solvencyAddress: ContractAddress,
    lenderPubKey: Uint8Array,
  ): Promise<void> {
    await this.submitSolvencyCall(solvencyAddress, 'addLender', [lenderPubKey]);
  }

  // Borrower generates + submits the ZK proof for a lender's pending claim.
  // The Midnight network verifies the proof at submission; facts that do not
  // match the on-chain commitment are rejected by the circuit.
  async proveSolvency(
    solvencyAddress: ContractAddress,
    lenderPubKey: Uint8Array,
  ): Promise<void> {
    const state = await this.requireSolvencyPrivateState(solvencyAddress);
    const claim = await this.claimFor(solvencyAddress, lenderPubKey);
    const verdict = computeSolvency(
      { balance: state.balance, debts: state.debts, income: state.income },
      { thresholdNetWorth: claim.thresholdNetWorth, maxDti: claim.maxDti },
    );
    this.logger.info(`Local verdict for ${bytesToHex(lenderPubKey).slice(0, 12)}: ${verdict}`);

    await this.submitSolvencyCall(solvencyAddress, 'proveSolvency', [
      lenderPubKey,
      state.balance,
      state.debts,
      state.income,
    ]);
  }

  // --- lender flows -------------------------------------------------------

  async requestClaim(
    solvencyAddress: ContractAddress,
    claim: ClaimParams,
  ): Promise<void> {
    const lenderPubKey = await this.solvencyPubKey(solvencyAddress);
    await this.submitSolvencyCall(solvencyAddress, 'requestClaim', [
      lenderPubKey,
      claim.thresholdNetWorth,
      claim.maxDti,
    ]);
  }

  async decideClaim(solvencyAddress: ContractAddress, approve: boolean): Promise<void> {
    const lenderPubKey = await this.solvencyPubKey(solvencyAddress);
    await this.submitSolvencyCall(
      solvencyAddress,
      approve ? 'approve' : 'reject',
      [lenderPubKey],
    );
  }

  // --- read-only queries --------------------------------------------------

  async solvencyState(address: ContractAddress): Promise<SolvencyLedger> {
    const state = await this.providers.solvency.publicDataProvider.queryContractState(address);
    if (!state) {
      throw new Error(`no contract state for ${address}`);
    }
    return solvencyLedger(state.data);
  }

  async registryState(address: ContractAddress): Promise<RegistryLedger> {
    const state = await this.providers.registry.publicDataProvider.queryContractState(address);
    if (!state) {
      throw new Error(`no contract state for ${address}`);
    }
    return registryLedger(state.data);
  }

  async listBorrowers(registryAddress: ContractAddress): Promise<BorrowerRow[]> {
    const state = await this.registryState(registryAddress);
    const rows: BorrowerRow[] = [];
    // Rows are keyed on the owner's dapp pubkey now, and carry the instance
    // address they point at.
    for (const [owner, value] of state.borrowers) {
      rows.push({
        instanceAddress: decodeContractAddress(value.instanceAddr),
        owner: owner as Uint8Array,
        commitment: value.commitment,
        status: value.status,
      });
    }
    return rows;
  }

  async claimFor(solvencyAddress: ContractAddress, lenderPubKey: Uint8Array) {
    const state = await this.solvencyState(solvencyAddress);
    if (!state.claims.member(lenderPubKey)) {
      throw new Error('no claim recorded for this lender');
    }
    return state.claims.lookup(lenderPubKey);
  }

  async attestationFor(
    solvencyAddress: ContractAddress,
    lenderPubKey: Uint8Array,
  ): Promise<AttestationStatus> {
    const state = await this.solvencyState(solvencyAddress);
    return state.attestations.member(lenderPubKey)
      ? state.attestations.lookup(lenderPubKey)
      : AttestationStatus.NONE;
  }

  // --- verification -------------------------------------------------------

  // The Midnight network verifies the ZK proof at submission (primary). This
  // helper lets a lender confirm the on-chain record is consistent:
  //   - an attestation exists for them,
  //   - the claim they requested is the one answered,
  //   - the borrower's commitment matches what the Registry indexes.
  // Wiring full off-chain PLONK proof verification against `verifierKey` is a
  // Wave-1 stretch item (see docs/scaffold.md).
  async verifyOffChain(
    solvencyAddress: ContractAddress,
    registryAddress: ContractAddress,
    lenderPubKey: Uint8Array,
  ): Promise<{ verified: boolean; verdict: AttestationStatus; claimStatus: ClaimStatus }> {
    const [state, claim] = await Promise.all([
      this.solvencyState(solvencyAddress),
      this.claimFor(solvencyAddress, lenderPubKey),
    ]);
    const attestation = await this.attestationFor(solvencyAddress, lenderPubKey);

    // The Registry row is keyed on the owner's dapp pubkey, so this now checks
    // three things rather than one: that the instance's own owner has a row,
    // that the row points back at this instance, and that it carries the
    // instance's current commitment. A stranger pointing their row at this
    // address no longer affects the answer — their row is under their key.
    const registered = await this.registryState(registryAddress);
    const ownerKey = state.owner;
    const row = registered.borrowers.member(ownerKey)
      ? registered.borrowers.lookup(ownerKey)
      : null;
    const commitmentMatches =
      row !== null &&
      bytesEqual(row.instanceAddr, encodeContractAddress(solvencyAddress)) &&
      bytesEqual(row.commitment, state.commitment);

    const verified = attestation !== AttestationStatus.NONE && commitmentMatches;
    this.logger.info(
      `Off-chain record check: attestation=${attestation}, commitmentConsistent=${commitmentMatches}, claimStatus=${claim.status}`,
    );
    return { verified, verdict: attestation, claimStatus: claim.status };
  }

  // --- raw submission helpers (also used by the simulation tests) ---------

  async submitSolvencyCall(
    solvencyAddress: ContractAddress,
    circuitId:
      | 'addLender'
      | 'updateFacts'
      | 'requestClaim'
      | 'proveSolvency'
      | 'approve'
      | 'reject',
    args: SolvencyCircuitArgs,
  ): Promise<void> {
    this.providers.solvency.privateStateProvider.setContractAddress(solvencyAddress);
    await submitCallTx<SolvencyProofContract, typeof circuitId>(this.providers.solvency, {
      compiledContract: CompiledSolvencyProofContract,
      contractAddress: solvencyAddress,
      privateStateId: this.solvencyPrivateStateId,
      circuitId,
      args,
    });
  }

  async submitRegistryCall(
    registryAddress: ContractAddress,
    circuitId: 'register' | 'updateCommitment' | 'suspend',
    args: RegistryCircuitArgs,
  ): Promise<void> {
    this.providers.registry.privateStateProvider.setContractAddress(registryAddress);
    await submitCallTx<RegistryContract, typeof circuitId>(this.providers.registry, {
      compiledContract: CompiledRegistryContract,
      contractAddress: registryAddress,
      privateStateId: this.registryPrivateStateId,
      circuitId,
      args,
    });
  }

  // --- internals ----------------------------------------------------------

  // Scope the store to `solvencyAddress`, then read this wallet's private
  // state. The provider throws when no address was ever scoped and returns
  // null when nothing is stored — both mean the bind step was skipped, so say
  // so instead of failing later on `undefined.sk`.
  private async requireSolvencyPrivateState(
    solvencyAddress?: ContractAddress,
  ): Promise<SolvencyPrivateState> {
    const provider = this.providers.solvency.privateStateProvider;
    if (solvencyAddress) {
      provider.setContractAddress(solvencyAddress);
    }
    const state: SolvencyPrivateState | null = await provider.get(this.solvencyPrivateStateId);
    if (!state) {
      const where = solvencyAddress ? ` for ${solvencyAddress}` : '';
      throw new Error(
        `no SolvencyProof private state${where} — call deploySolvencyProof (borrower) ` +
          'or bindSolvencyPrivateState (lender) first',
      );
    }
    return state;
  }
}

// Argument tuples for the raw submission helpers, kept in lock-step with the
// compiled circuit signatures.
type SolvencyCircuitArgs =
  | [lender: Uint8Array]
  | [balance: bigint, debts: bigint, income: bigint]
  | [lender: Uint8Array, thresholdNetWorth: bigint, maxDti: bigint]
  | [lender: Uint8Array, balance: bigint, debts: bigint, income: bigint];

// Rows are keyed on the caller, so none of these name a record to act on:
// suspend takes nothing, updateCommitment takes only the new commitment.
type RegistryCircuitArgs =
  | []
  | [commitment: Uint8Array]
  | [instanceAddr: Uint8Array, commitment: Uint8Array];
