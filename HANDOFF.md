# Kymider — session handoff

> **Starting a new session? Say: "Read HANDOFF.md, then continue."**
> This file is untracked — delete it or gitignore it before submission if you'd rather it not ship.

Last updated: 2026-09-08

---

## The project in one paragraph

Kymider is privacy-first loan underwriting on Midnight. A borrower proves their
net worth and debt-to-income clear a lender's bar using a zero-knowledge proof,
without revealing the figures. Each borrower deploys their own `SolvencyProof`
contract instance (private facts live there); a shared public `Registry` indexes
instances so lenders can find them. Three-wave Buildathon project — **currently
in Wave 1** (proof-of-solvency MVP, build window Aug 27 – Sep 16 2026).

Requirements are in `Kymider_PRD_3Waves.docx`; architecture in
`docs/architecture-wave1.md`; build/run detail in `docs/scaffold.md`.

---

## Where things stand

**Repo:** https://github.com/Turnless/kymider — branch `main`, public.
**CI:** https://github.com/Turnless/kymider/actions — **green**, all three jobs.
**Design canvas:** https://claude.ai/code/artifact/1eada512-7ce2-4976-b009-248ccca21b21

### Done and verified

- **The vertical slice actually runs.** CI run #1 passed all three jobs, including
  the two-wallet devnet simulation — **309 seconds of real ZK proof generation**
  against a real Midnight node. That was the first end-to-end execution in the
  project's history. FR-1.7 and FR-1.9 are proven, not just written.
- **49 unit tests pass offline in ~4s**, no Docker. 15 cover the circuit
  arithmetic; 34 drive the *compiled Compact contracts* directly through
  `tests/unit/support/simulators.ts` — constructor guards, commitment binding,
  verdict derivation, every caller-authorization assert, and the tamper path.
- **Four client bugs fixed** (all were latent because nothing had ever been run):
  1. `updateFacts` never wrote new facts back to private state → every later
     proof was built on stale facts and rejected. Borrower permanently bricked.
  2. Registry commitment went stale after a fact update → `verifyOffChain`
     returned false for an honest borrower. Added `updateRegistryCommitment`.
  3. Private-state stores were named with `Date.now()` and the owner `sk` was
     generated then discarded → a deployment could never be used again.
     Now `client/identity.ts` persists it to `.wallet-seed`, stores have stable
     names, and `deploy.ts` writes state that `demo.ts` consumes.
  4. Hand-rolled hex→`Bytes<32>` conversion with no validation → replaced with
     `encodeContractAddress`/`decodeContractAddress`.
- Plus: `.env` now actually loads (`client/env.ts`, zero deps), store password
  moved to an env var, `@midnight-ntwrk/compact-runtime@0.16.0` declared
  directly, Apache-2.0 `LICENSE` added, repo initialized and pushed.

### Deliberately NOT fixed — three contract limitations

These need the `.compact` sources edited **and recompiled**. Each is pinned by a
test that will start failing the moment it's fixed, and documented under
"Constraints & deferred items" in `docs/scaffold.md`.

1. **Registry squatting.** A stranger can register *your* instance address under
   *their* pubkey first; you're then locked out of the index permanently.
   Fix: key the map on the caller's dapp pubkey rather than the instance address.
2. **One claim per lender, forever.** `requestClaim` asserts the lender has no
   claim at all, so after approve/reject that pair is dead — no re-underwriting,
   no refresh after `updateFacts`. Wave 2's time-boxed proofs depend on this.
3. **Net worth floors at zero**, so a claim with a zero threshold passes even
   when debts exceed balance.

**These are now unblockable:** the `contracts` CI job compiles on Linux and
publishes `compiled/` as a downloadable artifact. Edit a `.compact`, push, grab
the artifact. No local WSL needed.

---

## What's left, in priority order

1. **Frontend.** The biggest remaining piece. `frontend/src/**` is nine screens
   of hardcoded `MOCK` data wired to nothing — they don't even import the mock
   client. The design for what replaces them is finished (see below). Note this
   is *not* a "swap the mock import" job: `client/providers.ts` is Node-only
   (`NodeZkConfigProvider`, `levelPrivateStateProvider`) and `client/wallet.ts`
   builds a wallet from a raw seed via testkit. A browser build needs a fetch-based
   ZK config provider, an IndexedDB private-state provider, and
   `@midnight-ntwrk/dapp-connector-api` for a Lace-style wallet, plus wasm/buffer
   Vite plugins. None are in the lockfile yet.
