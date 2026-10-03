// Kymider — payment-history disclosure for an auditor (Wave 3 preview).
//
// Each repayment folds (amount, on-time flag, nonce) into a Loan's public
// `historyCommitment` chain. The nonces are derived from the borrower's
// private history seed (see `loanPaymentNonce` in witnesses.ts), so the
// borrower can later open the whole chain to an auditor: every amount and
// on-time flag, with the nonces that bind them. The auditor recomputes the
// chain and checks it lands exactly on the on-chain head, so the history
// cannot be edited, reordered, padded or truncated.
//
// What binds a disclosure to a loan. The loan address is NOT inside the hash
// chain: the genesis head is the same constant for every Loan instance. A
// disclosure is about loan X only because the auditor fetched X's head from
// the chain and the disclosure opens it. The `loan` field is therefore a
// lookup key, not a proof. The safe entry point is `auditDisclosure`, which
// takes a lookup function and itself asks for the state of the loan the
// disclosure names, so an auditor cannot check one loan's openings against
// state they fetched for another (or against state the borrower handed them).
// Any disclosure that does open a given head is, by collision resistance, that
// head's true history, whatever label it carries.
//
// See docs/wave3-preview-auditor.md for the threat model.
//
// Browser-safe: shared verbatim with the console, like witnesses.ts.

import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import { loanPaymentNonce } from './witnesses.js';

export type DisclosedPayment = { amount: bigint; onTime: boolean };

export type Disclosure = {
  version: 1;
  /** Loan contract address, hex without 0x. */
  loan: string;
  /** Amounts as decimal strings, nonces as hex, so it serializes as JSON. */
  payments: { amount: string; onTime: boolean; nonce: string }[];
};

export type OnChainHistory = {
  historyCommitment: Uint8Array;
  paymentsMade: bigint;
  latePayments: bigint;
};

/** On-chain history together with the address it was read from. */
export type OnChainLoan = OnChainHistory & { loan: string };

export type DisclosureCheck =
  | { ok: true; payments: number; late: number; total: bigint }
  | { ok: false; reason: string };

/**
 * Every failure reason starts with one of these, then `: ` and the detail, so
 * a caller (or a test) can tell the failure modes apart without parsing prose.
 */
export const DisclosureFailure = {
  version: 'unsupported version',
  malformed: 'malformed disclosure',
  onChain: 'malformed on-chain state',
  unknownLoan: 'loan not found',
  wrongLoan: 'disclosure names a different loan',
  count: 'payment count does not match the chain',
  late: 'late-payment count does not match the chain',
  head: 'history does not open the on-chain commitment',
} as const;

export type DisclosureFailureKind = keyof typeof DisclosureFailure;

const fail = (kind: DisclosureFailureKind, detail: string): { ok: false; reason: string } => ({
  ok: false,
  reason: `${DisclosureFailure[kind]}: ${detail}`,
});

// --- encoding, exactly as loan.compact writes it ---------------------------

const UINT64_MAX = (1n << 64n) - 1n;

const bytes32 = new CompactTypeBytes(32);
const u64 = new CompactTypeUnsignedInteger(UINT64_MAX, 8);
const bytes32x1 = new CompactTypeVector(1, bytes32);
const bytes32x4 = new CompactTypeVector(4, bytes32);
const u64x1 = new CompactTypeVector(1, u64);

// Compact's pad(32, s): the UTF-8 bytes of s, zero-filled to 32.
const pad32 = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s));
  return out;
};

const GENESIS_TAG = pad32('kymider:loan:history:');
const ON_TIME = pad32('kymider:ontime');
const LATE = pad32('kymider:late');

export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const HEX64 = /^[0-9a-f]{64}$/;
// Canonical decimal: no sign, no leading zeros, no exponent, no whitespace.
const DECIMAL = /^(0|[1-9][0-9]*)$/;

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
};

/** An address as typed or read anywhere (0x or not, any case), as the disclosure writes it. */
export const normalizeAddress = (address: string): string =>
  address.trim().toLowerCase().replace(/^0x/, '');

/** The chain head before any payment, as the Loan constructor sets it. */
export function historyGenesis(): Uint8Array {
  return persistentHash(bytes32x1, [GENESIS_TAG]);
}

