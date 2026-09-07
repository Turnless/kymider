# Kymider

**Privacy-first loan underwriting on [Midnight](https://docs.midnight.network/)**

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
│   └── proof/
│       └── solvencyProof.ts    # reference circuit math (computeSolvency, DTI, net worth)
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Router + role toggle
│   │   ├── components/         # Shared UI components
│   │   ├── borrower/           # Borrower screens
│   │   ├── lender/             # Lender screens
│   │   └── lib/                # Client integration, formatters
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   └── wait-for-dust.ts        # wait for NIGHT + DUST accumulation
├── tests/
│   ├── unit/
│   │   └── solvencyProof.unit.test.ts
│   └── simulation/
│       └── wave1.simulation.test.ts
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

## Getting started

Full setup details, prerequisites and troubleshooting are in [`docs/scaffold.md`](./docs/scaffold.md).

> Windows: use `npm.cmd` instead of `npm` (npm.ps1 is blocked by the default execution policy).

1. Install dependencies: `npm install`
2. Start the local devnet: `npm run env:up` (Docker Desktop + WSL on Windows)
3. Compile contracts (needs the `compact` compiler): `npm run build:contracts`
4. Wait for NIGHT + DUST to accumulate: `npm run wait:dust`
5. Run tests:
   - Unit (no network): `npm run test:unit`
   - Simulation (devnet): `npm run test:simulation`
6. Run the end-to-end demo: `npm run demo`

## License

Midnight-related code developed for this project is Apache-2.0. See [LICENSE](./LICENSE).
