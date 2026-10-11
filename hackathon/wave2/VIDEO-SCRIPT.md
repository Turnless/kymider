# Kymider - Wave 2 demo video script

**Length:** 3:00 (target window 2:30-3:00).
**Narration:** 298 words (plus a 15-word optional beat), about 115 words per
minute, which leaves room for pauses. Do not rush; cut from the "If you run over" list instead.
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
  starts fresh. (`wave2` is merged to `main`, so Pages serves the Wave 2
  console.)
- The console seeds two repaid loans for the borrower, so the track-record
  proof at 2:00 needs no preparation.
- A second tab with `DEVNET-PROOF.md` on GitHub
  (<https://github.com/Turnless/kymider/blob/main/DEVNET-PROOF.md>): 37 transactions, 3 refusals and 54 of 54
  read-back checks from CI run 38152734953 on commit `d03bf03` (the current
  contracts). Preprod is pending; once the
  Preprod run has committed `PROOF.md`, use that file instead, and the 2:25
  alternative below.
- The deck in a third tab, on slide 3 (the 110% number):
  <https://turnless.github.io/kymider/deck/#3>.
- Notifications off. Move the mouse slowly; pause one beat after every click so
  the result is on screen before you speak about it.

---

## The script

Every line names a Kymider figure, screen or contract message; no line could
open someone else's demo. Figures are the ones the console shows for this path.

### 0:00-0:12 · Hook
**Show:** Deck slide 3, the 11,000 vs 15,000 comparison.

> Borrowing 10,000 in DeFi means locking 15,000, because the lender can't see
> your books. Kymider proves you clear its bar, privately. You lock 11,000.

---

### 0:12-1:05 · Borrower proves a tier
**Show:** Switch to the console tab.

**0:12** - **Do:** Landing → **Open the console →**. You are the borrower.
Click **Private facts**, hover the three figures.

> Balance one million, debts three hundred thousand, income one million. Those
> figures never leave this browser. Midnight holds only their salted hash.

**0:22** - **Do:** **Loans**. Lender: **Harbor Bank** (the default; the
lender console acts as Harbor Bank unless you change **Acting as** in the
lender rail, so keep it). Principal **10,000**, interest **10**%, **3**
installments. Point at the two collateral figures. Click **Apply to Harbor
Bank**.

> I ask Harbor Bank for 10,000. The form prices both answers before I apply:
> 11,000 if I'm verified, 15,000 if not. This loan is its own contract.

**0:36** - **Do:** Switch **Borrower → Lender** (bottom-left of the rail).
**Applications** → open the new loan → **Send quote** (net worth at least
$500,000, DTI at most 40%, valid 72 hours).

> As Harbor Bank I set the bar: net worth 500,000, debt under 40% of income.

*Optional beat (about 8 s; cut first if you run over):* **Do:** click
**Offer 150% before they prove · 15,000**. The contract refuses with "the
borrower can prove until the quote lapses".

> 15,000 before the borrower answers? Refused: the borrower can prove until
> the quote lapses.

**0:48** - **Do:** Switch to **Borrower**. **Loans** → the loan →
**Prove tier**. Wait for **Verified · 110%**.

> Prove tier. The circuit rebuilds the hash from my figures, matches it to the
> chain, and publishes one word: verified.

---

### 1:05-1:45 · Harbor Bank sees the tier, and cannot ask for more
**1:05** - **Do:** Switch to **Lender**, open the loan. Hold the cursor still
on the tier, then on the *never leaves the borrower* list, for three seconds.

> Harbor Bank sees verified and its own bar. Balance, debts, income: never
> leave the borrower.

**1:13** - **Do:** Click **Ask for 150% anyway · 15,000**. Let the red error
sit on screen for four seconds.

> I try 15,000 anyway. Refused: collateral does not match the tier. Compact
> can't divide, so the circuit checks 110% by cross-multiplying. Re-quoting to
> wipe the tier is refused too.

*Do not talk over the error. Let it sit.*

**1:32** - **Do:** Click **Offer at 110% · 11,000**. The desk shows "Waiting
for the borrower to accept". Switch to **Borrower**, open the loan: "Your step
· Accept or decline", "Harbor Bank offers $11,000 collateral (110%)". Click
**Accept**. Status: **Active**.

> 11,000 is the only figure the contract takes, and it binds when I accept it,
> naming 11,000. Active.

---

### 1:45-2:30 · Repay, the track record, the auditor
**1:45** - **Do:** Switch to **Lender** → **Disburse**. Switch to **Borrower**:
**+31 days**, **Repay $3,667** (marked late), **Repay $3,667**, **+30 days**,
**Repay $3,666**. Status: **Repaid in full**. Switch to **Lender** →
**Record repayment in the directory**.

> Three installments. The first lands a day past due, and Midnight's block
> clock marks it late, not me. Harbor Bank records the repayment.

**2:00** - **Do:** As the borrower, **Loans**: apply for **20,000**, **8**%,
**4** installments. On it, under **Prove two repaid loans**, tick two and click
**Prove two repaid loans**. Hold on "Every collateral figure on this loan is a
step lower: verified 105% ($21,000), standard 130% ($26,000)". Switch to
**Lender**, open the loan: "2 repaid loans proven on the Loan; root is in the
directory", and **Offer at 130% · 26,000**.

> New loan, 20,000. I prove two earlier Kymider loans were repaid, and every
> figure drops a step: 105% verified, 130% without a proof. Harbor
> Bank checks my proof against the directory; its no-proof price falls from
> 30,000 to 26,000.

**2:20** - **Do:** Open the repaid loan → **Open history to an auditor** →
**Copy JSON**. Switch to **Auditor**, paste, **Verify against the chain**:
**Verified**. Change one amount, verify again: **Rejected**.

> An auditor checks my exported payments against the loan's on-chain hash.
> Change one amount: rejected.

---

### 2:30-2:45 · On-chain proof
**Show:** the `DEVNET-PROOF.md` tab.

**2:30** - **Do:** Point at "Read-back checks: 54 of 54 PASS", then scroll the
Transactions table to rows 33-37 (`Loan.proveRepaidHistory` through
`Loan.accept` at 5,250).

> These contracts also ran on a Midnight devnet with real proofs: 37
> transactions, 54 of 54 claims read back, and loan C accepted at 105%.

*After the Preprod run (owner):* show `PROOF.md` on GitHub instead, click one
hash into the explorer ({{PREPROD_TX}}), and say "The same contracts ran on
Midnight Preprod, the public testnet. Here is loan C's 105% offer." in place
of the first sentence.

---

### 2:45-3:00 · What is simulated, what's next
**Show:** Deck slide 11 (roadmap), then slide 12 (close).

> Today the figures are self-reported and no tokens move. Wave 3 has a data
> provider sign them. Kymider: prove it privately, borrow on 110%.

---

## Word count by section

Narration words, numbers counted as one word each.

| Section | Time | Words |
|---|---|---|
| Hook | 0:00-0:12 | 24 |
| Borrower proves a tier | 0:12-1:05 | 84 |
| Harbor Bank sees the tier, refusal, offer and accept | 1:05-1:45 | 62 |
| Repay, track record, auditor | 1:45-2:30 | 79 |
| On-chain | 2:30-2:45 | 25 |
| What is simulated, next | 2:45-3:00 | 24 |

## If you run over

Cut in this order:

0. The optional proof-window beat at 0:36 (not in the timings or word
   counts above). Saves 8 s.
1. The Private facts hover at 0:10 (start at **Loans**). Saves 10 s.
2. The auditor edit-and-fail at 2:20 (keep the green verify). Saves 5 s.
3. Repayments: say the narration over the clicks without pausing. Saves 6 s.

**Never cut Harbor Bank's "never leaves the borrower" view, the 150% refusal,
the borrower's Accept or the 105% / 130% track record.** Those four moments are
the product.

## After recording

- Watch it once end to end, with sound.
- Upload unlisted to YouTube, 1080p. Put the link in the README table and the
  AKINDO form ({{VIDEO_URL}}), replacing "being recorded, link added before
  Oct 17" in the README table and Communication section.
