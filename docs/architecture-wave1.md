# Kymider — Wave 1 Code Architecture

**Proof of Solvency MVP** *(rev. 1.1 — addresses red-flag review)*

> Build period: Aug 27 – Sep 16, 2026 · Wave 1 pool: US$3,500
> Goal: a working vertical slice — a `SolvencyProof` Compact contract that compiles, a **per-borrower instance** dual-ledger model, and an end-to-end demo on the local network.

---

## 0. Revision Note (v1.1)

This revision fixes the three architectural blockers identified in the red-flag review:

1. **Per-borrower private state** — private state belongs to *one contract instance*. We now deploy **one `SolvencyProof` instance per borrower**; a shared, public-only **`Registry`** contract indexes instances for lenders. No contract holds another borrower's secrets.
2. **Verification** — proofs are verified by the **Midnight network at submission**, and lenders can additionally verify off-chain with the borrower's **verification key**.
3. **Authorization** — every privileged transition has an **explicit caller check** (`owner`, `lender`, or `registry`), since Midnight has no native roles.
4. **Data provenance** — ZK proves *computation*, not *honesty*. Self-reported facts are explicitly flagged; the fix (attested/co-signed data sources) is scoped and scheduled.

---

## 1. Overview

The Wave 1 flow:

- A borrower **deploys their own `SolvencyProof` instance**; their facts (balance, debts, income) live in that instance's **private state**.
- The borrower **registers the instance** in the shared public `Registry`.
- A lender discovers borrowers via the `Registry`, requests a claim, e.g. *"net worth ≥ $X AND DTI ≤ Y%"*.
- The borrower's client generates a **zero-knowledge proof locally**; the **Midnight network verifies it on submission**; the attested PASS/FAIL is written to the instance's public state and indexed in the `Registry`.
- **Raw data is never revealed.**

Runs against `midnight-local-dev`.

---

## 2. Why Per-Borrower Instances (Midnight Model)

In Midnight, a contract's **private state belongs to a single contract instance**, tied to the account that deploys it. Consequences:

| Naive (wrong) | Correct |
|---|---|
| One `SolvencyProof` instance with `balance/debts/income` for **all** borrowers | **One instance per borrower**; private state holds only that borrower's facts |
| Global public registry inside the same contract | Public **`Registry` contract** (separate program) indexes instances |
| Loan map across borrowers in one contract (Wave 2) | Per-loan instance + public directory (Wave 2) |

The `Registry` and the per-borrower instances are **two programs**; instances reference each other by contract address.

---

## 3. Contract Model

### 3.1 `SolvencyProof` (per-borrower instance)

| State | Contents | Access |
|---|---|---|
| **Private** | `balance`, `debts`, `income` | Only the deploying borrower can update (via local call + ZK) |
| **Public** | `commitment` (hash of private state), `verifierKey`, claims, attestations, `authorizedLenders` | Everyone can read |

Illustrative Compact sketch (not final syntax):

```text
contract SolvencyProof {

  private state {
    balance: bigint;
    debts:   bigint;
    income:  bigint;
  }

  public state {
    owner: Address;                       // the borrower (deployer)
    commitment: Hash;                     // hash of private state
    verifierKey: VerificationKey;         // for off-chain proof verification
    claims: Registry<Address, Claim>;     // lender -> requested claim
    attestations: Registry<Address, Result>; // lender -> PASS/FAIL
    authorizedLenders: Set<Address>;      // who may read/attest
  }

  // ZK claim against CURRENT private state
  // Compact has no division operator, so the DTI criterion is evaluated as the
  // exact cross-multiplied form (no truncation, conservative for underwriting):
  //   dti <= maxDti  ⇔  debts*100 <= maxDti*income
  circuit proveSolvency(thresholdNetWorth, maxDti) {
    check claim.status == PENDING;       // cannot re-prove a decided claim
    netWorth = balance - debts;
    dtiOk    = debts * 100 <= maxDti * income;
    return (netWorth >= thresholdNetWorth) && dtiOk;
  }

  // --- transitions with EXPLICIT caller checks ---
  local addLender(lender)        { check caller == owner; }         // only borrower
  local submitClaim(lender, t, m) { check caller == owner; }        // only borrower
  public approve(lender)         { check caller in authorizedLenders; } // only lender
  public reject(lender)          { check caller in authorizedLenders; }
  public updateFacts()           { /* local call: network verifies ZK proof */ }
}
```

