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
| CI run | [38165213326](https://github.com/Turnless/kymider/actions/runs/38165213326) (run 56), job `Devnet simulation`, all steps green |
| Commit | `93cc853` on branch `ccr-b84b6751-3p9bb3`: round 5 after its review, a proven track record lowers the collateral (`Loan.proveRepaidHistory`, which also re-prices a standing offer), on top of the round 4 contracts (proof window, `waiveProof`, accept with the figure, listing keys) |
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
| Registry | `16739bf1014fce3deea45884ae66f2fbed07eff46f0322f305bd3ef4d4668ec1` |
| SolvencyProof | `ef6b8d64d16aa6230b90328f1c008bb2a20fd8507769147f231813f27d098dff` |
| LoanDirectory | `fdf8b0b3097ed9498deb2597dfac8b65b7ca7181e7c70856670ec1d0b618692e` |
| Loan A (1,000, proved VERIFIED) | `7174dba560d9a5a26ee1c7ca7ff0637499fedde7d3bf47e81dbbea8f5a5e152c` |
| Loan B (2,000, proof waived) | `08faff16b72a44f4abb314aa2472f0e4df76134b129ef416f671fa147013ab21` |
| Loan C (5,000, two repaid loans proven, VERIFIED) | `1cc371398061c46cf9295f404aebb47ed5239afe2cae9d20448a0c9492ff2d38` |

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
tier reach the ledger. The two-repaid-loans proofs keep their Merkle paths off
the ledger too, but this is not secrecy here: the borrower's key has exactly
two `REPAID` listings (A and B), which are public.

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
| 1 | Borrower deploys the shared Registry | `Registry.deploy` | 178 | `9ee403fb920c646fb8ebce306bd7b264f223bbdbdfa24ee0a918d2bcfd285724` |
| 2 | Borrower deploys their SolvencyProof instance | `SolvencyProof.deploy` | 181 | `ee83dae76abae7ee2329dec413271686c636af95b1431a087bd97219b323bef2` |
| 3 | Borrower indexes the instance in the Registry | `Registry.register` | 185 | `6b194e994442c594077ee68ba3fc3e6cc5c450eaf0ef523833ddb9e7960bea97` |
| 4 | Borrower authorizes the lender | `SolvencyProof.addLender` | 189 | `ff23da72469b3a92e9fcb99a8a1a221b14ad9ab53b5644f0bf85ac71227c0387` |
| 5 | Lender requests a solvency claim (net worth ≥ 500,000, DTI ≤ 40%) | `SolvencyProof.requestClaim` | 193 | `1422a99cfaca232cf606271c05d5bea98929507c07e81393d203f15cbc48e2b8` |
| 6 | Borrower proves solvency in zero knowledge | `SolvencyProof.proveSolvency` | 197 | `832811a164cb259a7e9b4168322a9a7300fd933bc4ad3d4b2e2de4854299ffc1` |
| 7 | Lender approves the claim | `SolvencyProof.approve` | 201 | `7847f17e9b410e5719611a94722ff84041066c4f7f38d21abb1418501fbf7a16` |
| 8 | Borrower deploys the shared LoanDirectory | `LoanDirectory.deploy` | 204 | `de8c12be833af93c1ac02e13ce0f042efe064b2573d8c86a128b0183cace50ca` |
| 9 | Borrower opens loan A (principal 1,000), bound to the committed facts | `Loan.deploy` | 207 | `83f62a40f25d1b10cb69e16e29f20e2b182e3c12ad2c61e7c17a4124b7143577` |
| 10 | Borrower lists loan A in the LoanDirectory | `LoanDirectory.list` | 211 | `98486bace17dbfe6987e63d60d444ab5d3dd14790880cca719d89ddadfebd983` |
| 11 | Lender quotes the bar for the 110% tier on loan A | `Loan.quoteTerms` | 215 | `63cfcb3a8cbba24f76202bc3147b3f973f394435216445b43cdaea0e5caa66cf` |
| 12 | Borrower proves the tier on loan A in zero knowledge: VERIFIED | `Loan.proveTier` | 219 | `4bd7fe960bf9d60d377dc4af672ef9e5766184557a9e21a24f60b0373fafe4a6` |
| 13 | Lender offers loan A at 110% collateral (1,100) | `Loan.underwrite` | 223 | `e15fd28b27364043957b2f7212447bd580232d1e1806beca89ed54225af51bbb` |
| 14 | Borrower accepts the offer on loan A | `Loan.accept` | 227 | `984f32af7dae9d197f39e176542b75a0a9cfc931550bee8bdb1cf838a3f3edf7` |
| 15 | Lender marks loan A ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 231 | `c429365a56fc8488827ec94b800ed0a25d4d0a828761ce0f932342c688d42e64` |
| 16 | Lender disburses loan A | `Loan.disburse` | 235 | `48edde500f45d3329df9bcd1289070d8e837ae2323681cdf5904e4c6c3250f56` |
| 17 | Borrower repays an installment of loan A | `Loan.repay` | 239 | `ddc4031b9de296a1648f65afee195f719aa772be2806f6779f1e132bb12948e3` |
| 18 | Borrower repays an installment of loan A | `Loan.repay` | 243 | `2218d79a0631ab9e2d6614bf2224ee5a3376e18d34f36c8d03fcec502b67ef43` |
| 19 | Lender records loan A as repaid | `LoanDirectory.recordRepaid` | 247 | `d71ea04c1860c5b15e876980719d89f6b4ba670a850d4befbb64ef0289f1f66b` |
| 20 | Borrower opens loan B (principal 2,000), bound to the committed facts | `Loan.deploy` | 250 | `cb868e6075601a0435f99602e56fb806bb820b8bde683d75bbf706f7e974ac06` |
| 21 | Borrower lists loan B in the LoanDirectory | `LoanDirectory.list` | 254 | `aa45b2d13143f46cbc2ab7b68d3a3a387da01c4b2f2f147dff3a12f546f8d977` |
| 22 | Lender quotes the bar on loan B | `Loan.quoteTerms` | 258 | `167b65f965e597749986f0d5e0517c7920f6a92a906cc6898b2c0fec751a6f72` |
| 23 | Borrower waives the tier proof on loan B | `Loan.waiveProof` | 262 | `1f3c3224a67f5417c159b33988886d8ebe30b910a1700d4709a8c43c63f8807d` |
| 24 | Lender offers loan B at 150% collateral (3,000): proof waived | `Loan.underwrite` | 266 | `ad01846366681fbc3e6138af2c4ad6463c51ff83ebcb4c6a1d7b8e91543d3169` |
| 25 | Borrower accepts the offer on loan B | `Loan.accept` | 270 | `dbe62d114f0ebae20ad9b4f4a748c29b256b703dc955ca53dc62c1673fe8ad1f` |
| 26 | Lender marks loan B ACTIVE in the LoanDirectory | `LoanDirectory.updateStatus` | 274 | `2143343f10389f3ab8dcad24ff3411cdb373051e1d5842d5c3124da812febd05` |
| 27 | Lender disburses loan B | `Loan.disburse` | 278 | `fefebb3dec2787e1f87ca21179e7e1481c5f09087eed5dc7c0f888c92221207e` |
| 28 | Borrower repays loan B | `Loan.repay` | 282 | `e8dcbf7539208a23f5ecfe690ddfeb606e528d939c4274ca0d3866d6c69354c3` |
| 29 | Lender records loan B as repaid | `LoanDirectory.recordRepaid` | 286 | `a08214c21b95179e445e85f7670be234bd53fc1f3d0b70b46e4e861d7df53a64` |
| 30 | Borrower opens loan C (principal 5,000), a new application | `Loan.deploy` | 289 | `743e25f1a2176e61136aabc75119f88abe460eb3ec85c0b2b4f76c797c391698` |
| 31 | Borrower lists loan C in the LoanDirectory | `LoanDirectory.list` | 293 | `19376037821c6afba032a456b29ce4af05ec5d371308a76de831d1cba4076ae7` |
| 32 | Borrower proves two repaid Kymider loans for application C | `LoanDirectory.proveTwoRepaid` | 298 | `61c7aa993b0d01cdc84ff305f6797494e7feeae282600311835c2680db3759b3` |
| 33 | Borrower proves the two repaid loans on loan C itself: every collateral figure drops a step | `Loan.proveRepaidHistory` | 302 | `836672305df5e595202b65b48be6f9acffb6487bf24a9493752276ccd3c5d8e5` |
| 34 | Lender quotes the bar on loan C | `Loan.quoteTerms` | 306 | `7e24520485384152100dd722d6e327f2b9e67d1b2532a4c56b917a744b4ce808` |
| 35 | Borrower proves the tier on loan C in zero knowledge: VERIFIED | `Loan.proveTier` | 310 | `bc137297cb3ef0175b5a2b68e915842f21a4a1853a0bababce0bf897f25a4ea2` |
| 36 | Lender offers loan C at 105% collateral (5,250): VERIFIED with two repaid loans | `Loan.underwrite` | 314 | `a17ee9d6b6f916b35b405e439ef53925a704d7407ec51fa463f1f01942774045` |
| 37 | Borrower accepts the offer on loan C | `Loan.accept` | 318 | `2c3b998a479b7ecd438dd6decef87af4019db27faf8a0d779636aadd84a4b52a` |

Copied from the job log of run 38165213326 (each line `tx <Contract>.<circuit>
at block <n>: <hash>`), and cross-checked against `verify:onchain`'s lookups of
every hash at its block on the same devnet.
