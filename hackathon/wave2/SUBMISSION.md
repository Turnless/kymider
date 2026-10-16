# Kymider - AKINDO submission copy, Wave 2

Paste each section into the matching AKINDO field. Character counts are for the
text between the horizontal rules, measured with `wc -m`. Delete the HTML
comments before pasting. Every `{{...}}` is a placeholder; the one left,
`{{VIDEO_URL}}`, is in the owner checklist. Where a step is still pending
(video, AKINDO record), the copy below says so; update it once the step is
done.

---

## Owner checklist: fix the AKINDO record first

Wave 1 scored $0 with a broken record: no entry without a connected repo, and no
private entry, earned points (see `hackathon/wave1-results.md`).

- [ ] **Connect the GitHub repo field** to `Turnless/kymider`. Not only in the
      description text. All 7 Wave 1 winners had it connected; 0 of 60 without it scored.
- [ ] **Make the product page public.** 0 of 54 private entries scored.
- [ ] **Change the tech tag from "Base" to "Midnight".**
- [ ] Repo is public and carries the `midnightntwrk` topic. Update the GitHub
      repo description to the Wave 2 pitch (it still reads as Wave 1).
- [x] `wave2` is merged to `main` (`5437a29`), so GitHub Pages serves the Wave 2
      console at https://turnless.github.io/kymider/ and the deck at
      https://turnless.github.io/kymider/deck/ (Pages deploys from `main` only).
      `docs/architecture-wave1/2/3.md` and `docs/scaffold.md` are present on `main`.
- [x] **Preprod run** (2026-10-16): run 38886842306 committed `PROOF.md` and
      `frontend/public/deployments/preprod.json` (37 transactions, 54 of 54
      checks re-read from Preprod). It reads Preprod through Blockfrost (the
      `BLOCKFROST_PROJECT_ID` secret). README, this file, the deck, the video
      script, the X drafts and the landing page cite it.
- [ ] **Try Lace on Preprod** in the Live view; if it works, drop "untested on
      Preprod" from `README.md` (UX section, "What is real") and progress item
      7 below.
- [ ] Record the narrated video from `VIDEO-SCRIPT.md` (unlisted YouTube).
- [ ] Put your name on `DECK.html` slide 12 (it reads "Kymider team"; an HTML
      comment marks the spot), then regenerate the PDF:
      `cd frontend && npm run deck:pdf`, and commit `hackathon/wave2/DECK.pdf`.
- [ ] Fill the placeholder `{{VIDEO_URL}}`: Links below, `VIDEO-SCRIPT.md`
      ("After recording"), `X-THREAD.md`. In `README.md`, replace "being
      recorded, link added before Oct 17" (table and Communication) with the
      link.
      Before submitting, `grep -rnI "{{\|being recorded" README.md hackathon/wave2/DECK.html`
      returns nothing and the Links table below has no `{{`.
- [ ] Submit before **Oct 17, 2026** (AKINDO's timer says Oct 19 15:00 UTC; do
      not rely on it).

---

## Project name

Kymider

## Tagline (one line)

Prove solvency privately, post 110% collateral instead of 150%.

---

## Project description

<!-- Recount with wc -m after the placeholders are filled (target 900-2,600). 2,195 as written (no placeholders in this section). -->

Kymider is privacy-first loan underwriting on Midnight. DeFi lenders cannot see
a borrower's finances, so every borrower posts the same over-collateral, usually
150%. Kymider lets a borrower prove in zero knowledge that their balance, debts
and income clear the lender's bar. A 10,000 loan then needs 11,000 of
collateral instead of 15,000.