/** Fold one payment onto a chain head, exactly as Loan.repay does. */
export function foldPayment(head: Uint8Array, payment: DisclosedPayment, nonce: Uint8Array): Uint8Array {
  if (head.length !== 32) throw new RangeError('chain head must be 32 bytes');
  if (nonce.length !== 32) throw new RangeError('nonce must be 32 bytes');
  if (payment.amount < 0n || payment.amount > UINT64_MAX) {
    throw new RangeError('amount must fit in Uint<64>');
  }
  return persistentHash(bytes32x4, [
    head,
    persistentHash(u64x1, [payment.amount]),
    payment.onTime ? ON_TIME : LATE,
    nonce,
  ]);
}

/** Borrower side: open the history from the private seed and payment log. */
export function buildDisclosure(
  loan: string,
  historySeed: Uint8Array,
  payments: DisclosedPayment[],
): Disclosure {
  const address = normalizeAddress(loan);
  if (!HEX64.test(address)) throw new RangeError('loan address must be 32 bytes of hex');
  if (historySeed.length !== 32) throw new RangeError('history seed must be 32 bytes');

  let head = historyGenesis();
  const opened: Disclosure['payments'] = [];
  for (const p of payments) {
    // The same derivation the paymentNonce witness used when this payment
    // was made: keyed to the head the payment extends.
    const nonce = loanPaymentNonce(historySeed, head);
    head = foldPayment(head, p, nonce);
    opened.push({ amount: p.amount.toString(), onTime: p.onTime, nonce: bytesToHex(nonce) });
  }
  return { version: 1, loan: address, payments: opened };
}

// --- well-formedness -------------------------------------------------------

type Opened = { amount: bigint; onTime: boolean; nonce: Uint8Array };

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const unknownKeys = (x: Record<string, unknown>, allowed: string[]): string[] =>
  Object.keys(x).filter((k) => !allowed.includes(k));

/**
 * Check every field of an untrusted disclosure (it arrives as JSON from the
 * borrower). Returns the openings decoded, or the first failure. Unknown keys
 * are refused too, so nothing a viewer might display rides along unchecked.
 */
function decode(d: unknown): { ok: true; loan: string; payments: Opened[] } | { ok: false; reason: string } {
  if (!isRecord(d)) return fail('malformed', 'not a JSON object');
  if (d['version'] !== 1) {
    return fail('version', `expected version 1, got ${JSON.stringify(d['version']) ?? 'none'}`);
  }
  const extra = unknownKeys(d, ['version', 'loan', 'payments']);
  if (extra.length > 0) return fail('malformed', `unexpected field "${extra[0]}"`);

  const loan = d['loan'];
  if (typeof loan !== 'string' || !HEX64.test(loan)) {
    return fail('malformed', 'loan must be 64 lowercase hex characters, without 0x');
  }

  const list = d['payments'];
  if (!Array.isArray(list)) return fail('malformed', 'payments must be an array');

  const payments: Opened[] = [];
  for (let i = 0; i < list.length; i++) {
    const p: unknown = list[i];
    const at = `payment #${i + 1}`;
    if (!isRecord(p)) return fail('malformed', `${at} is not an object`);
    const stray = unknownKeys(p, ['amount', 'onTime', 'nonce']);
    if (stray.length > 0) return fail('malformed', `${at} has unexpected field "${stray[0]}"`);

    const { amount, onTime, nonce } = p;
    if (typeof amount !== 'string' || !DECIMAL.test(amount)) {
      return fail('malformed', `${at} amount must be a non-negative integer as a decimal string`);
    }
    const value = BigInt(amount);
    if (value > UINT64_MAX) return fail('malformed', `${at} amount exceeds Uint<64>`);
    if (typeof onTime !== 'boolean') return fail('malformed', `${at} onTime must be true or false`);
    if (typeof nonce !== 'string' || !HEX64.test(nonce)) {
      return fail('malformed', `${at} nonce must be 64 lowercase hex characters`);
    }
    payments.push({ amount: value, onTime, nonce: hexToBytes(nonce) });
  }
  return { ok: true, loan, payments };
}

