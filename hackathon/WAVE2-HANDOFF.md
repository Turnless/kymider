# Kymider — Wave 2 handoff

Everything a fresh session needs to continue the Midnight Buildathon Wave 2
work. Start here, then read `program.md` and `wave1-results.md`.

Last updated: 2026-10-03. Branch: `wave2`.

## The program

- **Midnight Buildathon** on AKINDO, three waves, each judged separately.
  Page: https://app.akindo.io/wave-hacks/jaMZjqPOBsLXvjdG
- Each wave's pool is split **in proportion to judge points**. Wave 1 ($3,500)
  paid only 7 of 159 entries.
- **Wave 2 submission deadline: 2026-10-19 15:00 UTC** (AKINDO's timer; the
  rules text says Oct 17, so aim for Oct 17). Pool $4,000.
- Wave 3: Oct 27 – Nov 16, pool $5,000.
- A resubmission must show **meaningful new Midnight functionality built
  during the wave**, plus a "what changed since the previous wave" section.
- Rubric, technical gate and submission requirements: `program.md`.

## Why Wave 1 earned $0

Full analysis in `wave1-results.md`. In short:

1. **The AKINDO product record was broken.** No GitHub repo was connected
   (the link was only in the comment text), the product was private, and its
   tech tag was "Base". All 7 winners had a connected repo and a public
   product; none of the 60 entries without a repo, or the 54 private ones,
   scored. The judge reviews read as tool-driven ("compiled cleanly on the
   toolchains used for this review"), so an unconnected repo likely never got
   compiled.
2. No public-testnet transaction. Winners showed Preview/Preprod/mainnet hashes.
3. The console runs contracts in the browser with no wallet and no chain.
   Judges rewarded "UI calls the contract and reads on-chain state back".
4. Credit/solvency was the most crowded theme (about 22 entries).
5. Top scorers had real-world traction or domain expertise.

The deck and video **were** submitted on the AKINDO form (confirmed by the
owner). Do not claim they were missing.

## Decisions already made (do not re-ask)

- **Scope:** the full Wave 2 plan in `docs/architecture-wave2.md`.
- **Pitch:** a DeFi under-collateral tier. A borrower who proves solvency posts
  **110% collateral instead of 150%**. One concrete, checkable number.
- **Preprod deploy:** a manually triggered GitHub Actions job. The owner creates
  and funds the wallet and adds the secret `PREPROD_WALLET_SEED`; never handle
  the seed yourself.

## Status

| # | Work | State |
|---|---|---|
| 1 | `contracts/loan.compact`: per-loan lifecycle, tier proof, collateral check, repay, default, history chain | Done, compiles |
| 2 | `contracts/loanDirectory.compact`: index + Merkle repaid records + `proveTwoRepaid` | Done, compiles |
| 3 | Build script, `.gitignore` and CI sync updated for both contracts | Done |
| 4 | Compile both; commit `compiled/loan*/contract` | Done (2026-10-03, compiled locally) |
| 5 | Export both from `contracts/index.ts`; witnesses in `contracts/witnesses.ts` (`localSk`, `paymentNonce`) | Done |
| 6 | Offline tests in `tests/unit/` with simulators | Done: 302 tests in 11 files (64 Loan, 24 LoanDirectory, 24 privacy) |
| 7 | Client: `client/` lifecycle ops and CLI (`deploy`, `demo`) for loans | Done: `client/loans.ts`, `npm run loan:deploy`, `npm run loan:demo`; devnet run in CI |
| 8 | Console: borrower loan view (apply, prove tier, accept, repay) and lender view (quote, offer, disburse, default, record, portfolio) | Done (`frontend/src/borrower/`, `frontend/src/lender/`) |
| 9 | `prove:onchain` / `verify:onchain` scripts; CI runs both on the devnet; `preprod.yml` `workflow_dispatch` job writes `PROOF.md` | Scripts and workflow done; Preprod run **pending the owner's wallet secret** |
| 10 | Read-only Preprod view in the console (indexer reads of the deployed instances) | Done (`frontend/src/live/Live.tsx`); untested against Preprod, shows "Not deployed to Preprod yet" |
| 11 | README update, new deck, narrated video, AKINDO submission text | README, deck (`wave2/DECK.html`, shots re-captured), video script, X drafts and submission copy done; **video and deck PDF pending the owner** |

### What the first compile settled

- The block-time stdlib names `blockTimeLt`, `blockTimeLte`, `blockTimeGt`,
  `blockTimeGte` exist and take `Uint<64>`. A sum such as `now + 3600` widens,
  so cast it back: `blockTimeLt((disclose(now) + 3600) as Uint<64>)`.
- A ledger read inside a short-circuited `&&` that depends on private values
  is a disclosure error (whether the read happens leaks the comparison).
  `proveTier` now reads `quote` into a local before the predicate.
- `loanDirectory.compact` compiled as written, Merkle root check included.
- Compact has **no division**. Quotients (collateral, owed, installment) are
  passed in by the caller and checked with cross-multiplied bounds
  (`isFloorOfBps`, `isCeilOfShare`).

### Offline tests (step 6)

`tests/unit/loan.contract.test.ts` and `tests/unit/loanDirectory.contract.test.ts`,
driving the compiled contracts through `LoanSimulator` and
`LoanDirectorySimulator` in `tests/unit/support/simulators.ts`.

- Time: `createCircuitContext` stamps the block with the wall clock. The Loan
  simulator owns the clock instead (`at`, `advance`, starting at `T0`) and
  writes it to `currentQueryContext.block` before every call, so expiry,
  lateness and the grace period are tested to the second.
- Covered: the happy path to REPAID (367, 367, 366 on 1,100 owed); 110% for a
  VERIFIED tier and 150% otherwise (never proved, STANDARD, lapsed tier); the
  exact-floor collateral check; every refusal the handoff listed; late and
  on-the-due-date payments; default before, at and after the grace period.
- The history chain is rebuilt in the test from the seed and the public
  payments and compared byte for byte, on time and late.
- Directory: forged paths (a well-formed path to a leaf never written), the
  wrong lender, someone else's record, the same loan twice, the application
  vouching for itself, and a path still valid after later inserts change the root.
- An earlier note claimed a mutation check (24 failing tests); no log backs
  it, and the README no longer cites it.

### Client (step 7)

- `client/loans.ts`: `LoanClient`, one per wallet, beside `KymiderClient`.
  It computes every figure the circuits check but cannot divide out
  (`client/proof/loanMath.ts`: collateral, owed, installment, amount due),
  so callers never pass one. `tests/unit/loanMath.unit.test.ts` sweeps terms
  through the compiled contract to prove the two agree.
- Rounding the installment up can finish a small loan in fewer payments than
  `installments` (5 owed over 4 is 2, 2, 1). Pinned by a test; harmless.
- `disburse` back-dates its start by 60 s, since block time and the client's
  clock can differ and the circuit refuses a start in the future.
- `npm run loan:demo` repays one loan per run and records it in the directory
  (`.midnight-loans.json`, gitignored). From the third run on, each new
  application also proves two repaid loans.
- `tests/simulation/wave2.simulation.test.ts` runs the same flows on the
  devnet in CI. Simulation files now run one at a time
  (`--no-file-parallelism`): they share the genesis wallets.
- One provider set per wallet per process: `buildProviders` opens that
  wallet's LevelDB private-state stores, which cannot be opened twice.
- The devnet cannot run in a cloud session: the network policy blocks
  `srs.midnight.network`, where the proof server fetches its parameters
  (allow that host to change this). Docker itself works, and the proof
  server also needs the session CA mounted (`/root/.ccr/ca-bundle.crt`).

### Witness design (step 5)

- `LoanPrivateState = { sk, historySeed }`; `LoanDirectoryPrivateState = { sk }`.
- `paymentNonce` is derived, not random: `loanPaymentNonce(historySeed,
  historyCommitment)`, keyed to the chain head the payment extends. Not keyed
  to `paymentsMade`: `repay` increments the counter before asking for the
  nonce, and the witness sees the incremented value, so a counter key would
  hang on statement order inside the circuit.
- The witnesses are shared verbatim with the browser console, so they use the
  compact runtime's `persistentHash`, never `node:crypto`.

### Privacy hardening

- **Salted facts commitment.** Was `persistentHash<Vector<3, Uint<64>>>([balance,
  debts, income])`, which a dictionary of round figures reverses, measured on
  one core with the compact runtime's `persistentHash` in Node: multiples of
  100,000 up to 2,000,000 → demo facts after 3,973 hashes, 0.15 s; multiples
  of 50,000 up to 5,000,000 → 193,826 hashes, 4.28 s; multiples of 10,000 up
  to 2,000,000 → 3,999,730 hashes, 84 s. Now, identical in both contracts:
  `persistentHash<Vector<3, Bytes<32>>>([pad(32, "kymider:facts:v2"),
  persistentHash<Vector<3, Uint<64>>>([balance, debts, income]), salt])`.
  The tag separates it from the payment nonce (same shape) and from v1.
  Off-chain: `contracts/loanMath.ts#commitFacts(facts, salt)`.
- **Salt is a witness** (`factsSalt()`), never a circuit argument.
  `SolvencyPrivateState` gains `salt` (and `previous` during an update);
  `LoanPrivateState` gains `factsSalt`. Both contracts refuse an all-zero
  salt at commit time ("facts salt must be set"); `NO_FACTS_SALT` is what a
  lender's private state carries.
- **How updateFacts learns the new salt:** the witness is read while the
  circuit runs, so `KymiderClient.updateFacts` stages `{new facts, fresh salt,
  previous: old opening}` in the store BEFORE submitting. After the call it
  calls `reconcileFacts`, which keeps whichever opening the on-chain
  commitment matches and drops `previous`; on an error it does the same (a
  transaction can land after the client saw a failure). `proveSolvency` and
  `factsOpening` reconcile first too.
- **Loans keep their own salt.** `deployLoan` takes `factsSalt` (from
  `KymiderClient.factsOpening`). After `updateFacts`, older loans still prove
  with their stored salt if the figures are unchanged; the lender's
  `factsMatchSolvencyProof` shows they no longer match the instance.
- **`.midnight-state.json`** now stores the salt (hex) beside the facts; a
  file without it is treated as absent (its instance runs the old circuits).
- **Re-quote cap.** `Loan.quotesIssued: Counter` capped at the exported pure
  circuit `quoteLimit()` = 3 ("quote limit reached"); `tierProven: Boolean`,
  reset by each quote, allows one `proveTier` per quote ("already proven
  against this quote"). The cap added no circuit; the consent step later
  added `accept` and `declineOffer` (Loan: 9 circuits, 22 across 4 contracts).
  `LoanView` has `quotesIssued`, `quoteLimit`, `tierProven`.
- **Not done in SolvencyProof:** claims are not "decided once" (re-request
  after a decision is allowed), so the same 1-bit-per-round leak exists there,
  but each round needs the borrower's own proof and the Wave 1 lender screen
  cannot show a refusal yet. A per-(lender, commitment) cap is the Wave 3 fix.
- Tests: `tests/unit/privacy.contract.test.ts` (24), including the dictionary
  regression. Mutation check: removing the two Loan cap asserts fails the cap
  tests.

## Constraints

- On the owner's Windows machine there is **no Docker**, and the Compact
  compiler is Linux-only. Compile, devnet and simulation run **in CI only**.
  A cloud session may have both; check before relying on CI round trips.
- Compiling in a cloud session: `compact update` fails there (the GitHub
  API is rate-limited or rejects the session token). Download the compiler
  zip directly instead:
  `curl -LO https://github.com/midnightntwrk/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_x86_64-unknown-linux-musl.zip`,
  unzip it, put the folder on `PATH`, and run `compactc <src> <outdir>`.
  Its output matches CI's byte for byte.
- Toolchain: Compact language 0.23, toolchain 0.31.1 (pinned in `.github/workflows/ci.yml`).
- `compiled/*/contract/` is tracked and regenerated by CI; the keys are not tracked.
- Windows: use `npm.cmd`, not `npm`.

## Round 2/3 changes (after the judge-style review)

| Change | What it does | Where |
|---|---|---|
| Salted facts commitment | `persistentHash([pad(32, "kymider:facts:v2"), H(facts), salt])`, 32-byte salt via the `factsSalt` witness; all-zero salt refused (`facts salt must be set`) | `contracts/solvencyProof.compact`, `contracts/loan.compact`, `contracts/witnesses.ts`, `contracts/loanMath.ts`; `tests/unit/privacy.contract.test.ts`; commit `d44c92c` |
| Quote cap | At most 3 quotes per loan (`quote limit reached`), one `proveTier` per quote (`already proven against this quote`), a quote of at least 30 minutes (`quote must hold at least 30 minutes`) | `contracts/loan.compact` (`quoteLimit`, `minQuoteSeconds`); `privacy.contract.test.ts` "Loan — re-quote cap" |
| Consent step | `underwrite` records an offer (`OFFERED`) at exactly the tier's figure (`collateral does not match the tier`); borrower `accept` → `ACTIVE` or `declineOffer` → `APPLIED`; `quoteTerms` refused while `VERIFIED` is live (`a verified tier is live until it lapses`) | `contracts/loan.compact`, `client/loans.ts` (`acceptOffer`), `client/loan-demo.ts`, `scripts/lib/flow.ts`; `loan.contract.test.ts` "borrower consent" and "a lender cannot impose 150%"; commits `d4584d5`, `f4187d0` |
| Listing lockdown | `updateStatus` refuses `REPAID` (`a repayment is recorded with recordRepaid, not set`); borrower may only withdraw an `OPEN` listing; `recordRepaid` only on `ACTIVE` (`only an active listing can be recorded as repaid`) | `contracts/loanDirectory.compact`; `tests/unit/loanDirectory.contract.test.ts` |
| Lender persona picker | "Acting as" select in the lender rail; the lender console follows the chosen persona (Harbor Bank by default) | `frontend/src/components/Console.tsx`, `frontend/src/lib/simulatedClient.ts` (`setMe`) |
| Auditor preview | Wave 3 preview: verify an exported payment log against the on-chain history hash (integrity, not secrecy) | `frontend/src/auditor/Audit.tsx`, `contracts/audit.ts`; `tests/unit/audit.unit.test.ts`; commit `d7b561c` |
| E2E suite | 46 Playwright tests (23 desktop 1440 px + 23 phone 390 px): README fast path, refusals, every route, Wave 1 screens; plus the `shots` project for the deck | `frontend/e2e/`, `frontend/playwright.config.ts`; commit `2f73ab0` |

Evidence status: CI run 34 (https://github.com/Turnless/kymider/actions/runs/37092735681)
passed every job on `5a56372`, including the devnet simulation, `prove:onchain`
(27 transactions) and `verify:onchain` ("All 40 checks PASS"). It predates the
salt and the consent step; a green run on the current contracts is the next
thing to confirm (Actions → CI, "Devnet simulation" job, `proof-local`
artifact).

## Owner's to-do (not Claude's)

- [ ] On AKINDO, connect the GitHub repo field, make the product public, and
      change the tech tag from Base to Midnight.
- [ ] Merge `wave2` into `main` so Pages serves the Wave 2 console at
      https://turnless.github.io/kymider/; keep `docs/` through the merge.
- [ ] Confirm a green CI run on the current contracts (devnet job included).
- [ ] Create a Preprod wallet, fund it at
      https://midnight-tmnight-preprod.nethermind.dev/, add the GitHub secret
      `PREPROD_WALLET_SEED`, run Actions → "Preprod proof", and check that
      `PROOF.md` and `frontend/public/deployments/preprod.json` were committed.
      Then switch the "Preprod pending" wording to links (list in
      `wave2/SUBMISSION.md`, owner checklist) and re-capture `08-live.jpg`.
- [ ] Try Lace against Preprod in the Live view.
- [ ] Record the narrated Wave 2 video from `wave2/VIDEO-SCRIPT.md`; export
      `wave2/DECK.html` to PDF.
- [ ] Fill `{{VIDEO_URL}}`, `{{DECK_PDF_URL}}`, `{{PREPROD_TX}}`,
      `{{OWNER_NAME}}` (where each appears: `wave2/SUBMISSION.md`, owner
      checklist).
- [ ] Submit before Oct 17.

## Useful

- Judge comments, points and every entry's submission text are public JSON:
  `https://api.akindo.io/public/wave-hacks/jaMZjqPOBsLXvjdG/products?page=1..17`
  (`waveSubmissions[].votes[].comment`, `.point`, `.earnedAmount`).
- Model submissions to imitate: Stock & Foil (deck, video, PROOF.md,
  `verify:onchain`, refusals shown as features, 177 tests) and BACCHIRI
  (Preprod hashes, public verification view, 528 tests).
- Wave 1 materials (deck, video script, submission copy): `wave1/`.
- Hackathon playbook used for this work: the `/hack` skill (Phases 5–7: README,
  video, pre-submit checklist).
