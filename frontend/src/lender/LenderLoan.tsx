import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { money, shortHex } from '../lib/client';
import { blockDate, DAY, duration, percentOfBps, type LoanView } from '../lib/loans';
import { useLoans } from '../lib/useLoans';

/**
 * The underwriting desk for one loan: quote, underwrite at the tier the
 * borrower proved, disburse, watch repayment, call a default or record the
 * repayment. Everything here is read off the public Loan ledger. The facts
 * behind the tier never reach this screen, and the panel on the left says so.
 */

const desk$ = (n: bigint): string => n.toLocaleString('en-US');

const deskGroup = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? '' : Number(digits).toLocaleString('en-US');
};
const deskBig = (s: string): bigint => {
  const digits = s.replace(/[^0-9]/g, '');
  return digits === '' ? 0n : BigInt(digits);
};

/** Principal plus flat interest, floored, as `disburse` checks it. */
const deskOwedFor = (l: LoanView): bigint =>
  (l.terms.principal * (10_000n + l.terms.interestBps)) / 10_000n;
/** Equal installments, rounded up, as `disburse` checks it. */
const deskInstallmentFor = (owed: bigint, n: bigint): bigint => (owed + n - 1n) / n;

/** How the contract phrases a refusal, whatever wraps it on the way up. */
const deskRefusal = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^(Error:\s*)?(failed assert:\s*)?/i, '');
};

type DeskAction =
  | 'quote'
  | 'underwrite'
  | 'overask'
  | 'decline'
  | 'disburse'
  | 'default'
  | 'record';

export function LenderLoan() {
  const { address = '' } = useParams();
  // Keyed by address so a refusal or form left on one loan never shows on the next.
  return <DeskLoan key={address} address={address} />;
}

