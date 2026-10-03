/**
 * Where the console's data comes from, for the espresso rail: the in-browser
 * simulation of the compiled contracts, or a live Midnight network read
 * through its indexer. Never let a simulated screen pass for chain data.
 */
export function LiveBadge({
  mode,
  network,
}: {
  mode: 'simulation' | 'live';
  network?: string;
}) {
  const live = mode === 'live';
  const text = live ? `Live · ${network ?? 'network'}` : 'Local simulation';
  return (
    <span
      className="inline-flex max-w-full items-center gap-[6px] rounded-full px-[9px] py-[3px] text-[10px] font-semibold whitespace-nowrap"
      style={{
        background: live ? 'rgba(94,201,138,0.14)' : 'rgba(255,247,235,0.06)',
        border: `1px solid ${live ? 'rgba(94,201,138,0.32)' : 'rgba(255,247,235,0.1)'}`,
        color: live ? '#7bd9a5' : 'rgba(255,247,235,0.55)',
      }}
      title={
        live
          ? `Reading public contract state from the ${network ?? ''} indexer`
          : 'Compiled contracts running in this browser — no wallet, no chain'
      }
    >
      <span className="relative inline-flex size-[6px] shrink-0">
        {live && (
          <span className="absolute inset-0 animate-ping rounded-full bg-[#5ec98a] opacity-60 motion-reduce:hidden" />
        )}
        <span
          className="relative size-[6px] rounded-full"
          style={{ background: live ? '#5ec98a' : 'var(--color-accent)' }}
        />
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}
