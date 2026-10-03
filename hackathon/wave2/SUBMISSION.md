# Kymider - AKINDO submission copy, Wave 2

Paste each section into the matching AKINDO field. Character counts are for the
text between the horizontal rules, measured with `wc -m`. Items marked
`<!-- VERIFY -->` depend on work being finished in parallel; confirm or cut
them before pasting, and delete the HTML comments themselves. Every `{{...}}`
is a placeholder; the list is in the owner checklist.

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
- [ ] `wave2` is merged to `main`, so GitHub Pages serves the Wave 2 console
      (Pages deploys from `main` only), and `docs/architecture-wave1/2/3.md`
      and `docs/scaffold.md` survive the merge (`main` deleted them; the README
      and the contracts link them).
- [ ] Paste the video link ({{VIDEO_URL}}, unlisted YouTube, narrated) and the
      deck (PDF export of `hackathon/wave2/DECK.html`, {{DECK_PDF_URL}}).
- [ ] `PROOF.md` lists the Preprod tx hashes ({{PREPROD_TX}}), and the README
      table links to it.
- [ ] Fill every placeholder: `302`, `11`,
      `46`, `22`, `9`, `{{VIDEO_URL}}`,
      `{{DECK_PDF_URL}}`, `{{PREPROD_TX}}`, `{{OWNER_NAME}}` (deck slide 12).
      Resolve every `<!-- VERIFY -->` in `README.md`, this file, `DECK.html`,
      `VIDEO-SCRIPT.md` and `X-THREAD.md`.
- [ ] Submit before **Oct 17, 2026** (AKINDO's timer says Oct 19 15:00 UTC; do
      not rely on it).

---

## Project name

Kymider

## Tagline (one line)

Prove solvency privately, post 110% collateral instead of 150%.

---

## Project description

<!-- Recount with wc -m after the placeholders are filled (target 900-2,600). 1,846 with the placeholders unfilled and the comments removed. -->

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
the principal; any other figure is refused by the contract. The offer binds
only when the borrower accepts it, and a verified tier cannot be re-quoted away.
<!-- VERIFY: offer / accept and the re-quote lock merged --> Disbursement,
installments, late flags and defaults run on block time, with a 3-day grace
period before a default can be called.

Each repayment extends a hash chain on the loan. An auditor can check an
exported payment log against that on-chain hash offline. A shared LoanDirectory
records repaid loans in a HistoricMerkleTree, so a borrower can prove "two
prior loans repaid" on a new application without naming the loans, lenders or
amounts.

Evidence: 4 Compact contracts (22 circuits) compiled in CI on
toolchain 0.31.1; 302 offline tests on the compiled contracts;
46 browser tests of the console; an 18-case devnet simulation with
real proofs on every push; Preprod transactions in PROOF.md. <!-- VERIFY: Preprod -->

What is simulated: no token moves, and the figures are self-reported, so a
VERIFIED tier costs nothing to get today. Attested data provenance is Wave 3.

---

## Progress made during this wave

