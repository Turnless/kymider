# Kymider - AKINDO submission copy, Wave 2

Paste each section into the matching AKINDO field. Character counts are for the
text between the horizontal rules, measured with `wc -m`. Items marked
`<!-- VERIFY -->` depend on work being finished in parallel; confirm or cut
them before pasting, and delete the HTML comments themselves.

---

## Owner checklist: fix the AKINDO record first

Wave 1 scored $0 with a broken record: no entry without a connected repo, and no
private entry, earned points (see `hackathon/wave1-results.md`).

- [ ] **Connect the GitHub repo field** to `Turnless/kymider`. Not only in the
      description text. All 7 Wave 1 winners had it connected; 0 of 60 without it scored.
- [ ] **Make the product page public.** 0 of 54 private entries scored.
- [ ] **Change the tech tag from "Base" to "Midnight".**
- [ ] Repo is public and carries the `midnightntwrk` topic.
- [ ] `wave2` is merged to `main`, so GitHub Pages serves the Wave 2 console
      (Pages deploys from `main` only).
- [ ] Paste the video link ({{VIDEO_URL}}, unlisted YouTube, narrated) and the
      deck (PDF export of `hackathon/wave2/DECK.html`, {{DECK_PDF_URL}}).
- [ ] `PROOF.md` lists the Preprod tx hashes ({{PREPROD_TX}}), and the README
      table links to it.
- [ ] Every `{{...}}` placeholder and `<!-- VERIFY -->` comment in `README.md`
      and this file is resolved.
- [ ] Submit before **Oct 17, 2026** (AKINDO's timer says Oct 19 15:00 UTC; do
      not rely on it).

---

## Project name

Kymider

## Tagline (one line)

Prove solvency privately, post 110% collateral instead of 150%.

---

## Project description

<!-- 1,953 characters (target 900-2,600), measured without this comment and the VERIFY comment -->

Kymider is privacy-first loan underwriting on Midnight. DeFi lenders cannot see
a borrower's finances, so every borrower posts the same over-collateral, usually
150%. Kymider lets a borrower prove in zero knowledge that their balance, debts
and income clear the lender's bar, and the Loan contract then requires 110%
collateral for that borrower. A 10,000 loan needs 11,000 instead of 15,000.

How it works: the borrower commits a hash of their figures on-chain (Wave 1's
SolvencyProof contract). Each loan is its own Loan contract instance. The lender
quotes a net-worth floor and a maximum debt-to-income ratio; the borrower runs
proveTier, which recomputes the commitment from the private figures in-circuit
and writes one public value: VERIFIED or STANDARD. The lender underwrites, and
the circuit accepts only the exact floor of 110% (verified) or 150% of the
principal. A lender who asks a verified borrower for 150% is refused by the
contract. Disbursement, installments, late flags and defaults run on block
time, with a 3-day grace period before a default can be called.

Each repayment extends a hash chain on the loan, using nonces derived from the
borrower's private seed. The borrower can later open that history to an auditor,
who checks it lands exactly on the on-chain commitment. A shared LoanDirectory
records repaid loans as leaves in a HistoricMerkleTree, so a borrower can prove
"two prior loans repaid" on a new application without naming the loans, lenders
or amounts.

Evidence: 4 Compact contracts (20 circuits) compiled in CI on toolchain 0.31.1;
131 offline tests driving the compiled contracts; an 18-case devnet simulation
with real proofs on every push; a live console that runs the real contracts in
the browser with no install; Preprod transactions in PROOF.md. <!-- VERIFY: Preprod -->

What is simulated: no token moves (collateral and balances are figures in
contract state), and the figures are self-reported. Attested data provenance is
Wave 3.

---

## Progress made during this wave

