// Kymider — the indexer query for one transaction hash.
//
// Kept apart from onchain.ts so PROOF.md rendering can quote it without
// loading the indexer client.

/** The query used for every transaction hash; repeated verbatim in PROOF.md. */
export const TX_BY_HASH_QUERY =
  'query TxByHash($offset: TransactionOffset!) { transactions(offset: $offset) { hash block { height hash } ... on RegularTransaction { transactionResult { status } } } }';