/** Parse disclosure JSON as pasted or uploaded, checking every field. */
export function parseDisclosure(json: string): { ok: true; disclosure: Disclosure } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail('malformed', 'not valid JSON');
  }
  const decoded = decode(raw);
  if (!decoded.ok) return decoded;
  return { ok: true, disclosure: raw as Disclosure };
}

/** One opened payment and the chain head after it, for display. */
export type OpenedPayment = DisclosedPayment & { index: number; nonce: string; head: string };

/**
 * Replay a well-formed disclosure, returning each payment with the running
 * chain head. Display only: it does not compare with the chain. Null when the
 * disclosure is malformed.
 */
export function openHistory(disclosure: Disclosure): OpenedPayment[] | null {
  const decoded = decode(disclosure);
  if (!decoded.ok) return null;
  let head = historyGenesis();
  return decoded.payments.map((p, i) => {
    head = foldPayment(head, p, p.nonce);
    return { index: i + 1, amount: p.amount, onTime: p.onTime, nonce: bytesToHex(p.nonce), head: bytesToHex(head) };
  });
}

// --- verification ----------------------------------------------------------

/**
 * Auditor side: does this disclosure open the on-chain history exactly?
 *
 * `onChain` must be the state of the loan the disclosure names, read by the
 * auditor from the chain. Pass it with its `loan` address (an `OnChainLoan`)
 * and the names are compared; better, use `auditDisclosure`, which does the
 * lookup by the disclosure's own `loan` field.
 *
 * Order of checks, so each failure gets the most specific reason: version,
 * well-formedness, loan name, payment count, late count, then the head.
 * The head alone already implies the two counts (the chain commits to every
 * payment and flag); the counts are checked first to say WHAT is wrong.
 */
export function verifyDisclosure(disclosure: Disclosure, onChain: OnChainHistory | OnChainLoan): DisclosureCheck {
  const decoded = decode(disclosure);
  if (!decoded.ok) return decoded;

  const { historyCommitment, paymentsMade, latePayments } = onChain;
  if (!(historyCommitment instanceof Uint8Array) || historyCommitment.length !== 32) {
    return fail('onChain', 'historyCommitment must be 32 bytes');
  }
  if (typeof paymentsMade !== 'bigint' || typeof latePayments !== 'bigint' || paymentsMade < 0n || latePayments < 0n) {
    return fail('onChain', 'counts must be non-negative bigints');
  }
  if ('loan' in onChain && typeof onChain.loan === 'string') {
    const expected = normalizeAddress(onChain.loan);
    if (expected !== decoded.loan) {
      return fail('wrongLoan', `disclosure is for ${decoded.loan}, the state given is for ${expected}`);
    }
  }

  const { payments } = decoded;
  if (BigInt(payments.length) !== paymentsMade) {
    return fail('count', `disclosure opens ${payments.length}, the loan records ${paymentsMade}`);
  }
  const late = payments.filter((p) => !p.onTime).length;
  if (BigInt(late) !== latePayments) {
    return fail('late', `disclosure marks ${late} late, the loan records ${latePayments}`);
  }

  let head = historyGenesis();
  for (const p of payments) head = foldPayment(head, p, p.nonce);
  const expectedHead = bytesToHex(historyCommitment);
  if (bytesToHex(head) !== expectedHead) {
    return fail(
      'head',
      `recomputed ${bytesToHex(head).slice(0, 16)}…, the chain holds ${expectedHead.slice(0, 16)}…`,
    );
  }

  return {
    ok: true,
    payments: payments.length,
    late,
    total: payments.reduce((sum, p) => sum + p.amount, 0n),
  };
}

/**
 * The auditor's entry point. `lookup` reads a loan's public state from the
 * auditor's own view of the chain (indexer, node, or the console's desk); it
 * is called with the address the disclosure names, so the openings are always
 * checked against THAT loan's head and nothing else.
 */
export function auditDisclosure(
  disclosure: Disclosure,
  lookup: (loan: string) => OnChainHistory | null,
): DisclosureCheck {
  const decoded = decode(disclosure);
  if (!decoded.ok) return decoded;
  const state = lookup(decoded.loan);
  if (!state) return fail('unknownLoan', `no loan at ${decoded.loan}`);
  return verifyDisclosure(disclosure, { ...state, loan: decoded.loan });
}
