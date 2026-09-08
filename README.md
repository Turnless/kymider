# Kymider

**Privacy-first loan underwriting on [Midnight](https://docs.midnight.network/)**

[![CI](https://github.com/Turnless/kymider/actions/workflows/ci.yml/badge.svg)](https://github.com/Turnless/kymider/actions/workflows/ci.yml)

Borrowers prove creditworthiness — solvency, liquidity, payment history, debt ratios — to lenders using **zero-knowledge proofs**, without ever revealing balances, transaction history, or identity.

## What Kymider does

- Each borrower deploys their **own `SolvencyProof` contract instance**; their financial facts live in that instance's **private state**.
- A shared, public-only **`Registry`** contract indexes borrower instances so lenders can discover and request claims.
- Lenders get **network-verified PASS/FAIL** on a claim like *"net worth ≥ $X and debt-to-income ≤ 40%"* — raw data is never revealed.
- In Wave 2, each **loan** is its own contract instance with an on-chain lifecycle (apply → underwrite → disburse → repay).
- In Wave 3, the same proof engine feeds a **traditional-bank channel** via signed, expirable off-chain attestations, plus attested data provenance and KYC/AML hooks.

## Architecture (v1.1)

The design follows Midnight's model: **private state belongs to a single contract instance**. No contract holds another borrower's secrets.

| Component | Type | Role |
|---|---|---|
| `SolvencyProof` | contract (per-borrower instance) | private facts + public commitments/attestations |
| `Registry` | contract (shared, public-only) | indexes borrower instances for lenders |
| `Loan` | contract (per-loan instance) | lifecycle state machine (Wave 2) |
| `LoanDirectory` | contract (public) | indexes loans (Wave 2) |
| Off-chain client | MidnightJS SDK | deploy, register, generate proofs locally, submit |
| Attestation API | service (Wave 3) | signed JWS attestations for banks |

Key properties:

- **Network-verified proofs** — the Midnight network verifies each ZK proof at submission; lenders can also verify off-chain via the borrower's `verifierKey`.
- **Explicit authorization** — every privileged transition checks the caller (`owner`, `lender`, `authorizedLenders`). Midnight has no native roles.
- **Per-instance privacy** — one borrower per `SolvencyProof` instance; one loan per `Loan` instance.
- **Honest data provenance** — ZK proves computation, not honesty. Demo data is self-reported; production relies on attested data providers that co-sign facts into private state (Wave 3).

## Repository structure

```
kymider/
├── contracts/
│   ├── solvencyProof.compact   # per-borrower program
│   ├── registry.compact        # shared public index
│   ├── index.ts                # CompiledContract glue (consumes compiled/)
│   ├── witnesses.ts            # private-state shapes + witnesses
│   └── types/
│       └── financial.compact   # shared reference types (not compiled standalone)
├── compiled/                   # compiler output (git-ignored)
│   ├── solvency-proof/
│   └── registry/
├── client/
│   ├── index.ts                # KymiderClient facade (the main API)
│   ├── config.ts               # LOCAL / PREVIEW / PREPROD network presets
│   ├── wallet.ts               # MidnightWalletProvider + syncWallet
│   ├── providers.ts            # buildProviders (solvency + registry provider sets)
│   ├── context.ts              # shared wallet wiring for scripts/demo
│   ├── deploy.ts               # deploy + register CLI
│   ├── demo.ts                 # end-to-end demo CLI
│   ├── check-balance.ts        # print a wallet's balances
│   ├── utils.ts                # byte helpers (hexToBytes, bytesToHex, bytesEqual)
│   ├── env.ts                  # .env loader for the CLI entry points
│   ├── identity.ts             # persistent dapp secret key (.wallet-seed)
│   ├── state.ts                # .midnight-state.json read/write
│   └── proof/
│       └── solvencyProof.ts    # reference circuit math (computeSolvency, DTI, net worth)
├── frontend/                   # web console — runs the real contracts in-browser
│   ├── src/
│   │   ├── Landing.tsx         # marketing page (scroll-driven)
│   │   ├── App.tsx             # routes + borrower/lender role
│   │   ├── borrower/           # Overview, Facts, Claims
│   │   ├── lender/             # Directory, Underwriting
│   │   ├── components/         # console shell, badges
│   │   └── lib/
│   │       ├── client.ts       # the KymiderClient interface the screens use
│   │       ├── contracts.ts    # browser-safe compiled-contract exports
│   │       └── simulatedClient.ts  # that interface, on the real contracts
│   ├── package.json
│   └── vite.config.ts          # wasm plugin + single-runtime pinning
├── scripts/
│   └── wait-for-dust.ts        # wait for NIGHT + DUST accumulation
├── tests/
│   ├── unit/
│   │   ├── solvencyProof.unit.test.ts       # circuit math (reference impl)
│   │   ├── solvencyProof.contract.test.ts   # compiled contract, run offline
│   │   ├── registry.contract.test.ts        # compiled contract, run offline
│   │   └── support/simulators.ts            # offline contract simulators
│   └── simulation/
│       └── wave1.simulation.test.ts         # two wallets on the devnet
├── docs/
│   ├── architecture-wave1.md
│   ├── architecture-wave2.md
│   ├── architecture-wave3.md
│   └── scaffold.md             # Wave 1 scaffold build/run guide
├── docker-compose.yml          # local devnet (midnight-node, indexer, proof-server)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── README.md
```

## Waves

| Wave | Build period | Focus | Pool |
|---|---|---|---|
| Wave 1 | Aug 27 – Sep 16, 2026 | Proof-of-solvency MVP (per-borrower instances + Registry) | US$3,500 |
| Wave 2 | Sep 27 – Oct 17, 2026 | Loan lifecycle (per-loan instances) | US$4,000 |
| Wave 3 | Oct 27 – Nov 16, 2026 | Attestations, provenance, polish | US$5,000 |

See `docs/architecture-wave1.md`, `docs/architecture-wave2.md`, `docs/architecture-wave3.md` for full detail.

## See it run

```sh
git clone https://github.com/Turnless/kymider && cd kymider/frontend
npm install && npm run dev          # http://localhost:3000
```

No Docker, no node, no wallet extension. The console runs the **compiled
Compact contracts themselves** in your browser: six `SolvencyProof` instances
and a `Registry` are deployed into `compact-runtime` at page load, and every
figure on screen is read back off that ledger. Authorization asserts,
commitment binding and PASS/FAIL verdicts are the contract's, not the UI's — so
the console cannot show you a state the chain would refuse.

Walk the borrower side (commit a statement, answer a lender's request), then
flip to the lender side and underwrite someone: name your terms, watch the
verdict land, and see all three figures behind it read `not disclosed`.

It does not generate ZK proofs or submit transactions — that is the Node client
below, and the devnet simulation CI runs on every push.

## Running the rest

Full setup details, prerequisites and troubleshooting are in [`docs/scaffold.md`](./docs/scaffold.md).

> Windows: use `npm.cmd` instead of `npm` (npm.ps1 is blocked by the default execution policy).

Offline, and enough for most work — no Docker required:

1. Install dependencies: `npm install`
2. Run the tests: `npm run test:unit` (circuit math plus the compiled contracts
   driven offline — 49 tests in a few seconds)

The full ZK flow, which needs Docker for the node, indexer and proof server:

3. Start the local devnet: `npm run env:up`
4. Compile contracts (needs the Linux-only `compact` compiler): `npm run build:contracts`
5. Wait for NIGHT + DUST to accumulate: `npm run wait:dust`
6. Run the devnet simulation: `npm run test:simulation`
7. Run the end-to-end demo: `npm run demo`

If Docker or the compiler are not available to you, CI runs all of it on every
push — including real ZK proof generation against a real Midnight node.

## License

Midnight-related code developed for this project is Apache-2.0. See [LICENSE](./LICENSE).
