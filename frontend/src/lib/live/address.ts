/**
 * Midnight Bech32m keys → the hex the ledger and midnight-js expect.
 *
 * The DApp connector hands out the wallet's shielded coin and encryption
 * public keys in Bech32m (`mn_shield-cpk_preprod1…`), while midnight-js's
 * `WalletProvider.getCoinPublicKey()` returns ledger hex. The payload is the
 * raw key bytes (see `ShieldedCoinPublicKey` in
 * `@midnight-ntwrk/wallet-sdk-address-format`), so decoding is plain BIP-350
 * Bech32m. Implemented here, dependency-free, so it stays testable in Node
 * and adds nothing to the bundle; the unit tests cross-check it against the
 * wallet SDK's encoder.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

const polymod = (values: number[]): number => {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk >>> 0;
};

const hrpExpand = (hrp: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
};

export class AddressFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressFormatError';
  }
}

/** Decode a Bech32m string (no length limit: Midnight addresses exceed BIP-173's 90). */
export function bech32mDecode(input: string): { hrp: string; bytes: Uint8Array } {
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
    throw new AddressFormatError('mixed-case Bech32m string');
  }
  const s = input.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 1 || sep + 7 > s.length) throw new AddressFormatError('no Bech32m separator');
  const hrp = s.slice(0, sep);
  const data: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v === -1) throw new AddressFormatError(`invalid Bech32m character "${c}"`);
    data.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== BECH32M_CONST) {
    throw new AddressFormatError('Bech32m checksum mismatch');
  }
  // 5-bit words → 8-bit bytes, dropping the 6-word checksum.
  const words = data.slice(0, -6);
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) {
    throw new AddressFormatError('non-zero Bech32m padding');
  }
  return { hrp, bytes: Uint8Array.from(bytes) };
}

/** `mn_<type>[_<network>]` — the network segment is absent on mainnet. */
export function parseMidnightHrp(hrp: string): { type: string; network: string } {
  const [prefix, type, network] = hrp.split('_');
  if (prefix !== 'mn' || !type) throw new AddressFormatError(`not a Midnight Bech32m prefix: ${hrp}`);
  return { type, network: network ?? 'mainnet' };
}

const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * A Bech32m Midnight key → hex. Already-hex input passes through, because
 * some wallet builds report keys in hex.
 */
export function midnightKeyToHex(
  value: string,
  expectedType: 'shield-cpk' | 'shield-epk',
): { hex: string; network: string | null } {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    return { hex: value.replace(/^0x/, '').toLowerCase(), network: null };
  }
  const { hrp, bytes } = bech32mDecode(value);
  const { type, network } = parseMidnightHrp(hrp);
  if (type !== expectedType) {
    throw new AddressFormatError(`expected a ${expectedType} key, got ${type}`);
  }
  if (expectedType === 'shield-cpk' && bytes.length !== 32) {
    throw new AddressFormatError(`coin public key must be 32 bytes, got ${bytes.length}`);
  }
  return { hex: toHex(bytes), network };
}
