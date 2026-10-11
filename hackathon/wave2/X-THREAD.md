# Kymider - build-in-public drafts for X

Drafts for the owner to post. Nothing here has been posted. Posts 1 and 2 are
under 280 characters, counting every link as 23 characters, as X does; post 3
is one long post. Tag
`@MidnightNtwrk` and use `#MidnightBuildathon` only where shown, so the feed does
not read as spam. Attach the named image where one is suggested; the paths are
the deck screenshots in `hackathon/wave2/deck/shots/`.

Post 2 waits for the Preprod run, which is pending the owner's wallet. Post 3
cites the devnet run; switch it to Preprod once `PROOF.md` exists.

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

## 3. Launch post (submission day): one long post, four images

One post, not a thread (X Premium long post; about 1,500 characters). Attach
the four 16:9 images from `hackathon/wave2/x/` in this order; X shows them as a
2×2 grid and opens each full size on tap:

1. `x-1-lender-sees-tier.jpg`: Harbor Bank's desk. VERIFIED, 11,000 at 110%,
   and the list of what never leaves the borrower.
2. `x-2-refused-150.jpg`: "Ask for 150% anyway", refused by the contract.
3. `x-3-track-record-105.jpg`: two repaid loans proven; 105% ($21,000) and
   130% ($26,000) on a 20,000 loan.
4. `x-4-auditor.jpg`: the auditor's exported history matching the on-chain hash.

> Borrowing 10,000 in DeFi means locking 15,000, because the lender can't see
> your books.
>
> Kymider (Wave 2, #MidnightBuildathon) lets you prove you clear the lender's
> bar without showing it. You lock 11,000.
>
> How it works on @MidnightNtwrk:
>
> → Your balance, debts and income stay in your browser. The chain holds a
> salted hash of them.
>
> → The lender quotes a bar: net worth ≥ 500,000, debt under 40% of income.
> Your proof answers one word: VERIFIED or STANDARD.
>
> → The Loan contract then takes exactly one collateral figure. 110% if
> verified. Ask a verified borrower for 150% and the contract refuses:
> "collateral does not match the tier" (image 2). The offer binds only when
> you accept it, naming the figure.
>
> → Repay on Midnight's block clock; late is the chain's call, and a default
> needs 3 days past due.
>
> → New this week: prove two earlier Kymider loans were repaid.
> Every figure drops a step: 105% verified, 130% without a proof (image 3).
> The ratios live in the contract, so the lender can't quote them away.
>
> → An auditor checks your exported payments against the loan's on-chain
> hash. Change one amount: rejected (image 4).
>
> Proof it runs: 37 transactions on a Midnight devnet with real ZK proofs, 54
> of 54 claims read back. 366 offline tests, 48 browser tests.
>
> Honest limits: figures are self-reported, no tokens move yet, and a track
> record can be faked by lending to yourself. Wave 3 has a data provider sign
> the figures and only listed lenders count.
>
> Try it, no install: https://turnless.github.io/kymider/
> Video: {{VIDEO_URL}}
> Code: https://github.com/Turnless/kymider

Before posting: replace `{{VIDEO_URL}}`; once Preprod has run, change the
"Proof it runs" line to the Preprod record and a transaction link from
`PROOF.md`. If the Preprod link exists, it is worth more than the devnet line.

---

## Reply templates

- **"Why not just KYC?"** KYC tells the lender who you are, not whether you can
  repay, and it puts identity on a counterparty's server. The tier answers the
  repayment question and nothing else.
- **"Can't the borrower lie?"** Today, yes: figures are self-reported, and we
  say so in the README. Wave 3 has a data provider co-sign them before they are
  committed.
- **"Can't the lender just re-quote?"** Not while a verified tier is live, and
  not while the borrower can still answer the quote; nor can it offer 150% in
  that window. Any figure the lender names is only an offer until the borrower
  accepts it. Two reviews found gaps here; we closed them in the contract.
- **"Is the payment history private?"** No. Each repayment amount is public on
  the ledger. The history proof hides which loans back it, not that a key has
  repaid loans. The auditor check proves the history is complete and unaltered.
- **"Where's the money?"** Nowhere yet. Wave 2 is a lifecycle demo; balances
  are figures in contract state. Token settlement is a later milestone.
