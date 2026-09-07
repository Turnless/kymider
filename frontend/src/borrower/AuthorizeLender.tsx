import { useState } from 'react';
import { truncateAddress } from '../lib/format';

const MOCK_AUTHORIZED = [
  '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  '0xcafebabe1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
];

export function AuthorizeLender() {
  const [pubKey, setPubKey] = useState('');

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Authorize Lender</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Grant a lender permission to request claims</p>
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-semibold text-[#0F172A]">Lender Public Key</label>
        <textarea
          value={pubKey}
          onChange={(e) => setPubKey(e.target.value)}
          placeholder="Paste the lender's public key (hex)..."
          rows={3}
          className="input-field font-mono resize-none"
        />
        <button className="w-full btn-primary">Authorize Lender</button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[#0F172A] mb-3">Authorized Lenders</h2>
        <div className="space-y-2">
          {MOCK_AUTHORIZED.map((addr) => (
            <div key={addr} className="glass rounded-xl px-4 py-3 flex items-center justify-between card-hover">
              <span className="text-xs font-mono text-[#0F172A]/50">{truncateAddress(addr)}</span>
              <button className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer bg-transparent border-0 p-0 font-semibold">Revoke</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
