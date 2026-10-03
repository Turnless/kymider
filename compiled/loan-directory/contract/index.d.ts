import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum ListingStatus { OPEN = 0,
                            ACTIVE = 1,
                            REPAID = 2,
                            DEFAULTED = 3,
                            CLOSED = 4
}

export type Listing = { loan: Uint8Array;
                        borrower: Uint8Array;
                        lender: Uint8Array;
                        principal: bigint;
                        status: ListingStatus
                      };

export type Witnesses<PS> = {
  localSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  list(context: __compactRuntime.CircuitContext<PS>,
       loanAddr_0: Uint8Array,
       lenderPk_0: Uint8Array,
       principal_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  updateStatus(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array,
               status_0: ListingStatus): __compactRuntime.CircuitResults<PS, []>;
  recordRepaid(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveTwoRepaid(context: __compactRuntime.CircuitContext<PS>,
                 forLoan_0: Uint8Array,
                 loanA_0: Uint8Array,
                 lenderA_0: Uint8Array,
                 pathA_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          },
                 loanB_0: Uint8Array,
                 lenderB_0: Uint8Array,
                 pathB_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  list(context: __compactRuntime.CircuitContext<PS>,
       loanAddr_0: Uint8Array,
       lenderPk_0: Uint8Array,
       principal_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  updateStatus(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array,
               status_0: ListingStatus): __compactRuntime.CircuitResults<PS, []>;
  recordRepaid(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveTwoRepaid(context: __compactRuntime.CircuitContext<PS>,
                 forLoan_0: Uint8Array,
                 loanA_0: Uint8Array,
                 lenderA_0: Uint8Array,
                 pathA_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          },
                 loanB_0: Uint8Array,
                 lenderB_0: Uint8Array,
                 pathB_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  getDappPubKey(sk_0: Uint8Array): Uint8Array;
  repaidLeaf(borrowerPk_0: Uint8Array,
             loanAddr_0: Uint8Array,
             lenderPk_0: Uint8Array): Uint8Array;
  listingKey(loanAddr_0: Uint8Array, borrowerPk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  getDappPubKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  repaidLeaf(context: __compactRuntime.CircuitContext<PS>,
             borrowerPk_0: Uint8Array,
             loanAddr_0: Uint8Array,
             lenderPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  listingKey(context: __compactRuntime.CircuitContext<PS>,
             loanAddr_0: Uint8Array,
             borrowerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  list(context: __compactRuntime.CircuitContext<PS>,
       loanAddr_0: Uint8Array,
       lenderPk_0: Uint8Array,
       principal_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  updateStatus(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array,
               status_0: ListingStatus): __compactRuntime.CircuitResults<PS, []>;
  recordRepaid(context: __compactRuntime.CircuitContext<PS>,
               listing_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveTwoRepaid(context: __compactRuntime.CircuitContext<PS>,
                 forLoan_0: Uint8Array,
                 loanA_0: Uint8Array,
                 lenderA_0: Uint8Array,
                 pathA_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          },
                 loanB_0: Uint8Array,
                 lenderB_0: Uint8Array,
                 pathB_0: { leaf: Uint8Array,
                            path: { sibling: { field: bigint },
                                    goes_left: boolean
                                  }[]
                          }): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  listings: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Listing;
    [Symbol.iterator](): Iterator<[Uint8Array, Listing]>
  };
  readonly listingCount: bigint;
  repaid: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  recordedLoans: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  historyProofs: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
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
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