All built Sep 27 - Oct 17, 2026, on the `wave2` branch
(https://github.com/Turnless/kymider/tree/wave2).

1. **`Loan` contract** (`contracts/loan.compact`, 7 circuits): per-loan
   lifecycle APPLIED → ACTIVE → REPAID / DEFAULTED / DECLINED; `proveTier`
   against the borrower's committed facts; 110% vs 150% collateral enforced with
   an exact-floor check (`isFloorOfBps`), because Compact has no division;
   block-time quote expiry, due dates, lateness and a 3-day grace period;
   a payment-history hash chain with seed-derived nonces.
2. **`LoanDirectory` contract** (`contracts/loanDirectory.compact`, 4 circuits):
   public listings, repayment records in a `HistoricMerkleTree<10>`, and
   `proveTwoRepaid`, which checks two private Merkle paths with `checkRoot`.
3. **82 new offline tests** (47 Loan, 18 LoanDirectory, 12 client-arithmetic
   sweep, 5 Wave 1 additions): 131 in total, all driving the compiled contracts.
   Mutation-checked: altering the collateral ratio, a late flag or the proof
   count fails 24 of them.
4. **`LoanClient`** (`client/loans.ts`) and two CLIs, `npm run loan:deploy` and
   `npm run loan:demo`. The client computes every quotient the circuits check.
5. **Devnet simulation** for Wave 2 (`tests/simulation/wave2.simulation.test.ts`,
   7 cases, two wallets, real proofs) in CI on every push.
6. **Console loan screens**: borrower (apply, prove tier, repay, prove history,
   disclose), lender (applications, quote, underwrite, disburse, default, record),
   portfolio. <!-- VERIFY: merged and on Pages -->
7. **Live view**: Lace wallet connect and indexer reads of the deployed
   instances. <!-- VERIFY -->
8. **Preprod deployment** from a manually triggered CI job, with the transaction
   hashes in `PROOF.md` and `npm run verify:onchain` to re-read them. <!-- VERIFY -->
9. **Wave 3 preview**: an auditor verifies a borrower's payment-history
   disclosure against the on-chain commitment (`/app/audit`). <!-- VERIFY -->

---

## What changed since Wave 1

Wave 1 proved creditworthiness as a PASS/FAIL attestation. Wave 2 makes the
proof buy something: a lower, contract-enforced collateral ratio.

- Contracts: 2 → 4 (+ `Loan`, `LoanDirectory`); circuits 9 → 20.
  https://github.com/Turnless/kymider/blob/wave2/contracts/loan.compact
- Offline tests: 49 → 131.
  https://github.com/Turnless/kymider/tree/wave2/tests/unit
- Devnet simulation: 11 → 18 cases.
  https://github.com/Turnless/kymider/tree/wave2/tests/simulation
- New Compact features in use: block time (`blockTimeLt/Lte/Gt/Gte`),
  `HistoricMerkleTree` with `checkRoot`, a second witness
  (`paymentNonce`), division-free quotient checks.
- On-chain: local devnet only → Preprod transactions in `PROOF.md`. <!-- VERIFY -->
- Console: solvency screens → plus loan desk, portfolio, auditor preview and a
  Live view reading the chain. <!-- VERIFY -->
- What Wave 1 judges asked entries for, now addressed: the README states exactly which data is
  private and which is public (a dual-ledger table); the video is narrated;
  a public-testnet transaction is shown.
- AKINDO record: repo connected, product public, tagged Midnight.

---

## Challenges

- **Compact has no division.** Collateral, amount owed and installment are all
  quotients. The circuit takes each as an input and checks it by
  cross-multiplication (`value × 10000 ≤ principal × ratio < (value + 1) × 10000`),
  and the client computes the figure the circuit will accept. A test sweeps
  principals from 1 to 2^40 through both.
- **A ledger read can leak a private comparison.** Inside a short-circuited
  `&&` whose left side depends on private facts, whether the read happens
  reveals the comparison. The compiler flagged it; `proveTier` now reads the
  quote before evaluating the predicate.
- **Nonce keyed to the wrong value.** A payment nonce keyed to `paymentsMade`
  depended on statement order inside `repay`, which increments the counter
  before the witness runs. It is now keyed to the previous chain head.
- **Time in tests.** The simulator stamps blocks with the wall clock, so the
  Loan simulator owns its own clock and tests expiry, lateness and the grace
  period to the second.
- **Toolchain on Windows.** The compiler is Linux-only and the devnet needs
  Docker, so CI is the development loop: it compiles, tests, runs the devnet
  and commits the compiled modules back.

---

## Tech stack

Compact language 0.23 (toolchain 0.31.1) for 4 contracts. MidnightJS 4.1.1:
`compact-runtime` 0.16.0, `midnight-js-contracts`, the indexer public data
provider, the LevelDB private-state provider, the HTTP proof provider, wallet
SDK 1.2.0. React 19, react-router-dom 7, TypeScript 6, Tailwind 4 and Vite 8 for the
console, which runs the compiled contracts in the browser. Vitest for offline
contract tests and the devnet simulation. Docker Compose for the local devnet
(Midnight node, indexer, proof server). GitHub Actions for CI and the Preprod
deploy job; GitHub Pages for the console. Lace for the Live view. <!-- VERIFY: Lace -->

---

## Links

| Field | Value |
|---|---|
| GitHub repo (connect in the repo field) | https://github.com/Turnless/kymider |
| Live console | https://turnless.github.io/kymider/ |
| Demo video (narrated) | {{VIDEO_URL}} |
| Slide deck | {{DECK_PDF_URL}} (source: `hackathon/wave2/DECK.html`) |
| On-chain proof | https://github.com/Turnless/kymider/blob/main/PROOF.md <!-- VERIFY --> |
| Preprod transaction | {{PREPROD_TX}} |
| Build with (tech tag) | Midnight |
| Category | DeFi, lending, privacy |
| Tags | #Midnight #Compact #ZeroKnowledge #Lending #DeFi |
