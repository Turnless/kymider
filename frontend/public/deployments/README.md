# Deployment records

The console's **Live chain** screen (`/app/live`) reads one file per network
from this folder, served at `<base>/deployments/<network>.json`:

| Network      | File            | Written by                          |
|--------------|-----------------|-------------------------------------|
| Preprod      | `preprod.json`  | the manually triggered deploy job   |
| Preview      | `preview.json`  | the deploy job, if pointed at Preview |
| Local devnet | `local.json`    | a devnet run (CI or `docker compose`) |

A missing file is shown as "Not deployed to <network> yet". The console never
fills in an address it was not given. **Only the deploy job should write
`preprod.json` / `preview.json`**, and only with addresses and hashes it got
back from the chain.

`example.json` shows the shape. Its addresses and hashes are placeholders
(all zeros and repeated digits), not deployments; the console never loads it.

## Schema

```ts
{
  network: string;       // "preprod" | "preview" | "undeployed" (the wallet's network id)
  indexer: string;       // GraphQL HTTP endpoint the console reads state from
  indexerWS: string;     // GraphQL WebSocket endpoint (used by the wallet provider stack)
  generatedAt: string;   // ISO-8601 time the file was written
  contracts: {
    solvencyProof?: string;   // contract address, hex (optional 0x prefix)
    registry?: string;
    loanDirectory?: string;
    loans?: string[];         // one entry per deployed Loan instance
  };
  txs: {
    label: string;            // e.g. "Deploy SolvencyProof", "Loan 1: repay 1/3"
    txId?: string;            // transaction identifier (hex)
    txHash?: string;          // transaction hash (hex); preferred for lookups
    blockHeight?: number;     // block the tx landed in
    contract?: string;        // address the tx touched, hex
  }[];
}
```

Validation (`frontend/src/lib/live/deployments.ts`, `parseDeployment`):
`network`, `indexer`, `indexerWS` and `generatedAt` are required non-empty
strings; every address must be even-length hex; `blockHeight` must be a
non-negative integer; unknown keys are ignored.

## What the console does with it

For each contract it POSTs `contractAction(address) { state transaction { hash
block { height } } }` to `indexer`, deserializes the state with the compact
runtime's `ContractState.deserialize`, and decodes it with that contract's
compiled `ledger()`. Each `txHash` (or `txId`) is looked up with
`transactions(offset: { hash })` and marked **Confirmed** only when the
indexer returns it.

## Writing it from a deploy script

Contract addresses come from `deployTxData.public.contractAddress`, tx hashes
from `public.txHash` / `public.txId`, and heights from `public.blockHeight` on
midnight-js `deployContract` / `callTx` results. Write the file, then build
the console (or commit the file) so it ships under `dist/deployments/`.
