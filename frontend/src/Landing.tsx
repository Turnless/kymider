import { useState } from 'react';
import { Link } from 'react-router-dom';
import overviewShot from './assets/shots/overview.jpg';
import factsShot from './assets/shots/facts.jpg';
import underwritingShot from './assets/shots/underwriting.jpg';

/**
 * The landing alternates between the console's two grounds — espresso and
 * cream — rather than staying dark the whole way down. The dark bands carry
 * the argument, the light bands carry the evidence, and the switch is what
 * gives a single-page pitch any rhythm at all.
 */
export function Landing() {
  return (
    <div className="bg-espresso">
      <ScrollProgress />
      <Nav />
      {/* The hero pins; everything after it is opaque and rides over the top. */}
      <Hero />
      <div className="k-over">
        <Disclosure />
        <ConsoleShowcase />
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
    <nav className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-[1140px] items-center justify-between gap-4 px-5 py-5 text-cream sm:px-8 sm:py-6">
      <span className="flex items-center gap-2 text-[11px] font-black tracking-[1.6px]">
        <Mark />
        KYMIDER
      </span>
      <div className="flex items-center gap-5 text-[12px] font-medium text-[rgba(255,247,235,0.6)] sm:gap-7">
        {/* The section links collide with the wordmark on a phone; the one
            that matters there is the call to action. */}
        <a href="#how" className="hidden text-inherit hover:text-cream sm:inline">
          How it works
        </a>
        <a href="#honesty" className="hidden text-inherit hover:text-cream sm:inline">
          What we claim
        </a>
        <Link to="/app/overview" className="btn btn-accent px-4 py-[7px] text-[12px]">
          Open console
        </Link>
      </div>
    </nav>
  );
}

/**
 * Bottom-anchored rather than centred: the headline sits on the fold line with
 * the wordmark bled off the right edge behind it, so the first screen reads as
 * a title card instead of a centred slide.
 */
function Hero() {
  return (
    <header className="k-pin relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-espresso px-5 pb-8 pt-24 text-cream sm:px-8 sm:pb-10">
      <ArcGlow />

      {/* The wordmark is set enormous and cropped by the hero's own overflow,
          so it reads as texture rather than a second heading. */}
      <span
        aria-hidden="true"
        className="k-parallax pointer-events-none absolute -bottom-[3%] -right-[9%] select-none text-[20vw] font-black leading-none tracking-[-0.05em] text-[rgba(255,247,235,0.022)]"
      >
        KYMIDER
      </span>

      <div className="k-hero-out relative mx-auto w-full max-w-[1140px]">
        <span className="badge mb-6 inline-flex border border-[rgba(212,109,37,0.4)] bg-[rgba(212,109,37,0.12)] text-accent">
          Built on Midnight
        </span>
        <h1 className="max-w-[15ch] text-[clamp(2.9rem,8vw,6.5rem)] font-black leading-[0.92] tracking-[-0.045em]">
          Prove it.
          <br />
          <span className="text-[rgba(255,247,235,0.32)]">Don&rsquo;t show it.</span>
        </h1>

        <div className="mt-8 flex flex-col gap-8 border-t border-[rgba(255,247,235,0.1)] pt-7 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[440px] text-[14px] leading-[1.7] text-[rgba(255,247,235,0.62)]">
            Borrowers prove their net worth and debt ratios clear a lender&rsquo;s bar — without
            handing over a balance, a statement, or a name. The network verifies the proof. Nobody
            sees the numbers.
          </p>
          <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </div>
    </header>
  );
}

/** A cropped ring plus a soft bloom — light spilling in from off-canvas. */
function ArcGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="k-parallax absolute -right-[28%] -top-[45%] size-[min(150vw,1100px)] rounded-full"
        style={{
          border: '1px solid rgba(212,109,37,0.38)',
          filter: 'blur(2px)',
          boxShadow:
            '0 0 120px 24px rgba(212,109,37,0.18), inset 0 0 140px 30px rgba(212,109,37,0.10)',
        }}
      />
      <div
        className="k-parallax absolute -right-[12%] -top-[22%] size-[min(110vw,780px)] rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle, rgba(212,109,37,0.42) 0%, rgba(212,109,37,0.10) 45%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
    </div>
  );
}

