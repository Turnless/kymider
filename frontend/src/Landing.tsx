import { Link } from 'react-router-dom';

/**
 * Figures filled in at integration from the runs they come from. They are
 * strings on purpose: until they are filled, the page shows the placeholder
 * rather than a number nobody measured.
 *
 *   UNIT_TESTS   `npm run test:unit` → "Tests  N passed"
 *   E2E_TESTS    `cd frontend && npm run e2e` → total across the desktop and phone projects
 *   CIRCUITS     impure circuits across the 4 contracts (zkir files), pure
 *                helpers not counted
 */
const UNIT_TESTS = '339';
const E2E_TESTS = '48';
const CIRCUITS = '23';
/** tests/simulation: 11 Wave 1 + 7 Wave 2 cases. Recheck if the lifecycle adds one. */
const DEVNET_CASES = '18';

const REPO = 'https://github.com/Turnless/kymider';

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
      {/* Each panel gets a track: the track is the scroll distance, the panel
          inside pins to the top while the next one laps it. */}
      <div className="k-over">
        <div className="k-track">
          <HowItWorks />
        </div>
        <div className="k-track">
          <Ledger />
        </div>
        <div className="k-track">
          <Evidence />
        </div>
        <div className="k-track">
          <AuditorPreview />
        </div>
        <div className="k-track">
          <Simulated />
        </div>
        <div className="k-track k-track--final">
          <Closing />
        </div>
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
        <a href="#ledger" className="hidden text-inherit hover:text-cream md:inline">
          What is public
        </a>
        <a href="#simulated" className="hidden text-inherit hover:text-cream sm:inline">
          What is simulated
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
 * a title card instead of a centred slide. The one number sits under it.
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
          Midnight Buildathon · Wave 2
        </span>
        <h1 className="max-w-[15ch] text-[clamp(2.9rem,8vw,6.5rem)] font-black leading-[0.92] tracking-[-0.045em]">
          Prove it.
          <br />
          <span className="text-[rgba(255,247,235,0.32)]">Don&rsquo;t show it.</span>
        </h1>

        <div className="mt-8 grid gap-7 border-t border-[rgba(255,247,235,0.1)] pt-7 sm:mt-10 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-14">
          <div>
            <p className="tnum text-[clamp(3.4rem,7vw,5.6rem)] font-black leading-none tracking-[-0.04em] text-accent">
              110%
            </p>
            <p className="mt-2 text-[12px] font-semibold text-[rgba(255,247,235,0.62)]">
              collateral, not 150% ·{' '}
              <span className="tnum text-cream">11,000</span> on a 10,000 loan, not{' '}
              <span className="tnum line-through">15,000</span>
            </p>
          </div>
          <div className="flex flex-col gap-5">
            <p className="max-w-[460px] text-[14px] leading-[1.7] text-[rgba(255,247,235,0.62)]">
              A borrower proves in zero knowledge that their balance, debts and income clear a
              lender&rsquo;s bar. The figures stay on their device. A lender can only offer the
              tier&rsquo;s figure — <span className="text-cream">110% for a verified borrower</span> —
              and only the borrower can make it binding.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/app/overview" className="btn btn-accent px-7 py-[14px] text-[14px]">
                Open the console →
              </Link>
              <Link
                to="/app/applications"
                className="btn px-7 py-[14px] text-[14px]"
                style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
              >
                See the lender view
              </Link>
            </div>
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

/** Shared section header: eyebrow, then the claim. */
function Heading({ eyebrow, title, dark }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">{eyebrow}</p>
      <h2
        className={[
          'mb-8 max-w-[760px] text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]',
          dark ? 'text-cream' : 'text-ink',
        ].join(' ')}
      >
        {title}
      </h2>
    </>
  );
}

