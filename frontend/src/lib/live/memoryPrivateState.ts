/**
 * Minimal in-memory PrivateStateProvider.
 *
 * FALLBACK ONLY. The live console prefers midnight-js's level provider, which
 * resolves to IndexedDB in a browser. When IndexedDB is unavailable (some
 * private windows, blocked site data) this keeps a session usable: state lives
 * for this tab and is lost on reload, so a borrower's dapp key and a loan's
 * history seed would have to be re-created. Export/import are not offered,
 * because there is nothing durable to move.
 */

import type { ContractAddress, SigningKey } from '@midnight-ntwrk/compact-runtime';
import type { PrivateStateId, PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`${what} is not available for in-memory private state`));

export function createInMemoryPrivateStateProvider<
  PSI extends PrivateStateId = PrivateStateId,
  PS = unknown,
>(): PrivateStateProvider<PSI, PS> {
  // Scoped per contract address, as the level provider does.
  let scope = '';
  const states = new Map<string, PS>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  const key = (id: PSI) => `${scope}:${id}`;

  return {
    setContractAddress(address) {
      scope = address;
    },
    set: async (id, state) => {
      states.set(key(id), state);
    },
    get: async (id) => states.get(key(id)) ?? null,
    remove: async (id) => {
      states.delete(key(id));
    },
    clear: async () => {
      states.clear();
    },
    setSigningKey: async (address, signingKey) => {
      signingKeys.set(address, signingKey);
    },
    getSigningKey: async (address) => signingKeys.get(address) ?? null,
    removeSigningKey: async (address) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
    },
    exportPrivateStates: unsupported('exportPrivateStates'),
    importPrivateStates: unsupported('importPrivateStates'),
    exportSigningKeys: unsupported('exportSigningKeys'),
    importSigningKeys: unsupported('importSigningKeys'),
  };
}
