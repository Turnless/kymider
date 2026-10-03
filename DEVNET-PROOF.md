# Kymider: devnet proof, final Wave 2 contracts

**This is a local devnet run, not a public network.** It was produced by CI on
GitHub's runners: the `Devnet simulation` job starts a Midnight node, indexer
and proof server (`docker-compose.yml`), runs `npm run prove:onchain` (every
transaction with a real ZK proof, recorded as it finalizes), then
`npm run verify:onchain`, which reads every contract back from the indexer and
checks each claim. The Preprod run, which produces `PROOF.md` on a public
network, is pending the owner's wallet (see the README's
[On-chain evidence](./README.md#on-chain-evidence-devnet-now-preprod-pending)).

| | |
|---|---|
| CI run | [37098203726](https://github.com/Turnless/kymider/actions/runs/37098203726), job `Devnet simulation`, all steps green |
| Commit | `b815b26`: salted facts commitment, re-quote cap, borrower consent step, listing lockdown |
| Network | `local` (Midnight node 1.0.0, indexer-standalone 4.3.3, proof server 8.1.0) |
| Transactions | 31, all `SUCCESS` |
| Read-back checks | **45 of 45 PASS** (`verify:onchain`) |
| Full record | the run's `proof-local` artifact (PROOF.md + deployments JSON, kept 14 days) |

Every CI run on every branch repeats this from an empty chain, so the hashes
below are one instance of a flow that is re-proved on each push.

## Contracts

| Contract | Address |
|---|---|
| Registry | `939e28e5f5e73c2c93df4e9acb580923ba4c899044abd70850c0c4c68057118d` |
| SolvencyProof | `464e6033539c076361d8705773bab555aa5272afc8d8a90ef524bc5f9bc5e2f3` |
| LoanDirectory | `473b41191ec6f674ba55b893f76766148ee6f22bead84de795493416271fafbc` |
| Loan A (1,000, proved VERIFIED) | `8e86277d082acdf4e3205e92241ccc87745c3087342fe43b5a01092895437c46` |
| Loan B (2,000, no proof) | `27b268d4c6675153d7f732862064fc748347716dfafd32bcd97956f571e18208` |
| Loan C (5,000, new application) | `2ba463dee131e4ff351009ef9aae5f396109acc7e74f734d740f745f53236bdc` |

## What the chain says, read back

| Claim | On chain |
|---|---|
| Loan A: tier VERIFIED, collateral 110%, accepted by the borrower | VERIFIED, 1,100 on 1,000 (150% would be 1,500) |
| Loan B: tier STANDARD, collateral 150%, accepted by the borrower | STANDARD, 3,000 on 2,000 |
| Loans A and B repaid in full | REPAID, 0 owed; A 2 payments, B 1; 0 late |
| Loans A, B and C bind the SolvencyProof facts commitment | all three match |
| Quotes within the cap of 3 | A 1, B 1, C 0 |
| LoanDirectory: A and B recorded as repaid | both REPAID and recorded |
| Loan C carries a history proof of 2 repaid loans | 2 |
| SolvencyProof: one lender attestation, PASS; claim APPROVED | PASS; APPROVED |
| Registry row points at the SolvencyProof instance and its commitment | ACTIVE; address and commitment match |

The borrower's balance, debts and income appear in none of these transactions:
they are circuit inputs to the proofs, and only the salted commitment and the
tier reach the ledger.

## Transactions

| # | Step | Circuit | Block | Tx hash |
|---|---|---|---|---|
| 1 | Borrower deploys the shared Registry | `Registry.deploy` | 130 | `feb5f657850955b8af46aeef9538db33ca21ef476241eef14ff8b9623b73cb83` |
| 2 | Borrower deploys their SolvencyProof instance | `SolvencyProof.deploy` | 133 | `c57d7f73a3cae8f19b48c25f9826aaa61edb612dd7f2040aa67a01632e71a89f` |
| 3 | Borrower indexes the instance in the Registry | `Registry.register` | 136 | `063e315533fe87e0169f93718d70fcc17f6c4207ce24e1f707add9edd8f5b453` |
| 4 | Borrower authorizes the lender | `SolvencyProof.addLender` | 139 | `13ac47d6d121aeee391534cde16bf941bc75d90cf7c8294a26c68484365d182d` |
| 5 | Lender requests a solvency claim (net worth ≥ 500,000, DTI ≤ 40%) | `SolvencyProof.requestClaim` | 142 | `9d05ce5a6d07d3b0f54dfe02f745b0d3eda4c574dc5f778f6f67b18a3501ddea` |
| 6 | Borrower proves solvency in zero knowledge | `SolvencyProof.proveSolvency` | 146 | `1af38efb6c7b7d9b2808641b61045259c9648a8c16d8c28d07f770e4675cac26` |
| 7 | Lender approves the claim | `SolvencyProof.approve` | 149 | `41e3666453a7ded2d7965b6a8b5e5ef90dc304cb97e371e1c37380087b49d41b` |
| 8 | Borrower deploys the shared LoanDirectory | `LoanDirectory.deploy` | 152 | `6b58276008753d45792d0e4a20885c76bf72433ce887fedc2044f6281fef4151` |
| 9 | Borrower opens loan A (principal 1,000), bound to the committed facts | `Loan.deploy` | 155 | `c0296d52447d79fc4569d7ba6fcb5dbf801ee4131d3a83bd75072a06a686b6d1` |
| 10 | Borrower lists loan A in the LoanDirectory | `LoanDirectory.list` | 158 | `6fe8cc595d17e17308fd08914cab8f2fd55f2d618a14afbbf050488cccf30b15` |
| 11 | Lender quotes the bar for the 110% tier on loan A | `Loan.quoteTerms` | 161 | `31ec772c4acf90665079d53931cb9030ea4b24b88e1fc5869e5692fa5b7324e5` |
| 12 | Borrower proves the tier on loan A in zero knowledge: VERIFIED | `Loan.proveTier` | 164 | `6c4c1a1520a3d6b28319fd704a5316d461099502cd5d5650cb2ba1a709cea32c` |
| 13 | Lender offers loan A at 110% collateral (1,100) | `Loan.underwrite` | 167 | `cf676d68b365c121895a9b3f48f7bb1b9a04bf0f1c54e4e0cd18e67bf1bec24d` |
| 14 | Borrower accepts the offer on loan A | `Loan.accept` | 170 | `a78d456db735d9094a0fc621262742f7feca165de5d591bd0c917065a15964bf` |
| 15 | Lender marks loan A ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 173 | `519a1bf99c6d0d07fbf912ad0114a491fb0eb46a9674804d5696a7d7af991102` |
| 16 | Lender disburses loan A | `Loan.disburse` | 176 | `6c21645a099171e3fd77b7a6ec0d3f0005c6bf4d7f69befb654598ec061912e9` |
| 17 | Borrower repays an installment of loan A (550) | `Loan.repay` | 180 | `27d7eda2b93b53c2b472714b75a23c092e08510770a0c10c8785270de97f0d0f` |
| 18 | Borrower repays an installment of loan A (550) | `Loan.repay` | 184 | `fe15ccb6281abf86e19bee83f2a113b785d78b72dc78a3d82e4efadc22b9b01d` |
| 19 | Lender records loan A as repaid | `LoanDirectory.recordRepaid` | 188 | `c39fb0910f9b3b09181237fede347876cc8a7601a91d320e1aef9c397ff1a96a` |
| 20 | Borrower opens loan B (principal 2,000), bound to the committed facts | `Loan.deploy` | 191 | `a4d642940c8b7f1cc756f0511dc60b6371e4b077f22d35dd1263a6c758f260c4` |
| 21 | Borrower lists loan B in the LoanDirectory | `LoanDirectory.list` | 195 | `9c1ee7a98470417ae47ef45fdcb1032eb8fc33f96a9b5871de83f9e908939e40` |
| 22 | Lender quotes the bar on loan B | `Loan.quoteTerms` | 199 | `25cc74e48a23fbfdfaedb2f92ca2fd1a958b708bd65f03d5e05a22722555c3ca` |
| 23 | Lender offers loan B at 150% collateral (3,000): no tier proof | `Loan.underwrite` | 202 | `991755c5a395f56ec701e17f5dd477d32207acaeec029632875724841ea323f3` |
| 24 | Borrower accepts the offer on loan B | `Loan.accept` | 205 | `df30a66f5540652d69f3f02a2359d7e6450875b773bd692a24a27ff7edc03103` |
| 25 | Lender marks loan B ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 209 | `3a8e8bf0293c7a684fbe7565e4edb800f937240f9c32b8eba736fc6bc1c33938` |
| 26 | Lender disburses loan B | `Loan.disburse` | 213 | `f99ada0f944bf7be4dcf7485fe31d71ce21ef8b33e1f39c3a489b53f04b5f5e9` |
| 27 | Borrower repays loan B (2,100) | `Loan.repay` | 217 | `1aa1a76b246421e4aaa5b8d8d76d56dbd9bddd3bba470234cebd9400164f56d8` |
| 28 | Lender records loan B as repaid | `LoanDirectory.recordRepaid` | 221 | `1a38fcbf3087bf25fdc71a4de9ecae7bf639d5b3d4fb21ac31bf1fb3290c7f98` |
| 29 | Borrower opens loan C (principal 5,000), a new application | `Loan.deploy` | 224 | `bf024a80f2a7d3d7dfc014687374a42279faefa63b298c679ca0c05c6a7b7ce1` |
| 30 | Borrower lists loan C in the LoanDirectory | `LoanDirectory.list` | 227 | `74f14e73930be6c70ff3e4e3307e8f0a1708cfe14d2fd5863f2231a17fa8909f` |
| 31 | Borrower proves two repaid Kymider loans for application C | `LoanDirectory.proveTwoRepaid` | 231 | `080f8956a91b1420481e3bd44038f88b5ec5d992091b1686582ec7aeb7a61139` |

Copied from the job log of run 37098203726 (each line `tx <Contract>.<circuit>
at block <n>: <hash>`), and cross-checked against `verify:onchain`'s lookups of
every hash at its block on the same devnet.
