/**
 * KymiderClient integration layer.
 *
 * This module wraps the existing KymiderClient from the root project's client/
 * directory. When the frontend is built as part of the monorepo, it imports
 * directly. For now, it exports typed interfaces and mock implementations
 * that match the real client's API surface.
 *
 * To wire up the real client:
 *   1. Import KymiderClient from '../../../client/index.js'
 *   2. Import buildProviders from '../../../client/providers.js'
 *   3. Import MidnightWalletProvider from '../../../client/wallet.js'
 *   4. Replace mock calls with real client method calls
 */

export interface FinancialFacts {
  balance: bigint;
  debts: bigint;
  income: bigint;
}

export interface ClaimParams {
  thresholdNetWorth: bigint;
  maxDti: bigint;
}

export type AttestationStatus = 'NONE' | 'PASS' | 'FAIL';
export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type BorrowStatus = 'ACTIVE' | 'SUSPENDED';

export interface BorrowerRow {
  instanceAddress: string;
  owner: Uint8Array;
  commitment: Uint8Array;
  status: BorrowStatus;
}

export interface Claim {
  thresholdNetWorth: bigint;
  maxDti: bigint;
  status: ClaimStatus;
}

/**
 * Mock client for development. Replace with real KymiderClient when
 * the wallet SDK is connected.
 */
export class MockKymiderClient {
  async deploySolvencyProof(_facts: FinancialFacts): Promise<string> {
    await delay(1500);
    return '0x' + randomHex(64);
  }

  async deployRegistry(): Promise<string> {
    await delay(1000);
    return '0x' + randomHex(64);
  }

  async registerWithRegistry(_registryAddr: string, _solvencyAddr: string): Promise<void> {
    await delay(800);
  }

  async authorizeLender(_solvencyAddr: string, _lenderPk: Uint8Array): Promise<void> {
    await delay(600);
  }

  async updateFacts(_solvencyAddr: string, _facts: FinancialFacts): Promise<void> {
    await delay(1000);
  }

  async proveSolvency(_solvencyAddr: string, _lenderPk: Uint8Array): Promise<void> {
    await delay(3000); // ZK proof generation takes time
  }

  async requestClaim(_solvencyAddr: string, _claim: ClaimParams): Promise<void> {
    await delay(800);
  }

  async decideClaim(_solvencyAddr: string, _approve: boolean): Promise<void> {
    await delay(600);
  }

  async listBorrowers(_registryAddr: string): Promise<BorrowerRow[]> {
    await delay(500);
    return [];
  }

  async solvencyState(_addr: string): Promise<Record<string, unknown>> {
    await delay(300);
    return {};
  }

  async attestationFor(_addr: string, _lenderPk: Uint8Array): Promise<AttestationStatus> {
    await delay(300);
    return 'NONE';
  }

  async claimFor(_addr: string, _lenderPk: Uint8Array): Promise<Claim> {
    await delay(300);
    return { thresholdNetWorth: 0n, maxDti: 0n, status: 'PENDING' };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
