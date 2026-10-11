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
| CI run | [37105707040](https://github.com/Turnless/kymider/actions/runs/37105707040) (run 48), job `Devnet simulation`, all steps green |
| Commit | `5c704e2`: round 4 contracts (proof window, `waiveProof`, accept with the figure, listing keys, no directory defaults), on top of the salted facts commitment, re-quote cap and borrower consent step |
| Network | `local` (Midnight node 1.0.0, indexer-standalone 4.3.3, proof server 8.1.0) |
| Transactions | 32, all `SUCCESS` |
| Refusals | 2, refused by the contract before submission (none reached the chain) |
| Read-back checks | **47 of 47 PASS** (`verify:onchain`) |
| Full record | the run's `proof-local` artifact (PROOF.md + deployments JSON, kept 14 days) |

Every CI run on every branch repeats this from an empty chain, so the hashes
below are one instance of a flow that is re-proved on each push.

## Contracts

| Contract | Address |
|---|---|
| Registry | `6eeecf32cf49ea486f2759b1b67d829851c81966475dee95e3ea5892a1b51828` |
| SolvencyProof | `2d41fab54f7f04f11157cd8c6e21026779c1ff611249b2e5d52cc776091f1f8f` |
| LoanDirectory | `0f01eb3ebcb69acac72895a9dc5ca809c5bc3dad9dccd2d6bd04be80b8987991` |
| Loan A (1,000, proved VERIFIED) | `1fd777aa910b8ce9f0291d606ba164dc7c4f07851eb32f5fb8c9a38745a66224` |
| Loan B (2,000, proof waived) | `d7af3fc52c3e2e563266aa44d3241fd92135e5cc63f1076ca918311a4c09abc2` |
| Loan C (5,000, new application) | `75b19fea38e01235b70a9f665bf846d559b0e7c48a2aa996d2b9c516fbccd078` |

## What the chain says, read back

| Claim | On chain |
|---|---|
| Loan A: tier VERIFIED, collateral 110%, accepted by the borrower | VERIFIED, 1,100 on 1,000 (150% would be 1,500) |
| Loan A: the refused 150% offer and re-quote left no trace | 1 quote, VERIFIED, 1,100 offered; 2 refusals recorded |
| Loan B: proof waived, tier STANDARD, collateral 150%, accepted by the borrower | STANDARD, 3,000 on 2,000 |
| Loans A and B repaid in full | REPAID, 0 owed; A 2 payments, B 1; 0 late |
| Loans A, B and C bind the SolvencyProof facts commitment | all three match |
| Quotes within the cap of 3 | A 1, B 1, C 0 |
| LoanDirectory: A, B and C listed under their own borrowers, naming their lenders | all three listed; parties match each Loan |
| LoanDirectory: A and B recorded as repaid | both REPAID and recorded |
| Loan C carries a history proof of 2 repaid loans | 2 |
| SolvencyProof: one lender attestation, PASS; claim APPROVED | PASS; APPROVED |
| Registry row points at the SolvencyProof instance and its commitment | ACTIVE; address and commitment match |

The borrower's balance, debts and income appear in none of these transactions:
they are circuit inputs to the proofs, and only the salted commitment and the
tier reach the ledger.

## Refused, not submitted

Between the tier proof and the offer on Loan A, `prove:onchain` asks the Loan
contract for two things a lender must not be able to do. Each call fails in
the circuit, so no transaction is built and nothing reaches the chain; the
read-back then confirms Loan A still shows 1 quote and the 110% offer.

| Attempt | Contract's answer |
|---|---|
| Lender offers loan A at 150% (1,500) while its VERIFIED tier is live | `collateral does not match the tier` |
| Lender re-quotes loan A while its VERIFIED tier is live | `a verified tier is live until it lapses` |

## Transactions

| # | Step | Circuit | Block | Tx hash |
|---|---|---|---|---|
| 1 | Borrower deploys the shared Registry | `Registry.deploy` | 145 | `b6c0cc7fc8bff7efa9d83ee339e45a6ea7d3aef3f29a5c4572a17eea22e0436d` |
| 2 | Borrower deploys their SolvencyProof instance | `SolvencyProof.deploy` | 148 | `563b5aed7da27df3d61f901b35f594a07b1bf33f7daa18bbd2f4f7cbb642f7c1` |
| 3 | Borrower indexes the instance in the Registry | `Registry.register` | 151 | `0ce512af6961ab2d99ac5aa7ec6931606005394a1855180fbeecddf4c97edbf5` |
| 4 | Borrower authorizes the lender | `SolvencyProof.addLender` | 154 | `51a5db97af8bce6a4384fb9af60eb021e35dca960c16b6d9c7feb1ab3d965b4d` |
| 5 | Lender requests a solvency claim (net worth ≥ 500,000, DTI ≤ 40%) | `SolvencyProof.requestClaim` | 157 | `54f9f1eb8d48e878995b17e9b721fede2309b7873167618c4bae8c86b4631fe9` |
| 6 | Borrower proves solvency in zero knowledge | `SolvencyProof.proveSolvency` | 161 | `f0d6ce87c048fa86cb5d702ebb5d704250e535ba837fbbe7007bfc1745686495` |
| 7 | Lender approves the claim | `SolvencyProof.approve` | 164 | `b3ce3f78eefb774f824307fc268270670a4b2b58fdf750e8510f160ad76ba8da` |
| 8 | Borrower deploys the shared LoanDirectory | `LoanDirectory.deploy` | 167 | `fbde4fe920456771398d8b7faa2744c52c563fc063c0242daeab842ed39921a8` |
| 9 | Borrower opens loan A (principal 1,000), bound to the committed facts | `Loan.deploy` | 170 | `e66bda653abac02983659084f79453e194d52008654d8c4a2bf716956139ea70` |
| 10 | Borrower lists loan A in the LoanDirectory | `LoanDirectory.list` | 174 | `590c612644d972fcd5b2b082b421bb851cb3a51120d0d91af6036e35c129ec84` |
| 11 | Lender quotes the bar for the 110% tier on loan A | `Loan.quoteTerms` | 177 | `02f05d65f1432bf8a3e866fcea539c084a2428db9cf11e04e099cc81225411e7` |
| 12 | Borrower proves the tier on loan A in zero knowledge: VERIFIED | `Loan.proveTier` | 181 | `b5a164df38c0f2c3a5076e4604bdaa400ad94ccc7d3c4800fb1d6c660810c428` |
| 13 | Lender offers loan A at 110% collateral (1,100) | `Loan.underwrite` | 184 | `425bc7eab185d7c683dcf9002eddb3da0046b8bf5b9a66127bd29df6db5c4c27` |
| 14 | Borrower accepts the offer on loan A | `Loan.accept` | 187 | `b1e1a3fe8b0ca97f3766137dfc37072300b788ceb70f3b9a2c186b75db78fbeb` |
| 15 | Lender marks loan A ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 190 | `6a9336d931bfa3a4cd2087514061e81d4734a5bc95b01d0081e090649db21b5c` |
| 16 | Lender disburses loan A | `Loan.disburse` | 193 | `9b7104552ac9b850545349744bf1f1925ba2aa19834060f4b307e46c96ecd974` |
| 17 | Borrower repays an installment of loan A | `Loan.repay` | 197 | `045c3e7470857e16ef20814449b8e19e0def6818691417bf08925776db4390ce` |
| 18 | Borrower repays an installment of loan A | `Loan.repay` | 200 | `18704b72ae283f7e12a4d306b8ab57b8eaa9f9a7bae9ec7ac7293235cee1a922` |
| 19 | Lender records loan A as repaid | `LoanDirectory.recordRepaid` | 204 | `8354f9e056c26c06fed13a00abf13c69beccda6f48c2f991ec33e658a6c66029` |
| 20 | Borrower opens loan B (principal 2,000), bound to the committed facts | `Loan.deploy` | 207 | `cf8922c1a1ad352eb48d9ad0b99a21f58e4457283e80613a415a6b1f14efe082` |
| 21 | Borrower lists loan B in the LoanDirectory | `LoanDirectory.list` | 211 | `57e5b87d920387d0b1a96311e52952e67f328c79a7aee9e7080023d5ffa6033b` |
| 22 | Lender quotes the bar on loan B | `Loan.quoteTerms` | 214 | `12b3b6c08eb1805690b9979fe17f2bc2648f800b73ca0a53f40eefc841336af3` |
| 23 | Borrower waives the tier proof on loan B | `Loan.waiveProof` | 217 | `dc26f7a9a4b4e182425264c2431dca2247de3cf95000b68cd55fe1d3bc75217c` |
| 24 | Lender offers loan B at 150% collateral (3,000): proof waived | `Loan.underwrite` | 220 | `a80482fcd7d4b26a045608e4972a37e4805845b8301b1b3288a0ea1916e13436` |
| 25 | Borrower accepts the offer on loan B | `Loan.accept` | 223 | `756a80961a46cd4ca48de43d90cc5653a4a637a4c55e50b5497e6d8a1c9b3399` |
| 26 | Lender marks loan B ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 226 | `29d360d7dea139d44a0f0968995977298361f74763f228d754d441d9a01eefc9` |
| 27 | Lender disburses loan B | `Loan.disburse` | 229 | `324892da7b474f421fef793b00f07a951582bc75532f352f5cd54dfe74596c5a` |
| 28 | Borrower repays loan B | `Loan.repay` | 232 | `b0906d0267ad326bd19c779c97a31fb1c560bdd6a3f41403b1a380370b787bf1` |
| 29 | Lender records loan B as repaid | `LoanDirectory.recordRepaid` | 236 | `48f61140aa2faf2ce78305c0cea38e7a8fcfc7d6451c0a5795c082d121d2362a` |
| 30 | Borrower opens loan C (principal 5,000), a new application | `Loan.deploy` | 239 | `6dc2821919c501b05a98db91deeb6abe915ecb586fcec9f5e74ae626d2bda1ef` |
| 31 | Borrower lists loan C in the LoanDirectory | `LoanDirectory.list` | 243 | `ede5818e42d8623e75bdee2b4c0f516e54e365112df209a2ef86c226c8834e00` |
| 32 | Borrower proves two repaid Kymider loans for application C | `LoanDirectory.proveTwoRepaid` | 247 | `68691d8b2ebe9302c1b8b3ce421a855920429cf00523cbad9d2f40af67176c37` |

Copied from the job log of run 37105707040 (each line `tx <Contract>.<circuit>
at block <n>: <hash>`), and cross-checked against `verify:onchain`'s lookups of
every hash at its block on the same devnet.
