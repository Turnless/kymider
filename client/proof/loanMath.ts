// Kymider — Loan arithmetic, computed off-chain.
//
// The implementation lives in contracts/loanMath.ts, which is browser-safe so
// the console shares it verbatim. Re-exported here so the Node client and the
// tests keep importing it from where they always have.

export {
  VERIFIED_RATIO_BPS,
  STANDARD_RATIO_BPS,
  GRACE_SECONDS,
  MAX_PRINCIPAL,
  collateralFor,
  owedFor,
  installmentFor,
  amountDue,
  tierIsLive,
  defaultableFrom,
  commitFacts,
  nowSeconds,
} from '../../contracts/loanMath.js';
