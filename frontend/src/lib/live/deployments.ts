/**
 * Deployment records: which contract instances exist on which network, and
 * the transactions that put them there.
 *
 * The deploy job (CI) writes `frontend/public/deployments/<network>.json`;
 * the console serves it at `<base>/deployments/<network>.json`. The schema is
 * documented in `frontend/public/deployments/README.md`. Nothing here invents
 * an address: a missing file is reported as "not deployed", never filled in.
 *
 * `parseDeployment` is pure (no DOM, no fetch) so the unit tests and a Node
 * script can validate a file the same way the console does.
 */

import { normalizeAddress } from './decode';

export type NetworkKey = 'preprod' | 'preview' | 'local';

export type NetworkInfo = {
  key: NetworkKey;
  label: string;
  /** The network id a wallet reports for this network. */
  networkId: string;
  /** Default indexer endpoints; the deployment file may override them. */
  indexer: string;
  indexerWS: string;
};

// Same endpoints as client/config.ts, so the console and the Node client read
// the same indexers.
export const NETWORKS: Record<NetworkKey, NetworkInfo> = {
  preprod: {
    key: 'preprod',
    label: 'Preprod',
    networkId: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  preview: {
    key: 'preview',
    label: 'Preview',
    networkId: 'preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
  local: {
    key: 'local',
    label: 'Local devnet',
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  },
};

export const NETWORK_ORDER: readonly NetworkKey[] = ['preprod', 'preview', 'local'];

export type DeploymentTx = {
  label: string;
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  contract?: string;
};

export type Deployment = {
  network: string;
  indexer: string;
  indexerWS: string;
  generatedAt: string;
  contracts: {
    solvencyProof?: string;
    registry?: string;
    loanDirectory?: string;
    loans?: string[];
  };
  txs: DeploymentTx[];
};

export class DeploymentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentFormatError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (o: Record<string, unknown>, key: string, where: string): string => {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new DeploymentFormatError(`${where}.${key} must be a non-empty string`);
  }
  return v;
};

const optStr = (o: Record<string, unknown>, key: string, where: string): string | undefined => {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.length === 0) {
    throw new DeploymentFormatError(`${where}.${key} must be a string when present`);
  }
  return v;
};

const optAddress = (o: Record<string, unknown>, key: string, where: string): string | undefined => {
  const v = optStr(o, key, where);
  if (v === undefined) return undefined;
  try {
    return normalizeAddress(v);
  } catch {
    throw new DeploymentFormatError(`${where}.${key} is not a hex contract address`);
  }
};

/**
 * Validate a parsed deployment file. Addresses come back normalized (bare
 * lowercase hex) so they can go straight to the indexer.
 */
