# Kymider

Privacy-first loan underwriting on Midnight (Compact contracts + MidnightJS
client + React console). Entered in the Midnight Buildathon on AKINDO.

Current work: Wave 2 on the `wave2` branch. Read `hackathon/HANDOFF.md` first:
it has the deadline, decisions already made, status and next steps.

- Contracts: `contracts/*.compact` (Compact language 0.23, toolchain 0.31.1).
- Compile, devnet and simulation run in CI (`.github/workflows/ci.yml`); CI
  commits the compiled modules in `compiled/*/contract/` back to the branch.
- Offline tests: `npm run test:unit`. Console: `frontend/` (`npm run dev`).
- Never handle wallet seeds; the Preprod seed is the GitHub secret `PREPROD_WALLET_SEED`.
