// Kymider — the deployments file: frontend/public/deployments/<network>.json.
//
// Written by `prove:onchain`, read by `verify:onchain` and by the console's
// read-only on-chain view. The shape is a contract with the console, so it is
// built field by field here and validated on the way back in:
//
//   { network, indexer, indexerWS, generatedAt,
//     contracts: { solvencyProof, registry, loanDirectory, loans: string[] },
//     txs: [{ label, txId, txHash, blockHeight, contract }],
//     refusals: [{ label, contract, circuit, message }] }
//
// `refusals` are calls the run made on purpose that the circuit refused before
// anything was proved or submitted: no hash, only the contract's message.
// Optional when read back (older files have none).
//
// `contracts.loans` is ordered: loan A (VERIFIED, 110%), loan B (STANDARD,
// 150%), loan C (the application carrying the history proof).

import fs from 'node:fs';
import path from 'node:path';
import type { TxReceipt } from '../../client/txlog.js';

export type DeploymentTx = {
  label: string;
  txId: string;
  txHash: string;
  blockHeight: number;
  contract: string;
};

/** A call the circuit refused before submission: what was tried and the assert message. */
export type DeploymentRefusal = {
  label: string;
  contract: string;
  circuit: string;
  message: string;
};

export type DeployedContracts = {
  solvencyProof: string;
  registry: string;
  loanDirectory: string;
  loans: string[];
};

export type Deployments = {
  network: string;
  indexer: string;
  indexerWS: string;
  generatedAt: string;
  contracts: DeployedContracts;
  txs: DeploymentTx[];
  refusals: DeploymentRefusal[];
};

export const DEPLOYMENTS_DIR = path.join('frontend', 'public', 'deployments');

export function deploymentsPath(network: string, root: string = process.cwd()): string {
  if (!/^[a-z0-9-]+$/.test(network)) {
    throw new Error(`not a network name: ${JSON.stringify(network)}`);
  }
  return path.resolve(root, DEPLOYMENTS_DIR, `${network}.json`);
}

export function toDeploymentTx(r: TxReceipt): DeploymentTx {
  return {
    label: r.label,
    txId: r.txId,
    txHash: r.txHash,
    blockHeight: r.blockHeight,
    contract: r.contract,
  };
}

export function buildDeployments(args: {
  network: string;
  indexer: string;
  indexerWS: string;
  generatedAt: Date | string;
  contracts: DeployedContracts;
  receipts: readonly TxReceipt[];
  refusals?: readonly DeploymentRefusal[];
}): Deployments {
  return {
    network: args.network,
    indexer: args.indexer,
    indexerWS: args.indexerWS,
    generatedAt:
      typeof args.generatedAt === 'string' ? args.generatedAt : args.generatedAt.toISOString(),
    contracts: {
      solvencyProof: args.contracts.solvencyProof,
      registry: args.contracts.registry,
      loanDirectory: args.contracts.loanDirectory,
      loans: [...args.contracts.loans],
    },
    txs: args.receipts.map(toDeploymentTx),
    refusals: (args.refusals ?? []).map((r) => ({
      label: r.label,
      contract: r.contract,
      circuit: r.circuit,
      message: r.message,
    })),
  };
}

export function serializeDeployments(d: Deployments): string {
  return `${JSON.stringify(d, null, 2)}\n`;
}

// --- reading it back -------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${where}.${key}: expected a non-empty string`);
  }
  return v;
}

/** Validate a parsed deployments file; throws naming the first bad field. */
export function parseDeployments(value: unknown): Deployments {
  if (!isObject(value)) throw new Error('deployments: expected an object');
  const contracts = value['contracts'];
  if (!isObject(contracts)) throw new Error('deployments.contracts: expected an object');
  const loans = contracts['loans'];
  if (!Array.isArray(loans) || loans.some((l) => typeof l !== 'string' || l.length === 0)) {
    throw new Error('deployments.contracts.loans: expected an array of addresses');
  }
  const txs = value['txs'];
  if (!Array.isArray(txs)) throw new Error('deployments.txs: expected an array');
  const refusals = value['refusals'] ?? [];
  if (!Array.isArray(refusals)) throw new Error('deployments.refusals: expected an array');

  return {
    network: str(value, 'network', 'deployments'),
    indexer: str(value, 'indexer', 'deployments'),
    indexerWS: str(value, 'indexerWS', 'deployments'),
    generatedAt: str(value, 'generatedAt', 'deployments'),
    contracts: {
      solvencyProof: str(contracts, 'solvencyProof', 'deployments.contracts'),
      registry: str(contracts, 'registry', 'deployments.contracts'),
      loanDirectory: str(contracts, 'loanDirectory', 'deployments.contracts'),
      loans: loans as string[],
    },
    txs: txs.map((t, i) => {
      const where = `deployments.txs[${i}]`;
      if (!isObject(t)) throw new Error(`${where}: expected an object`);
      const blockHeight = t['blockHeight'];
      if (typeof blockHeight !== 'number' || !Number.isInteger(blockHeight) || blockHeight < 0) {
        throw new Error(`${where}.blockHeight: expected a block number`);
      }
      return {
        label: str(t, 'label', where),
        txId: str(t, 'txId', where),
        txHash: str(t, 'txHash', where),
        blockHeight,
        contract: str(t, 'contract', where),
      };
    }),
    refusals: refusals.map((r, i) => {
      const where = `deployments.refusals[${i}]`;
      if (!isObject(r)) throw new Error(`${where}: expected an object`);
      return {
        label: str(r, 'label', where),
        contract: str(r, 'contract', where),
        circuit: str(r, 'circuit', where),
        message: str(r, 'message', where),
      };
    }),
  };
}

export function readDeployments(file: string): Deployments {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found: run \`npm run prove:onchain\` for this network first`);
  }
  return parseDeployments(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function writeDeployments(file: string, d: Deployments): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeDeployments(d), 'utf8');
}
