# Kymider - build-in-public drafts for X

Drafts for the owner to post. Nothing here has been posted. Each post is under
280 characters, counting every link as 23 characters, as X does. Tag
`@MidnightNtwrk` and use `#MidnightBuildathon` only where shown, so the feed does
not read as spam. Attach the named image where one is suggested; the paths are
the deck screenshots in `hackathon/wave2/deck/shots/`.

Items that depend on unfinished work are marked `<!-- VERIFY -->`; do not post
them until they are true.

---

## 1. Thesis post (post first, around Oct 6)

> DeFi lending asks everyone for 150% collateral: a protocol can't see a
> borrower's balance sheet.
>
> I'm building the other answer on @MidnightNtwrk: prove in zero knowledge you
> clear the lender's bar; the contract enforces 110%.
>
> One bit disclosed. 11,000 collateral, not 15,000.

Image: `03-prove-tier.jpg`, or slide 3 of the deck.

---

## 2. Milestone post (after the Preprod deploy)

<!-- VERIFY: Preprod deploy done; replace {{PREPROD_TX}} with an explorer link -->

> Kymider's Loan contract is on Midnight Preprod.
>
> A lender tried to charge a verified borrower 150%. Refused: "collateral
> does not match the tier".
>
> Compact has no division, so the circuit checks the exact floor of 110% by
> cross-multiplying.
>
> {{PREPROD_TX}}

Image: `05-refusal-150.jpg`.

---

## 3. Launch thread (submission day)

**1/7**

> Kymider, Wave 2 of the #MidnightBuildathon: prove solvency privately, post
> 110% collateral instead of 150%.
>
> Live console, no install: https://turnless.github.io/kymider/
> Video: {{VIDEO_URL}}
>
> What it does and what it doesn't, below.

Image: `01-landing.jpg`.

**2/7**

> Each loan is its own Compact contract instance. The lender quotes a
> net-worth floor and a max debt-to-income. The borrower's proveTier circuit
> checks their private figures against an on-chain hash and writes one word:
> VERIFIED or STANDARD.

Image: `03-prove-tier.jpg`.

**3/7**

> What the lender sees: the tier. Balance, debts, income: not disclosed.
>
> What the contract enforces: collateral = exactly floor(principal × 110%).
> Ask a verified borrower for 150% and the transaction is refused.

Image: `04-lender-underwrite.jpg`, then `05-refusal-150.jpg`.

**4/7**

> Repayments run on block time: late is decided by the chain, and a default
> can't be called until 3 days past due.
>
> Each payment extends a hash chain. Later, the borrower can prove "2 loans
> repaid" on a new application without naming which, via a Merkle tree.

Image: `06-repaid-history.jpg`.

**5/7**

> Evidence:
> - 4 Compact contracts, 20 circuits, compiled in CI
> - 131 offline tests on the compiled contracts
> - 18 devnet cases with real ZK proofs, every push
> - Preprod hashes in PROOF.md <!-- VERIFY -->
>
> https://github.com/Turnless/kymider

**6/7**

> What's simulated: no token moves yet (collateral is a figure in contract
> state), and the figures are self-reported. ZK proves the arithmetic, not
> that the inputs are true.
>
> Wave 3: data providers co-sign facts, and an auditor view. The preview is
> already in the console. <!-- VERIFY: /app/audit shipped -->

Image: `07-auditor.jpg`.

**7/7**

> If you run a lending protocol and a cheaper verified tier interests you, or
> you provide financial data and would co-sign facts, my DMs are open.
>
> Apache-2.0. Built with Compact + MidnightJS on @MidnightNtwrk.

---

## Reply templates

- **"Why not just KYC?"** KYC tells the lender who you are, not whether you can
  repay, and it puts identity on a counterparty's server. The tier answers the
  repayment question and nothing else.
- **"Can't the borrower lie?"** Today, yes: figures are self-reported, and we
  say so in the README. Wave 3 has a data provider co-sign them before they are
  committed.
- **"Where's the money?"** Nowhere yet. Wave 2 is a lifecycle demo; balances
  are figures in contract state. Token settlement is a later milestone.