function DeskLoan({ address }: { address: string }) {
  const { desk } = useLoans();

  const [threshold, setThreshold] = useState('500,000');
  const [maxDti, setMaxDti] = useState('40');
  const [hours, setHours] = useState('72');
  const [busy, setBusy] = useState<DeskAction | null>(null);
  const [refusal, setRefusal] = useState<{ action: DeskAction; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const loan = desk.loan(address);
  const now = desk.now();

  if (!loan) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <p className="text-[13px] text-[rgba(15,23,42,0.6)]">
          No such loan.{' '}
          <Link to="/app/applications" className="font-semibold">
            Back to applications
          </Link>
        </p>
      </div>
    );
  }

  const run = async (action: DeskAction, fn: () => Promise<string | void>) => {
    setBusy(action);
    setRefusal(null);
    setDone(null);
    try {
      const note = await fn();
      if (note) setDone(note);
    } catch (e) {
      setRefusal({ action, message: deskRefusal(e) });
    } finally {
      setBusy(null);
    }
  };

  const l = loan;
  const quoteLive = l.quote !== null && now < l.quote.expiresAt;
  const step =
    l.status === 'APPLIED'
      ? quoteLive
        ? 2
        : 1
      : l.status === 'ACTIVE'
        ? l.disbursed
          ? 4
          : 3
        : 5;
  const closed = step === 5;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-[3px] text-[11px] text-[rgba(15,23,42,0.4)]">Applications</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mono text-[20px] font-bold tracking-[-0.01em]">
              {shortHex('0x' + l.address, 10, 4)}
            </h1>
            <DeskStatusBadge loan={l} now={now} />
          </div>
        </div>
        <Link to="/app/applications" className="btn btn-quiet">
          Back to applications
        </Link>
      </header>

      <DeskClock now={now} onAdvance={(s) => desk.advanceTime(s)} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <DeskRecord loan={l} />
          {l.disbursed && <DeskRepayment loan={l} now={now} />}
          <DeskVisibility loan={l} />
        </div>

        {/* On a phone the desk is the reason for the visit, so it leads. */}
        <section className="card-dark order-first flex min-w-0 flex-col p-6 lg:order-none">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="label-dark">Underwriting desk</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="h-[3px] w-5 rounded-full"
                  style={{
                    background: n <= step ? 'var(--color-accent)' : 'rgba(255,247,235,0.18)',
                  }}
                />
              ))}
              <span className="ml-2 text-[11px] text-[rgba(255,247,235,0.5)]">
                {closed ? 'Closed' : `Step ${step} of 5`}
              </span>
            </div>
          </div>

          {l.status === 'APPLIED' && (
            <>
              {!l.factsBound && (
                <DeskNotice tone="fail" title="Facts do not match">
                  This loan's facts commitment does not match the borrower's SolvencyProof instance.
                  A tier proven here would not be about the statement you know. Decline it, or
                  underwrite only at 150%.
                </DeskNotice>
              )}

              <p className="label-dark mb-3">1 · Quote the 110% bar</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DeskTerm
                  label="Minimum net worth"
                  prefix="$"
                  value={threshold}
                  onChange={(v) => setThreshold(deskGroup(v))}
                />
                <DeskTerm
                  label="Maximum DTI"
                  prefix="%"
                  value={maxDti}
                  onChange={(v) => setMaxDti(v.replace(/[^0-9]/g, ''))}
                />
                <DeskTerm
                  label="Valid for"
                  suffix="hours"
                  value={hours}
                  onChange={(v) => setHours(v.replace(/[^0-9]/g, ''))}
                />
              </div>
              <p className="mt-3 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
                The borrower proves, in zero knowledge, that their committed facts clear this bar.
                You receive a tier, not the figures. A proof lapses when the quote does.
                {l.quote !== null &&
                  ' Quoting again replaces the bar and clears any tier proven against the old one.'}
              </p>
              <button
                type="button"
                className={`btn mt-4 w-full py-[12px] ${quoteLive ? '' : 'btn-accent'}`}
                style={
                  quoteLive
                    ? { background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }
                    : undefined
                }
                disabled={busy !== null}
                onClick={() =>
                  run('quote', () =>
                    desk.quote(l.address, {
                      thresholdNetWorth: deskBig(threshold),
                      maxDti: deskBig(maxDti),
                      ttlSeconds: deskBig(hours) * 3_600n,
                    }),
                  )
                }
              >
                {busy === 'quote' ? 'Quoting…' : l.quote === null ? 'Send quote' : 'Replace quote'}
              </button>
              {refusal?.action === 'quote' && <DeskRefused message={refusal.message} />}

              {l.quote !== null && (
                <div className="mt-4 rounded-[13px] bg-[rgba(255,247,235,0.05)] px-4 py-3">
                  <p className="tnum text-[12px] font-semibold text-cream">
                    Net worth ≥ {money(l.quote.thresholdNetWorth)} · DTI ≤ {String(l.quote.maxDti)}%
                  </p>
                  <p className="tnum mt-[2px] text-[11px] text-[rgba(255,247,235,0.5)]">
                    {quoteLive
                      ? `On the ledger. Expires ${blockDate(l.quote.expiresAt)}, in ${duration(l.quote.expiresAt - now)}.`
                      : `Expired ${blockDate(l.quote.expiresAt)}. The borrower cannot prove against it; quote again.`}
                  </p>
                </div>
              )}

              <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
                <p className="label-dark mb-3">2 · Borrower's tier</p>
                <DeskTierLine loan={l} now={now} />
              </div>

              <DeskHero
                loan={l}
                busy={busy !== null}
                pending={busy === 'overask'}
                refusal={refusal?.action === 'overask' ? refusal.message : null}
                onOverask={() =>
                  run('overask', () => desk.underwriteAt(l.address, l.collateralIfStandard))
                }
              />

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="btn btn-accent flex-1 py-[13px]"
                  disabled={busy !== null}
                  onClick={() =>
                    run('underwrite', async () => {
                      const r = await desk.underwrite(l.address);
                      return `Underwritten at ${r.tier === 'VERIFIED' ? '110%' : '150%'}: collateral ${desk$(r.collateral)} recorded on the loan.`;
                    })
                  }
                >
                  {busy === 'underwrite'
                    ? 'Underwriting…'
                    : `Underwrite at ${l.tierLive ? '110%' : '150%'} · ${desk$(
                        l.tierLive ? l.collateralIfVerified : l.collateralIfStandard,
                      )}`}
                </button>
                <button
                  type="button"
                  className="btn py-[13px]"
                  style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
                  disabled={busy !== null}
                  onClick={() => run('decline', () => desk.decline(l.address))}
                >
                  {busy === 'decline' ? 'Declining…' : 'Decline'}
                </button>
              </div>
              {(refusal?.action === 'underwrite' || refusal?.action === 'decline') && (
                <DeskRefused message={refusal.message} />
              )}
            </>
          )}

          {l.status !== 'APPLIED' && l.status !== 'DECLINED' && <DeskUnderwritten loan={l} />}

          {l.status === 'ACTIVE' && !l.disbursed && <DeskDisburse loan={l} now={now} />}
          {l.status === 'ACTIVE' && !l.disbursed && (
            <>
              <button
                type="button"
                className="btn btn-accent mt-5 w-full py-[13px]"
                disabled={busy !== null}
                onClick={() =>
                  run('disburse', async () => {
                    await desk.disburse(l.address);
                    return 'Disbursed. The first installment clock is running.';
                  })
                }
              >
                {busy === 'disburse' ? 'Disbursing…' : 'Disburse'}
              </button>
              {refusal?.action === 'disburse' && <DeskRefused message={refusal.message} />}
            </>
          )}

          {l.status === 'ACTIVE' && l.disbursed && (
            <DeskDefault
              loan={l}
              now={now}
              busy={busy !== null}
              pending={busy === 'default'}
              onDefault={() => run('default', () => desk.markDefault(l.address))}
              refusal={refusal?.action === 'default' ? refusal.message : null}
            />
          )}

          {l.status === 'REPAID' && (
            <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
              <p className="label-dark mb-3">5 · Repaid</p>
              <p className="text-[44px] font-black leading-none tracking-[-0.03em] text-[#7BD9A5]">
                Repaid
              </p>
              <p className="tnum mt-2 text-[12px] text-[rgba(255,247,235,0.6)]">
                {String(l.paymentsMade)} payments · {String(l.latePayments)} late ·{' '}
                {desk$(deskOwedFor(l))} received
              </p>
              {l.recorded ? (
                <DeskNotice tone="pass" title="Recorded in the directory">
                  This repayment is a leaf in the directory's repaid-loans tree. The borrower can
                  cite it in a two-loan history proof to a future lender, who will not learn it was
                  this loan or you.
                </DeskNotice>
              ) : (
                <>
                  <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.5)]">
                    Recording writes one private leaf to the directory. Only you, as this loan's
                    lender, can record it, and only once. It is what lets the borrower prove a
                    repayment history later without naming this loan.
                  </p>
                  <button
                    type="button"
                    className="btn btn-accent mt-4 w-full py-[13px]"
                    disabled={busy !== null}
                    onClick={() => run('record', () => desk.recordRepaid(l.address))}
                  >
                    {busy === 'record' ? 'Recording…' : 'Record repayment in the directory'}
                  </button>
                </>
              )}
              {refusal?.action === 'record' && <DeskRefused message={refusal.message} />}
            </div>
          )}

          {l.status === 'DEFAULTED' && (
            <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
              <p className="label-dark mb-3">5 · Defaulted</p>
              <p className="text-[44px] font-black leading-none tracking-[-0.03em] text-[#F09484]">
                Defaulted
              </p>
              <p className="tnum mt-2 text-[12px] text-[rgba(255,247,235,0.6)]">
                {desk$(l.balanceOwed)} unpaid · {desk$(l.collateralRequired)} collateral held ·{' '}
                {String(l.paymentsMade)} payments made
              </p>
              <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
                The contract accepted the default because an installment was more than 3 days past
                due by block time. A defaulted loan cannot be recorded as repaid.
              </p>
            </div>
          )}

          {l.status === 'DECLINED' && (
            <div className="mt-2">
              <p className="text-[44px] font-black leading-none tracking-[-0.03em] text-[rgba(255,247,235,0.7)]">
                Declined
              </p>
              <p className="mt-3 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.45)]">
                No collateral was set and nothing was disbursed. The loan instance accepts no
                further quotes, proofs or underwriting.
              </p>
            </div>
          )}

          {done && (
            <p className="rise mt-4 rounded-[13px] bg-[rgba(94,201,138,0.12)] px-4 py-3 text-[12px] text-[#7BD9A5]">
              {done}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** STANDARD is a usable answer, not a failure, so it is not drawn in red. */
const DESK_NEUTRAL_DARK = {
  background: 'rgba(255,247,235,0.08)',
  color: 'rgba(255,247,235,0.75)',
  border: '1px solid rgba(255,247,235,0.18)',
};

// --- desk panels ------------------------------------------------------------

/**
 * The pitch, for this principal: what each tier costs the borrower. With a
 * live VERIFIED tier it also offers the adversarial move, asking for 150%
 * anyway, so the contract's refusal is seen rather than described.
 */
function DeskHero({
  loan: l,
  busy,
  pending,
  refusal,
  onOverask,
}: {
  loan: LoanView;
  busy: boolean;
  pending: boolean;
  refusal: string | null;
  onOverask: () => void;
}) {
  const verified = l.tierLive;
  const at = verified ? l.collateralIfVerified : l.collateralIfStandard;
  const saved = l.collateralIfStandard - l.collateralIfVerified;
  const tierRefusal = refusal !== null && /collateral does not match the tier/i.test(refusal);
  return (
    <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
      <p className="label-dark mb-3">3 · Underwrite</p>
      <p className="text-[11px] font-semibold text-[rgba(255,247,235,0.55)]">
        Collateral at this tier
      </p>
      <p className="tnum mt-1 flex flex-wrap items-baseline gap-x-3">
        <span
          className="text-[44px] font-black leading-none tracking-[-0.03em]"
          style={{ color: verified ? '#7BD9A5' : 'var(--color-cream)' }}
        >
          {desk$(at)}
        </span>
        <span className="text-[18px] font-bold text-[rgba(255,247,235,0.7)]">
          {verified ? '110%' : '150%'}
        </span>
      </p>
      <p className="tnum mt-2 text-[12px] text-[rgba(255,247,235,0.6)]">
        {verified ? (
          <>
            150% would be <span className="line-through">{desk$(l.collateralIfStandard)}</span>. The
            borrower posts {desk$(saved)} less.
          </>
        ) : (
          <>
            A live VERIFIED tier would make it {desk$(l.collateralIfVerified)} (110%),{' '}
            {desk$(saved)} less.
          </>
        )}
      </p>

      <div className="mt-4 rounded-[13px] border border-[rgba(255,247,235,0.1)] px-4 py-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px] text-[rgba(255,247,235,0.55)]">
          Enforced by the contract
        </p>
        <p className="text-[11px] leading-[1.55] text-[rgba(255,247,235,0.6)]">
          <span className="mono">underwrite</span> accepts exactly one collateral figure: 110% of
          the principal while a VERIFIED tier is live, 150% otherwise. A lender cannot quietly ask a
          verified borrower for 150%.
        </p>

        {verified && (
          <>
            <button
              type="button"
              className="btn mt-3 w-full py-[10px] text-[12px]"
              style={{
                background: 'transparent',
                color: '#F09484',
                border: '1px dashed rgba(232,112,95,0.55)',
              }}
              disabled={busy}
              onClick={onOverask}
              title="Expected to be refused by the contract"
            >
              {pending ? 'Submitting…' : `Ask for 150% anyway · ${desk$(l.collateralIfStandard)}`}
            </button>
            <p className="mt-[6px] text-center text-[10px] text-[rgba(255,247,235,0.4)]">
              Try it. The transaction is built and submitted; the contract decides.
            </p>
          </>
        )}

        {refusal !== null && (
          <div
            role="alert"
            className="rise mt-3 rounded-[13px] px-4 py-4"
            style={{
              background: 'rgba(232,112,95,0.14)',
              border: '1px solid rgba(232,112,95,0.4)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#F09484]">
              Refused · the guarantee held
            </p>
            <p className="mt-2 text-[14px] font-semibold leading-[1.45] text-cream">
              The contract refused: <span className="mono text-[#F09484]">{refusal}</span>.
              {tierRefusal && ' A verified borrower cannot be asked for more than 110%.'}
            </p>
            <p className="tnum mt-2 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.55)]">
              Nothing was written. The loan is still open; {desk$(l.collateralIfVerified)} at 110%
              is the only collateral this borrower can be asked for while the tier holds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeskTierLine({ loan: l, now }: { loan: LoanView; now: bigint }) {
  if (l.quote === null) {
    return (
      <p className="text-[12px] text-[rgba(255,247,235,0.5)]">
        Nothing to prove against until you quote. Underwriting now takes 150%.
      </p>
    );
  }
  if (l.tier === 'VERIFIED' && l.tierLive) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="badge badge-pass-dark">Verified</span>
        <span className="tnum text-[12px] text-[rgba(255,247,235,0.7)]">
          Lapses {blockDate(l.tierExpiresAt)}, in {duration(l.tierExpiresAt - now)}
        </span>
      </div>
    );
  }
  if (l.tier === 'VERIFIED') {
    return (
      <div>
        <span
          className="badge"
          style={{
            background: 'rgba(217,119,6,0.18)',
            color: '#e9b168',
            border: '1px solid rgba(217,119,6,0.35)',
          }}
        >
          Verified, lapsed
        </span>
        <p className="tnum mt-2 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.5)]">
          Lapsed {blockDate(l.tierExpiresAt)}. Underwriting now takes 150%. Quote again and the
          borrower can prove once more.
        </p>
      </div>
    );
  }
  if (l.tier === 'STANDARD') {
    return (
      <div>
        <span className="badge" style={DESK_NEUTRAL_DARK}>
          Standard
        </span>
        <p className="mt-2 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.5)]">
          The borrower proved against your bar and did not clear it. That is a usable answer: 150%
          collateral. You are not told by how much they missed.
        </p>
      </div>
    );
  }
  return (
    <p className="text-[12px] text-[rgba(255,247,235,0.5)]">
      The borrower has not proved against this quote yet. Underwriting now takes 150%; wait for the
      proof to offer 110%.
    </p>
  );
}

function DeskUnderwritten({ loan: l }: { loan: LoanView }) {
  const verified = l.tier === 'VERIFIED';
  return (
    <div>
      <p className="label-dark mb-3">Underwritten</p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`badge ${verified ? 'badge-pass-dark' : ''}`}
          style={verified ? undefined : DESK_NEUTRAL_DARK}
        >
          {verified ? 'Verified' : 'Standard'}
        </span>
        <span className="tnum text-[13px] font-semibold text-cream">
          Collateral {desk$(l.collateralRequired)} ({verified ? '110%' : '150%'})
        </span>
      </div>
      {verified && (
        <p className="tnum mt-2 text-[11px] text-[rgba(255,247,235,0.5)]">
          150% would have been {desk$(l.collateralIfStandard)}; the borrower posts{' '}
          {desk$(l.collateralIfStandard - l.collateralIfVerified)} less.
        </p>
      )}
    </div>
  );
}

function DeskDisburse({ loan: l, now }: { loan: LoanView; now: bigint }) {
  const owed = deskOwedFor(l);
  const inst = deskInstallmentFor(owed, l.terms.installments);
  return (
    <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
      <p className="label-dark mb-3">4 · Disburse</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DeskFigure
          label="Owed"
          value={desk$(owed)}
          note={`${desk$(l.terms.principal)} + ${percentOfBps(l.terms.interestBps)}`}
        />
        <DeskFigure
          label="Installment"
          value={desk$(inst)}
          note={`× ${String(l.terms.installments)}, last one smaller`}
        />
        <DeskFigure
          label="First due"
          value={blockDate(now + l.terms.periodSeconds).slice(0, 10)}
          note={`in ${duration(l.terms.periodSeconds)}`}
        />
      </div>
      <p className="mt-3 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
        The contract checks that owed is exactly the principal plus flat interest and that the
        installment is that split evenly, rounded up. Disbursing starts the clock at block time.
      </p>
    </div>
  );
}

function DeskDefault({
  loan: l,
  now,
  busy,
  pending,
  onDefault,
  refusal,
}: {
  loan: LoanView;
  now: bigint;
  busy: boolean;
  pending: boolean;
  onDefault: () => void;
  refusal: string | null;
}) {
  const from = l.defaultableFrom;
  const open = from !== null && now >= from;
  const overdue = now > l.nextDueAt;
  return (
    <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-5">
      <p className="label-dark mb-3">4 · Repaying</p>
      <p className="text-[11px] font-semibold text-[rgba(255,247,235,0.55)]">Balance owed</p>
      <p className="tnum mt-1 text-[44px] font-black leading-none tracking-[-0.03em] text-cream">
        {desk$(l.balanceOwed)}
      </p>
      <p className="tnum mt-2 text-[12px] text-[rgba(255,247,235,0.6)]">
        Next {desk$(l.amountDue)} due {blockDate(l.nextDueAt)}
        {overdue ? (
          <span className="text-[#F09484]">, {duration(now - l.nextDueAt)} overdue</span>
        ) : (
          <>, in {duration(l.nextDueAt - now)}</>
        )}
      </p>

      <div
        className="mt-5 rounded-[13px] px-4 py-3"
        style={{
          background: open ? 'rgba(232,112,95,0.12)' : 'rgba(255,247,235,0.05)',
        }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[0.6px]"
          style={{ color: open ? '#F09484' : 'rgba(255,247,235,0.55)' }}
        >
          {open ? 'Past grace: default can be called' : 'Default window'}
        </p>
        <p className="tnum mt-1 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.6)]">
          {from === null
            ? 'Not applicable.'
            : open
              ? `Opened ${blockDate(from)}. The installment due ${blockDate(l.nextDueAt)} is more than 3 days late.`
              : `Opens ${blockDate(from)}, in ${duration(from - now)}: 3 days after the next due date. Calling it earlier is refused by the contract.`}
        </p>
      </div>

      <button
        type="button"
        className="btn mt-4 w-full py-[13px]"
        style={
          open
            ? { background: '#e8705f', color: 'var(--color-espresso)' }
            : {
                background: 'transparent',
                color: 'rgba(255,247,235,0.55)',
                border: '1px solid rgba(255,247,235,0.16)',
              }
        }
        disabled={busy}
        onClick={onDefault}
        title={open ? undefined : 'Expected to be refused: the grace period has not passed'}
      >
        {pending ? 'Submitting…' : open ? 'Mark default' : 'Mark default (before grace ends)'}
      </button>
      {refusal && <DeskRefused message={refusal} />}
    </div>
  );
}

// --- left column --------------------------------------------------------------

function DeskRecord({ loan: l }: { loan: LoanView }) {
  return (
    <section className="card p-6">
      <p className="label mb-4">Public record</p>
      <dl className="flex flex-col gap-[10px] text-[11px]">
        <DeskRow label="Loan instance" value={shortHex('0x' + l.address, 10, 4)} mono />
        <DeskRow label="Borrower key" value={shortHex(l.borrower, 10, 4)} mono />
        <DeskRow label="Lender" value={`${l.lender.name} (you)`} />
        <DeskRow label="Principal" value={desk$(l.terms.principal)} />
        <DeskRow label="Interest, flat" value={percentOfBps(l.terms.interestBps)} />
        <DeskRow
          label="Schedule"
          value={`${String(l.terms.installments)} × every ${duration(l.terms.periodSeconds)}`}
        />
        <DeskRow
          label="Facts commitment"
          value={
            l.factsBound
              ? "✓ Matches the borrower's SolvencyProof"
              : '✕ Does not match SolvencyProof'
          }
          tone={l.factsBound ? 'ok' : 'fail'}
        />
        <DeskRow
          label="Repayment history"
          value={
            l.historyProofCount >= 2
              ? `${l.historyProofCount} prior repaid loans proven`
              : 'No history proof attached'
          }
          tone={l.historyProofCount >= 2 ? 'ok' : undefined}
        />
        <DeskRow
          label="Directory listing"
          value={l.listing === null ? 'Not listed' : l.listing.toLowerCase()}
        />
        {l.status === 'REPAID' && (
          <DeskRow
            label="Repayment recorded"
            value={l.recorded ? 'Yes' : 'Not yet'}
            tone={l.recorded ? 'ok' : 'warn'}
          />
        )}
      </dl>
    </section>
  );
}

function DeskRepayment({ loan: l, now }: { loan: LoanView; now: bigint }) {
  const owed = deskOwedFor(l);
  const paid = owed - l.balanceOwed;
  const total = l.installmentAmount > 0n ? deskInstallmentFor(owed, l.installmentAmount) : 0n;
  const pct = owed > 0n ? Number((paid * 1000n) / owed) / 10 : 0;
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="label">Repayment</p>
        <p className="tnum text-[11px] text-[rgba(15,23,42,0.45)]">
          {desk$(paid)} of {desk$(owed)} · {pct.toFixed(1)}%
        </p>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-[rgba(15,23,42,0.07)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: l.status === 'DEFAULTED' ? '#dc2626' : '#16a34a',
          }}
        />
      </div>
      <dl className="mt-5 flex flex-col gap-[10px] text-[11px]">
        <DeskRow label="Payments made" value={`${String(l.paymentsMade)} of ${String(total)}`} />
        <DeskRow
          label="Late payments"
          value={String(l.latePayments)}
          tone={l.latePayments > 0n ? 'warn' : undefined}
        />
        <DeskRow label="Installment" value={desk$(l.installmentAmount)} />
        <DeskRow label="Balance owed" value={desk$(l.balanceOwed)} />
        {l.status === 'ACTIVE' && (
          <>
            <DeskRow
              label="Next due"
              value={`${blockDate(l.nextDueAt)}${now > l.nextDueAt ? ' · overdue' : ''}`}
              tone={now > l.nextDueAt ? 'warn' : undefined}
            />
            {l.defaultableFrom !== null && (
              <DeskRow
                label="Default possible from"
                value={
                  now >= l.defaultableFrom
                    ? `${blockDate(l.defaultableFrom)} · open`
                    : `${blockDate(l.defaultableFrom)} · in ${duration(l.defaultableFrom - now)}`
                }
                tone={now >= l.defaultableFrom ? 'fail' : undefined}
              />
            )}
          </>
        )}
        <DeskRow label="History commitment" value={shortHex(l.historyCommitment, 10, 4)} mono />
      </dl>
      <p className="mt-4 border-t border-[rgba(15,23,42,0.07)] pt-4 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
        Lateness is decided by block time against the due date, not by either party. Each payment is
        folded into the history commitment; the borrower can later open it to an auditor.
      </p>
    </section>
  );
}

function DeskVisibility({ loan: l }: { loan: LoanView }) {
  const can = [
    'The tier: VERIFIED or STANDARD',
    'When that tier lapses',
    'The bar you quoted',
    'Collateral required',
    'Payments made, late count, balance',
    l.historyProofCount >= 2
      ? `That ${l.historyProofCount} prior loans were repaid`
      : 'Whether prior repaid loans are proven',
  ];
  const cannot = [
    'Cash balance',
    'Outstanding debts',
    'Annual income',
    'Net worth or DTI, or how close to your bar',
    'Which earlier loans were repaid',
    'Which lenders those were',
  ];
  return (
    <section className="card p-6">
      <p className="label mb-4">What you can see, and what you cannot</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <ul className="flex flex-col gap-[8px] text-[12px]">
          <li className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#16a34a]">
            On the ledger
          </li>
          {can.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-[#16a34a]">✓</span>
              <span className="text-[rgba(15,23,42,0.75)]">{c}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-[8px] text-[12px]">
          <li className="text-[10px] font-bold uppercase tracking-[0.6px] text-[rgba(15,23,42,0.45)]">
            Never leaves the borrower
          </li>
          {cannot.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-[rgba(15,23,42,0.3)]">✕</span>
              <span className="text-[rgba(15,23,42,0.45)]">{c}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-5 border-t border-[rgba(15,23,42,0.07)] pt-4 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
        The tier is computed inside the proof from facts bound to the borrower's SolvencyProof
        commitment. You rely on the result without receiving the inputs.
      </p>
    </section>
  );
}

// --- small pieces -------------------------------------------------------------

/** Demo control: step the simulated block clock past a due date or grace period. */
function DeskClock({ now, onAdvance }: { now: bigint; onAdvance: (s: bigint) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[13px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.5)] px-4 py-[9px]">
      <span className="label">Block time</span>
      <span className="tnum mono text-[12px] font-semibold">{blockDate(now)}</span>
      <span className="flex gap-1 sm:ml-auto">
        {(
          [
            ['+1 h', 3_600n],
            ['+1 d', DAY],
            ['+7 d', 7n * DAY],
            ['+30 d', 30n * DAY],
          ] as const
        ).map(([label, s]) => (
          <button
            key={label}
            type="button"
            className="btn btn-quiet px-[10px] py-[5px] text-[11px]"
            onClick={() => onAdvance(s)}
          >
            {label}
          </button>
        ))}
      </span>
    </div>
  );
}

function DeskStatusBadge({ loan: l, now }: { loan: LoanView; now: bigint }) {
  if (l.status === 'APPLIED') return <span className="badge badge-pending">Applied</span>;
  if (l.status === 'ACTIVE') {
    if (!l.disbursed) return <span className="badge badge-pending">Underwritten</span>;
    if (l.defaultableFrom !== null && now >= l.defaultableFrom)
      return <span className="badge badge-fail">Past grace</span>;
    return <span className="badge badge-pass">Repaying</span>;
  }
  if (l.status === 'REPAID') return <span className="badge badge-pass">Repaid</span>;
  if (l.status === 'DEFAULTED') return <span className="badge badge-fail">Defaulted</span>;
  return <span className="badge badge-neutral">Declined</span>;
}

function DeskRefused({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rise mt-3 rounded-[13px] px-4 py-3"
      style={{ background: 'rgba(232,112,95,0.12)', border: '1px solid rgba(232,112,95,0.3)' }}
    >
      <p className="text-[12px] leading-[1.5] text-[#F09484]">
        The contract refused: <span className="mono">{message}</span>
      </p>
      <p className="mt-1 text-[10px] text-[rgba(255,247,235,0.45)]">
        Nothing was written to the ledger.
      </p>
    </div>
  );
}

function DeskNotice({
  tone,
  title,
  children,
}: {
  tone: 'pass' | 'fail';
  title: string;
  children: ReactNode;
}) {
  const color = tone === 'pass' ? '#7BD9A5' : '#F09484';
  return (
    <div
      className="my-4 rounded-[13px] px-4 py-3"
      style={{ background: tone === 'pass' ? 'rgba(94,201,138,0.12)' : 'rgba(232,112,95,0.12)' }}
    >
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px]" style={{ color }}>
        {title}
      </p>
      <p className="text-[11px] leading-[1.5] text-[rgba(255,247,235,0.62)]">{children}</p>
    </div>
  );
}

function DeskFigure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[13px] bg-[rgba(255,247,235,0.05)] px-3 py-[10px]">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.6px] text-[rgba(255,247,235,0.4)]">
        {label}
      </p>
      <p className="tnum text-[18px] font-bold leading-tight text-cream">{value}</p>
      <p className="tnum mt-[2px] text-[10px] text-[rgba(255,247,235,0.45)]">{note}</p>
    </div>
  );
}

function DeskRow({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'fail';
  mono?: boolean;
}) {
  const color =
    tone === 'ok'
      ? '#16a34a'
      : tone === 'warn'
        ? '#d97706'
        : tone === 'fail'
          ? '#dc2626'
          : 'rgba(15,23,42,0.85)';
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[rgba(15,23,42,0.5)]">{label}</dt>
      <dd className={`${mono ? 'mono' : 'tnum font-semibold'} text-right`} style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

function DeskTerm({
  label,
  prefix,
  suffix,
  value,
  onChange,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-[6px] block text-[11px] font-semibold text-[rgba(255,247,235,0.6)]">
        {label}
      </span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[rgba(255,247,235,0.35)]">
            {prefix}
          </span>
        )}
        <input
          className={`tnum w-full rounded-[11px] border border-[rgba(255,247,235,0.14)] bg-[rgba(255,247,235,0.06)] py-[10px] text-[14px] font-semibold text-cream outline-none transition-colors focus:border-accent ${prefix ? 'pl-[24px]' : 'pl-3'} ${suffix ? 'pr-[52px]' : 'pr-3'}`}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[rgba(255,247,235,0.35)]">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
