import { useCallback, useState } from 'react';
import { refusalOf } from './LoanFormat';

export type LoanRefusalState = { action: string; message: string };

/**
 * Runs one desk call at a time and keeps the contract's refusal, if any,
 * against the action that caused it, so a screen can show it beside the
 * button that was pressed instead of throwing.
 *
 *   const act = useLoanAction();
 *   <button onClick={() => act.run('repay', () => desk.repay(address))} />
 *   <LoanRefusal message={act.refusalFor('repay')} onDismiss={act.clear} />
 */
export function useLoanAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<LoanRefusalState | null>(null);

  const run = useCallback(
    async <T,>(action: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
      setBusy(action);
      setRefusal(null);
      try {
        return await fn();
      } catch (err) {
        setRefusal({ action, message: refusalOf(err) });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const clear = useCallback(() => setRefusal(null), []);

  /** The refusal message for one action, or null. */
  const refusalFor = (action: string): string | null =>
    refusal?.action === action ? refusal.message : null;

  return { busy, refusal, refusalFor, run, clear };
}
