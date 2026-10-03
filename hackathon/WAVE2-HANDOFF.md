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
| 6 | Offline tests in `tests/unit/` with simulators | Done: 47 Loan + 18 LoanDirectory tests |
| 7 | Client: `client/` lifecycle ops and CLI (`deploy`, `demo`) for loans | **Next** |
| 8 | Console: borrower loan view (apply, prove tier, repay) and lender view (quote, underwrite, disburse, default, portfolio) | To do |
| 9 | CI `workflow_dispatch` job: proof server + deploy to Preprod + run the flow, write tx hashes to `PROOF.md` | To do |
| 10 | Read-only Preprod view in the console (indexer reads of the deployed instances) | To do |
| 11 | README update, new deck, narrated video, AKINDO submission text | To do |

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
- The suites were mutation-checked: altering the collateral, a late flag or
  the proof count fails 24 tests.

### Witness design (step 5)

- `LoanPrivateState = { sk, historySeed }`; `LoanDirectoryPrivateState = { sk }`.
- `paymentNonce` is derived, not random: `loanPaymentNonce(historySeed,
  historyCommitment)`, keyed to the chain head the payment extends. Not keyed
  to `paymentsMade`: `repay` increments the counter before asking for the
  nonce, and the witness sees the incremented value, so a counter key would
  hang on statement order inside the circuit.
- The witnesses are shared verbatim with the browser console, so they use the
  compact runtime's `persistentHash`, never `node:crypto`.

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

## Owner's to-do (not Claude's)

- [ ] On AKINDO, connect the GitHub repo field, make the product public, and
      change the tech tag from Base to Midnight.
- [ ] Create a Preprod wallet, fund it at
      https://midnight-tmnight-preprod.nethermind.dev/, and add the GitHub
      secret `PREPROD_WALLET_SEED`. Target: about Oct 8.
- [ ] Record the narrated Wave 2 video (a judge asked another team for audio).

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
