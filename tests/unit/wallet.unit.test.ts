// Kymider — the wallet's DUST-timing helpers (client/wallet.ts), offline.

import { describe, expect, it } from 'vitest';
import { isDustShortfall, parseBlockTime } from '../../client/wallet.js';

// The error as the wallet SDK raised it in CI: an Effect FiberFailure, printed
// as "(FiberFailure) Wallet.InsufficientFunds: Insufficient Funds: could not balance dust".
function fiberFailure(tag: string, message: string): Error {
  const err = new Error(message);
  err.name = `(FiberFailure) ${tag}`;
  return err;
}

describe('isDustShortfall', () => {
  it('recognises the SDK failure to pay a fee in DUST', () => {
    expect(
      isDustShortfall(fiberFailure('Wallet.InsufficientFunds', 'Insufficient Funds: could not balance dust')),
    ).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isDustShortfall(fiberFailure('Wallet.InsufficientFunds', 'Insufficient Funds: could not balance 0000'))).toBe(
      false,
    );
    expect(isDustShortfall(fiberFailure('Wallet.Other', 'Dust balancing failed'))).toBe(false);
    expect(isDustShortfall(new Error('could not balance dust'))).toBe(false);
    expect(isDustShortfall('InsufficientFunds dust')).toBe(false);
  });
});

describe('parseBlockTime', () => {
  const ms = Date.UTC(2026, 9, 3, 4, 58, 18);

  it('reads epoch milliseconds as a number or a string', () => {
    expect(parseBlockTime(ms).getTime()).toBe(ms);
    expect(parseBlockTime(String(ms)).getTime()).toBe(ms);
  });

  it('reads an ISO timestamp', () => {
    expect(parseBlockTime(new Date(ms).toISOString()).getTime()).toBe(ms);
  });

  it('refuses something that is not a time', () => {
    expect(() => parseBlockTime('soon')).toThrow(/unreadable block timestamp/);
  });
});
