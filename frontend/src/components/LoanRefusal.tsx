import { refusalHint } from './LoanFormat';

/**
 * A contract refusal, shown where it happened. Calm on purpose: a refusal is
 * the contract enforcing a rule, so it reads as an answer, not a crash. The
 * message is the contract's assert text, word for word; known asserts get a
 * one-line reason underneath.
 */
export function LoanRefusal({
  message,
  onDismiss,
  dark = false,
}: {
  message: string | null;
  onDismiss?: () => void;
  dark?: boolean;
}) {
  if (!message) return null;
  const hint = refusalHint(message);

  return (
    <div
      role="status"
      className="rise mt-3 flex items-start justify-between gap-3 rounded-[13px] px-4 py-3"
      style={
        dark
          ? { background: 'rgba(232,112,95,0.1)', border: '1px solid rgba(232,112,95,0.26)' }
          : { background: 'rgba(220,38,38,0.045)', border: '1px solid rgba(220,38,38,0.16)' }
      }
    >
      <div className="min-w-0">
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px]"
          style={{ color: dark ? '#f09484' : '#b91c1c' }}
        >
          The contract refused
        </p>
        <p
          className="text-[12px] font-semibold leading-[1.5]"
          style={{ color: dark ? 'var(--color-cream)' : 'var(--color-ink)' }}
        >
          “{message}”
        </p>
        {hint && (
          <p
            className="mt-1 text-[11px] leading-[1.5]"
            style={{ color: dark ? 'rgba(255,247,235,0.55)' : 'rgba(15,23,42,0.55)' }}
          >
            {hint}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-[11px] font-semibold"
          style={{ color: dark ? 'rgba(255,247,235,0.45)' : 'rgba(15,23,42,0.4)' }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
