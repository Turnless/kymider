# Kymider — Wave 1 scaffold

This document describes the Wave 1 code scaffold: what it implements, how to
build and run it, and the known constraints.

## What Wave 1 delivers

A vertical slice of **proof-of-solvency**: a borrower privately proves they are
solvent to a lender, and the lender verifies it — without any raw financial
facts being revealed.

- **`SolvencyProof`** contract, deployed **once per borrower** (private facts +
  public commitments/attestations).
- **`Registry`** contract, **shared and public-only**, indexing borrower
  instances for lender discovery.
- **Off-chain client** (`client/`) built on MidnightJS: deploy, register,
  authorize, request claims, generate + submit ZK proofs, decide claims.
- **Tests**: unit tests for the circuit math, and a two-wallet simulation
  against the local devnet (or a public testnet).
- **Web console** (`frontend/`) — a landing page plus the borrower and lender
  consoles, running the **real compiled contracts in the browser** through
  `compact-runtime`. See "The web console" below.

## Architecture (recap)

See `docs/architecture-wave1.md` for the full design. Key mechanics:

- Financial facts (`balance`, `debts`, `income`) are **private state** — they
  never leave the borrower's machine and are never part of any transaction.
- On-chain, facts are committed to:
  `commitment = persistentHash<Vector<3, Uint<64>>>([balance, debts, income])`
- `proveSolvency` recomputes the commitment **inside the circuit** from the
  submitted facts, so facts that do not match the committed ones produce an
  invalid proof and are rejected by the network.
- The verdict logic (`netWorth >= threshold && debts*100 <= maxDti*income`) is also
  computed inside the circuit and recorded as `PASS`/`FAIL`. Compact has no
  division operator, so the DTI criterion uses the exact cross-multiplied form
  (identical to `dti <= maxDti`, with no truncation — conservative for
  underwriting); range guards in the contract keep the `* 100` products inside
  `Uint<64>`.
- Caller authorization is explicit: the borrower is the `owner` (from `sk`);
  a lender must be in `authorizedLenders` and be the `caller` to act.
- Identity: `getDappPubKey(sk) = persistentHash([pad(32,"kymider:pk:"), sk])`
  uses the **same salt** in both contracts, so one key gives one identity
  across SolvencyProof and Registry.
- The Registry cannot prove a contract instance is genuinely owned by the
  person who registers it (cross-contract ownership is not verifiable on
  Midnight). This is a documented Wave-1 simplification — see "Constraints".

## Prerequisites

| Tool | Minimum | Notes |
|---|---|---|
| Node.js | >= 22 | Tested on v24.17.0 |
| npm | >= 10 | Use `npm.cmd` on Windows (npm.ps1 is blocked by default execution policy) |
| Docker Desktop | — | Required for the local devnet |
| WSL 2 + Ubuntu | — | Required on Windows: the `compact` compiler has no Windows binary, and Docker Desktop uses WSL 2 |
| `compact` compiler | toolchain **0.31.1** (Compact language 0.23) | No Windows build — install inside WSL Ubuntu and pin to 0.31.1 to match our `language_version 0.23` (see below) |

### Install the Compact compiler (Windows via WSL)

There is no native Windows build of `compact` (release assets are Linux/macOS),
so it must run inside WSL. The latest toolchain (0.33.0) targets Compact
language 0.25; our contracts declare `language_version 0.23`, so pin toolchain
**0.31.1** (the last 0.23-line release).

1. From an **admin** PowerShell, install WSL 2 + Ubuntu (one command; may need a
   reboot, then create a UNIX user/password):

   ```powershell
   wsl --install -d ubuntu
   wsl -l -v        # verify: Ubuntu, VERSION 2
   ```

2. In the **Ubuntu** terminal, install the Compact toolchain:

   ```sh
   curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
   source ~/.bashrc
   compact --version
   compact update 0.31.1        # pin to the 0.23-language toolchain
   compact --version
   ```

3. Compile the contracts from inside WSL, against the project mounted at
   `/mnt/c/Users/Computerist/Kymider` (artifacts land in `compiled/` and are consumed by
   the Windows-side npm scripts):

   ```sh
   cd /mnt/c/Users/Computerist/Kymider
   compact compile contracts/solvencyProof.compact compiled/solvency-proof
   compact compile contracts/registry.compact compiled/registry
   ```

