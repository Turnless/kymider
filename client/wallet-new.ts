// Kymider — make a fresh wallet for a public test network, without a wallet app.
//
//   npm run wallet:new                         (Preprod)
//   MIDNIGHT_NETWORK=preview npm run wallet:new
//
// Prints 24 new recovery words and the wallet's public address, derived
// exactly as `prove:onchain` derives them (MidnightWalletProvider.build), so
// the address you fund is the address the run spends from.
//
// Run it on your own machine and keep the words to yourself: they go into the
// GitHub secret PREPROD_WALLET_SEED and nowhere else. Nothing is sent
// anywhere; the wallet is built but never started or synced.

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { generateMnemonicWords } from '@midnight-ntwrk/wallet-sdk-hd';
import pino from 'pino';
import { getConfig } from './config.js';
import { environmentFor } from './context.js';
import { MidnightWalletProvider } from './wallet.js';

process.env['MIDNIGHT_NETWORK'] ??= 'preprod';
// Offline: no endpoint is contacted, so a Blockfrost project ID is not needed.
process.env['BLOCKFROST_PROJECT_ID'] ||= 'nightpreprod-offline';
const config = getConfig();
setNetworkId(config.networkId);

const words = generateMnemonicWords(256).join(' ');
const silent = pino({ level: 'silent' });
const provider = await MidnightWalletProvider.build(silent, environmentFor(config), { kind: 'mnemonic', value: words });
const address = provider.unshieldedKeystore.getBech32Address().asString();

console.log(`
Network: ${config.networkId}

Recovery words (24). Secret: put them in the GitHub secret PREPROD_WALLET_SEED,
exactly as printed, and nowhere else. Anyone with them controls this wallet.

  ${words}

Address (public). Paste it into the faucet to receive tNIGHT:

  ${address}
${config.faucet ? `\nFaucet: ${config.faucet}\n` : ''}
Then run Actions -> "Preprod proof" on main. The run registers the tNIGHT for
DUST (the fee token) by itself; no wallet app is needed.
`);
process.exit(0);