All built Sep 27 - Oct 17, 2026, on the `wave2` branch
(https://github.com/Turnless/kymider/tree/wave2).

1. **`Loan` contract** (`contracts/loan.compact`, 9 circuits):
   per-loan lifecycle from application to repaid, defaulted or declined;
   `proveTier` against the borrower's salted facts commitment; 110% vs 150%
   collateral enforced with an exact-floor check (`isFloorOfBps`), because
   Compact has no division; the lender's figure is an offer the borrower
   accepts or declines; block-time quote expiry, a 30-minute minimum quote
   life, due dates, lateness and a 3-day grace period; at most 3 quotes per
   loan; a payment-history hash chain with seed-derived nonces.
   <!-- VERIFY: offer / accept, the re-quote lock and the minimum quote life merged -->
2. **`LoanDirectory` contract** (`contracts/loanDirectory.compact`, 4 circuits):
   public listings with status rules (only the lender's `recordRepaid` on an
   active listing marks it repaid), repayment records in a
   `HistoricMerkleTree<10>`, and `proveTwoRepaid`, which checks two private
   Merkle paths with `checkRoot`. <!-- VERIFY: listing lockdown merged -->
3. **302 offline tests** in 11 files, all driving
   the compiled contracts (Wave 1 had 49), plus **46 Playwright
   tests** that run the README's judge path and each refusal at 1440 and 390 px
   in CI.
4. **`LoanClient`** (`client/loans.ts`) and the CLIs `loan:deploy`, `loan:demo`,
   `prove:onchain` and `verify:onchain`. The client computes every quotient the
   circuits check.
5. **Devnet simulation** for Wave 2 (`tests/simulation/wave2.simulation.test.ts`,
   7 cases, two wallets, real proofs) in CI on every push.
6. **Console loan screens**: borrower (apply, prove tier, accept, repay, prove
   history, export history), lender (applications, quote, offer, disburse,
   default, record), portfolio.
7. **Live view**: indexer reads of deployed instances; Lace connect built,
   untested on Preprod. <!-- VERIFY: owner tried Lace -->
8. **Preprod deployment** from a manually triggered CI job, with the transaction
   hashes in `PROOF.md` and `npm run verify:onchain` to re-read them. <!-- VERIFY -->
9. **Wave 3 preview**: an auditor checks a borrower's exported payment log
   against the on-chain history hash (`/app/audit`).
10. **Hardening after review**: salted facts commitment, re-quote cap, the
    borrower-acceptance step, listing status rules, and no seed characters in
    logs.

---

## What changed since Wave 1

Wave 1 proved creditworthiness as a PASS/FAIL attestation. Wave 2 makes the
proof buy something: a lower collateral ratio that the lender cannot change and
the borrower must accept.

- Contracts: 2 → 4 (+ `Loan`, `LoanDirectory`); circuits 9 → 22.
  https://github.com/Turnless/kymider/blob/wave2/contracts/loan.compact
- Offline tests: 49 → 302; browser tests: 0 → 46.
  https://github.com/Turnless/kymider/tree/wave2/tests/unit
- Devnet simulation: 11 → 18 cases.
  https://github.com/Turnless/kymider/tree/wave2/tests/simulation
- New Compact features in use: block time (`blockTimeLt/Lte/Gt/Gte`),
  `HistoricMerkleTree` with `checkRoot`, more witnesses (`factsSalt`,
  `paymentNonce`), division-free quotient checks.
- On-chain: local devnet only → Preprod transactions in `PROOF.md`. <!-- VERIFY -->
- Console: solvency screens → plus loan desk, portfolio, auditor preview and a
  Live view reading the chain.
- What Wave 1 judges asked entries for, now addressed: the README states exactly which data is
  private and which is public (a dual-ledger table); the video is narrated;
  a public-testnet transaction is shown. <!-- VERIFY: Preprod -->
- AKINDO record: repo connected, product public, tagged Midnight.

---

## Challenges

- **Our own headline claim had a bypass.** A review found that a lender could
  re-quote a loan to clear a VERIFIED tier and then underwrite at 150%, and the
  console accepted it. The fix was not another assert on the price: the
  lender's figure became an offer, the borrower's acceptance makes the loan
  active, a live verified tier cannot be re-quoted, and a quote must stand for
  30 minutes. <!-- VERIFY: merged -->
- **A public hash of round figures is not private.** The first facts
  commitment was unsalted; a dictionary of multiples of 50,000 recovered the
  demo facts in 4.3 s on one core. It now carries a 32-byte salt held in
  private state.
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
Actions for CI and the Preprod deploy job; GitHub Pages for the console. Lace
for the Live view. <!-- VERIFY: Lace -->

---

## Links

| Field | Value |
|---|---|
| GitHub repo (connect in the repo field) | https://github.com/Turnless/kymider |
| Live console | https://turnless.github.io/kymider/ <!-- VERIFY: serves Wave 2 after the merge to main --> |
| Demo video (narrated) | {{VIDEO_URL}} |
| Slide deck | {{DECK_PDF_URL}} (source: `hackathon/wave2/DECK.html`) |
| On-chain proof | https://github.com/Turnless/kymider/blob/main/PROOF.md <!-- VERIFY: exists on main --> |
| Preprod transaction | {{PREPROD_TX}} |
| Build with (tech tag) | Midnight |
| Category | DeFi, lending, privacy |
| Tags | #Midnight #Compact #ZeroKnowledge #Lending #DeFi |
