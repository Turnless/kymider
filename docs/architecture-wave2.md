# Kymider — Wave 2 Code Architecture

**Loan Lifecycle** *(rev. 1.1 — addresses red-flag review)*

> Build period: Sep 27 – Oct 17, 2026 · Wave 2 pool: US$4,000
> Goal: a full **borrow → underwrite → disburse → repay** lifecycle with **per-loan contract instances**, explicit authorization, and payment-history proofs.

---

## 0. Revision Note (v1.1)

Consistent with the Wave 1 revision:

1. **Per-loan instances** — each loan is its own `Loan` contract instance; the borrower's `paymentHistory` lives in that instance's private state. A public `LoanDirectory` indexes loans. No shared loan map holding multiple borrowers' data.
2. **Explicit authorization** — `borrower`, `lender`, and `registry` are stored in state; every lifecycle transition checks the caller.
3. **Money mechanics made explicit** — balances are simulated in contract state for the demo; real settlement (USDC/ADA on Cardano) is clearly marked as a later milestone, not claimed in Wave 2.

---

## 1. Overview

Wave 2 turns the per-borrower proof (Wave 1) into a **loan product**:

- Each loan = a **`Loan` contract instance** deployed by the borrower.
- Public **`LoanDirectory`** indexes loans (status, terms summary) for discovery.
- **Disbursement and installment repayment** are contract-enforced (simulated funds).
- Borrowers can prove **payment history** (e.g., *"no default in the last 12 months"*).
- Attestations become **time-boxed** with expiry + refresh.
- Borrower and lender **dashboards** manage the lifecycle.

---

## 2. Repository Structure (additions)

```
kymider/
├── contracts/
│   ├── index.compact               # SolvencyProof (per-borrower, Wave 1)
│   ├── registry.compact            # Registry (Wave 1)
│   ├── loan.compact                # NEW: per-loan lifecycle contract
│   ├── loanDirectory.compact       # NEW: public index of loans
│   ├── types/
│   │   ├── financial.compact
│   │   └── loan.compact            # NEW: LoanTerms, LoanStatus, Payment
│   └── circuits/
│       ├── solvency.zk
│       └── paymentHistory.zk       # NEW
├── compiled/
├── client/
│   ├── api/
│   │   ├── borrower.ts             # + apply(), repay(), refreshProof()
│   │   ├── lender.ts               # + underwrite(), disburse(), viewPortfolio()
│   │   └── loan.ts                 # NEW: lifecycle ops against a loan instance
│   └── proof/
│       └── paymentHistory.ts       # NEW
├── services/
│   └── expiry/                     # proof expiry + refresh (dev-mode scheduler)
├── frontend/
│   ├── borrower/                   # + loan status, repay, refresh
│   ├── lender/                     # + portfolio, underwrite, disburse
│   └── shared/
├── tests/
│   ├── simulation/                 # + loan lifecycle scenarios
│   └── unit/
└── README.md
```

---

## 3. Loan Contract — Lifecycle State Machine

**Per-loan instance.** The borrower deploys `Loan`; the instance holds *that loan only*.

```
                 apply()        underwrite()        disburse()
  ┌──────────┐  ──────► ┌────────────┐  ──────► ┌────────────┐
  │          │          │  Pending   │          │  Active    │
  │  None    │          │            │          │            │
  └──────────┘          └────────────┘          └─────┬──────┘
                            │ reject()               │ repay()
                            ▼                        ▼
                    ┌────────────┐           ┌────────────┐   ┌──────────────┐
                    │  Rejected  │           │   Active   │──►│   Repaid     │ (terminal)
                    └────────────┘           └─────┬──────┘   └──────────────┘
                                                  │ missed deadline
                                                  ▼
                                          ┌────────────┐
                                          │  Defaulted │
                                          └────────────┘
```

Illustrative Compact sketch:

```text
contract Loan {

  private state {
    paymentHistory: Map<Date, Payment>;   // this borrower's payments only
  }

  public state {
    borrower: Address;                    // deployer
    lender:   Address;                    // set at underwrite; auth target
    terms:    LoanTerms;                  // amount, rate, duration, collateral rules
    status:   LoanStatus;                 // Pending | Active | Repaid | Defaulted
    balanceOwed: bigint;
  }

  // --- lifecycle with EXPLICIT caller checks ---
  public apply(terms)                    { check caller == borrower; }   // borrower only
  public underwrite()                    { check caller == lender; }     // lender only
  public disburse()                      { check caller == lender; }
  public repay(installment)              { check caller == borrower; }   // borrower only
  public markDefault()                   { check caller == lender; }     // lender only
}
```