2. **The three contract fixes** above.
3. **`verifierKey` is not a verification key.** It's
   `persistentHash("kymider:sp:vk:")` — a label. `verifyOffChain` only checks the
   on-chain record. Either wire real verification against
   `compiled/solvency-proof/keys/*.verifier`, or rename the field and say plainly
   in the docs that off-chain verification is a record check. Right now the docs
   imply more than the code does.
4. **Slide deck and demo video.**
5. **Add the `midnightntwrk` topic tag** to the GitHub repo (submission rule).

### One small thing outstanding

The five commits I made carry the wrong author email. Fix with:

```sh
git rebase 82fce11 --exec 'git commit --amend --no-edit --author="Computerist <hassanabdulsalam170@gmail.com>"'
git push --force-with-lease
```

`82fce11` is your own initial commit and stays untouched. Config for *future*
commits is already correct.

---

## The design work

Published canvas (six artboards, all clickable):
https://claude.ai/code/artifact/1eada512-7ce2-4976-b009-248ccca21b21

Source lives in `design/` — edit the `.dc.html` files, then re-seed and republish
via the `/design` skill. `design/canvas.json` is the layout manifest.

- `Landing.dc.html` — cinematic landing. Espresso `#1B1410` ground with cream
  `#FFF7EB` type: the console's palette inverted, so the two halves read as one
  product. Viewport-sized artboard that scrolls internally; hero pins while the
  body slides over it, plus scroll progress bar, parallax bloom and per-section
  reveals (all `animation-timeline`, wrapped in `@supports`).
- `Main` / `Facts` / `Claims` — borrower console (cream `#FFF7EB`)
- `Registry` / `BorrowerDetail` — lender console (sand `#F9F0E0`)

All five console screens share a warm-dark left rail in the landing's espresso.
Design system: Inter 400–900, accent `#D46D25`, ink `#0F172A`, 18px cards /
13px controls / 20px badges, tabular numerals on all figures.

Working interactions: the landing's disclosure toggle; live solvency arithmetic
on Facts (cross-multiplied DTI, matching the circuit); proof generation on
Claims; search + filters on Registry; the full request → verdict → decide flow
on BorrowerDetail.

**Sample figures throughout are invented** — swap them for whatever you want the
demo to show.

---

## Environment gotchas — read before debugging

- **Docker cannot run on this machine.** Windows 10 Pro **1909 (build 18363)**;
  Docker Desktop needs **22H2 (build 19045)**. Also VT-x is disabled in BIOS,
  and it's a 2011 i7-2640M with 7.9 GB RAM. `npm run env:up`, `wait:dust`,
  `test:simulation` and `demo` are all CI-only. Don't waste time trying.
- **WSL is not installed** (no `wsl.exe`), so no local `compact` compiler.
- **`compact` on the Windows PATH is `C:\Windows\System32\compact.exe`** — the
  NTFS compression tool, not the Midnight compiler. `npm run build:contracts`
  from PowerShell runs the wrong program and fails confusingly. Compiled
  artifacts are already in `compiled/`; recompile via CI.
- **npm:** use `npm.cmd` (npm.ps1 is blocked by execution policy).
- The last session ran as a **background job**, which is why the Chrome
  extension never attached. A fresh foreground session (`claude --chrome`)
  should work — that was the reason for restarting.

## Commands that work locally

```sh
npm.cmd run typecheck      # clean
npm.cmd run test:unit      # 49 tests, ~4s, no Docker
cd frontend && npm run dev # localhost:3000 — the OLD mock screens
```

---

## First thing to do in the new session

Get Chrome connected (`/chrome` → `Status: Enabled`), open the design canvas,
and look at the six artboards. **None of them have ever been seen rendered** —
they were authored blind. A static audit found and fixed one silent bug already
(BorrowerDetail's nav rail was rendering empty), but layout, the scroll
choreography and the bloom placement are all unverified. Fix what's visibly
wrong, then start wiring the frontend.
