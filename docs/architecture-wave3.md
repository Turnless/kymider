# Kymider — Wave 3 Code Architecture

**Attestations & Polish** *(rev. 1.1 — addresses red-flag review)*

> Build period: Oct 27 – Nov 16, 2026 · Wave 3 pool: US$5,000
> Goal: open the **second lender channel (traditional banks)** with signed, expirable, offline-verifiable attestations; add the **attested-data provenance** fix; add auditor/regulator + KYC/AML hooks; automate refresh; polish.

---

## 0. Revision Note (v1.1)

1. **Attested data provenance** — Wave 3 now includes the fix for the "ZK proves computation, not honesty" hole (red flag #2b): a **data provider co-signs facts into private state at ingestion**.
2. **Calibrated narrative** — the bank channel is a **"channel demo"**: a signing key, a demo KYC provider, and offline verification are implemented for the demo, with live bank integrations explicitly out of scope (red flag #5).
3. **Verification continuity** — attestations reference the per-borrower `SolvencyProof`/`Loan` instance and its `verifierKey` (red flag #2a).

---

## 1. Overview

One proof engine, two channels:

- **On-chain channel** (Waves 1–2): proofs → Compact contract → on-ledger attestations + enforcement.
- **Bank channel** (Wave 3): the *same* proofs become **signed JWS attestations** a bank can verify offline and archive — no chain access needed on the bank side.

The Wave-3 truthfulness fix (co-signed facts) strengthens *both* channels.

---

## 2. Repository Structure (additions)

```
kymider/
├── contracts/
│   ├── index.compact               # SolvencyProof (per-borrower)
│   ├── registry.compact
│   ├── loan.compact                # per-loan
│   ├── loanDirectory.compact
│   └── circuits/...
├── compiled/
├── client/
│   ├── proof/
│   │   ├── solvencyProof.ts
│   │   ├── paymentHistory.ts
│   │   └── attestation.ts          # NEW: build bank-consumable signed attestations
│   └── ingestion/
│       └── verifiedData.ts         # NEW: receive + co-sign attested facts into private state
├── services/
│   ├── expiry/                     # (Wave 2)
│   └── attestation-api/            # NEW: REST API for traditional banks
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/
│       │   │   ├── attestations.ts     # issue / verify / revoke
│       │   │   ├── auditors.ts         # regulator views
│       │   │   └── kyc.ts              # KYC/AML proof requests
│       │   ├── signing/                # JWS signing (key from HSM/env)
│       │   └── verifier.ts
│       └── test/
├── workers/
│   └── refresh/                    # NEW: scheduled recurring proof refresh
├── frontend/
│   ├── borrower/
│   ├── lender/                     # + "share attestation" export
│   └── auditor/                    # NEW: regulator read-only dashboard
├── tests/
└── README.md
```

---

## 3. Attested Data Provenance (red flag #2b — the fix)

Ingestion is now a two-party step, not self-report:

```
 Data provider (bank API / payroll)        Borrower client
        |  fact: balance = 12,400.00          |
        |  signs fact (provider signature)    |
        |------------------------------------>|  validate provider signature
        |                                     |  fold fact + provider sig into
        |                                     |  private state (commitment updated)
        |                                     |  -> borrower can now prove:
        |                                     |     "balance >= $X AND fact signed by
        |                                     |      provider P"  (ZK)
```

- The **circuit can prove the co-signature is valid** — so the claim carries provenance, not just arithmetic.
- Providers sign facts at ingestion; **facts are never revealed**, only the verified-claim result.
- Demo: a mock "payroll provider" signs mock facts (no real bank integration — calibrated narrative).

---

## 4. Attestation API — Architecture

```
 Borrower client (MidnightJS)        Kymider Attestation API             Traditional bank
    |  prove locally; export proof     |                                      |
    |--------------------------------->|  POST /attestations                  |
    |                                  |   - proof + verifierKey reference   |
    |                                  |   - policy: claim, threshold, TTL   |
    |                                  |  verify proof vs instance + network |
    |                                  |  sign JWS (HSM/env key)             |
    |                                  |  store record (SQLite)              |
    |                                  |------------------------------------>| store + verify
    |                                  |<------------------------------------| GET /verify
```

### Attestation record (illustrative)

```json
{
  "id": "att_9f3a...",
  "subject": "borrower-did",
  "instance": "midnight:instance:0x...",
  "verifierKey": "vk_...",
  "claim": "NET_WORTH >= 50000 AND DTI <= 0.40",
  "provenance": { "provider": "mock-payroll", "factIds": ["f1", "f2"] },
  "result": "PASS",
  "issuedAt": "2026-11-02T10:00:00Z",
  "expiresAt": "2026-12-02T10:00:00Z",
  "signature": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

- **JWS (ES256)** → banks verify offline with Kymider's public key.
- **`expiresAt`** mirrors the on-chain TTL.
- **`instance` + `verifierKey`** tie the attestation to a specific contract instance for online verification.

### Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/attestations` | Issue (borrower consent + local proof) |
| GET | `/attestations/:id` | Fetch signed attestation |
| GET | `/verify` | Online verification |
| POST | `/revocations/:id` | Revoke before expiry |
| GET | `/auditor/attestations` | Auditor/regulator read-only view |
| POST | `/kyc/check` | Prove KYC/sanctions status privately |

---

## 5. Auditor / Regulator Views

`frontend/auditor` + `/auditor/*` = read-only, non-invasive window:

- Aggregate stats (verified loans, default rates) — **no individual data**.
- Drill-down to "loan in good standing" attestations.
- Story: prove compliant lending *and* that Kymider never touches raw borrower data.

---

## 6. KYC / AML Hooks

A regulated bank needs identity + sanctions checks without receiving the data:

| Hook | Proves (ZK) | Never reveals |
|---|---|---|
| Identity | "identity verified by licensed KYC provider" | the identity |
| Sanctions | "not on sanctioned-entity lists" | screening detail |
| Standing | "loan in good standing" | balance, history |

Implementation: the KYC provider **co-signs the verification fact** into private state (same pattern as §3); the borrower then proves *the fact of verification* via ZK. Demo uses a mock KYC provider.

---

## 7. Recurring Proof Refresh (Worker)

```
cron (daily)
   ├─ scan loans with attestations near expiresAt
   ├─ notify borrower client (in-app / push)
   │    └─ borrower ONLINE → re-prove against current private state → submit
   └─ update attestation registry (+ re-issue bank attestation if subscribed)
```

Consent + local proof generation remain mandatory — the worker schedules, it cannot forge proofs (red flag #4: this gap is disclosed, with TTL + refresh intervals as mitigations).

---

## 8. End-to-End Flow (dual channel)

```
                        Kymider proof engine
                       ┌─────────────────────┐
                       │ per-borrower facts   │
                       │ + provider co-signs  │
                       │ ZK circuits          │
                       └──────────┬───────────┘
                                  │ one proof
              ┌───────────────────┴───────────────────┐
              │                                       │
     on-chain channel                          bank channel
   ┌──────────▼──────────┐              ┌─────────────▼──────────────┐
   │ Midnight contracts  │              │ Attestation API + JWS      │
   │ verified by network │              │ offline-verifiable, signed │
   │ Cardano settlement  │              │ stored in bank rails       │
   │ (roadmap)           │              │ (channel demo in Wave 3)   │
   └─────────────────────┘              └────────────────────────────┘
```

---

## 9. Security Notes

- Signing keys in HSM / env-managed secrets — **never in the repo**.
- Raw private state never reaches the API; only proofs, commitments, and co-signed-fact references.
- All issue routes require borrower consent.
- Rate-limit `/verify`, `/attestations`; audit logging with no PII.

---

## 10. Deployment / Infra (buildathon demo)

| Component | Run on |
|---|---|
| Contracts | `midnight-local-dev` (or Midnight testnet) |
| Attestation API | Docker compose (Fastify + SQLite index) |
| Refresh worker | Node cron in the same compose |
| Mock data provider / KYC | Local mock service in compose |
| Frontends | Vite dev servers; `npm run demo` |

README documents `docker compose up` for the full Wave 3 stack.

---

## 11. Judging Notes for Wave 3

- **Meaningful progress**: bank channel, attested provenance, KYC/AML, auditor views, automation, polish.
- **BD 5%**: honest two-sided market story + adoption path; **"channel demo"** not "bank-ready".
- **Communication 10%**: demo video leads with *"same proof, two channels, real provenance"*.
- Final submission: repo, README, slide deck, demo video, wave-over-wave change log.
