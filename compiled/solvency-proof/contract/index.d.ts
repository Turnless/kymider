import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum ClaimStatus { PENDING = 0, APPROVED = 1, REJECTED = 2 }

export enum AttestationStatus { NONE = 0, PASS = 1, FAIL = 2 }

export type Claim = { thresholdNetWorth: bigint;
                      maxDti: bigint;
                      status: ClaimStatus
                    };

export type Witnesses<PS> = {
  localSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  addLender(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateFacts(context: __compactRuntime.CircuitContext<PS>,
              balance_0: bigint,
              debts_0: bigint,
              income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  proveSolvency(context: __compactRuntime.CircuitContext<PS>,
                lender_0: Uint8Array,
                balance_0: bigint,
                debts_0: bigint,
                income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  requestClaim(context: __compactRuntime.CircuitContext<PS>,
               lender_0: Uint8Array,
               thresholdNetWorth_0: bigint,
               maxDti_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reject(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  addLender(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateFacts(context: __compactRuntime.CircuitContext<PS>,
              balance_0: bigint,
              debts_0: bigint,
              income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  proveSolvency(context: __compactRuntime.CircuitContext<PS>,
                lender_0: Uint8Array,
                balance_0: bigint,
                debts_0: bigint,
                income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  requestClaim(context: __compactRuntime.CircuitContext<PS>,
               lender_0: Uint8Array,
               thresholdNetWorth_0: bigint,
               maxDti_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reject(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  getDappPubKey(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  getDappPubKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  addLender(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateFacts(context: __compactRuntime.CircuitContext<PS>,
              balance_0: bigint,
              debts_0: bigint,
              income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  proveSolvency(context: __compactRuntime.CircuitContext<PS>,
                lender_0: Uint8Array,
                balance_0: bigint,
                debts_0: bigint,
                income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  requestClaim(context: __compactRuntime.CircuitContext<PS>,
               lender_0: Uint8Array,
               thresholdNetWorth_0: bigint,
               maxDti_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approve(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  reject(context: __compactRuntime.CircuitContext<PS>, lender_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly owner: Uint8Array;
  readonly commitment: Uint8Array;
  readonly verifierKey: Uint8Array;
  authorizedLenders: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  claims: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Claim;
    [Symbol.iterator](): Iterator<[Uint8Array, Claim]>
  };
  attestations: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): AttestationStatus;
    [Symbol.iterator](): Iterator<[Uint8Array, AttestationStatus]>
  };
  openClaims: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               initialBalance_0: bigint,
               initialDebts_0: bigint,
               initialIncome_0: bigint): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
