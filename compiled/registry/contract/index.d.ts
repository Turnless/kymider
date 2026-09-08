import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum BorrowStatus { UNREGISTERED = 0, ACTIVE = 1, SUSPENDED = 2 }

export type BorrowerRecord = { instanceAddr: Uint8Array;
                               commitment: Uint8Array;
                               status: BorrowStatus
                             };

export type Witnesses<PS> = {
  localSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  register(context: __compactRuntime.CircuitContext<PS>,
           instanceAddr_0: Uint8Array,
           commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCommitment(context: __compactRuntime.CircuitContext<PS>,
                   commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  suspend(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  register(context: __compactRuntime.CircuitContext<PS>,
           instanceAddr_0: Uint8Array,
           commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCommitment(context: __compactRuntime.CircuitContext<PS>,
                   commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  suspend(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  getDappPubKey(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  getDappPubKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  register(context: __compactRuntime.CircuitContext<PS>,
           instanceAddr_0: Uint8Array,
           commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateCommitment(context: __compactRuntime.CircuitContext<PS>,
                   commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  suspend(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  borrowers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): BorrowerRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, BorrowerRecord]>
  };
  readonly borrowerCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