How it works: the borrower commits a salted hash of their figures on-chain
(Wave 1's SolvencyProof contract). Each loan is its own Loan contract instance.
The lender quotes a net-worth floor and a maximum debt-to-income ratio; the
borrower runs proveTier, which recomputes the commitment from the private
figures in-circuit and writes one public value: VERIFIED or STANDARD. The lender
can then offer only the tier's collateral, the exact floor of 110% or 150% of
the principal; any other figure is refused by the contract. While a quote is
live and unanswered, the lender can neither offer 150% nor re-quote; a borrower
who does not want to prove calls waiveProof, which reveals nothing. The offer
binds only when the borrower accepts it, naming the figure, and a verified tier
cannot be re-quoted away.
Disbursement, installments, late flags and defaults run on block time, with a
3-day grace period before a default can be called.

Each repayment extends a hash chain on the loan. An auditor can check an
exported payment log against that on-chain hash offline. A shared LoanDirectory
records repaid loans in a HistoricMerkleTree, so a borrower can prove "two
prior loans repaid" on a new application (the proof's inputs stay off the
ledger, though a key's repaid listings are public). Proven on the new Loan itself, that track record lowers every
collateral figure a step, 110% to 105% and 150% to 130%. The ratios are
constants in the contract, so the lender cannot quote the discount away.

Evidence: 4 Compact contracts (24 circuits) compiled in CI on
toolchain 0.31.1; 366 offline tests on the compiled contracts;
48 browser tests of the console; a 19-case devnet simulation with
real proofs on every push, followed by the full flow proven and re-read on
that devnet (recorded run on commit 93cc853: 37 transactions, 54 of 54
read-back checks: https://github.com/Turnless/kymider/blob/main/DEVNET-PROOF.md).
On Midnight Preprod, the public testnet, the same flow ran in 37 transactions
and every claim was re-read from Preprod, 54 of 54 checks:
https://github.com/Turnless/kymider/blob/main/PROOF.md

What is simulated: no token moves, and the figures are self-reported, so a
VERIFIED tier costs nothing to get today. Attested data provenance is Wave 3.

---

## Progress made during this wave

All built Sep 27 - Oct 17, 2026, on the `wave2` branch, now merged to `main`
(https://github.com/Turnless/kymider/tree/main).

1. **`Loan` contract** (`contracts/loan.compact`, 11 circuits):
   per-loan lifecycle from application to repaid, defaulted or declined;
   `proveTier` against the borrower's salted facts commitment; 110% vs 150%
   collateral enforced with an exact-floor check (`isFloorOfBps`), because
   Compact has no division; the lender's figure is an offer the borrower
   accepts (naming the figure) or declines; a proof window in which the lender
   can neither offer 150% nor re-quote, and `waiveProof` for a borrower who
   takes 150% without proving; block-time quote expiry, a 30-minute minimum
   quote life, due dates, lateness and a 3-day grace period; at most 3 quotes
   per loan; a payment-history hash chain with seed-derived nonces; and
   `proveRepaidHistory`, which checks two directory Merkle paths in the Loan
   and lowers its ratios to 105% / 130% (the lender checks the published root
   against the directory). Circuits: `quoteTerms`, `proveTier`, `waiveProof`,
   `proveRepaidHistory`, `underwrite` (the offer),
   `accept(expectedCollateral)`, `declineOffer`, `decline`, `disburse`,
   `repay`, `markDefault`.
2. **`LoanDirectory` contract** (`contracts/loanDirectory.compact`, 4 circuits):
   public listings keyed by `listingKey(loan, borrower)`, so a stranger
   listing your loan address neither blocks nor touches your listing; status
   rules (only the lender's `recordRepaid` on an active listing marks it
   repaid; no one sets `REPAID` or `DEFAULTED` through `updateStatus`, and a
   default is read from the `Loan`); repayment records in a
   `HistoricMerkleTree<10>`; and `proveTwoRepaid`, which checks two private
   Merkle paths with `checkRoot`.
3. **366 offline tests** in 13 files, all driving
   the compiled contracts (Wave 1 had 54), plus **48 Playwright
   tests** that run the README's judge path and each refusal at 1440 and 390 px
   in CI.
4. **`LoanClient`** (`client/loans.ts`) and the CLIs `loan:deploy`, `loan:demo`,
   `prove:onchain` and `verify:onchain`. The client computes every quotient the
   circuits check.
5. **Devnet simulation** for Wave 2 (`tests/simulation/wave2.simulation.test.ts`,
   8 cases, two wallets, real proofs) in CI on every push.
6. **Console loan screens**: borrower (apply, prove tier or waive the proof,
   accept, repay, prove history, export history), lender (applications,
   quote, offer, disburse, default, record), portfolio.
7. **Live view**: the Preprod deployment (contracts and all 37 transactions,
   from the committed record); Lace connect built, untested on Preprod.
8. **On-chain proof scripts**: `prove:onchain` runs the flow and records every
   transaction; `verify:onchain` re-reads them. CI runs both on a local devnet
   on every push; run 38165213326 on commit 93cc853 (37 transactions, including
   Loan B's waiver and Loan C accepted at 105% on its proven track record,
   three refusals recorded before submission, 54 of 54 checks)
   is recorded in https://github.com/Turnless/kymider/blob/main/DEVNET-PROOF.md. A manually triggered Preprod job ran
   the same flow on Midnight Preprod (run 38886842306: 37 transactions, 54 of
   54 checks re-read from Preprod) and committed https://github.com/Turnless/kymider/blob/main/PROOF.md.
9. **Wave 3 preview**: an auditor checks a borrower's exported payment log
   against the on-chain history hash (`/app/audit`).
10. **Hardening after two reviews**: salted facts commitment, re-quote cap,
    the borrower-acceptance step, listing status rules and no seed characters
    in logs (first review); the proof window and `waiveProof`, acceptance that
    names the figure, listing keys, and no defaults set in the directory
    (second review); and, from the second review's suggestions, a track
    record with an economic effect (105% / 130% with two repaid loans).

---

## What changed since Wave 1

Wave 1 proved creditworthiness as a PASS/FAIL attestation. Wave 2 makes the
proof buy something: a lower collateral ratio that the lender cannot raise for a
verified borrower and the borrower must accept.

- Contracts: 2 → 4 (+ `Loan`, `LoanDirectory`); circuits 9 → 24.
  https://github.com/Turnless/kymider/blob/main/contracts/loan.compact
- Offline tests: 54 → 366; browser tests: 0 → 48.
  https://github.com/Turnless/kymider/tree/main/tests/unit
- Devnet simulation: 11 → 19 cases.
  https://github.com/Turnless/kymider/tree/main/tests/simulation
- New Compact features in use: block time (`blockTimeLt/Lte/Gt/Gte`),
  `HistoricMerkleTree` with `checkRoot`, `merkleTreePathRoot` and
  `kernel.self()` in the Loan, more witnesses (`factsSalt`,
  `paymentNonce`), division-free quotient checks.
- On-chain: local devnet only → the full flow on Midnight Preprod, the public
  testnet (37 transactions, 54 of 54 checks re-read from Preprod):
  https://github.com/Turnless/kymider/blob/main/PROOF.md ; and on a devnet in CI on every push
  (run 38165213326, commit 93cc853):
  https://github.com/Turnless/kymider/blob/main/DEVNET-PROOF.md
- Console: solvency screens → plus loan desk, portfolio, auditor preview and a
  Live view reading the chain.
- What Wave 1 judges asked entries for, now addressed: the README states exactly which data is
  private and which is public (a dual-ledger table); the video is narrated.
  A public-testnet transaction: 37 of them, on Preprod (PROOF.md).
- AKINDO record: connecting the repo, making the product public and tagging
  Midnight (owner, before submission).

---

## Challenges

- **Our own headline claim had a bypass.** A review found that a lender could
  re-quote a loan to clear a VERIFIED tier and then underwrite at 150%, and the
  console accepted it. The fix was not another assert on the price: the
  lender's figure became an offer, the borrower's acceptance makes the loan
  active, a live verified tier cannot be re-quoted, and a quote must stand for
  30 minutes. A second review then found the lender could still starve the
  proof (offer 150% or re-quote before the borrower answered), squat a
  listing, and mark a listing defaulted at will. Each is now refused by the
  contracts.
- **A public hash of round figures is not private.** The first facts
  commitment was unsalted; a dictionary of multiples of 100,000 recovered the
  demo facts after 3,973 hashes in 0.15 s on one core (multiples of 10,000:
  3,999,730 hashes, 84 s). It now carries a 32-byte salt held in private
  state.
- **Compact has no division.** Collateral, amount owed and installment are all
  quotients. The circuit takes each as an input and checks it by
  cross-multiplication (`value × 10000 ≤ principal × ratio < (value + 1) × 10000`),
  and the client computes the figure the circuit will accept. A test sweeps
  principals from 1 to 2^40 through both.
- **A ledger read can leak a private comparison.** Inside a short-circuited
  `&&` whose left side depends on private facts, whether the read happens
  reveals the comparison. The compiler flagged it; `proveTier` now reads the
  quote before evaluating the predicate.
- **Time in tests.** The simulator stamps blocks with the wall clock, so the
  Loan simulator owns its own clock and tests expiry, lateness and the grace
  period to the second.

---

## Tech stack

Compact language 0.23 (toolchain 0.31.1) for 4 contracts. MidnightJS 4.1.1:
`compact-runtime` 0.16.0, `midnight-js-contracts`, the indexer public data
provider, the LevelDB private-state provider, the HTTP proof provider, wallet
SDK 1.2.0. React 19, react-router-dom 7, TypeScript 6, Tailwind 4 and Vite 8 for the
console, which runs the compiled contracts in the browser. Vitest for offline
contract tests and the devnet simulation; Playwright for the console. Docker
Compose for the local devnet (Midnight node, indexer, proof server). GitHub
Actions for CI and the Preprod deploy job; Blockfrost for Preprod's indexer
and node; GitHub Pages for the console. Lace for the Live view (untested on
Preprod).

---

## Links

| Field | Value |
|---|---|
| GitHub repo (connect in the repo field) | https://github.com/Turnless/kymider |
| Live console | https://turnless.github.io/kymider/ |
| Demo video (narrated) | {{VIDEO_URL}} |
| Slide deck | https://turnless.github.io/kymider/deck/ (PDF: https://github.com/Turnless/kymider/blob/main/hackathon/wave2/DECK.pdf) |
| On-chain proof | Devnet, run 38165213326 on commit 93cc853, 37 transactions, 54 of 54 checks: https://github.com/Turnless/kymider/blob/main/DEVNET-PROOF.md. Re-run on every push: https://github.com/Turnless/kymider/actions/workflows/ci.yml (job "Devnet simulation", artifact `proof-local`). Preprod: 37 transactions, 54 of 54 checks, https://github.com/Turnless/kymider/blob/main/PROOF.md (run https://github.com/Turnless/kymider/actions/runs/38886842306) |
| Preprod transaction | 4308996e5c6343979c12c7cb9057a9ec3dd19e150b74afd7e1328c4f6763351b (Loan C offered at 105%, block 3,006,081; every hash in PROOF.md) |
| Build with (tech tag) | Midnight |
| Category | DeFi, lending, privacy |
| Tags | #Midnight #Compact #ZeroKnowledge #Lending #DeFi |
