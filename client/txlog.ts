// Kymider — transaction receipts.
//
// Every state-changing call in KymiderClient and LoanClient ends in a
// finalized transaction. midnight-js hands back its public data
// (`FinalizedTxData`: txId, txHash, blockHash, blockHeight, blockTimestamp,
// status, fees, ...) next to private data (proof inputs, private state,
// signing keys). A receipt copies the PUBLIC fields only, field by field, so
// nothing private can reach a log, PROOF.md or a deployments file by way of a
// spread or a JSON.stringify of the whole object.
//
// The clients take an optional `TxSink` and call it once per finalized
// transaction; their method return types are unchanged. `TxLog` is the
// ready-made sink: it collects receipts in order and lets a script name the
// step that produced them.

import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';

export type ContractName = 'SolvencyProof' | 'Registry' | 'Loan' | 'LoanDirectory';

/** Circuit name used for a deployment (the contract's constructor). */
export const DEPLOY_CIRCUIT = 'deploy';

export type TxReceipt = {
  /** What the step was, in words. Defaults to `<contractName>.<circuit>`. */
  label: string;
  contractName: ContractName;
  /** The contract address the transaction deployed or called. */
  contract: string;
  /** Circuit called, or `deploy` for a deployment. */
  circuit: string;
  txId: string;
  txHash: string;
  blockHeight: number;
  blockHash: string;
  /** Block timestamp as the indexer reports it. */
  blockTimestamp: number;
  /** SucceedEntirely | FailFallible | FailEntirely. */
  status: string;
  paidFees: string;
};

export type TxSink = (receipt: TxReceipt) => void;

/** The public fields of a finalized transaction that a receipt keeps. */
export type PublicTxFields = Pick<
  FinalizedTxData,
  'txId' | 'txHash' | 'blockHeight' | 'blockHash' | 'blockTimestamp' | 'status'
> & { fees?: Pick<FinalizedTxData['fees'], 'paidFees'> };

/** Build a receipt from a finalized transaction's public data. */
export function receiptOf(
  contractName: ContractName,
  contract: string,
  circuit: string,
  tx: PublicTxFields,
  label?: string,
): TxReceipt {
  return {
    label: label ?? `${contractName}.${circuit}`,
    contractName,
    contract: String(contract),
    circuit,
    txId: String(tx.txId),
    txHash: String(tx.txHash),
    blockHeight: Number(tx.blockHeight),
    blockHash: String(tx.blockHash),
    blockTimestamp: Number(tx.blockTimestamp),
    status: String(tx.status),
    paidFees: String(tx.fees?.paidFees ?? ''),
  };
}

/**
 * Hand a receipt to the sink, if there is one. A sink that throws must not
 * turn a transaction that is already final into a failed call, so errors are
 * reported and swallowed.
 */
export function emitReceipt(
  sink: TxSink | undefined,
  contractName: ContractName,
  contract: string,
  circuit: string,
  tx: PublicTxFields,
): void {
  if (!sink) return;
  try {
    sink(receiptOf(contractName, contract, circuit, tx));
  } catch (err) {
    console.error(`tx receipt sink failed for ${contractName}.${circuit} (${tx.txHash}):`, err);
  }
}

/**
 * Collects receipts in submission order.
 *
 *   const log = new TxLog();
 *   const client = new LoanClient(logger, providers, undefined, undefined, log.sink);
 *   await log.step('Lender underwrites loan A', () => lender.underwrite(loanA));
 *
 * Receipts emitted while a step runs carry its label; others keep the default
 * `<contract>.<circuit>` label.
 */
export class TxLog {
  readonly receipts: TxReceipt[] = [];
  private current: string | undefined;

  constructor(private readonly onReceipt?: (receipt: TxReceipt) => void) {}

  readonly sink: TxSink = (receipt) => {
    const labelled = this.current ? { ...receipt, label: this.current } : receipt;
    this.receipts.push(labelled);
    this.onReceipt?.(labelled);
  };

  /** Run `fn`, labelling every receipt it produces with `label`. */
  async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.current;
    this.current = label;
    try {
      return await fn();
    } finally {
      this.current = previous;
    }
  }
}