**Authorization (red flag #3):** `borrower` is the deployer; `lender` is locked at underwrite. Every transition checks the caller against state. A rogue account cannot `markDefault()` a healthy loan or `repay()` someone else's.

---

## 4. On-Chain Flows (Wave 2)

### 4.1 Apply → Underwrite → Disburse
1. Borrower deploys `Loan` instance, calls `apply(terms)` — **terms public**.
2. Lender runs an optional Wave-1 solvency check (now time-boxed).
3. Lender calls `underwrite()` → `lender` locked, status **Active**.
4. `disburse()` simulates releasing funds; `balanceOwed = principal + interest`.

### 4.2 Repay
- Borrower calls `repay(installment)`; contract updates `balanceOwed`.
- Each payment is **also written to private `paymentHistory`** (future proofs).
- `balanceOwed == 0` → **Repaid**.

### 4.3 Default
- Missed deadline → lender calls `markDefault()` → **Defaulted**.

---

## 5. Payment-History Proofs

`paymentHistory.zk` proves statements over *this borrower's* private records:

| Claim | Circuit output | Revealed |
|---|---|---|
| "No default in last N months" | boolean | nothing — just the verdict |
| "Always on-time in last N months" | boolean | nothing |

Only the verdict is attested; transactions stay private.

---

## 6. Proof Expiry & Refresh

- Attestations carry `expiresAt`.
- `services/expiry/` (dev scheduler) detects expiring proofs and asks the borrower client to re-prove against **current** private state.
- Refresh requires borrower presence + local proof generation — nobody can refresh on the borrower's behalf (deliberate).

**Acknowledged limitation (red flag #4):** point-in-time proofs can go stale between refreshes. Mitigations: shorter TTLs for large loans, lender-configurable `refreshInterval`, and (roadmap) continuous/streaming attestations.

---

## 7. Dashboards

### Borrower
- Applications, active loans, balance owed, next installment, refresh expiring proofs, prove payment history to a new lender.

### Lender
- Incoming applications, claim requests, underwrite/disburse/mark default, portfolio view (exposure per loan, aggregated risk).

---

## 8. End-to-End Sequence (apply → repay)

```
 Borrower              Loan instance (per-loan)        LoanDirectory        Lender dApp
    |  deploy + apply(terms)   |                            |                    |
    |-------------------------->|  Pending                   |  index             |
    |  solvency proof (W1)     |<----- request ------------|--------------------|
    |-------------------------->|  verified PASS            |                    |
    |                           |  underwrite() <------------------------------|
    |                           |  Active; lender locked    |  status update     |
    |  disburse()               |                            |                    |
    |-------------------------->|  balanceOwed set          |                    |
    |  repay() x N             |                            |                    |
    |-------------------------->|  balanceOwed -= inst.     |  status update     |
    |                           |  Repaid                   |                    |
```

---

## 9. Testing Strategy

| Layer | Coverage |
|---|---|
| Simulation | Full lifecycle: apply → underwrite → disburse → repay → default → repaid; refresh flow |
| Unit | State-machine invariants (no disburse before Active, no repay after Repaid, `balanceOwed` math); **auth-negative tests** (borrower calling `markDefault`, stranger calling `repay`) |
| E2E | Borrower repays from UI; lender approves from UI |

---

## 10. Money Mechanics (honest framing — red flag #6)

- Wave 2 simulates funds as `bigint` in contract state. **No token is minted or moved.**
- Real settlement (USDC/ADA escrow on Cardano via Midnight interop) is a post-Buildathon milestone, clearly labelled as such.
- Pitch language: **"product lifecycle demo"**, not "production lending".

---

## 11. Judging Notes for Wave 2

- Meaningful progress vs Wave 1: lifecycle contract, payment-history circuits, expiry/refresh, dashboards.
- Dual-ledger proven twice: facts private, product visible.
- Narrative: *"Wave 1 proved creditworthiness. Wave 2 ships the loan."*
