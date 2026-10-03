# Wave 3 preview: a borrower opens one loan's history to an auditor

Wave 2 already commits every repayment into a public hash chain on the Loan
contract. This preview adds the other half: the borrower hands an auditor the
openings of that chain, and the auditor checks them against the chain without
taking the borrower's word for anything.

| Piece | Where |
|---|---|
| Build and verify a disclosure (browser-safe) | `contracts/audit.ts` |
| Tests against the compiled Loan contract | `tests/unit/audit.unit.test.ts` |
| Auditor screen, route `/app/audit` | `frontend/src/auditor/Audit.tsx` (`AuditView`) |

## What it does

**On chain (Wave 2, unchanged).** `Loan.repay` folds each payment into
`historyCommitment`:

```
head₀ = H([pad(32, "kymider:loan:history:")])                         // constructor
headᵢ = H([headᵢ₋₁, H([amountᵢ]), onTimeᵢ ? "kymider:ontime" : "kymider:late", nonceᵢ])
nonceᵢ = H(["kymider:loan:nonce:", historySeed, headᵢ₋₁])             // witness, private
```

`H` is the contract's `persistentHash`. Lateness is the contract's verdict by
block time, never the borrower's. The ledger also keeps `paymentsMade` and
`latePayments`.

**Borrower.** `buildDisclosure(loan, historySeed, paymentLog)` re-derives every
nonce from the private seed and writes a JSON file:

```json
{ "version": 1, "loan": "<64 hex>", "payments": [ { "amount": "367", "onTime": true, "nonce": "<64 hex>" } ] }
```

The seed itself is not disclosed. The nonces open this loan only: each one is
a hash of the seed, so it says nothing about the borrower's other loans.

