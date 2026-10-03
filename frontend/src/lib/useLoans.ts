import { createContext, useContext, useEffect, useState } from 'react';
import type { LoanDesk } from './loans';

export const LoanDeskContext = createContext<LoanDesk | null>(null);

/**
 * The loan desk, plus a revision that ticks whenever the ledger, private
 * state or block clock changes. Same pattern as `useKymider`: screens read
 * straight off the desk, and the revision tells React the source moved.
 */
export function useLoans(): { desk: LoanDesk; revision: number } {
  const desk = useContext(LoanDeskContext);
  if (!desk) throw new Error('useLoans must be used inside a LoanDeskContext provider');

  const [revision, setRevision] = useState(0);
  useEffect(() => desk.subscribe(() => setRevision((r) => r + 1)), [desk]);

  return { desk, revision };
}
