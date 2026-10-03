# Kymider - Wave 2 demo video script

**Length:** 2:50 (target window 2:30-3:00).
**Narration:** 328 words, about 115 words per minute, which leaves room for pauses. Do not rush;
cut from the "If you run over" list instead.
**Audio is required.** A Wave 1 judge asked another team for narration. Record
the voice track; add captions from the same lines if you can.
**Format:** one screen recording of the live console, plus three deck slides
(3, 11, 12 of `hackathon/wave2/DECK.html`).

<!-- VERIFY: screen names, buttons and routes below match the shipped Wave 2
     console. Adjust the "Do" lines, not the narration. -->

---

## Before you press record

- Console at <https://turnless.github.io/kymider/> in a clean browser profile
  (no extensions, zoom 110%, window 1920×1080). Reload so the simulated ledger
  starts fresh.
- Have **two repaid loans** ready for the history proof at 1:50, or rehearse
  creating them: apply → quote → underwrite → disburse → repay ×N, twice. If the
  console ships a demo seed with repaid loans, use it.
- A second tab with [PROOF.md](../../PROOF.md) on GitHub and, if shipped, the
  console's **Live** view connected to Lace on Preprod. <!-- VERIFY -->
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

### 0:10-1:30 · Borrower proves a tier; the lender sees only the tier
**Show:** Switch to the console tab.

**0:10** - **Do:** Landing → **Open the console**. You are the borrower. Click
**Private facts**, hover the three figures.

> These are the borrower's balance, debts and income. They stay on this device.
> On chain there is only a hash of them.

**0:22** - **Do:** **Loans** → **Apply**. Lender: the first in the list.
Principal 10,000, interest 10%, 3 installments. Point at the two collateral
figures. Submit.

> I apply for 10,000. Each loan is its own contract instance on Midnight.
> The application already shows the price of each answer: 11,000 if verified,
> 15,000 if not.

**0:38** - **Do:** Bottom-left, switch **Borrower → Lender**. **Applications** →
open the new loan → **Quote**: net worth at least 50,000, DTI at most 40%,
expires in 7 days. Submit.

> Now I'm the lender. I name my bar: a net-worth floor and a maximum
> debt-to-income ratio. That quote is public.

**0:55** - **Do:** Switch back to **Borrower**. Open the loan → **Prove tier**.
Wait for **VERIFIED**.

> The borrower proves against it. The circuit recomputes the hash from the
> private figures, checks it matches, and writes one word to the ledger:
> verified.

**1:08** - **Do:** Switch to **Lender**, open the loan. Hold the cursor still
on the tier, then on the *not disclosed* figures, for three seconds.

> Here's what the lender sees. Tier: verified. Balance, debts, income: not
> disclosed. Not hidden behind a permission. Never written.

**1:20** - **Do:** Click **Underwrite**. Collateral reads 11,000.

> I underwrite. Collateral: 11,000.

---

### 1:30-1:50 · The contract refuses 150%
**Show:** A second verified application, on the lender's underwriting screen.
<!-- VERIFY: the console has a control to submit a non-tier collateral figure
     (LoanDesk.underwrite took no collateral argument at commit a0337b1). -->

**1:30** - **Do:** Click **Ask for 150%** (collateral 15,000). Let the red error
sit on screen for four seconds.

> Can a lender quietly charge a verified borrower the full 150%? I try.
> Refused: "collateral does not match the tier". Compact has no division, so the
> circuit checks the exact floor of 110% by cross-multiplying. Nothing else
> passes.

*Do not talk over the error. Let it sit.*

---

### 1:50-2:20 · Repay, history proof, auditor
**1:50** - **Do:** Lender → **Disburse**. Borrower → **Repay** three times
(fast; the amounts read 3,667, 3,667, 3,666 on 11,000 owed at 10%). Status:
**REPAID**. Lender → **Record repayment**.

> The borrower repays three installments. On time or late is decided by block
> time, not by the borrower. Each payment extends a hash chain on the loan.

**2:02** - **Do:** Open a new application → **Prove history** → pick the two
repaid loans. The lender's view now shows "2 repaid loans proven".

> On a new application, the borrower proves two earlier loans were repaid,
> against a Merkle tree in the directory, without saying which loans or which
> lenders.

**2:10** - **Do:** Repaid loan → **Disclose** → copy. Open **/app/audit**,
paste, **Verify**: green. Change one amount, **Verify**: red.

> And for an auditor, the borrower opens the full history. It matches the
> on-chain commitment exactly. Change one amount, and it doesn't.

---

### 2:20-2:35 · On-chain proof
**Show:** The **Live** view (Lace connected, Preprod) or PROOF.md on GitHub.
<!-- VERIFY: Preprod deploy done ({{PREPROD_TX}}); otherwise show the green CI
     devnet job and say "on our CI devnet, with real proofs" instead. -->

**2:20** - **Do:** Scroll PROOF.md to the `proveTier` and `underwrite`
transactions. Click one hash into the explorer.

> The same contracts run on Midnight Preprod. These are the transactions:
> deploy, prove tier, underwrite at 110%, repay. 131 offline tests and a
> devnet run with real proofs back every step in CI.

---

### 2:35-2:50 · Why Midnight, what's next
**Show:** Deck slide 11 (roadmap), then slide 12 (close).

> This needs Midnight's dual ledger: the figures stay private, the loan stays
> public and enforceable. No token moves yet, and the figures are self-reported.
> Wave 3 adds attested data providers and the auditor view. Kymider: prove it
> privately, post 110%.

---

## Word count by section

| Section | Time | Words |
|---|---|---|
| Hook | 0:00-0:10 | 24 |
| Prove tier, lender view | 0:10-1:30 | 118 |
| Refusal | 1:30-1:50 | 38 |
| Repay, history, auditor | 1:50-2:20 | 75 |
| On-chain | 2:20-2:35 | 33 |
| Why Midnight, next | 2:35-2:50 | 40 |

## If you run over

Cut in this order:

1. The Private facts hover at 0:10 (start at **Apply**). Saves 12 s.
2. The auditor edit-and-fail at 2:10 (keep the green verify). Saves 5 s.
3. Repayments: show only the last one. Saves 6 s.

**Never cut the lender's "not disclosed" view or the 150% refusal.** Those two
moments are the product.

## After recording

- Watch it once end to end, with sound.
- Upload unlisted to YouTube, 1080p. Put the link in the README table and the
  AKINDO form ({{VIDEO_URL}}).
