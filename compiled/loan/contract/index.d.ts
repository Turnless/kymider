import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum LoanStatus { APPLIED = 0,
                         ACTIVE = 1,
                         REPAID = 2,
                         DEFAULTED = 3,
                         DECLINED = 4,
                         OFFERED = 5
}

export enum Tier { NONE = 0, VERIFIED = 1, STANDARD = 2 }

export type LoanTerms = { principal: bigint;
                          interestBps: bigint;
                          installments: bigint;
                          periodSeconds: bigint
                        };

export type Quote = { thresholdNetWorth: bigint;
                      maxDti: bigint;
                      expiresAt: bigint
                    };

export type Witnesses<PS> = {
  localSk(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  paymentNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  factsSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  quoteTerms(context: __compactRuntime.CircuitContext<PS>,
             thresholdNetWorth_0: bigint,
             maxDti_0: bigint,
             expiresAt_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  underwrite(context: __compactRuntime.CircuitContext<PS>, collateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  decline(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  disburse(context: __compactRuntime.CircuitContext<PS>,
           now_0: bigint,
           owed_0: bigint,
           installment_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markDefault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>,
         expectedCollateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  declineOffer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  waiveProof(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveTier(context: __compactRuntime.CircuitContext<PS>,
            balance_0: bigint,
            debts_0: bigint,
            income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  quoteTerms(context: __compactRuntime.CircuitContext<PS>,
             thresholdNetWorth_0: bigint,
             maxDti_0: bigint,
             expiresAt_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  underwrite(context: __compactRuntime.CircuitContext<PS>, collateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  decline(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  disburse(context: __compactRuntime.CircuitContext<PS>,
           now_0: bigint,
           owed_0: bigint,
           installment_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markDefault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>,
         expectedCollateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  declineOffer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  waiveProof(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveTier(context: __compactRuntime.CircuitContext<PS>,
            balance_0: bigint,
            debts_0: bigint,
            income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  quoteLimit(): bigint;
  minQuoteSeconds(): bigint;
  getDappPubKey(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  quoteLimit(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  minQuoteSeconds(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  getDappPubKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  quoteTerms(context: __compactRuntime.CircuitContext<PS>,
             thresholdNetWorth_0: bigint,
             maxDti_0: bigint,
             expiresAt_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  underwrite(context: __compactRuntime.CircuitContext<PS>, collateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  decline(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  disburse(context: __compactRuntime.CircuitContext<PS>,
           now_0: bigint,
           owed_0: bigint,
           installment_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markDefault(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  accept(context: __compactRuntime.CircuitContext<PS>,
         expectedCollateral_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  declineOffer(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  waiveProof(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveTier(context: __compactRuntime.CircuitContext<PS>,
            balance_0: bigint,
            debts_0: bigint,
            income_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly borrower: Uint8Array;
  readonly lender: Uint8Array;
  readonly terms: LoanTerms;
  readonly factsCommitment: Uint8Array;
  readonly status: LoanStatus;
  readonly quote: Quote;
  readonly quoted: boolean;
  readonly quotesIssued: bigint;
  readonly tierProven: boolean;
  readonly tier: Tier;
  readonly tierExpiresAt: bigint;
  readonly collateralRequired: bigint;
  readonly offeredCollateral: bigint;
  readonly offeredTier: Tier;
  readonly balanceOwed: bigint;
  readonly installmentAmount: bigint;
  readonly nextDueAt: bigint;
  readonly paymentsMade: bigint;
  readonly latePayments: bigint;
  readonly disbursed: boolean;
  readonly historyCommitment: Uint8Array;
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
               lenderPk_0: Uint8Array,
               loanTerms_0: LoanTerms,
               commitment_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
