# Kymider - Wave 2 demo video script

**Length:** 2:55 (target window 2:30-3:00).
**Narration:** 337 words, about 115 words per minute, which leaves room
for pauses. Do not rush; cut from the "If you run over" list instead.
**Audio is required.** A Wave 1 judge asked another team for narration. Record
the voice track; add captions from the same lines if you can.
**Format:** one screen recording of the live console, plus three deck slides
(3, 11, 12 of `hackathon/wave2/DECK.html`).

The "Do" lines follow the README's judge fast path, which runs in CI as
`frontend/e2e/fast-path.spec.ts`. If a label differs on screen, adjust the "Do"
line, not the narration. Every bold label below was checked against the
console source (`frontend/src/lender/LenderLoan.tsx`,
`frontend/src/borrower/LoanDetail.tsx`) and the shots in `deck/shots/`.

---

## Before you press record

- Console at <https://turnless.github.io/kymider/> in a clean browser profile
  (no extensions, zoom 110%, window 1920×1080). Reload so the simulated ledger
  starts fresh. (Pages serves the Wave 2 console once `wave2` is merged to
  `main`.)
- The console seeds two repaid loans for the borrower, so the history proof at
  2:05 needs no preparation.
- A second tab with the latest green CI run
  (<https://github.com/Turnless/kymider/actions/workflows/ci.yml>), open on the
  "Devnet simulation" job's "Verify the record against the devnet" step. Preprod
  is pending; once the Preprod run has committed `PROOF.md`, use that file on
  GitHub instead, and the 2:25 alternative below.
- `DECK.html` in a third tab, on slide 3 (the 110% number; open `DECK.html#3`).
- Notifications off. Move the mouse slowly; pause one beat after every click so
  the result is on screen before you speak about it.

---

## The script

### 0:00-0:10 · Hook
**Show:** Deck slide 3, the 11,000 vs 15,000 comparison.

> DeFi lenders can't see your finances, so everyone posts 150% collateral.
> Kymider lets a borrower prove they clear the bar, privately, and post 110%.

---

### 0:10-1:05 · Borrower proves a tier
**Show:** Switch to the console tab.

**0:10** - **Do:** Landing → **Open the console →**. You are the borrower.
Click **Private facts**, hover the three figures.

> These are the borrower's balance, debts and income. They stay on this device.
> On chain there is only a salted hash of them.

**0:20** - **Do:** **Loans**. Lender: **Harbor Bank** (the default; the
lender console acts as Harbor Bank unless you change **Acting as** in the
lender rail, so keep it). Principal
**10,000**, interest **10**%, **3** installments. Point at the two collateral
figures. Click **Apply to Harbor Bank**.

> I apply for 10,000. Each loan is its own contract instance on Midnight.
> The form already shows the price of each answer: 11,000 if verified,
> 15,000 if not.

**0:36** - **Do:** Switch **Borrower → Lender** (bottom-left of the rail).
**Applications** → open the new loan → **Send quote** (net worth at least
$500,000, DTI at most 40%, valid 72 hours).

> Now I'm the lender. I name my bar: a net-worth floor and a maximum
> debt-to-income ratio. That quote is public.

**0:50** - **Do:** Switch to **Borrower**. **Loans** → the loan →
**Prove tier**. Wait for **Verified · 110%**.

> The borrower proves against it. The circuit recomputes the hash from the
> private figures, checks it matches, and writes one word to the ledger:
> verified.

---

### 1:05-1:45 · The lender sees the tier, and cannot ask for more
**1:05** - **Do:** Switch to **Lender**, open the loan. Hold the cursor still
on the tier, then on the *not disclosed* figures, for three seconds.

> Here's what the lender sees. Tier: verified. Balance, debts, income: not
> disclosed. Never written to the chain.

**1:15** - **Do:** Click **Ask for 150% anyway · 15,000**. Let the red error
sit on screen for four seconds.

> Can the lender charge a verified borrower the full 150%? I try. Refused:
> "collateral does not match the tier". The circuit checks the exact floor of
> 110% by cross-multiplying, since Compact has no division. And while the tier
> is live, the lender can't re-quote to clear it.

*Do not talk over the error. Let it sit.*

**1:32** - **Do:** Click **Offer at 110% · 11,000**. The desk shows "Waiting
for the borrower to accept". Switch to **Borrower**, open the loan: "Your step
· Accept or decline", "Harbor Bank offers $11,000 collateral (110%)". Click
**Accept**. Status: **Active**.

> So the lender offers 11,000. Nothing binds until the borrower accepts.
> Now it does.

---

### 1:45-2:25 · Repay, history proof, auditor
**1:45** - **Do:** Switch to **Lender** → **Disburse**. Switch to **Borrower**:
**+31 days**, **Repay $3,667** (marked late), **Repay $3,667**, **+30 days**,
**Repay $3,666**. Status: **Repaid in full**. Switch to **Lender** →
**Record repayment in the directory**.

> The borrower repays three installments. Late or on time is decided by block
> time, not by the borrower. Each payment extends a hash chain on the loan.

**2:05** - **Do:** As the borrower, apply for a second loan. On it, under
**Prove two repaid loans**, tick two and click **Prove two repaid loans**. The
lender's application list shows **2 prior repaid loans proven**.

> On a new application, the borrower proves two earlier loans were repaid,
> against a Merkle tree in the directory, without saying which ones.

**2:15** - **Do:** Open the repaid loan → **Open history to an auditor** →
**Copy JSON**. Switch to **Auditor**, paste, **Verify against the chain**:
**Verified**. Change one amount, verify again: **Rejected**.

> An auditor checks the exported history against the on-chain hash. It
> matches exactly. Change one amount, and it doesn't.

---

### 2:25-2:40 · On-chain proof
**Show:** the CI tab, on the "Devnet simulation" job's verify step ("All ...
checks PASS").

**2:25** - **Do:** Scroll the `prove:onchain` step to the `proveTier` and
`underwrite` transactions, then to the verify step's PASS line.

> In CI, the same contracts run on a Midnight devnet with real proofs, on
> every push. Every transaction is recorded and read back. 307 offline tests
> and 46 browser tests back every step.

*After the Preprod run (owner):* show `PROOF.md` on GitHub instead, click one
hash into the explorer ({{PREPROD_TX}}), and say "The same contracts run on
Midnight Preprod. These are the transactions." in place of the first two
sentences.

---

### 2:40-2:55 · What is simulated, what's next
**Show:** Deck slide 11 (roadmap), then slide 12 (close).

> The figures stay private, the loan stays public and enforceable. No token
> moves yet, and the figures are self-reported, so today anyone can be
> verified. Wave 3 adds attested data providers. Kymider: prove it privately,
> post 110%.

---

## Word count by section

Narration words, numbers counted as one word each.

| Section | Time | Words |
|---|---|---|
| Hook | 0:00-0:10 | 24 |
| Borrower proves a tier | 0:10-1:05 | 96 |
| Lender view, refusal, offer and accept | 1:05-1:45 | 78 |
| Repay, history, auditor | 1:45-2:25 | 69 |
| On-chain | 2:25-2:40 | 33 |
| What is simulated, next | 2:40-2:55 | 37 |

## If you run over

Cut in this order:

1. The Private facts hover at 0:10 (start at **Loans**). Saves 10 s.
2. The auditor edit-and-fail at 2:15 (keep the green verify). Saves 5 s.
3. Repayments: say the narration over the clicks without pausing. Saves 6 s.

**Never cut the lender's "not disclosed" view, the 150% refusal or the
borrower's Accept.** Those three moments are the product.

## After recording

- Watch it once end to end, with sound.
- Upload unlisted to YouTube, 1080p. Put the link in the README table and the
  AKINDO form ({{VIDEO_URL}}).