export function parseDeployment(raw: unknown): Deployment {
  if (!isObject(raw)) throw new DeploymentFormatError('deployment must be a JSON object');
  const contractsRaw = raw['contracts'];
  if (!isObject(contractsRaw)) throw new DeploymentFormatError('deployment.contracts must be an object');
  const txsRaw = raw['txs'] ?? [];
  if (!Array.isArray(txsRaw)) throw new DeploymentFormatError('deployment.txs must be an array');

  const loansRaw = contractsRaw['loans'] ?? [];
  if (!Array.isArray(loansRaw)) throw new DeploymentFormatError('contracts.loans must be an array');
  const loans = loansRaw.map((l, i) => {
    if (typeof l !== 'string') throw new DeploymentFormatError(`contracts.loans[${i}] must be a string`);
    try {
      return normalizeAddress(l);
    } catch {
      throw new DeploymentFormatError(`contracts.loans[${i}] is not a hex contract address`);
    }
  });

  const txs = txsRaw.map((t, i): DeploymentTx => {
    const where = `txs[${i}]`;
    if (!isObject(t)) throw new DeploymentFormatError(`${where} must be an object`);
    const height = t['blockHeight'];
    if (height !== undefined && (typeof height !== 'number' || !Number.isInteger(height) || height < 0)) {
      throw new DeploymentFormatError(`${where}.blockHeight must be a non-negative integer`);
    }
    const tx: DeploymentTx = { label: str(t, 'label', where) };
    const txId = optStr(t, 'txId', where);
    const txHash = optStr(t, 'txHash', where);
    const contract = optAddress(t, 'contract', where);
    if (txId !== undefined) tx.txId = txId;
    if (txHash !== undefined) tx.txHash = txHash;
    if (typeof height === 'number') tx.blockHeight = height;
    if (contract !== undefined) tx.contract = contract;
    return tx;
  });

  const contracts: Deployment['contracts'] = { loans };
  const sp = optAddress(contractsRaw, 'solvencyProof', 'contracts');
  const reg = optAddress(contractsRaw, 'registry', 'contracts');
  const dir = optAddress(contractsRaw, 'loanDirectory', 'contracts');
  if (sp !== undefined) contracts.solvencyProof = sp;
  if (reg !== undefined) contracts.registry = reg;
  if (dir !== undefined) contracts.loanDirectory = dir;

  return {
    network: str(raw, 'network', 'deployment'),
    indexer: str(raw, 'indexer', 'deployment'),
    indexerWS: str(raw, 'indexerWS', 'deployment'),
    generatedAt: str(raw, 'generatedAt', 'deployment'),
    contracts,
    txs,
  };
}

/** Every contract in a deployment, in display order, with the kind to decode it as. */
export type DeployedContract = {
  kind: 'solvencyProof' | 'registry' | 'loanDirectory' | 'loan';
  label: string;
  address: string;
};

export function deployedContracts(d: Deployment): DeployedContract[] {
  const out: DeployedContract[] = [];
  if (d.contracts.solvencyProof) {
    out.push({ kind: 'solvencyProof', label: 'SolvencyProof', address: d.contracts.solvencyProof });
  }
  if (d.contracts.registry) {
    out.push({ kind: 'registry', label: 'Registry', address: d.contracts.registry });
  }
  if (d.contracts.loanDirectory) {
    out.push({ kind: 'loanDirectory', label: 'LoanDirectory', address: d.contracts.loanDirectory });
  }
  (d.contracts.loans ?? []).forEach((address, i) =>
    out.push({ kind: 'loan', label: `Loan ${i + 1}`, address }),
  );
  return out;
}

export type DeploymentLoad =
  | { state: 'found'; deployment: Deployment; url: string }
  | { state: 'missing'; url: string }
  | { state: 'invalid'; url: string; error: string };

/** `<base>/deployments/<network>.json`, honouring the GitHub Pages base path. */
export const deploymentUrl = (network: NetworkKey, base = '/'): string =>
  `${base.endsWith('/') ? base : base + '/'}deployments/${network}.json`;

/**
 * Fetch and validate a deployment file. A 404 — or the SPA fallback page some
 * hosts serve in its place — is "missing", not an error: the deploy job simply
 * has not written it yet.
 */
export async function loadDeployment(
  network: NetworkKey,
  options: { base?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DeploymentLoad> {
  const url = deploymentUrl(network, options.base ?? '/');
  const doFetch = options.fetchImpl ?? fetch;
  // GitHub Pages caches for minutes; a fresh deploy should show at once.
  const res = await doFetch(`${url}?t=${Date.now()}`, { signal: options.signal });
  if (res.status === 404) return { state: 'missing', url };
  if (!res.ok) return { state: 'invalid', url, error: `HTTP ${res.status}` };
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html')) return { state: 'missing', url };
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { state: 'invalid', url, error: 'not valid JSON' };
  }
  try {
    return { state: 'found', deployment: parseDeployment(raw), url };
  } catch (e) {
    return { state: 'invalid', url, error: e instanceof Error ? e.message : String(e) };
  }
}
