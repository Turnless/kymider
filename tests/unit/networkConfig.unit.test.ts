// Kymider — network config: Midnight Preprod through Blockfrost.
//
// Midnight's own Preprod endpoints shut down on 2026-10-09; Blockfrost serves
// the indexer and node, and every request carries a project token. The token is
// a secret, so these tests pin where it goes (the live URLs) and where it must
// never go (the deployments record, and so PROOF.md).

import { describe, it, expect } from 'vitest';
import {
  BLOCKFROST_TOKEN_VAR,
  getConfig,
  preprodConfig,
  withProjectId,
  withTokenFromEnv,
  withoutProjectId,
} from '../../client/config.js';
import { buildDeployments } from '../../scripts/lib/deployments.js';

const TOKEN = 'nightpreprodTESTTOKEN123';
const env = { [BLOCKFROST_TOKEN_VAR]: TOKEN } as NodeJS.ProcessEnv;

describe('Preprod via Blockfrost', () => {
  it('points every endpoint at Blockfrost, with the project ID as a query parameter', () => {
    const c = preprodConfig(env);
    expect(c.networkId).toBe('preprod');
    expect(c.indexer).toBe(`https://midnight-preprod.blockfrost.io/api/v0?project_id=${TOKEN}`);
    expect(c.indexerWS).toBe(`wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=${TOKEN}`);
    expect(c.node).toBe(`https://rpc.midnight-preprod.blockfrost.io/?project_id=${TOKEN}`);
    expect(c.nodeWS).toBe(`wss://rpc.midnight-preprod.blockfrost.io/?project_id=${TOKEN}`);
    for (const url of [c.indexer, c.indexerWS, c.node, c.nodeWS]) {
      expect(url).not.toContain('preprod.midnight.network');
    }
  });

  it('refuses to build a Preprod config without the project ID, saying where to get one', () => {
    expect(() => preprodConfig({} as NodeJS.ProcessEnv)).toThrow(/BLOCKFROST_PROJECT_ID is not set.*blockfrost\.io/);
  });

  it('strips the project ID for anything written down, and adds it back for reading', () => {
    const live = withProjectId('https://midnight-preprod.blockfrost.io/api/v0', TOKEN);
    const shown = withoutProjectId(live);
    expect(shown).toBe('https://midnight-preprod.blockfrost.io/api/v0');
    expect(withTokenFromEnv(shown, env)).toBe(live);
    expect(() => withTokenFromEnv(shown, {} as NodeJS.ProcessEnv)).toThrow(/BLOCKFROST_PROJECT_ID/);
  });

  it('leaves non-Blockfrost URLs alone (the local devnet, Preview)', () => {
    const local = 'http://127.0.0.1:8088/api/v4/graphql';
    expect(withProjectId(local, TOKEN)).toBe(local);
    expect(withoutProjectId(local)).toBe(local);
    expect(withTokenFromEnv(local, {} as NodeJS.ProcessEnv)).toBe(local);
    expect(getConfig().indexer).toBe(local); // MIDNIGHT_NETWORK unset in unit tests: local
  });

  it('never writes the project ID into the deployments record', () => {
    const c = preprodConfig(env);
    const d = buildDeployments({
      network: 'preprod',
      indexer: c.indexer,
      indexerWS: c.indexerWS,
      generatedAt: new Date('2026-10-15T00:00:00Z'),
      contracts: { solvencyProof: 'a', registry: 'b', loanDirectory: 'c', loans: [] },
      receipts: [],
    });
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(JSON.stringify(d)).not.toContain('project_id');
    expect(d.indexer).toBe('https://midnight-preprod.blockfrost.io/api/v0');
  });
});
