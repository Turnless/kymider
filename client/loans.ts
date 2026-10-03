// Kymider — off-chain client for the Wave 2 programs (MidnightJS).
//
// Facade over:
//   - one Loan instance per loan (lifecycle, tier proof, repayments)
//   - the shared LoanDirectory (index, repayment records, history proofs)
//
// Instantiate one LoanClient per wallet, like KymiderClient. The borrower
// deploys a Loan naming one lender, proves a tier and accepts (or declines)
// the lender's offer; the lender quotes, offers (underwrite), disburses and
// records the repayment. The client does the
// arithmetic the circuits check but cannot do (Compact has no division), so
// callers never pass a collateral, owed or installment figure themselves.
//
// Private state is scoped by contract address, so every method scopes the
// store to the instance it acts on before touching it.

import { randomBytes } from 'node:crypto';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import {
  decodeContractAddress,
  encodeContractAddress,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { Logger } from 'pino';
import {
  CompiledLoanContract,
  CompiledLoanDirectoryContract,
  ListingStatus,
  LoanStatus,
  Tier,
  loanDirectoryLedger,
  loanDirectoryPureCircuits,
  loanLedger,
  loanPureCircuits,
  solvencyLedger,
  type LoanContract,
  type LoanDirectoryContract,
  type LoanDirectoryLedger,
  type LoanLedger,
  type LoanTerms,
} from '../contracts/index.js';
import {
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  type LoanDirectoryPrivateState,
  type LoanPrivateState,
} from '../contracts/witnesses.js';
import type { KymiderProviders, LoanCircuits, LoanDirectoryCircuits } from './providers.js';
import { computeSolvency, type ClaimParams, type FinancialFacts } from './proof/solvencyProof.js';
import {
  amountDue,
  collateralFor,
  commitFacts,
  defaultableFrom,
  installmentFor,
  nowSeconds,
  owedFor,
  quoteRefusal,
  tierIsLive,
  underwriteRefusal,
} from './proof/loanMath.js';
import { bytesEqual } from './utils.js';
import { DEPLOY_CIRCUIT, emitReceipt, type TxSink } from './txlog.js';

export const LOAN_PRIVATE_STATE_ID = 'loan';
export const LOAN_DIRECTORY_PRIVATE_STATE_ID = 'loan-directory';

// Block time and the client's clock can disagree by a few seconds. Disburse
// asserts its start time is not in the future, so back-date it by this much.
const CLOCK_MARGIN_SECONDS = 60n;

export type Quote = ClaimParams & { ttlSeconds: bigint };

export type RepaidRecord = { loan: ContractAddress; lenderPk: Uint8Array };

export type ListingRow = {
  /** The directory key: listingKey(loan, borrower). */
  key: Uint8Array;
  loan: ContractAddress;
  borrower: Uint8Array;
  lender: Uint8Array;
  principal: bigint;
  status: ListingStatus;
  /**
   * Whether the listing's borrower and lender are the Loan instance's own
   * (set when `listings` is asked to reconcile; undefined otherwise). A
   * listing that does not match was made by someone other than the loan's
   * borrower, or names another lender: the directory cannot tell, a reader can.
   */
  matchesLoan?: boolean;
};

export class LoanClient {
  constructor(
    private readonly logger: Logger,
    readonly providers: KymiderProviders,
    private readonly loanPrivateStateId: string = LOAN_PRIVATE_STATE_ID,
    private readonly directoryPrivateStateId: string = LOAN_DIRECTORY_PRIVATE_STATE_ID,
    // Optional receipt sink: called once per finalized transaction this
    // client submits (deploys included) with its public tx data. See txlog.ts.
    private readonly onTx?: TxSink,
  ) {}

  // Same salt as every Kymider contract, so one key is one identity throughout.
  pubKeyOf(sk: Uint8Array): Uint8Array {
    return loanPureCircuits.getDappPubKey(sk);
  }

  // --- deployment ---------------------------------------------------------

  // Borrower: open a loan with one named lender. `commitment` is the public
  // commitment of the borrower's SolvencyProof instance; every tier proof in
  // this loan is checked against it. `factsSalt` is the salt that commitment
  // was blinded with (KymiderClient.factsOpening): it stays in this wallet's
  // private-state store and reaches proveTier through the `factsSalt` witness.
  // The history seed is fresh per loan and stays there too.
  async deployLoan(args: {
    sk: Uint8Array;
    lenderPk: Uint8Array;
    terms: LoanTerms;
    commitment: Uint8Array;
    factsSalt: Uint8Array;
    historySeed?: Uint8Array;
  }): Promise<ContractAddress> {
    const privateState = createLoanPrivateState(
      args.sk,
      args.historySeed ?? new Uint8Array(randomBytes(32)),
      args.factsSalt,
    );
    const deployed = await deployContract<LoanContract>(this.providers.loan, {
      compiledContract: CompiledLoanContract,
      privateStateId: this.loanPrivateStateId,
      initialPrivateState: privateState,
      args: [args.lenderPk, args.terms, args.commitment],
    });
    const address = deployed.deployTxData.public.contractAddress;
    emitReceipt(this.onTx, 'Loan', address, DEPLOY_CIRCUIT, deployed.deployTxData.public);
    await this.bindLoanPrivateState(address, privateState);
    this.logger.info(`Loan instance deployed at ${address}`);
    return address;
  }

  async deployLoanDirectory(sk: Uint8Array): Promise<ContractAddress> {
    const privateState = createLoanDirectoryPrivateState(sk);
    const deployed = await deployContract<LoanDirectoryContract>(this.providers.loanDirectory, {
      compiledContract: CompiledLoanDirectoryContract,
      privateStateId: this.directoryPrivateStateId,
      initialPrivateState: privateState,
    });
    const address = deployed.deployTxData.public.contractAddress;
    emitReceipt(this.onTx, 'LoanDirectory', address, DEPLOY_CIRCUIT, deployed.deployTxData.public);
    await this.bindLoanDirectoryPrivateState(address, privateState);
    this.logger.info(`LoanDirectory deployed at ${address}`);
    return address;
  }

  // A lender, or the borrower in a new process, binds its identity to a Loan
  // it did not deploy here. The lender's seed is never used (it never repays).
  async bindLoanPrivateState(address: ContractAddress, privateState: LoanPrivateState): Promise<void> {
    this.providers.loan.privateStateProvider.setContractAddress(address);
    await this.providers.loan.privateStateProvider.set(this.loanPrivateStateId, privateState);
  }

  async bindLoanDirectoryPrivateState(
    address: ContractAddress,
    privateState: LoanDirectoryPrivateState,
  ): Promise<void> {
    this.providers.loanDirectory.privateStateProvider.setContractAddress(address);
    await this.providers.loanDirectory.privateStateProvider.set(this.directoryPrivateStateId, privateState);
  }

  // --- lender -------------------------------------------------------------

  // Name the bar for the 110% tier and how long a proof against it holds
  // (at least 30 minutes). A loan takes at most quoteLimit() quotes, a live
  // VERIFIED tier cannot be re-quoted away, and neither can a live quote the
  // borrower has not answered yet. All are checked here first so the caller
  // gets the contract's answer without spending a proof on it.
  async quote(loan: ContractAddress, quote: Quote): Promise<bigint> {
    const state = await this.loanState(loan);
    if (state.quotesIssued >= loanPureCircuits.quoteLimit()) {
      throw new Error('quote limit reached');
    }
    const now = nowSeconds();
    const expiresAt = now + quote.ttlSeconds;
    const refusal = quoteRefusal(state, expiresAt, now);
    if (refusal) throw new Error(refusal);
    await this.callLoan(loan, 'quoteTerms', [quote.thresholdNetWorth, quote.maxDti, expiresAt]);
    return expiresAt;
  }

  // Offer the loan at the tier the borrower holds now, with the exact
  // collateral the circuit will take for it. The loan is OFFERED, not ACTIVE:
  // it binds once the borrower accepts. Refused before any quote, and refused
  // at 150% while the borrower's proof window is open (checked here first).
  async underwrite(loan: ContractAddress): Promise<{ tier: Tier; collateral: bigint }> {
    const state = await this.loanState(loan);
    const now = nowSeconds();
    const refusal = underwriteRefusal(state, now);
    if (refusal) throw new Error(refusal);
    const tier = tierIsLive(state, now) ? Tier.VERIFIED : Tier.STANDARD;
    const collateral = collateralFor(state.terms.principal, tier);
    await this.callLoan(loan, 'underwrite', [collateral]);
    this.logger.info(`Offered ${loan} at ${tierName(tier)}, collateral ${collateral}`);
    return { tier, collateral };
  }

  async decline(loan: ContractAddress): Promise<void> {
    await this.callLoan(loan, 'decline', []);
  }

  // Start the clock. Returns the figures the loan now carries.
  async disburse(loan: ContractAddress): Promise<{ owed: bigint; installment: bigint; start: bigint }> {
    const { terms } = await this.loanState(loan);
    const owed = owedFor(terms);
    const installment = installmentFor(owed, terms.installments);
    const start = nowSeconds() - CLOCK_MARGIN_SECONDS;
    await this.callLoan(loan, 'disburse', [start, owed, installment]);
    return { owed, installment, start };
  }

  // Refused on-chain until the grace period has passed; checked here first so
  // the caller gets a date rather than a failed proof.
  async markDefault(loan: ContractAddress): Promise<void> {
    const state = await this.loanState(loan);
    const from = defaultableFrom(state);
    if (nowSeconds() < from) {
      throw new Error(`installment is not past its grace period: a default is possible from ${from}`);
    }
    await this.callLoan(loan, 'markDefault', []);
  }

  // --- borrower -----------------------------------------------------------

  // Prove the committed facts against the lender's quote. The facts are
  // circuit inputs for the proof only, and the salt comes from private state
  // through the `factsSalt` witness; the verdict is what reaches the chain.
  // Once per quote. Both refusals are checked locally first, with the
  // contract's own words, so a doomed proof is never generated.
  async proveTier(loan: ContractAddress, facts: FinancialFacts): Promise<Tier> {
    const { quote, tierProven, factsCommitment } = await this.loanState(loan);
    if (tierProven) throw new Error('already proven against this quote');
    const { factsSalt } = await this.requireLoanPrivateState(loan);
    if (!bytesEqual(commitFacts(facts, factsSalt), factsCommitment)) {
      throw new Error('facts do not match committed facts');
    }
    const local = computeSolvency(facts, quote);
    this.logger.info(`Local verdict for ${loan}: ${local}`);
    await this.callLoan(loan, 'proveTier', [facts.balance, facts.debts, facts.income]);
    return (await this.loanState(loan)).tier;
  }

  // Answer the lender's quote without proving: the borrower takes the 150%
  // route and the lender may offer it at once. Reveals nothing about the facts.
  async waiveProof(loan: ContractAddress): Promise<void> {
    const { tierProven, quoted } = await this.loanState(loan);
    if (!quoted) throw new Error('the lender has not quoted yet');
    if (tierProven) throw new Error('already proven against this quote');
    await this.callLoan(loan, 'waiveProof', []);
  }

  // Make the lender's offer binding. `expectedCollateral` is the figure the
  // borrower was shown and agrees to; the circuit refuses any other ("offer
  // changed"), so the transcript names what was accepted.
  async acceptOffer(loan: ContractAddress, expectedCollateral: bigint): Promise<{ tier: Tier; collateral: bigint }> {
    const state = await this.loanState(loan);
    if (state.status !== LoanStatus.OFFERED) throw new Error('there is no offer to accept');
    if (state.offeredCollateral !== expectedCollateral) throw new Error('offer changed');
    await this.callLoan(loan, 'accept', [expectedCollateral]);
    this.logger.info(`Accepted ${loan} at ${tierName(state.offeredTier)}, collateral ${state.offeredCollateral}`);
    return { tier: state.offeredTier, collateral: state.offeredCollateral };
  }

  // Turn the offer down; the application is open again.
  async declineOffer(loan: ContractAddress): Promise<void> {
    const { status } = await this.loanState(loan);
    if (status !== LoanStatus.OFFERED) throw new Error('there is no offer to decline');
    await this.callLoan(loan, 'declineOffer', []);
  }

  // Pay the installment due (or the remainder). Returns the amount paid.
  async repay(loan: ContractAddress): Promise<bigint> {
    const amount = amountDue(await this.loanState(loan));
    await this.callLoan(loan, 'repay', [amount]);
    return amount;
  }

  // Midnight has no cross-contract reads, so a lender checks this before
  // quoting: the facts this loan binds are the ones the borrower's
  // SolvencyProof instance publishes.
  async factsMatchSolvencyProof(loan: ContractAddress, solvency: ContractAddress): Promise<boolean> {
    const [l, s] = await Promise.all([
      this.loanState(loan),
      this.providers.solvency.publicDataProvider.queryContractState(solvency),
    ]);
    if (!s) throw new Error(`no contract state for ${solvency}`);
    return bytesEqual(l.factsCommitment, solvencyLedger(s.data).commitment);
  }

  // --- directory ----------------------------------------------------------

  async listLoan(directory: ContractAddress, loan: ContractAddress): Promise<void> {
    const state = await this.loanState(loan);
    await this.callDirectory(directory, 'list', [
      encodeContractAddress(loan),
      state.lender,
      state.terms.principal,
    ]);
  }

  // The directory key of a loan's real listing: the one under the Loan
  // instance's own borrower key. A listing of the same address under any
  // other key is someone else's and is ignored.
  async listingKeyOf(loan: ContractAddress): Promise<Uint8Array> {
    const { borrower } = await this.loanState(loan);
    return loanDirectoryPureCircuits.listingKey(encodeContractAddress(loan), borrower);
  }

  // Either party moves the loan's real listing (see listingKeyOf). The
  // directory refuses DEFAULTED: a default is the Loan's own status.
  async updateListingStatus(
    directory: ContractAddress,
    loan: ContractAddress,
    status: ListingStatus,
  ): Promise<void> {
    await this.callDirectory(directory, 'updateStatus', [await this.listingKeyOf(loan), status]);
  }

  // Lender: record a repaid loan as a private leaf, on the listing under the
  // Loan's own borrower. Refused on-chain unless the caller is its lender.
  async recordRepaid(directory: ContractAddress, loan: ContractAddress): Promise<void> {
    await this.callDirectory(directory, 'recordRepaid', [await this.listingKeyOf(loan)]);
  }

  // Borrower: prove two repaid loans for a new application. The loans and
  // lenders are private inputs; the directory learns only the count.
  async proveTwoRepaid(
    directory: ContractAddress,
    forLoan: ContractAddress,
    a: RepaidRecord,
    b: RepaidRecord,
  ): Promise<void> {
    const sk = (await this.requireDirectoryPrivateState(directory)).sk;
    const me = this.pubKeyOf(sk);
    const state = await this.directoryState(directory);
    const pathOf = (r: RepaidRecord) => {
      const leaf = loanDirectoryPureCircuits.repaidLeaf(me, encodeContractAddress(r.loan), r.lenderPk);
      const path = state.repaid.findPathForLeaf(leaf);
      if (!path) throw new Error(`no repayment record for ${r.loan} under this borrower and lender`);
      return path;
    };
    await this.callDirectory(directory, 'proveTwoRepaid', [
      encodeContractAddress(forLoan),
      encodeContractAddress(a.loan),
      a.lenderPk,
      pathOf(a),
      encodeContractAddress(b.loan),
      b.lenderPk,
      pathOf(b),
    ]);
  }

  // --- read-only queries --------------------------------------------------

  async loanState(address: ContractAddress): Promise<LoanLedger> {
    const state = await this.providers.loan.publicDataProvider.queryContractState(address);
    if (!state) throw new Error(`no contract state for ${address}`);
    return loanLedger(state.data);
  }

  async directoryState(address: ContractAddress): Promise<LoanDirectoryLedger> {
    const state = await this.providers.loanDirectory.publicDataProvider.queryContractState(address);
    if (!state) throw new Error(`no contract state for ${address}`);
    return loanDirectoryLedger(state.data);
  }

  // Every listing in the directory. With `reconcile`, each row is checked
  // against its Loan instance (listingMatchesLoan) and carries `matchesLoan`:
  // the directory cannot read the Loan, so this is where a squatted or
  // mislabelled listing is caught.
  async listings(directory: ContractAddress, opts: { reconcile?: boolean } = {}): Promise<ListingRow[]> {
    const state = await this.directoryState(directory);
    const rows: ListingRow[] = [];
    for (const [key, value] of state.listings) {
      rows.push({
        key: key as Uint8Array,
        loan: decodeContractAddress(value.loan),
        borrower: value.borrower,
        lender: value.lender,
        principal: value.principal,
        status: value.status,
      });
    }
    if (opts.reconcile) {
      for (const row of rows) row.matchesLoan = await this.listingMatchesLoan(row);
    }
    return rows;
  }

  // A listing is the loan's own only if its borrower and lender are the Loan
  // instance's `borrower` and `lender` (and it sits under that borrower's
  // key). False when they differ or the address holds no Loan.
  async listingMatchesLoan(row: Pick<ListingRow, 'key' | 'loan' | 'borrower' | 'lender'>): Promise<boolean> {
    let loan: LoanLedger;
    try {
      loan = await this.loanState(row.loan);
    } catch {
      return false;
    }
    const key = loanDirectoryPureCircuits.listingKey(encodeContractAddress(row.loan), loan.borrower);
    return bytesEqual(row.borrower, loan.borrower) && bytesEqual(row.lender, loan.lender) && bytesEqual(row.key, key);
  }

  // The count proven for the loan's real listing (under its own borrower).
  async historyProofCount(directory: ContractAddress, forLoan: ContractAddress): Promise<bigint> {
    const state = await this.directoryState(directory);
    const key = await this.listingKeyOf(forLoan);
    return state.historyProofs.member(key) ? state.historyProofs.lookup(key) : 0n;
  }

  // --- submission ---------------------------------------------------------

  async callLoan<K extends LoanCircuits>(
    loan: ContractAddress,
    circuitId: K,
    args: LoanCircuitArgs[K],
  ): Promise<void> {
    this.providers.loan.privateStateProvider.setContractAddress(loan);
    const finalized = await submitCallTx<LoanContract, LoanCircuits>(this.providers.loan, {
      compiledContract: CompiledLoanContract,
      contractAddress: loan,
      privateStateId: this.loanPrivateStateId,
      circuitId,
      args: args as LoanCircuitArgs[LoanCircuits],
    });
    emitReceipt(this.onTx, 'Loan', loan, circuitId, finalized.public);
  }

  async callDirectory<K extends LoanDirectoryCircuits>(
    directory: ContractAddress,
    circuitId: K,
    args: LoanDirectoryCircuitArgs[K],
  ): Promise<void> {
    this.providers.loanDirectory.privateStateProvider.setContractAddress(directory);
    const finalized = await submitCallTx<LoanDirectoryContract, LoanDirectoryCircuits>(this.providers.loanDirectory, {
      compiledContract: CompiledLoanDirectoryContract,
      contractAddress: directory,
      privateStateId: this.directoryPrivateStateId,
      circuitId,
      args: args as LoanDirectoryCircuitArgs[LoanDirectoryCircuits],
    });
    emitReceipt(this.onTx, 'LoanDirectory', directory, circuitId, finalized.public);
  }

  private async requireLoanPrivateState(loan: ContractAddress): Promise<LoanPrivateState> {
    const provider = this.providers.loan.privateStateProvider;
    provider.setContractAddress(loan);
    const state: LoanPrivateState | null = await provider.get(this.loanPrivateStateId);
    if (!state) {
      throw new Error(`no Loan private state for ${loan}: call deployLoan or bindLoanPrivateState first`);
    }
    return state;
  }

  private async requireDirectoryPrivateState(directory: ContractAddress): Promise<LoanDirectoryPrivateState> {
    const provider = this.providers.loanDirectory.privateStateProvider;
    provider.setContractAddress(directory);
    const state: LoanDirectoryPrivateState | null = await provider.get(this.directoryPrivateStateId);
    if (!state) {
      throw new Error(
        `no LoanDirectory private state for ${directory}: call deployLoanDirectory or bindLoanDirectoryPrivateState first`,
      );
    }
    return state;
  }
}

// Argument tuples per circuit, in lock-step with the compiled signatures.
type LoanContractCircuits = LoanContract<LoanPrivateState>['provableCircuits'];
type LoanDirectoryContractCircuits = LoanDirectoryContract<LoanDirectoryPrivateState>['provableCircuits'];
type Rest<F> = F extends (ctx: never, ...rest: infer A) => unknown ? A : never;
type LoanCircuitArgs = { [K in LoanCircuits]: Rest<LoanContractCircuits[K]> };
type LoanDirectoryCircuitArgs = { [K in LoanDirectoryCircuits]: Rest<LoanDirectoryContractCircuits[K]> };

export function tierName(t: Tier): string {
  if (t === Tier.VERIFIED) return 'VERIFIED (110%)';
  if (t === Tier.STANDARD) return 'STANDARD (150%)';
  return 'NONE';
}
