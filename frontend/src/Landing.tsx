import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * The landing is the console inverted: cream on espresso rather than espresso
 * on cream. Same two colours, swapped roles, so the site and the app read as
 * one product.
 */
export function Landing() {
  return (
    <div className="bg-espresso text-cream">
      <ScrollProgress />
      <Nav />
      {/* The hero pins; everything after it is opaque and rides over the top. */}
      <Hero />
      <div className="k-over">
        <Disclosure />
        <HowItWorks />
        <Honesty />
        <Closing />
        <Footer />
      </div>
    </div>
  );
}

/** Tracks the read. Purely decorative, so it is hidden from assistive tech. */
function ScrollProgress() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-[2px] bg-[rgba(255,247,235,0.08)]"
    >
      <div className="k-progress h-full w-full bg-accent" />
    </div>
  );
}

function Nav() {
  return (
    <nav className="mx-auto flex max-w-[1140px] items-center justify-between px-8 py-6">
      <span className="flex items-center gap-2 text-[11px] font-black tracking-[1.6px]">
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.5" fill="var(--color-accent)" />
        </svg>
        KYMIDER
      </span>
      <div className="flex items-center gap-7 text-[12px] font-medium text-[rgba(255,247,235,0.6)]">
        <a href="#how" className="text-inherit hover:text-cream">
          How it works
        </a>
        <a href="#honesty" className="text-inherit hover:text-cream">
          What we claim
        </a>
        <Link to="/app/overview" className="btn btn-accent px-4 py-[7px] text-[12px]">
          Open console
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="k-pin relative flex min-h-[92vh] items-center overflow-hidden px-8 pb-28 pt-10">
      <div
        aria-hidden="true"
        className="k-parallax pointer-events-none absolute right-[-10%] top-[-20%] size-[720px] rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle, rgba(212,109,37,0.55) 0%, rgba(212,109,37,0.12) 45%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div className="k-hero-out relative mx-auto w-full max-w-[1140px]">
        <span className="badge mb-7 inline-flex border border-[rgba(212,109,37,0.4)] bg-[rgba(212,109,37,0.12)] text-accent">
          Built on Midnight
        </span>
        <h1 className="text-[clamp(3rem,7vw,5.5rem)] font-black leading-[0.95] tracking-[-0.04em]">
          Prove it.
          <br />
          <span className="text-[rgba(255,247,235,0.34)]">Don&rsquo;t show it.</span>
        </h1>
        <p className="mt-7 max-w-[480px] text-[14px] leading-[1.7] text-[rgba(255,247,235,0.62)]">
          Borrowers prove their net worth and debt ratios clear a lender&rsquo;s bar — without
          handing over a balance, a statement, or a name. The network verifies the proof. Nobody
          sees the numbers.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link to="/app/overview" className="btn btn-accent px-7 py-[14px] text-[14px]">
            Open the console →
          </Link>
          <Link
            to="/app/directory"
            className="btn px-7 py-[14px] text-[14px]"
            style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
          >
            See the lender view
          </Link>
        </div>
        <ul className="mt-20 flex flex-wrap gap-8 text-[11px] text-[rgba(255,247,235,0.4)]">
          {[
            'Proofs verified by the network at submission',
            'One contract instance per borrower',
            'Apache-2.0, source public',
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="text-accent">✓</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

/** The pitch in one gesture: the same decision, without the exposure. */
function Disclosure() {
  const [showLender, setShowLender] = useState(false);

  return (
    <section className="k-reveal border-t border-[rgba(255,247,235,0.07)] px-8 py-24">
      <div className="mx-auto max-w-[1140px]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
              The whole idea
            </p>
            <h2 className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
              Same decision.
              <br />
              None of the exposure.
            </h2>
          </div>
          <div className="flex rounded-[11px] bg-[rgba(255,247,235,0.07)] p-[3px]">
            {(
              [
                [false, 'What you hold'],
                [true, 'What the lender receives'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setShowLender(value)}
                aria-pressed={showLender === value}
                className={[
                  'rounded-[9px] px-4 py-[7px] text-[12px] font-semibold transition-colors',
                  showLender === value
                    ? 'bg-cream text-espresso'
                    : 'text-[rgba(255,247,235,0.5)] hover:text-[rgba(255,247,235,0.8)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-[rgba(255,247,235,0.08)] bg-[rgba(255,247,235,0.03)] p-7">
          <p className="mb-5 text-[12px] text-[rgba(255,247,235,0.5)]">
            {showLender
              ? 'Delivered to the lender. This is the entire payload.'
              : 'Held on the borrower device. Never transmitted, never written to the ledger.'}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ['Cash and equivalents', '$1,000,000'],
              ['Outstanding debts', '$300,000'],
              ['Annual income', '$1,000,000'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[14px] bg-[rgba(255,247,235,0.04)] px-5 py-4 transition-colors"
              >
                <p className="mb-[6px] text-[9px] font-bold uppercase tracking-[0.7px] text-[rgba(255,247,235,0.4)]">
                  {label}
                </p>
                <p
                  className="tnum text-[22px] font-bold"
                  style={{ color: showLender ? 'rgba(255,247,235,0.28)' : 'var(--color-cream)' }}
                >
                  {showLender ? 'not disclosed' : value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4 border-t border-[rgba(255,247,235,0.07)] pt-5">
            {showLender ? (
              <>
                <span className="badge badge-pass-dark">Pass</span>
                <p className="text-[12px] text-[rgba(255,247,235,0.6)]">
                  Net worth ≥ $500,000 and DTI ≤ 40% both hold. Verified by the network before it
                  was recorded.
                </p>
              </>
            ) : (
              <>
                <span className="badge badge-neutral border-[rgba(255,247,235,0.15)] bg-[rgba(255,247,235,0.08)] text-[rgba(255,247,235,0.6)]">
                  Private
                </span>
                <p className="text-[12px] text-[rgba(255,247,235,0.6)]">
                  The statement behind the answer, held locally and committed as a hash.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    ['01', 'Commit', 'Your device', 'Enter your figures once. Only their hash is written to your contract instance.'],
    ['02', 'Receive a request', 'Public', 'A lender names a threshold and a debt-to-income limit against your instance.'],
    ['03', 'Prove', 'Your device', 'A proof is generated locally against the committed statement. The figures stay put.'],
    ['04', 'Verify', 'Network', 'Midnight checks the proof on submission. A false one never lands.'],
  ];

  return (
    <section id="how" className="k-reveal border-t border-[rgba(255,247,235,0.07)] px-8 py-24">
      <div className="mx-auto max-w-[1140px]">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
          How it works
        </p>
        <h2 className="mb-12 max-w-[560px] text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
          Four steps. One of them leaves your device.
        </h2>
        <div className="k-reveal-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, title, where, body]) => (
            <article
              key={n}
              className="rounded-[18px] border border-[rgba(255,247,235,0.08)] bg-[rgba(255,247,235,0.03)] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="tnum text-[11px] font-bold text-accent">{n}</span>
                <span className="badge border-[rgba(255,247,235,0.14)] bg-[rgba(255,247,235,0.06)] text-[rgba(255,247,235,0.55)]">
                  {where}
                </span>
              </div>
              <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
              <p className="text-[12px] leading-[1.6] text-[rgba(255,247,235,0.5)]">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Saying plainly what a proof does not establish is worth more than a claim. */
function Honesty() {
  return (
    <section id="honesty" className="k-reveal border-t border-[rgba(255,247,235,0.07)] px-8 py-24">
      <div className="mx-auto grid max-w-[1140px] gap-10 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
            What we don&rsquo;t claim
          </p>
          <h2 className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
            Zero-knowledge proves computation, not honesty.
          </h2>
        </div>
        <div className="flex flex-col gap-5 text-[13px] leading-[1.75] text-[rgba(255,247,235,0.55)]">
          <p>
            A proof shows the arithmetic was carried out correctly against the committed statement.
            It does not show the statement was true to begin with — today&rsquo;s figures are
            self-reported, and we label them that way rather than calling them tamper-proof.
          </p>
          <p>
            The fix is provenance, not more cryptography: data providers co-sign facts at the point
            of ingestion, and the circuit proves the co-signature alongside the arithmetic. That is
            scheduled work, not a claim about today.
          </p>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="k-reveal relative overflow-hidden border-t border-[rgba(255,247,235,0.07)] px-8 py-28 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-40%] left-1/2 size-[620px] -translate-x-1/2 rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle, rgba(212,109,37,0.4) 0%, rgba(212,109,37,0.08) 50%, transparent 72%)',
          filter: 'blur(50px)',
        }}
      />
      <div className="relative">
        <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-[1.05] tracking-[-0.03em]">
          Underwrite the borrower.
          <br />
          Not their privacy.
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/app/overview" className="btn btn-accent px-7 py-[14px] text-[14px]">
            Open the console
          </Link>
          <a
            href="https://github.com/Turnless/kymider"
            className="btn px-7 py-[14px] text-[14px]"
            style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
          >
            Read the architecture
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[rgba(255,247,235,0.07)] px-8 py-8">
      <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-4 text-[11px] text-[rgba(255,247,235,0.35)]">
        <span className="font-black tracking-[1.6px]">KYMIDER</span>
        <div className="flex gap-6">
          <span>Apache-2.0</span>
          <a href="https://github.com/Turnless/kymider">Source</a>
        </div>
      </div>
    </footer>
  );
}
