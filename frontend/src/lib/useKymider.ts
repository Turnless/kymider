import { createContext, useContext, useEffect, useState } from 'react';
import type { KymiderClient } from './client';

export const KymiderContext = createContext<KymiderClient | null>(null);

/**
 * The client, plus a revision that ticks whenever the ledger changes.
 *
 * Screens read straight off the contract state rather than mirroring it into
 * React state, so there is only ever one source of truth; the revision just
 * tells React that the source moved.
 */
export function useKymider(): { client: KymiderClient; revision: number } {
  const client = useContext(KymiderContext);
  if (!client) throw new Error('useKymider must be used inside a KymiderProvider');

  const [revision, setRevision] = useState(0);
  useEffect(() => client.subscribe(() => setRevision((r) => r + 1)), [client]);

  return { client, revision };
}