**Authorization model (red flag #3):**
- `owner` is set at deployment (= borrower). Only the owner changes private state and grants lender access.
- `approve`/`reject` require the caller to be in `authorizedLenders` — checked against state, not assumed.

### 3.2 `Registry` (shared, public-only)

A second, public-only program that lenders query:

```text
contract Registry {
  public state {
    borrowers: Map<InstanceAddr, BorrowerRecord>;
    // BorrowerRecord = { commitment, status, loanCount }
  }
  public register(instanceAddr)     { check caller == instance.owner; }
  public updateStatus(instanceAddr) { ... }
  public list() -> [...]
}
```

Lenders never read another borrower's private state — they read the public `Registry` index and each borrower's public attestations.

---

## 4. Verification Flow (red flag #2a)

| Step | Who verifies | How |
|---|---|---|
| 1 | Borrower client | Generates the ZK proof locally against private state |
| 2 | **Midnight network** | **Verifies the proof as part of the local-call transaction on the shielded ledger** (invalid proofs are rejected) |
| 3 | Lender (optional, extra assurance) | Verifies the attested result off-chain against the borrower's public `verifierKey` |
| 4 | Registry | Confirms the instance's status/attestation record |

A borrower cannot submit a false proof: step 2 fails it. A borrower *can* submit a false **fact** (a real balance is not the same as a claimed balance) — see §5.

---

## 5. Data Provenance — "ZK proves computation, not honesty" (red flag #2b)

The `commitment` is a hash of **self-reported** data. The circuit proves the arithmetic is correct; it does **not** prove the balance is real. This is the classic ZK-credit hole and it is handled explicitly:

| Ingestion mode | Wave | Provenance strength |
|---|---|---|
| Manual mock input | Wave 1 (demo) | Self-reported — labelled "demo data" in UI |
| Attested data source (bank API / payroll provider **co-signs the facts** into private state at ingestion) | Wave 3 | Third-party vouches for the facts; the borrower then proves facts + co-signature via ZK |

Docs and UI must use **"verified claim"** (computation) never "tamper-proof fact" (honesty).

---

## 6. Off-chain Client (MidnightJS)

```
client/index.ts  (KymiderClient)
  ├── deploySolvencyProof(facts, sk)     # borrower deploys own instance
  ├── deployRegistry(sk)                 # deploy the shared Registry
  ├── registerWithRegistry(reg, sol)     # borrower registers instance in Registry
  ├── authorizeLender(sol, lenderPk)     # borrower grants lender access
  ├── updateFacts(sol, facts)            # borrower updates committed facts
  ├── proveSolvency(sol, lenderPk)       # borrower generates + submits ZK proof
  ├── requestClaim(sol, claim)           # lender requests a claim
  ├── decideClaim(sol, approve)          # lender approves/rejects
  ├── solvencyState(addr) / registryState(addr)  # read public state
  ├── listBorrowers(regAddr)             # lender discovers borrowers
  ├── claimFor(sol, lenderPk)            # read a specific claim
  ├── attestationFor(sol, lenderPk)      # read attestation status
  └── verifyOffChain(sol, reg, lenderPk) # optional lender-side record check
```

Raw data stays in the client; only proofs + commitments leave it (NFR-1).

---

## 7. Frontend

- **Borrower dApp**: deploy instance → enter financials → register → generate & submit proof → see claims/attestations.
- **Lender dApp**: browse `Registry` → open a borrower instance → request claim → see **verified PASS/FAIL, raw values hidden** → approve/reject.

---

## 8. End-to-End Sequence

```
 Borrower                Registry              SolvencyProof (own instance)      Lender dApp
    |  deploy()              |                          |                            |
    |----------------------->|                          |  private state (own facts) |
    |  register()            |                          |                            |
    |----------------------->|  index instance          |                            |
    |                        |                          |<--- discover borrower -----|
    |                        |                          |<--- request claim ---------|
    |  proveSolvency() (ZK)  |                          |                            |
    |----------------------->|                          |  network VERIFIES proof     |
    |  submitClaim()         |                          |                            |
    |----------------------->|                          |                            |
    |                        |                          |  attestation PASS/FAIL <----| verified
    |                        |  status update           |  approve/reject (auth:     |
    |                        |<-------------------------|  lender only)               |
```

---

## 9. Testing Strategy

| Layer | Tool | Coverage |
|---|---|---|
| Contract simulation | `midnight-local-dev` | deploy → register → claim → approve/reject; **negative auth tests** (non-owner calling `approve`) |
| Unit | Vitest / Jest | circuit edge cases (DTI 0, boundary thresholds); proof rejections |
| E2E | Playwright | borrower + lender UI against local network |

---

## 10. Week-1 Spike (red flag #7)

De-risk the biggest risk first:

1. Scaffold two contract programs (`SolvencyProof` + `Registry`) from `midnight-local-dev` samples.
2. Get **one per-borrower instance compiling + deployed** with a private-state local call.
3. Prove the **network-verification** step works (tamper with a fact → proof rejected).
4. Only then build the UI.

If the technical gate (compiling contract) is not met by end of week 1, the demo is at risk — so this spike is the top priority.

---

## 11. Judging Rubric Mapping

- **Engineering 40%** — compiling contracts, *correct* per-instance private-state model, dual-ledger usage, caller authorization, organized repo, README.
- **QA 15%** — simulation + unit tests (incl. auth-negative tests) passing.
- **UX 15%** — two frontends end-to-end.
- **Product/BD 5%** — dual-channel thesis stated honestly ("channel demo" in Wave 1).
