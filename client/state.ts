// Kymider — deployment state shared between the CLI entry points.
//
// `deploy.ts` writes it; `demo.ts` reads it, so a demo run can act on an
// instance deployed by an earlier process. Contains addresses and the
// (self-reported, demo) facts only — never a secret key, which lives in the
// separate identity file (see identity.ts).

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { FinancialFacts } from './proof/solvencyProof.js';

export const DEFAULT_STATE_FILE = '.midnight-state.json';

export type DeploymentState = {
  network: string;
  solvencyAddress: ContractAddress;
  registryAddress: ContractAddress;
  facts: { balance: string; debts: string; income: string };
};

export async function writeDeploymentState(
  state: DeploymentState,
  file: string = DEFAULT_STATE_FILE,
): Promise<void> {
  await fsp.writeFile(path.resolve(process.cwd(), file), JSON.stringify(state, null, 2));
}

// Returns null when there is no usable state for `network` — an absent file, a
// deployment from a different network, or an unreadable/!partial file. Callers
// treat null as "deploy fresh".
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
      !parsed.facts
    ) {
      return null;
    }
    return parsed as DeploymentState;
  } catch {
    return null;
  }
}

export function factsFromState(state: DeploymentState): FinancialFacts {
  return {
    balance: BigInt(state.facts.balance),
    debts: BigInt(state.facts.debts),
    income: BigInt(state.facts.income),
  };
}

export function factsToState(facts: FinancialFacts): DeploymentState['facts'] {
  return {
    balance: facts.balance.toString(),
    debts: facts.debts.toString(),
    income: facts.income.toString(),
  };
}
