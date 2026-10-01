# Kymider — AKINDO submission copy

**Tagline:** Prove You Qualify. Don't Show Why.

---

## What it does

Kymider is privacy-first loan underwriting. A borrower proves their finances clear a lender's bar — net worth above a threshold, debt-to-income under a limit — without revealing the balance, the debts, the income, or their identity.

Each borrower deploys their own `SolvencyProof` contract instance. Their actual figures live in that instance's private state and never leave their device; what goes on-chain is a commitment, a hash of the current statement. A shared, public-only `Registry` indexes instances so lenders can discover borrowers and request claims against them.

The flow is four steps, and only one of them leaves the device. A borrower commits a statement (`updateFacts`). A lender they have authorized names terms — a net-worth floor and a maximum DTI (`requestClaim`). The borrower generates a zero-knowledge proof locally against the committed statement (`proveSolvency`): the circuit recomputes the commitment from the private facts in-circuit and asserts it matches, so a proof built on figures the borrower has since changed cannot pass. Midnight verifies the proof at submission, and the contract records a PASS/FAIL attestation the lender can then act on (`approve` / `reject`).

The lender reads a verdict. Every figure behind it reads *not disclosed*.

The live console runs the **real compiled contracts in your browser** — not a mock, not a recording, with no wallet and no node to install. Commit a statement as a borrower, switch to the lender view, and underwrite someone: the verdict comes back from contract code executing client-side, and the arithmetic on screen is the circuit's own arithmetic.

## The problem it solves

Credit underwriting runs on wholesale disclosure. To borrow, you hand over bank statements, payslips, balances and identity documents — to the lender, and usually to two or three intermediaries behind them. The lender needs a single bit of information: does this applicant clear our bar? They receive an entire financial history instead, then have to store it, secure it, and become a breach target for it.

The asymmetry is the whole problem. The borrower over-discloses permanently in order to answer one question once. The lender inherits liability for data it never actually wanted. And an applicant who gets declined has still surrendered everything.

Zero-knowledge proofs fit that shape exactly: prove the predicate, disclose nothing else. Kymider applies that to the specific predicates underwriting actually turns on — solvency and debt ratios — so the verdict, not the evidence, is the thing that moves between the parties.

## Who it's for, and how it gets adopted

**The first adopters are on-chain lenders, because they have the sharpest version of this problem.** DeFi lending is overwhelmingly over-collateralised (you post $150 to borrow $100) and it stays that way because there is no way to assess a borrower without identity and disclosure, both of which the setting cannot accommodate. Kymider supplies the missing primitive: a creditworthiness predicate that carries no identity and no figures. A protocol can offer a verified-solvency tier with lower collateral requirements, and the borrower's balance sheet never enters the protocol at all. That is a capital-efficiency argument, not a privacy nicety, which is why it is the wedge.

**The second market is regulated lenders, where the incentive is liability rather than efficiency.** Credit unions, community lenders and mortgage pre-qualification all run high volumes of a single question, can this applicant afford this, and answer it by collecting everything. Data-minimisation rules under GDPR and Nigeria's NDPR are moving from good practice toward obligation, and the cheapest compliance posture is not collecting the data. You cannot leak what you never held. Wave 3's signed, expirable off-chain attestations exist for exactly this channel: a bank consumes a verdict without running a Midnight node or touching the chain.

**Adoption runs through the roadmap rather than around it.** Wave 2's per-loan instances make a full loan lifecycle representable, which is the minimum a lending protocol needs before it can integrate. Wave 3's attestation channel then reaches institutions that will never be on-chain. The realistic first integration is a single DeFi lending protocol adding solvency-verified loans, because it requires no regulatory change and no new user behaviour beyond one proof generation.

**The honest dependency is data provenance, and it is a partnership problem rather than a cryptography one.** As stated below, the circuit proves the arithmetic was performed correctly on committed figures; it cannot know those figures were true. Closing that needs an open-banking aggregator or similar provider willing to co-sign facts into private state. Until one does, Kymider is deployable wherever self-attested figures are already accepted, and that is a real set of venues, not a hypothetical one, because most on-chain lending accepts far weaker assurances today.

## Challenges I ran into

**The contract's own assertions caught me twice.** Midnight has no native roles, so every privileged transition has to check its caller explicitly. Writing the client against those contracts, I called `requestClaim` as the wrong party and `suspend` as the registrar rather than the owner — both rejected on the spot. The authorization model did its job on its own author.

**Three real limitations in the contracts, found and fixed.** A lender could open a second claim while one was still pending, so `requestClaim` now asserts against an `openClaims` set that `approve` and `reject` clear. A decided claim could be re-proved. And the verdict computed a ratio without first guarding insolvency, so the circuit now establishes `solvent = balance >= debts` before anything downstream depends on it.

**Neither half of the toolchain runs on my machine.** The Compact compiler ships as a Linux-only binary, and the devnet needs Docker, which this machine cannot run. So CI became the development loop rather than a check bolted on at the end: five jobs that compile the contracts, typecheck and run the offline tests, build the console, publish it, and stand up a Docker devnet — Midnight node, indexer and proof server — for a genuine two-wallet ZK simulation against real proofs. Because the compiled modules are tracked but only reproducible on Linux, CI also commits them back whenever a `.compact` source changes, so the repository never describes contracts it no longer has.