/** The pitch in one gesture: the same decision, without the exposure. */
function Disclosure() {
  const [showLender, setShowLender] = useState(false);

  return (
    <section className="bg-cream px-5 py-20 text-ink sm:px-8 sm:py-28">
      <div className="k-reveal mx-auto max-w-[1140px]">
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
          <div className="flex rounded-[11px] bg-[rgba(15,23,42,0.06)] p-[3px]">
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
                    ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                    : 'text-[rgba(15,23,42,0.5)] hover:text-ink',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <p className="mb-5 text-[12px] text-[rgba(15,23,42,0.5)]">
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
              <div key={label} className="rounded-[14px] bg-[rgba(15,23,42,0.03)] px-5 py-4">
                <p className="mb-[6px] text-[9px] font-bold uppercase tracking-[0.7px] text-[rgba(15,23,42,0.45)]">
                  {label}
                </p>
                <p
                  className="tnum text-[22px] font-bold"
                  style={{ color: showLender ? 'rgba(15,23,42,0.3)' : 'var(--color-ink)' }}
                >
                  {showLender ? 'not disclosed' : value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[rgba(15,23,42,0.07)] pt-5">
            {showLender ? (
              <>
                <span className="badge badge-pass">Pass</span>
                <p className="text-[12px] text-[rgba(15,23,42,0.6)]">
                  Net worth ≥ $500,000 and DTI ≤ 40% both hold. Verified by the network before it
                  was recorded.
                </p>
              </>
            ) : (
              <>
                <span className="badge badge-neutral">Private</span>
                <p className="text-[12px] text-[rgba(15,23,42,0.6)]">
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

/**
 * Real captures of the running console, not mockups — the product is the
 * argument, and it is live, so there is no reason to draw it.
 */
function ConsoleShowcase() {
  return (
    <section className="bg-espresso px-5 py-20 text-cream sm:px-8 sm:py-28">
      <div className="k-reveal mx-auto max-w-[1140px]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
              Not a mockup
            </p>
            <h2 className="max-w-[18ch] text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
              The contracts run in your browser.
            </h2>
          </div>
          <Link to="/app/overview" className="btn btn-accent px-6 py-[12px] text-[13px]">
            Try it yourself →
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Shot
            src={underwritingShot}
            alt="The lender console showing a network-verified Fail verdict, with cash, debts and income all reading not disclosed"
            title="A verdict, and nothing else"
            body="The lender sees pass or fail against the terms they set. Every figure behind it reads not disclosed."
            className="lg:col-span-3"
          />
          <Shot
            src={factsShot}
            alt="The borrower's private facts screen recomputing net worth and debt-to-income as figures are typed"
            title="Arithmetic that matches the circuit"
            body="Net worth and DTI recompute as you type, cross-multiplied exactly as the contract does."
            className="lg:col-span-2"
          />
          <Shot
            src={overviewShot}
            alt="The borrower overview listing four lender requests with their attestation results"
            title="Every verdict is the contract's"
            body="Six SolvencyProof instances and a Registry are deployed into the page at load. Nothing here is stubbed."
            className="lg:col-span-5"
            wide
          />
        </div>
      </div>
    </section>
  );
}

function Shot({
  src,
  alt,
  title,
  body,
  className = '',
  wide = false,
}: {
  src: string;
  alt: string;
  title: string;
  body: string;
  className?: string;
  wide?: boolean;
}) {
  return (
    <figure
      className={`overflow-hidden rounded-[18px] border border-[rgba(255,247,235,0.1)] bg-[rgba(255,247,235,0.03)] ${className}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`w-full border-b border-[rgba(255,247,235,0.08)] object-cover object-top ${
          wide ? 'h-[180px] sm:h-[260px]' : 'h-[200px] sm:h-[230px]'
        }`}
      />
      <figcaption className="p-5">
        <h3 className="mb-[6px] text-[14px] font-bold">{title}</h3>
        <p className="text-[12px] leading-[1.6] text-[rgba(255,247,235,0.5)]">{body}</p>
      </figcaption>
    </figure>
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
    <section id="how" className="bg-cream px-5 py-20 text-ink sm:px-8 sm:py-28">
      <div className="k-reveal mx-auto max-w-[1140px]">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
          How it works
        </p>
        <h2 className="mb-12 max-w-[560px] text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
          Four steps. One of them leaves your device.
        </h2>
        <div className="k-reveal-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, title, where, body]) => (
            <article key={n} className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="tnum text-[11px] font-bold text-accent">{n}</span>
                <span className="badge badge-neutral">{where}</span>
              </div>
              <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
              <p className="text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">{body}</p>
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
    <section id="honesty" className="bg-espresso px-5 py-20 text-cream sm:px-8 sm:py-28">
      <div className="k-reveal mx-auto grid max-w-[1140px] gap-10 lg:grid-cols-2">
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
    <section className="relative overflow-hidden bg-espresso px-5 py-24 text-center text-cream sm:px-8 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-40%] left-1/2 size-[620px] -translate-x-1/2 rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle, rgba(212,109,37,0.4) 0%, rgba(212,109,37,0.08) 50%, transparent 72%)',
          filter: 'blur(50px)',
        }}
      />
      <div className="k-reveal relative">
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
    <footer className="border-t border-[rgba(255,247,235,0.07)] bg-espresso px-5 py-8 text-cream sm:px-8">
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

function Mark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="var(--color-accent)" />
    </svg>
  );
}
