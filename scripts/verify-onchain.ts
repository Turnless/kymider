// Kymider — verify the on-chain record, read-only.
//
//   npm run verify:onchain                              (local devnet)
//   MIDNIGHT_NETWORK=preprod npm run verify:onchain     (Preprod)
//
// Reads frontend/public/deployments/<network>.json (or the file named by
// KYMIDER_DEPLOYMENTS_FILE), then, from the indexer alone, with no wallet:
//
//   - decodes each contract's public state with the compiled contracts and
//     checks the claims PROOF.md makes: attestation PASS and claim APPROVED,
//     the Registry row, loan A VERIFIED at exactly 110% of principal, loan
//     A's refused 150% offer and re-quote leaving no trace (one quote issued,
//     the tier still VERIFIED, the only offer 110%, both refusals recorded),
//     loan B STANDARD at exactly 150%, each listing under its Loan's own
//     borrower naming the Loan's own lender, both REPAID and recorded, loan C
//     carrying a history proof of 2;
//   - looks up every transaction hash and checks its block.
//
// Prints a PASS/FAIL table and exits non-zero on any FAIL.

import '../client/env.js';

import path from 'node:path';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { getConfig } from '../client/config.js';
import { deploymentsPath, readDeployments } from './lib/deployments.js';
import { allPass, renderClaimTable } from './lib/claims.js';
import { verifyDeployments } from './lib/onchain.js';

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

let exitCode = 0;
try {
  setNetworkId(getConfig().networkId);
  const file = process.env['KYMIDER_DEPLOYMENTS_FILE']
    ? path.resolve(process.cwd(), process.env['KYMIDER_DEPLOYMENTS_FILE'])
    : deploymentsPath(network);
  const deployments = readDeployments(file);
  if (deployments.network !== network) {
    throw new Error(
      `${file} records network '${deployments.network}', but MIDNIGHT_NETWORK is '${network}'`,
    );
  }

  console.log(`\n== Kymider on-chain verification: ${network} ==\n`);
  console.log(`Record:   ${path.relative(process.cwd(), file)} (generated ${deployments.generatedAt})`);
  console.log(`Indexer:  ${deployments.indexer}`);
  console.log(`Contracts: SolvencyProof ${deployments.contracts.solvencyProof}`);
  console.log(`           Registry ${deployments.contracts.registry}`);
  console.log(`           LoanDirectory ${deployments.contracts.loanDirectory}`);
  deployments.contracts.loans.forEach((l, i) => console.log(`           Loan ${'ABC'[i] ?? i + 1} ${l}`));

  const { claims, transactions } = await verifyDeployments(deployments);
  const rows = [...claims, ...transactions];
  console.log(`\n${renderClaimTable(rows)}\n`);

  const failed = rows.filter((r) => !r.pass).length;
  if (allPass(rows)) {
    console.log(`All ${rows.length} checks PASS.\n`);
  } else {
    console.error(`${failed} of ${rows.length} checks FAIL.\n`);
    exitCode = 1;
  }
} catch (err) {
  console.error('verify:onchain could not complete:', err instanceof Error ? err.message : err);
  exitCode = 1;
}

process.exit(exitCode);