**Two copies of the wasm runtime in one bundle.** The console shipped both 3.0.0 and 3.1.1 of the on-chain runtime — two instances of a wasm module that expects to be one. Fixed with Vite aliases pinning to a single copy, plus a dependency override so a fresh clone builds correctly without a root install.

**The devnet had a funding race hiding behind a well-named step.** The testkit's `waitForFunds` does not wait for DUST despite the name: it waits for NIGHT, submits a registration transaction if the dust balance is zero, syncs once, and returns. Registration only *starts* the accrual. So a green "Wait for NIGHT + DUST" step could finish in three seconds and hand straight over to a deploy that failed with `could not balance dust` — and because that deploy produced no contract address, every later assertion died on a zero-length hex string. One cause, seven red tests. It passed on the next two runs purely because the timing fell the right way. The wait now polls the actual balance.

**The CSS minifier silently deleted every scroll animation in production.** Lightning CSS merges animation longhands into the `animation` shorthand, and `animation-timeline` is not a legal component of that shorthand — so `animation: k-lap linear both` plus `animation-timeline: --k-track` shipped as a single malformed declaration the browser rejected outright. Dev looked perfect, because dev does not minify. Splitting the declarations across two rules does not help either; it merges rules with identical selectors too.

## Technologies I used

Compact 0.23 (toolchain 0.31.1) for the two contracts. MidnightJS for everything around them — `compact-runtime`, the `onchain-runtime-v3` wasm module, `midnight-js-contracts`, the indexer public data provider, and the wallet SDK facade with its dust wallet — handling deployment, local proof generation and submission. React 19, react-router-dom 7, TypeScript and Tailwind v4 on Vite 8 (rolldown) for the console, which bundles the wasm runtime and executes contract code client-side rather than calling a backend. Vitest for the offline contract tests and the devnet simulation. Docker Compose for the local devnet (node, indexer, proof server). GitHub Actions for CI, GitHub Pages for the live console. The landing page's stacked scroll is pure CSS scroll-driven animation — `view-timeline` and `animation-range`, no listeners and no observers.

## How we built it

Contracts first, because everything else is downstream of their shape. The key design decision came early: on Midnight, private state belongs to a single contract instance, so one borrower gets one `SolvencyProof` instance and no contract ever holds another borrower's secrets. The shared `Registry` is deliberately public-only — it indexes instances and the commitment each currently stands behind, and nothing more.

Then the client facade over MidnightJS, then the offline contract tests that drive the compiled contracts through simulators with no Docker and no proof server — which is what made iteration possible at all on a machine that cannot run the devnet. The devnet simulation came next as the honest end-to-end check: two wallets, real proofs, real network verification, including the negative cases — a lender who cannot call a borrower-only circuit, a borrower who cannot decide their own claim, and a proof built on facts that no longer match the commitment.

The console was built last, and deliberately against the real compiled modules rather than mocks. That is why a contract change can break the frontend build, and why there is a CI job whose only purpose is to catch exactly that. The landing page came after the product worked, using real screenshots of the running console rather than mockups.

## What we learned

**Assertions are the cheapest specification you can write.** Every authorization mistake I made was caught by the contract rather than by a test I had thought to write, and each one pointed at a real gap.

**ZK proves computation, not honesty.** The circuit guarantees the arithmetic was performed correctly on the committed figures. It cannot know whether those figures were true when committed. That gap is real, it is stated plainly inside the product itself, and closing it needs attested data providers co-signing facts into private state — not more cryptography.

**When CI is the only place code can run, it stops being a formality.** Building the pipeline as the development loop produced a far stricter one than I would have written as an afterthought.

**Verifying in dev is not verifying.** Two separate bugs shipped looking perfect locally: the minifier destroying the animations, and a viewport guard set fifteen pixels too high that disabled the entire scroll effect on the most common laptop screen there is. Both were invisible until checked against the deployed build.

## What's next for Kymider

- **Wave 2** — each loan becomes its own contract instance with an on-chain lifecycle: apply, underwrite, disburse, repay, indexed by a public `LoanDirectory`.
- **Wave 3** — the same proof engine feeding a traditional-bank channel through signed, expirable off-chain attestations, plus KYC/AML hooks for regulated lenders.
- **Attested data provenance** — data providers co-signing facts into private state, which is the only real answer to the honesty gap above.
- **Real wallet connection** — Lace, replacing the seed-based flow used for the demo.
- **Testnet deployment** — the client already carries preview and preprod presets; the simulation currently runs against a local devnet.

---

## Form fields

- **GitHub repo:** Turnless/kymider
- **Live demo:** https://turnless.github.io/kymider/
- **Build with:** Midnight
- **Product Category:** DeFi, lending, privacy infrastructure
- **Tags:** #ZeroKnowledge #Blockchain #Privacy #Compact #Lending
