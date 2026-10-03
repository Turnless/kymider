# Kymider - build-in-public drafts for X

Drafts for the owner to post. Nothing here has been posted. Each post is under
280 characters, counting every link as 23 characters, as X does. Tag
`@MidnightNtwrk` and use `#MidnightBuildathon` only where shown, so the feed does
not read as spam. Attach the named image where one is suggested; the paths are
the deck screenshots in `hackathon/wave2/deck/shots/`.

Post 2 waits for the Preprod run, which is pending the owner's wallet. Post 3,
5/7 says "Preprod: pending"; change that line once `PROOF.md` exists.

---

## 1. Thesis post (post first, around Oct 6)

> DeFi lending asks everyone for 150% collateral: protocols can't see
> balance sheets.
>
> I'm building the other answer on @MidnightNtwrk: prove in zero knowledge you
> clear the lender's bar. The lender can only offer 110%, and only you make
> it binding.
>
> 11,000 collateral, not 15,000.

Image: `03-prove-tier.jpg`, or slide 3 of the deck.

---

## 2. Milestone post (after the Preprod deploy)

Do not post until the Preprod run is done. Replace `{{PREPROD_TX}}` with an
explorer link to one transaction from `PROOF.md`.

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
> Ask a verified borrower for 150% and it's refused. The offer binds only
> when the borrower accepts.

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
> - 4 Compact contracts, 22 circuits, compiled in CI
> - 302 offline tests on the compiled contracts
> - 46 browser tests of the console
> - 18 devnet cases with real ZK proofs, every push
> - Preprod: pending
>
> https://github.com/Turnless/kymider

**6/7**

> What's simulated: no token moves yet, and the figures are self-reported, so
> today anyone can get VERIFIED. ZK proves the arithmetic, not that the inputs
> are true.
>
> Wave 3: data providers co-sign facts. The auditor check is already in the
> console.

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
- **"Can't the lender just re-quote?"** Not while a verified tier is live,
  and any figure the lender names is only an offer until the borrower accepts.
  A review found that gap in our first version; we closed it in the contract.
- **"Is the payment history private?"** No. Each repayment amount is public on
  the ledger. The history proof hides which loans back it, not that a key has
  repaid loans. The auditor check proves the history is complete and unaltered.
- **"Where's the money?"** Nowhere yet. Wave 2 is a lifecycle demo; balances
  are figures in contract state. Token settlement is a later milestone.
