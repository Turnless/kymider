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
| CI run | [38152734953](https://github.com/Turnless/kymider/actions/runs/38152734953) (run 54), job `Devnet simulation`, all steps green |
| Commit | `d03bf03` on branch `ccr-b84b6751-3p9bb3`: round 5, a proven track record lowers the collateral (`Loan.proveRepaidHistory`), on top of the round 4 contracts (proof window, `waiveProof`, accept with the figure, listing keys) |
| Network | `local` (Midnight node 1.0.0, indexer-standalone 4.3.3, proof server 8.1.0) |
| Transactions | 37, all `SUCCESS` |
| Refusals | 3, refused by the contract before submission (none reached the chain) |
| Read-back checks | **54 of 54 PASS** (`verify:onchain`) |
| Full record | the run's `proof-local` artifact (PROOF.md + deployments JSON, kept 14 days) |

Every CI run on every branch repeats this from an empty chain, so the hashes
below are one instance of a flow that is re-proved on each push.

## Contracts

| Contract | Address |
|---|---|
| Registry | `67fbdb21720a1ee03eb3518b118fa98acbf73e3be37b037d4793f3338faff293` |
| SolvencyProof | `76c1c68af7bd34ff88e450c8b3be06ae51fbb1644abae3f53ff293ca3956fba1` |
| LoanDirectory | `abebf9f9527fdb1f283dc0f895170802160f057f6bf9a0857832230385a8f995` |
| Loan A (1,000, proved VERIFIED) | `1fa23848cca9aa3f78e537a58c68f6e3595f68565bc61d4aa50f83c02a918264` |
| Loan B (2,000, proof waived) | `a47d8b42ccacc667563da8940490c8af7fd5c0596c02c1f30b555ce1fdd35e10` |
| Loan C (5,000, two repaid loans proven, VERIFIED) | `4304e867a4960406b95971a7386c80e1654eee63ce4d7665058d97a50c82cc41` |

## What the chain says, read back

| Claim | On chain |
|---|---|
| Loan A: tier VERIFIED, collateral 110%, accepted by the borrower | VERIFIED, 1,100 on 1,000 (150% would be 1,500) |
| Loan A: the refused 150% offer and re-quote left no trace | 1 quote, VERIFIED, 1,100 offered; 2 refusals recorded |
| Loan B: proof waived, tier STANDARD, collateral 150%, accepted by the borrower | STANDARD, 3,000 on 2,000 |
| Loans A and B repaid in full | REPAID, 0 owed; A 2 payments, B 1; 0 late |
| Loans A, B and C bind the SolvencyProof facts commitment | all three match |
| Quotes within the cap of 3 | A 1, B 1, C 1 |
| LoanDirectory: A, B and C listed under their own borrowers, naming their lenders | all three listed; parties match each Loan |
| LoanDirectory: A and B recorded as repaid | both REPAID and recorded |
| Loan C carries a history proof of 2 repaid loans (directory) | 2 |
| Loan C: two repaid loans proven on the Loan, against a LoanDirectory root | proven; root in the directory |
| Loan C: tier VERIFIED with two repaid loans, collateral 105%, accepted; the refused 110% offer left no trace | VERIFIED, 5,250 on 5,000 (110% would be 5,500); 1 refusal recorded |
| SolvencyProof: one lender attestation, PASS; claim APPROVED | PASS; APPROVED |
| Registry row points at the SolvencyProof instance and its commitment | ACTIVE; address and commitment match |

The borrower's balance, debts and income appear in none of these transactions:
they are circuit inputs to the proofs, and only the salted commitment and the
tier reach the ledger.

## Refused, not submitted

Between the tier proof and the offer, `prove:onchain` asks the Loan contract
for three things a lender must not be able to do. Each call fails in the
circuit, so no transaction is built and nothing reaches the chain; the
read-back then confirms Loan A still shows 1 quote and the 110% offer, and
Loan C the 105% offer.

| Attempt | Contract's answer |
|---|---|
| Lender offers loan A at 150% (1,500) while its VERIFIED tier is live | `collateral does not match the tier` |
| Lender re-quotes loan A while its VERIFIED tier is live | `a verified tier is live until it lapses` |
| Lender offers loan C at 110% (5,500), ignoring its proven track record | `collateral does not match the tier` |

## Transactions

| # | Step | Circuit | Block | Tx hash |
|---|---|---|---|---|
| 1 | Borrower deploys the shared Registry | `Registry.deploy` | 157 | `8edd84f398d56cb0889aed70651be5c78eeda9b02e4893105ea7e6c006a945cf` |
| 2 | Borrower deploys their SolvencyProof instance | `SolvencyProof.deploy` | 160 | `7a3c53d212dd06086c64b0c71561c8d0ed97531c076468477efb5c4f5ca606fe` |
| 3 | Borrower indexes the instance in the Registry | `Registry.register` | 164 | `7aa12ad35caae897dbe6732bfe1056f7cb17f8555e6e1356d1ddeca89572a8af` |
| 4 | Borrower authorizes the lender | `SolvencyProof.addLender` | 168 | `fd895ac42f174c57f8fe0b624a5f88124504c5f3fe0bdaef09c7a86592283c92` |
| 5 | Lender requests a solvency claim (net worth ≥ 500,000, DTI ≤ 40%) | `SolvencyProof.requestClaim` | 172 | `087fbfa7dc3fba3c2cf03ecf96f856a92bbee76ac1125d051a9449632be3db9f` |
| 6 | Borrower proves solvency in zero knowledge | `SolvencyProof.proveSolvency` | 176 | `ba53b5e8ca541e690dbdd098bf0576e5e775f842a0c2a375b84a132186c45bda` |
| 7 | Lender approves the claim | `SolvencyProof.approve` | 180 | `10f9b7e6ed0417358f98af1fa72282b09340b4fa915362c5573f553a93d113f3` |
| 8 | Borrower deploys the shared LoanDirectory | `LoanDirectory.deploy` | 183 | `ea8d390bc4bdd966bc2ec497d6295e8d426cdcc775ea396250e3a083d6c173fa` |
| 9 | Borrower opens loan A (principal 1,000), bound to the committed facts | `Loan.deploy` | 186 | `70ac5a60c23cd6380d9e30e39f48226a5041363452ca3ffae76bedaa7b4c88eb` |
| 10 | Borrower lists loan A in the LoanDirectory | `LoanDirectory.list` | 190 | `cefb1040bf185e1dcc855679fdd58b8deea170c2467abb71751177958fe4b2cc` |
| 11 | Lender quotes the bar for the 110% tier on loan A | `Loan.quoteTerms` | 194 | `44a7235877adae443e6642449f87c3981367c8507596b58a60ca7f3b07e153a9` |
| 12 | Borrower proves the tier on loan A in zero knowledge: VERIFIED | `Loan.proveTier` | 198 | `6933b1c1bd1ed85cdbad1720c57e3be23c42e302e9826284b2ed57213d4cc327` |
| 13 | Lender offers loan A at 110% collateral (1,100) | `Loan.underwrite` | 202 | `9765d5e7e9d4343a6219b83304dc03eb7c7c6a1e5077b946a2b7aa88e3281e1e` |
| 14 | Borrower accepts the offer on loan A | `Loan.accept` | 206 | `a2254fcdd7d694f3ac8fae8281cadda52302c881efd56ba4fef93fc4960ffa6f` |
| 15 | Lender marks loan A ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 210 | `63257848158778d2b7a1f737052440dee1a7ce4c61dd4eed52c98c008fe3d836` |
| 16 | Lender disburses loan A | `Loan.disburse` | 214 | `8ede078fdefb10be96429c8b1b246c9967d1d517f8ae44ccf5d3f150f1c9799e` |
| 17 | Borrower repays an installment of loan A | `Loan.repay` | 218 | `cc7192926f2aefc4b7776543eee15e18cdc0a3462e27a2d6b9e000cd12e0b033` |
| 18 | Borrower repays an installment of loan A | `Loan.repay` | 222 | `f55d20da2b15ae6300714daf45f123c9ce07a2ba3e8095c624bdd275a7807032` |
| 19 | Lender records loan A as repaid | `LoanDirectory.recordRepaid` | 226 | `848568e20d3812c3c059f77542139d20b9bf33837dc19ba683e983bf9b59ca6b` |
| 20 | Borrower opens loan B (principal 2,000), bound to the committed facts | `Loan.deploy` | 229 | `256d5dbe2c4022dc93d714ff2d4ebe56988dcd95908086cda2aa29bb0e44384d` |
| 21 | Borrower lists loan B in the LoanDirectory | `LoanDirectory.list` | 233 | `8d68bf78db7a1cc63388d1ff5db8922587a7051aeaa62e7ed2a8c85b11f3d654` |
| 22 | Lender quotes the bar on loan B | `Loan.quoteTerms` | 237 | `388a623b13f31a3c328294953ec1443898e8d78b17b2c4d294133c08db2cd578` |
| 23 | Borrower waives the tier proof on loan B | `Loan.waiveProof` | 241 | `d8079ce4892bff615ed52cf5a4871cd69e8eb49f963928e8331e3ea1c72a6378` |
| 24 | Lender offers loan B at 150% collateral (3,000): proof waived | `Loan.underwrite` | 245 | `69826cd6d91db039c2d39cd80314c1b4b24ade6b6d6d0dbce89ec1cb010d3ab7` |
| 25 | Borrower accepts the offer on loan B | `Loan.accept` | 249 | `40cdf4808745868f965d81797a1cbdf551018c710e581bcd4004eec5d3b64db9` |
| 26 | Lender marks loan B ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 253 | `c6f6be32da5ad96adc9f516f68bb9b27a54a4f4a7a51ea6ab65b57b23b14c67e` |
| 27 | Lender disburses loan B | `Loan.disburse` | 257 | `11ae1053adbd94be4c38f67b254f5769c3876b20d9e6f544b37cd3771931444d` |
| 28 | Borrower repays loan B | `Loan.repay` | 261 | `f4f0074d8539459b7485167f2764a4582f3f97684f89f4e4de7cfb1f52b172eb` |
| 29 | Lender records loan B as repaid | `LoanDirectory.recordRepaid` | 265 | `2eace08da2e7ed0614b1a34517b6619908b68079cfaeea297d85a9cf85739a03` |
| 30 | Borrower opens loan C (principal 5,000), a new application | `Loan.deploy` | 268 | `31752d6614685e97198b2fbb1361f775941dc57033eff34bcf59813827609bbb` |
| 31 | Borrower lists loan C in the LoanDirectory | `LoanDirectory.list` | 272 | `98ee742b3d2cfab7ff30635a96c584b960325af2b78b1d95e468a4637d174367` |
| 32 | Borrower proves two repaid Kymider loans for application C | `LoanDirectory.proveTwoRepaid` | 277 | `f43a4d2238983cfe30fe589e51ff80be39a4b99afb63f113971a0ae03a19e996` |
| 33 | Borrower proves the two repaid loans on loan C itself: every collateral figure drops a step | `Loan.proveRepaidHistory` | 281 | `e59f239e9c04c12906844899d9a415d9bb59bd101fc08cb7365bc1829cf2ec04` |
| 34 | Lender quotes the bar on loan C | `Loan.quoteTerms` | 285 | `32d83be58149db7fba59d05b18d2bf5adc836836f8b5caaa284dd3ca4dca47f2` |
| 35 | Borrower proves the tier on loan C in zero knowledge: VERIFIED | `Loan.proveTier` | 289 | `f63aeaabd384137d162c4baa86365b866cc69efe81cbfca2dc3d66065de2ab0d` |
| 36 | Lender offers loan C at 105% collateral (5,250): VERIFIED with two repaid loans | `Loan.underwrite` | 293 | `1f293908a780544152b04fb4cb7c9c68848e1f13bbc2d58371f64df61e125d13` |
| 37 | Borrower accepts the offer on loan C | `Loan.accept` | 297 | `4cca380ed7e4e33250b8eb3990aec96fe8b23007471b48935caabc4e40805f02` |

Copied from the job log of run 38152734953 (each line `tx <Contract>.<circuit>
at block <n>: <hash>`), and cross-checked against `verify:onchain`'s lookups of
every hash at its block on the same devnet.
