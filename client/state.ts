// Kymider — deployment state shared between the CLI entry points.
//
// `deploy.ts` writes it; `demo.ts` reads it, so a demo run can act on an
// instance deployed by an earlier process. Contains addresses and the
// (self-reported, demo) facts with the salt that blinds their commitment —
// never a secret key, which lives in the separate identity file (see
// identity.ts). The salt is as private as the facts: anyone holding both can
// open the on-chain commitment. The file is gitignored and stays local.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { FinancialFacts } from './proof/solvencyProof.js';
import type { FactsOpening } from '../contracts/witnesses.js';
import { bytesToHex, hexToBytes } from './utils.js';

export const DEFAULT_STATE_FILE = '.midnight-state.json';

export type DeploymentState = {
  network: string;
  solvencyAddress: ContractAddress;
  registryAddress: ContractAddress;
  /** The opening of the instance's commitment: facts and salt (hex). */
  facts: { balance: string; debts: string; income: string; salt: string };
};

export async function writeDeploymentState(
  state: DeploymentState,
  file: string = DEFAULT_STATE_FILE,
): Promise<void> {
  await fsp.writeFile(path.resolve(process.cwd(), file), JSON.stringify(state, null, 2));
}

// Returns null when there is no usable state for `network` — an absent file, a
// deployment from a different network, or an unreadable/!partial file. Callers
// treat null as "deploy fresh". A file without a salt predates the salted
// commitment: its instance runs the old circuits, so it is not usable either.
export function readDeploymentState(
  network: string,
  file: string = DEFAULT_STATE_FILE,
): DeploymentState | null {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Partial<DeploymentState>;
    if (
      parsed.network !== network ||
      !parsed.solvencyAddress ||
      !parsed.registryAddress ||
      !parsed.facts ||
      typeof parsed.facts.salt !== 'string' ||
      parsed.facts.salt.length !== 64
    ) {
      return null;
    }
    return parsed as DeploymentState;
  } catch {
    return null;
  }
}

export function factsFromState(state: DeploymentState): FactsOpening {
  return {
    balance: BigInt(state.facts.balance),
    debts: BigInt(state.facts.debts),
    income: BigInt(state.facts.income),
    salt: hexToBytes(state.facts.salt),
  };
}

export function factsToState(facts: FinancialFacts, salt: Uint8Array): DeploymentState['facts'] {
  return {
    balance: facts.balance.toString(),
    debts: facts.debts.toString(),
    income: facts.income.toString(),
    salt: bytesToHex(salt),
  };
}

// --- Wave 2 ---------------------------------------------------------------
//
// The loan CLIs keep their own file: the shared LoanDirectory, and the loans
// this borrower has repaid and had recorded there. A repaid record is what a
// later application proves against, so the demo can show a history proof on
// its second run. Addresses and public keys only, never a secret.

export const DEFAULT_LOAN_STATE_FILE = '.midnight-loans.json';

export type LoanDeploymentState = {
  network: string;
  directoryAddress: ContractAddress;
  repaid: { loan: ContractAddress; lenderPk: string }[];
};

export async function writeLoanState(
  state: LoanDeploymentState,
  file: string = DEFAULT_LOAN_STATE_FILE,
): Promise<void> {
  await fsp.writeFile(path.resolve(process.cwd(), file), JSON.stringify(state, null, 2));
}

// Null for an absent file, another network's deployment, or an unreadable one.
export function readLoanState(
  network: string,
  file: string = DEFAULT_LOAN_STATE_FILE,
): LoanDeploymentState | null {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Partial<LoanDeploymentState>;
    if (parsed.network !== network || !parsed.directoryAddress) {
      return null;
    }
    return { network, directoryAddress: parsed.directoryAddress, repaid: parsed.repaid ?? [] };
  } catch {
    return null;
  }
}
