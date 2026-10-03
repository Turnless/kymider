# Kymider — Wave 1 demo video script

**Target length:** 4 minutes 20 seconds
**Narration:** ~570 words, which is a comfortable, unhurried pace. Do not rush to fit.
**Format:** screen recording. Deck for the argument, live console for the proof.

---

## Before you press record

**Rehearse the console section once.** It is the only unscripted part and the
only place you can fumble. Specifically: pick an instance in the Directory where
you can actually complete the underwriting step, so the verdict appears live
rather than showing an already-answered claim.

**Set up two things side by side:**
- `DECK.html` open in one window, fullscreen (`F`)
- The live console at `turnless.github.io/kymider` in another

**Recording settings:**
- 1080p if your connection allows the upload, 720p is fine
- `Win + G` for Windows Game Bar, or OBS
- Close notifications. A Slack popup mid-demo costs you credibility for free

**If your mic is poor, do not narrate.** Every line below works as an on-screen
caption instead. Judges will not mark you down for captions; they will mark you
down for audio they cannot follow.

**Move the mouse slowly and deliberately.** Fast cursor movement is the single
most common thing that makes a good demo look amateur.

---

## The script

### 0:00 – 0:25 · The problem
**Show:** Deck slide 2 (*Underwriting runs on wholesale disclosure*)

> To borrow money, you hand over your entire financial life. Bank statements,
> balances, payslips, identity documents. To the lender, and usually to two or
> three intermediaries behind them.
>
> The lender needs one thing: does this applicant clear our bar? They receive
> everything instead. Then they have to store it, secure it, and become a breach
> target for it.

---

### 0:25 – 0:42 · The claim
**Show:** Deck slide 3 (landing screenshot, *Prove it. Don't show it.*)

> Kymider answers that question without the disclosure. A borrower proves their
> net worth and debt ratios clear a lender's bar, and never reveals a balance, a
> statement, or a name. It is built on Midnight.

---

### 0:42 – 1:08 · Architecture
**Show:** Deck slide 7 (dual ledger: SolvencyProof + Registry)

*This is the highest-weighted thing in the rubric. Slow down here.*

> The design follows Midnight's dual ledger. Private state belongs to a single
> contract instance, so every borrower deploys their own SolvencyProof instance.
> Their actual figures live in that instance's private state, and never leave the
> device.
>
> The shared Registry is deliberately public-only. It indexes instances and the
> commitment each one currently stands behind. Nothing else.

---

### 1:08 – 1:32 · How the proof binds
**Show:** Deck slide 6 (the four-step flow)

> Four steps. The borrower commits a statement, and only a hash goes on chain. An
> authorized lender names terms: a net-worth floor and a maximum debt-to-income.
> The borrower generates the proof locally, on their own device. Midnight verifies
> it, and the contract records a pass or fail.
>
> The circuit recomputes the commitment in-circuit from the private facts and
> asserts it matches. So a proof built on figures the borrower has since changed
> cannot pass.

---

### 1:32 – 3:15 · LIVE CONSOLE
**Show:** Switch to the browser. `turnless.github.io/kymider`

*Do this whole block in one unbroken take. An unedited run is itself evidence
the thing works.*

**1:32** — Landing page, click **Open the console**

> This is the live console. It runs the real compiled contracts in your browser.
> No wallet extension, no node, nothing to install.

**1:45** — You are on the borrower's **Overview**. Hover the figures.

> Here is the borrower's own view. Net worth, debt-to-income, and four lenders who
> have asked for a claim, with the verdict on each.

**2:00** — Point at the **ON-CHAIN RECORD** panel on the right.

> And here is everything that is actually on chain. An instance id, a commitment
> hash, and a circuit tag. No balances. They are not hidden behind a permission,
> they are simply never written.

**2:15** — Click **Private facts** in the sidebar. Pause on the badge.

> The figures are entered here and stay here. The product says so itself:
> nothing on this screen is transmitted.

**2:30** — Click **Commit new facts** (or edit a figure and commit).

> Committing a statement writes a hash. The numbers stay on the device.

**2:45** — Bottom-left, switch **Borrower → Lender**. The Directory loads.

> Now the same system from the lender's side. This is the entire public surface:
> instance ids, commitment hashes, attestation counts, status. No balance, no
> income, no name.

**2:55** — Click **Open** on an instance.

> Let me underwrite this borrower. I set a minimum net worth and a maximum
> debt-to-income, and request a claim.

**3:05** — Enter terms, submit, and **hold on the verdict for four full seconds.**

> Pass. Verified by the network before it was recorded.
>
> And that is the whole point. I have my answer, and I have not learned a single
> one of their figures.

*Do not talk over this moment. Let it sit.*

---

### 3:15 – 3:38 · Quality assurance
**Show:** Deck slide 10 (49 tests / 5 CI jobs / 2 wallets)

> Neither half of the Midnight toolchain runs on my machine. The Compact compiler
> is a Linux binary and the devnet needs Docker. So CI became the development loop
> rather than a check at the end.
>
> Forty-nine offline contract tests, and a two-wallet devnet simulation against
> real proofs, including the negative cases: a lender cannot call a borrower-only
> circuit, and a proof against a stale commitment fails.

---

### 3:38 – 3:54 · Market
**Show:** Deck slide 11 (market and adoption)

> On-chain lenders adopt this first. DeFi lending is over-collateralised because
> a borrower cannot be assessed without disclosure. This is the missing primitive,
> and it is a capital-efficiency argument, not a privacy nicety.

---

### 3:54 – 4:12 · Roadmap and the honest limit
**Show:** Deck slide 12 (roadmap)

> Wave 2 makes each loan its own contract instance with a full on-chain lifecycle.
> Wave 3 reaches traditional banks through signed off-chain attestations.
>
> And one honest limit: zero-knowledge proves computation, not honesty. The circuit
> guarantees the arithmetic was correct on the committed figures. It cannot know
> whether those figures were true. Closing that needs attested data providers, and
> that is stated inside the product itself.

---

### 4:12 – 4:20 · Close
**Show:** Deck slide 13 (links)

> Kymider. Prove it, don't show it. The console is live, the repository is public.
> Thank you.

---

## Why the order is what it is

The rubric weights **Engineering at 40%** and **User Experience at 15%**, so the
architecture explanation comes early and the live console gets the largest single
block — 103 seconds, roughly 40% of the runtime. Communication is only 10%, which
is why this is a clean screen recording rather than motion graphics: polish would
cost time and hide the thing being scored.

Mentioning the honest limit near the end is deliberate. It reads as engineering
maturity rather than a gap, and judges consistently reward a project that names
what it cannot do.

## If you run over

Cut in this order, and never past the third one:

1. Market section (3:38–3:54). Worth 5%.
2. The intro problem statement, down to two sentences.
3. Roadmap, down to one sentence on Wave 2.

**Never cut the console block or the architecture slide.** Those are 55% of your
score between them.

## After recording

- Watch it once, start to finish
- Re-record only if something is actually broken, not because you dislike your voice
- Upload unlisted to YouTube, 720p or 1080p
- Paste the link into the AKINDO submission alongside the repo and the deck PDF