**Auditor.** `auditDisclosure(disclosure, lookup)` reads the address the
disclosure names, asks `lookup` (the auditor's own view of the chain) for that
loan's `historyCommitment`, `paymentsMade` and `latePayments`, and then
`verifyDisclosure` checks, in this order:

1. `version` is 1.
2. Every field is well-formed: the loan is 64 lowercase hex characters; each
   amount is a canonical decimal string (no sign, no leading zero, no exponent)
   within `Uint<64>`; each `onTime` is a JSON boolean; each nonce is 64
   lowercase hex characters; there are no unknown fields.
3. If the state carries its own address, it is the loan the disclosure names.
4. The number of payments equals `paymentsMade`.
5. The number marked late equals `latePayments`.
6. Folding the payments from `head₀` lands on `historyCommitment`, byte for byte.

A failure returns `{ ok: false, reason }`, where `reason` starts with one of the
`DisclosureFailure` codes (`unsupported version`, `malformed disclosure`,
`malformed on-chain state`, `loan not found`, `disclosure names a different
loan`, `payment count does not match the chain`, `late-payment count does not
match the chain`, `history does not open the on-chain commitment`), then the
detail. Step 6 alone already implies 4 and 5. They come first so the auditor
is told what is wrong, not just that the hash differs.

**Screen.** The auditor pastes or uploads the file. The view looks the named
loan up with `desk.loan(address)`, gets the verdict from
`desk.verifyDisclosure(d)`, and shows two things side by side. On one side is
the replayed table (payment #, amount, on time or late, the running chain head
with the last head compared to the chain). On the other is what the public
ledger alone shows (status, counts, balance, the one hash). Any figure where
the disclosure and the ledger disagree is marked.

## Threat model

The adversary is the borrower, who wants a better-looking history than the
one the chain committed to, or wants to pass another loan's history off as
this one's. Every row is a test in `tests/unit/audit.unit.test.ts`. Each test
drives the compiled Loan through real repayments first.

| Attack | Why it fails | Test (`describe` → `it`) |
|---|---|---|
| Change an amount | The head commits to `H(amount)`. A different amount means a different head, unless there is a hash collision. | hostile borrower → *changes an amount* |
| Swap two amounts, keeping the total | The order of the amounts is inside the chain. | hostile → *swaps two amounts, keeping the total* |
| Flip the late payment to on time | The late count no longer matches `latePayments`, and the head changes as well. | hostile → *flips the late payment to on time* |
| Move the late flag to another payment (count kept) | The counts match but the head does not. | hostile → *moves the late flag to another payment* |
| Drop the late payment | Fewer payments than `paymentsMade`. | hostile → *drops the late payment* |
| Truncate the history | The same. | hostile → *truncates the history* |
| Reorder the payments | Each head chains to the one before it. | hostile → *reorders the payments* |
| Reorder, and re-derive every nonce from the real seed | The seed does not help: the chain is a commitment to the sequence. | hostile → *reorders … re-derives every nonce* |
| Append or pad payments | More payments than `paymentsMade`. | hostile → *appends …*, *pads the front …* |
| Alter or swap nonces | A nonce is an input to the head. | hostile → *alters a nonce*, *swaps two nonces* |
| Rebuild the openings from another seed | Different nonces, so a different head. | hostile → *builds the openings from a different seed* |
| Present an old disclosure after a new payment | The count is behind the chain. | hostile → *hands over an old disclosure …* |
| Check loan A's openings against loan B's state | The state carries B's address, so it is refused as the wrong loan. With a bare state, the counts or the head differ. | binding → *refuses A's disclosure checked against B's …* (both) |
| Relabel clean loan B's history as loan A | `auditDisclosure` looks up A, and B's openings do not open A's head. | binding → *refuses B's clean history relabelled as loan A* |
| Relabel loan C, which has the same counts as A, as A | The counts match but the head does not. | binding → *refuses a relabelled history with matching counts* |
| Name a loan that does not exist | The lookup returns nothing. | binding → *reports a loan the auditor cannot find* |
| Malformed JSON, wrong version, non-canonical or out-of-range amount, non-boolean flag, bad hex, extra fields | Refused before any hashing, with the field named. | malformed → all nine cases |
| Random schedules with one random tamper each | 24 random loans (1–8 installments, random terms, on time and late, fully or partly repaid) all verify. More than 80 single tampers (amount, flip, drop, append, nonce, swap) each fail with the expected reason. | random payment schedules |

## Honest limits

- **The auditor learns this loan's amounts and timeliness.** They learn every
  amount, whether each payment was on time, and the order, for this loan. They
  do not learn the borrower's balance, debts or income behind the tier, any
  other loan, or who the borrower is beyond the public borrower key. They also
  do not learn how late a late payment was, because no timestamps are disclosed.
- **The binding to the loan is the auditor's lookup.** The loan address is not
  in the chain, and `head₀` is the same constant for every Loan. A disclosure
  is about loan X only because the auditor fetched X's head themselves. If the
  borrower supplies the "on-chain state", the check is meaningless. That is
  why `auditDisclosure` takes a lookup function and calls it with the address
  the disclosure names, and why the screen goes through the desk. One
  consequence follows: two loans with the same seed and the same sequence of
  payments have the same head, so either disclosure opens both. That is not a
  false statement, because the openings are the true history of each loan. It
  is pinned by *a relabelled disclosure can only ever open an identical
  history*.
- **There is no on-chain record of the audit.** Verification is a local
  computation. Nothing on the ledger shows that an audit happened, who
  performed it, or what it concluded.
- **The presenter is not authenticated.** Anyone holding the file can present
  it, and it cannot be revoked. It proves what the history is, not that the
  person presenting it is the borrower.
- **On Wave 2's ledger this history is largely public anyway.** `repay` runs
  `disclose(amount)`, and the ledger fields `balanceOwed` and `latePayments`
  change with every transaction. Someone who replays the loan's transaction
  history can rebuild each amount (from the balance changes) and each late
  flag (from the counter changes). The disclosure therefore adds integrity
  and convenience, not much secrecy: one file is checked against today's head,
  offline, with no history replay. For it to be real selective disclosure, a
  later contract has to stop publishing the amount and the per-payment late
  flag, for example by keeping the balance as a commitment.
- **The seed is the root.** If the seed leaks, every history under it can be
  opened by anyone. If one seed is reused across loans with identical
  payments, those loans end with identical heads, which links them publicly.
  Today they are linkable through the shared `borrower` key anyway.
- **This is a preview on a simulated desk.** In the console, the desk's lookup
  reads the in-browser simulation, not an indexer.

## Into the full Wave 3 regulator view

`docs/architecture-wave3.md` §5 calls for a read-only regulator window with
aggregate statistics and "loan in good standing" drill-downs. This preview is
the per-loan building block for it:

1. **Borrower-signed disclosures.** Add a signature (or a small ZK proof of
   knowledge of the `sk` behind `borrower`) over the disclosure. A presented
   history is then also proven to come from the borrower.
2. **Audit receipts as attestations.** The attestation API (§4) can issue a
   signed JWS that says "disclosure with hash D opened loan X at head H". A
   bank can store and re-check it offline, and it gives the audit the record
   it lacks today.
3. **A regulator dashboard over the LoanDirectory.** Aggregate the public
   counts (repaid, defaulted, late) across listed loans with no individual
   data. Drill into a single loan only when its borrower has disclosed it,
   using this same check.
4. **Private payments in the contract.** Hide the per-payment amount and
   timeliness on chain (see the limits above). The chain head then stays the
   only public trace, and this disclosure becomes the only way to read the
   history.
5. **Standing without opening.** For "loan in good standing" (§6), prove a
   predicate over the committed history in circuit, such as "no payment more
   than N days late", without disclosing the payments at all.