4. (Optional) VS Code Compact extension: install `compact-0.2.13.vsix` from the
   Midnight releases page.

## Install

```sh
# Windows (execution policy blocks npm.ps1):
npm.cmd install

# macOS / Linux:
npm install
```

> Install notes: `vite-node` is pinned to `^6.0.0` (vitest 4.x no longer ships a
> `4.x`-versioned `vite-node`; 6.x brings its own `vite ^8`, which also
> satisfies vitest's peer range). On a slow/unreliable connection the first
> install can take a long time while npm revalidates registry metadata; retry
> resumes from the npm cache. `node_modules` + `package-lock.json` are produced
> at the repo root.

Copy the environment template and adjust if needed:

```sh
cp .env.example .env
```

`.env.example` carries the network config and (for public testnets) the wallet
seeds/mnemonics used by the simulation tests.

## Compile the contracts

> **Windows: do not run `npm run build:contracts` from PowerShell or CMD.**
> `compact` on the Windows PATH is `C:\Windows\System32\compact.exe` — the
> built-in NTFS file-compression tool, not the Midnight compiler. The npm
> script will invoke *that*, and the failure it produces looks nothing like a
> compiler error. Run the `compact compile` commands from inside WSL (below);
> the npm script is for Linux/macOS.


```sh
npm run build:contracts
```

This runs:

```sh
compact compile contracts/solvencyProof.compact compiled/solvency-proof \
  && compact compile contracts/registry.compact compiled/registry
```

> `contracts/types/financial.compact` is a shared-types reference module, not
> compiled standalone.

Artifacts land in `compiled/` (git-ignored). They are consumed at runtime by
`contracts/index.ts` (`CompiledSolvencyProofContract`,
`CompiledRegistryContract`).

For quicker iteration after a first full build:

```sh
npm run compile:fast   # skips the ZK-circuit step (runs only the runtime)
```

## Start the local devnet

```sh
npm run env:up
```

`docker-compose.yml` brings up `midnight-node`, `indexer-standalone` and
`proof-server` on the `undeployed` network with genesis seeds `0x…01`
(borrower) and `0x…02` (lender) pre-minted.

```sh
npm run env:down   # stop (keep the node container)
npm run proof:up   # (re)start the proof server only
```

## Wait for NIGHT + DUST

Proof generation needs DUST as well as NIGHT, and DUST accrues by staking
NIGHT, so wait before simulating:

```sh
npm run wait:dust
```

## Tests

Unit tests (no network, no Docker):

```sh
npm run test:unit
```

Two layers run here:

1. **Circuit math** (`solvencyProof.unit.test.ts`) — the TypeScript reference
   implementation in `client/proof/solvencyProof.ts`.
2. **The compiled contracts themselves** (`*.contract.test.ts`) — the Compact
   programs executed locally through `tests/unit/support/simulators.ts`:
   constructor guards, commitment binding, verdict derivation, every
   caller-authorization assert, and the tamper path. This needs no proof
   server and no network; only real ZK proof generation and network
   verification are left to the devnet simulation below.

Simulation (needs devnet up, or a testnet):

```sh
npm run test:simulation                       # local devnet
MIDNIGHT_NETWORK=preview npm run test:simulation
MIDNIGHT_NETWORK=preprod  npm run test:simulation
```

For a public testnet, export `MIDNIGHT_PREVIEW_BORROWER_MNEMONIC` /
`MIDNIGHT_PREVIEW_BORROWER_SEED` (and the `_LENDER_` counterparts) first.

Simulation covers:

1. Deploy Registry + a per-borrower SolvencyProof instance.
2. Register the instance in the Registry.
3. Authorize the lender; lender requests a claim.
4. Borrower proves solvency → network-verified `PASS`.
5. Lender approves → claim `APPROVED`; off-chain record check passes.
6. Negative auth: lender cannot call borrower-only transitions, borrower
   cannot decide a lender's claim.
7. Tamper: a proof built on facts that don't match the commitment is rejected.
8. `updateFacts` re-commits; the commitment changes.
9. Re-proving an already-decided claim is rejected (claim must be `PENDING`).

## Continuous integration

`.github/workflows/ci.yml` runs the whole slice on Linux runners, which is the
only place it goes green in one pass: the `compact` compiler ships Linux-only
binaries, and the devnet needs Docker.

| Job | Needs Docker | What it proves |
|---|---|---|
| `contracts` | no | The Compact programs compile (the Buildathon technical gate). Caches `compiled/` on the hash of `contracts/**/*.compact` and publishes it as an artifact. |
| `unit` | no | `typecheck` + the 49 unit and offline contract tests. |
| `simulation` | yes | `docker compose up --wait`, DUST accrual, then the two-wallet ZK simulation with real proof generation and network verification. |

This matters if you develop on Windows: Docker Desktop requires Windows 10
**22H2 (build 19045)** or newer, so on an older build the devnet cannot run
locally at all and CI is the only route. The `contracts` job is also the
practical way to recompile after editing a `.compact` file without a local WSL
toolchain — download the `compiled-contracts` artifact from the run.

The toolchain version is pinned in one place, the `COMPACT_TOOLCHAIN` env var
at the top of the workflow. Keep it on the 0.23 language line to match
`pragma language_version 0.23`.

## Demo + deployment CLI

```sh
npm run demo             # full borrower + lender vertical slice (devnet)
npm run deploy           # borrower: deploy + register, write .midnight-state.json
npm run check-balance    # print a wallet's balances
```

## The web console

```sh
cd frontend && npm install && npm run dev   # http://localhost:3000
```

No Docker, no node and no wallet extension: the console runs the **compiled
Compact contracts themselves** in the browser. Six `SolvencyProof` instances and
one `Registry` are deployed into `compact-runtime` at page load (~400 ms), and
every figure on screen is read back off that ledger — so authorization asserts,
commitment binding and PASS/FAIL verdicts are the contract's, not the UI's. Ask
for a claim as the wrong party and the contract refuses, exactly as on-chain.

What it does **not** do yet: generate ZK proofs, submit transactions, or talk to
a node. Screens depend only on the `KymiderClient` interface in
`frontend/src/lib/client.ts`; the wallet-backed implementation (Lace through
`@midnight-ntwrk/dapp-connector-api`, a fetch ZK-config provider and an
IndexedDB private-state provider) drops in behind that same interface.

Two build details worth knowing:

- `frontend/vite.config.ts` aliases `@compiled` and `@contracts` to the root
  `compiled/` and `contracts/` directories, and pins `compact-runtime` and
  `onchain-runtime-v3` to the **root** `node_modules` copies. Without that pin,
  the compiled contracts resolve one runtime and app code resolves another, and
  two different wasm runtimes end up in one bundle.
- `vite-plugin-wasm` is required: the runtime reaches wasm-bindgen's bundler
  target (a bare `import ... from './*.wasm'`), which Vite cannot load on its
  own.

Screens beyond the Wave 1 demo path (`AuthorizeLender`, `QRScanner`) are left
from the earlier scaffold and are not routed.

## Repository map

```
contracts/
  types/financial.compact   # shared reference types (not compiled standalone)
  solvencyProof.compact     # per-borrower program
  registry.compact          # shared public index
  index.ts                  # CompiledContract glue (consumes compiled/)
  witnesses.ts              # private-state shapes + witnesses
compiled/                   # compiler output (git-ignored)
client/
  config.ts                 # LOCAL / PREVIEW / PREPROD network presets
  wallet.ts                 # MidnightWalletProvider + syncWallet
  providers.ts              # buildProviders (solvency + registry provider sets)
  context.ts                # shared wallet wiring for scripts/demo
  index.ts                  # KymiderClient facade (the main API)
  proof/solvencyProof.ts    # reference circuit math (computeSolvency, DTI, net worth)
  deploy.ts                 # deploy + register CLI
  demo.ts                   # end-to-end demo CLI
  check-balance.ts          # print a wallet's balances
  utils.ts                  # byte helpers (hexToBytes, bytesToHex, bytesEqual)
  env.ts                    # .env loader for the CLI entry points
  identity.ts               # persistent dapp secret key (.wallet-seed)
  state.ts                  # .midnight-state.json read/write
scripts/
  wait-for-dust.ts          # wait for NIGHT + DUST accumulation
tests/
  unit/solvencyProof.unit.test.ts       # circuit math (reference impl)
  unit/solvencyProof.contract.test.ts   # compiled contract, offline
  unit/registry.contract.test.ts        # compiled contract, offline
  unit/support/simulators.ts            # offline contract simulators
  simulation/wave1.simulation.test.ts
frontend/
  src/
    App.tsx               # Router + role toggle
    components/           # Shared UI (Layout, Navbar, StatusBadge, QRScanner)
    borrower/             # Borrower screens (Landing, Dashboard, Facts, Claims, Authorize)
    lender/               # Lender screens (Landing, Registry, BorrowerDetail, ClaimsDashboard)
    lib/                  # Client integration, color tokens, formatters
  package.json
  vite.config.ts          # React + Tailwind + Vite
docs/
  scaffold.md               # this file
```

## Constraints & deferred items

- **Compiled artifacts are now checked in workflow-wise.** `contracts/index.ts`
  imports from `compiled/`, so `npm run typecheck` only passes after
  `npm run build:contracts` (the artifacts are git-ignored and regenerated).
- **Running the ZK flow locally requires Docker Desktop** (Midnight node,
  indexer, proof server), which in turn requires Windows 10 22H2 / build 19045
  or newer. On an older Windows build the devnet cannot run locally at all —
  use CI, which runs the full two-wallet simulation on every push (see
  "Continuous integration"). Proof generation there takes ~5 minutes.
- **`verifierKey` is not a verification key.** The contract stores
  `persistentHash("kymider:sp:vk:")` — a fixed domain-separation label, the
  same value on every instance. It cannot verify anything, and nothing reads it
  as if it could. The web console therefore labels it **“circuit tag”** rather
  than repeating the field name. Renaming the ledger field needs a `.compact`
  edit and a recompile, so the name survives for now; the meaning does not.
- **Off-chain proof verification** (`verifyOffChain` in `client/index.ts`) is a
  **record check**, not a cryptographic one: it reads the attestation back and
  confirms the instance commitment matches the Registry entry. Real proof
  verification would need the real verifier keys under
  `compiled/solvency-proof/keys/*.verifier`, which is a separate piece of work.
  The network does verify proofs at submission — that is what makes a false
  attestation impossible to land — but `verifyOffChain` is not what does it.
- **Attestations outlive the statement behind them.** The ledger records a
  verdict per lender, but not which committed statement produced it, so after
  `updateFacts` an old PASS still sits there looking current. The contract is
  behaving correctly — the verdict was true of the earlier statement — but a
  lender reading it fresh could be misled. The web console tracks the
  commitment each attestation was proved against and marks the divergent ones
  **superseded** in the directory, on the borrower's claims, and on the
  lender's verdict panel; the borrower is prompted to prove again. Carrying the
  commitment into the attestation record on-chain is the durable fix.
- **Registry does not verify instance ownership.** The Registry cannot check
  who deployed the instance at `instanceAddr` (Midnight has no cross-contract
  reads), and `register` rejects an address that is already indexed. A stranger
  who registers someone else's instance address first, under their own pubkey,
  therefore locks the real owner out of the index permanently — `register`,
  `updateCommitment` and `suspend` are all closed to them after that. The
  squatted record is *detectable* (its commitment will not match the
  instance's real on-chain commitment) but not repairable. Pinned by a test in
  `tests/unit/registry.contract.test.ts`. Fixing it properly means keying the
  map on the caller's dapp pubkey instead of the instance address, which is a
  contract change (and so a recompile).
- **One claim per lender, forever.** `requestClaim` asserts the lender has no
  claim at all, so once a claim is approved or rejected that lender can never
  be underwritten again — no re-request, no proof refresh after `updateFacts`.
  Wave 2's time-boxed proofs (FR-2.4) need this changed. Pinned by a test in
  `tests/unit/solvencyProof.contract.test.ts`.
- **Net worth floors at zero.** An insolvent borrower (debts > balance) gets
  `netWorth = 0` rather than a negative value, so a claim with a zero net-worth
  threshold passes on that leg. Also pinned by a test.
- **Data honesty is out of scope for ZK.** Proofs prove computation, not
  truthfulness; demo data is self-reported. Attested data provenance lands in
  Wave 3.
- **`wallet-sdk` is pinned to 1.2.0** via `package.json` `overrides` to match
  the MidnightJS 4.1.1 release train (see the root `package.json`).