function HowItWorks() {
  const steps = [
    [
      '01',
      'Commit your facts',
      'Your device',
      'Balance, debts and income stay in private state. The ledger gets one salted hash of them, with a 32-byte salt that never leaves the device.',
    ],
    [
      '02',
      'The lender quotes a bar',
      'Public',
      'A net-worth floor and a debt-to-income limit, valid for at least 30 minutes. At most 3 quotes per loan. While it is live and unanswered, the lender can neither re-quote nor offer 150%.',
    ],
    [
      '03',
      'Prove the tier',
      'Zero knowledge',
      'proveTier checks your facts against the commitment and the bar, in a circuit. It writes one word to the ledger: VERIFIED or STANDARD. Or waive the proof: nothing is revealed, and the offer is 150%.',
    ],
    [
      '04',
      'Offer 110%, you accept',
      'Contract',
      'For a verified borrower the lender can offer only 11,000 on 10,000. A 150% ask is refused by the contract. Nothing binds until you accept, naming the figure.',
    ],
  ];

  return (
    <section id="how" className="k-stack bg-cream px-5 py-20 text-ink sm:px-8 sm:py-28 lg:py-12" style={{ zIndex: 1 }}>
      <div className="k-reveal mx-auto w-full max-w-[1140px]">
        <Heading eyebrow="How it works · one Loan contract per loan" title="Four steps. Your figures never leave your device." />
        <div className="k-reveal-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([n, title, where, body]) => (
            <article key={n} className="card p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="tnum text-[11px] font-bold text-accent">{n}</span>
                <span className="badge badge-neutral">{where}</span>
              </div>
              <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
              <p className="text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">{body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-[720px] text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">
          Ask a verified borrower for 15,000 and the call fails with the contract&rsquo;s own assert:{' '}
          <code className="font-mono text-ink">collateral does not match the tier</code>. The console
          lets you try it.
        </p>
      </div>
    </section>
  );
}

/** The dual ledger, both halves at once: what stays private beside what does not. */
function Ledger() {
  const priv = [
    ['Balance, debts, income', 'proveTier inputs only'],
    ['The 32-byte facts salt', 'Never in a transaction'],
    ['Secret key, history seed, nonces', 'Witnesses'],
    ['Which loans back a history proof', 'Merkle paths, private inputs'],
  ];
  const pub = [
    ['Salted facts commitment', 'One hash'],
    ['The bar, the tier, its expiry', 'Up to 3 answers per loan'],
    ['Collateral, terms, owed, due dates', 'So the lender can enforce them'],
    ['Payments made, late count, amounts', 'Each repay amount is an input'],
    ['Listings: keys, principal, status', 'Anyone can count a key’s repaid loans'],
  ];

  return (
    <section id="ledger" className="k-stack bg-espresso px-5 py-20 text-cream sm:px-8 sm:py-28 lg:py-12" style={{ zIndex: 2 }}>
      <div className="k-reveal mx-auto w-full max-w-[1140px]">
        <Heading
          dark
          eyebrow="Midnight’s dual ledger · a lender has to be able to enforce the loan"
          title="The facts are private. The loan is public."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <LedgerList title="Stays on your device" tone="private" rows={priv} />
          <LedgerList title="On the public ledger" tone="public" rows={pub} />
        </div>
      </div>
    </section>
  );
}

function LedgerList({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'private' | 'public';
  rows: string[][];
}) {
  return (
    <div className="rounded-[18px] border border-[rgba(255,247,235,0.1)] bg-[rgba(255,247,235,0.03)] p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-bold">{title}</h3>
        <span
          className={
            tone === 'private'
              ? 'badge badge-pass-dark'
              : 'badge border border-[rgba(255,247,235,0.18)] text-[rgba(255,247,235,0.7)]'
          }
        >
          {tone === 'private' ? 'Private' : 'Public'}
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map(([what, why]) => (
          <li
            key={what}
            className="flex flex-col gap-[2px] border-t border-[rgba(255,247,235,0.07)] py-[7px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span className="text-[13px] font-semibold">{what}</span>
            <span className="text-[11px] text-[rgba(255,247,235,0.45)] sm:text-right">{why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Numbers a judge can rerun, each with the command that produces it. */
function Evidence() {
  const cards = [
    ['4', 'Compact contracts', `${CIRCUITS} circuits. Compiled by CI on every push, toolchain 0.31.1.`],
    [UNIT_TESTS, 'Offline tests', 'Drive the compiled contracts, every refusal included. npm run test:unit'],
    [E2E_TESTS, 'Browser tests', 'The README fast path and each refusal, at 1440 and 390 px. npm run e2e'],
    [
      DEVNET_CASES,
      'Devnet cases',
      <>
        Real zero-knowledge proofs, two wallets, a local Midnight node. In CI.{' '}
        <a href={`${REPO}/blob/main/DEVNET-PROOF.md`} className="underline">
          DEVNET-PROOF.md
        </a>
      </>,
    ],
  ] as const;

  return (
    <section id="proof" className="k-stack bg-cream px-5 py-20 text-ink sm:px-8 sm:py-28 lg:py-12" style={{ zIndex: 3 }}>
      <div className="k-reveal mx-auto w-full max-w-[1140px]">
        <div className="flex flex-wrap items-end justify-between gap-x-6">
          <div>
            <Heading eyebrow="Evidence" title="Every number here comes from a command you can run." />
          </div>
          <a
            href={`${REPO}#tests-and-scripts`}
            className="btn btn-ink mb-8 px-6 py-[12px] text-[13px]"
          >
            Tests and scripts →
          </a>
        </div>
        <div className="k-reveal-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([n, title, body]) => (
            <article key={title} className="card p-5">
              <p className="tnum mb-3 text-[30px] [overflow-wrap:anywhere] font-black leading-none tracking-[-0.02em]">{n}</p>
              <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
              <p className="text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Wave 3, already runnable: an integrity check, not a privacy feature. */
function AuditorPreview() {
  return (
    <section id="auditor" className="k-stack bg-espresso px-5 py-20 text-cream sm:px-8 sm:py-28 lg:py-12" style={{ zIndex: 4 }}>
      <div className="k-reveal mx-auto grid w-full max-w-[1140px] gap-10 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[1px] text-accent">
            Wave 3 preview · the auditor
          </p>
          <h2 className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.02em]">
            Check a payment history offline, against one on-chain hash.
          </h2>
          <Link to="/app/audit" className="btn btn-accent mt-8 px-6 py-[12px] text-[13px]">
            Try the auditor →
          </Link>
        </div>
        <div className="flex flex-col gap-5 text-[13px] leading-[1.75] text-[rgba(255,247,235,0.55)]">
          <p>
            Each repayment extends a hash chain on the loan. The borrower exports the log; the
            auditor recomputes the chain and compares the result with the loan&rsquo;s{' '}
            <code className="font-mono text-cream">historyCommitment</code>. In the console, 3
            payments land on the head exactly; change one amount and the check fails.
          </p>
          <p>
            This proves integrity, not secrecy. Each repay amount and the late count are already
            public on the ledger; the export adds the nonces that make the chain checkable without a
            Midnight node.
          </p>
          <p>
            Wave 3 adds attested facts: a data provider co-signs balance, debts and income, so a
            VERIFIED tier rests on more than the borrower&rsquo;s word.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Saying plainly what is simulated is worth more than a claim. */
function Simulated() {
  const items = [
    [
      'The console',
      'Runs the compiled Loan and LoanDirectory contracts in your browser, on a simulated ledger with a demo block clock. It executes the circuits; it does not generate proofs or use a wallet.',
    ],
    [
      'Real proofs',
      `${DEVNET_CASES} devnet cases prove and submit in CI on every push, and the full loan flow is proven on that devnet and read back. Preprod: pending; until it runs, the console's Live chain view says it is not deployed.`,
    ],
    [
      'Money',
      'No token moves. Collateral, principal and balances are figures in contract state.',
    ],
    [
      'The facts',
      'Self-reported. Anyone can commit figures that clear the bar, so today a VERIFIED tier costs nothing to get. Attested provenance in Wave 3 is the fix.',
    ],
  ];

  return (
    <section id="simulated" className="k-stack bg-cream px-5 py-20 text-ink sm:px-8 sm:py-28 lg:py-12" style={{ zIndex: 5 }}>
      <div className="k-reveal mx-auto w-full max-w-[1140px]">
        <Heading eyebrow="What is simulated · unaudited, no external review" title="Zero knowledge proves the arithmetic, not that the figures are true." />
        <div className="k-reveal-stagger grid gap-4 sm:grid-cols-2">
          {items.map(([title, body]) => (
            <article key={title} className="card p-5">
              <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
              <p className="text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="k-stack relative overflow-hidden bg-espresso px-5 py-24 text-center text-cream sm:px-8 sm:py-32 lg:py-12" style={{ zIndex: 6 }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-40%] left-1/2 size-[620px] -translate-x-1/2 rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle, rgba(212,109,37,0.4) 0%, rgba(212,109,37,0.08) 50%, transparent 72%)',
          filter: 'blur(50px)',
        }}
      />
      <div className="k-reveal relative w-full">
        <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-[1.05] tracking-[-0.03em]">
          Post 110%.
          <br />
          Keep the figures.
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/app/overview" className="btn btn-accent px-7 py-[14px] text-[14px]">
            Open the console
          </Link>
          <a
            href={REPO}
            className="btn px-7 py-[14px] text-[14px]"
            style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
          >
            Read the README
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-[7] border-t border-[rgba(255,247,235,0.07)] bg-espresso px-5 py-8 text-cream sm:px-8">
      <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-4 text-[11px] text-[rgba(255,247,235,0.35)]">
        <span className="font-black tracking-[1.6px]">KYMIDER</span>
        <div className="flex gap-6">
          <span>Apache-2.0</span>
          <a href={REPO}>Source</a>
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
