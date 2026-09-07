import { useCallback } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const handleScan = useCallback(
    (result: string) => {
      onScan(result);
      onClose();
    },
    [onScan, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#0F172A]">Scan QR Code</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/[0.04] transition-colors cursor-pointer bg-transparent border-0 text-black/40 text-lg"
          >
            &times;
          </button>
        </div>

        <div className="aspect-square rounded-xl bg-black/[0.03] border border-black/[0.06] flex items-center justify-center mb-4 overflow-hidden">
          {/* QR scanner requires camera access — placeholder for when wallet SDK is connected */}
          <div className="text-center p-6">
            <div className="w-12 h-12 rounded-xl bg-black/[0.04] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-black/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <p className="text-xs text-black/40">
              Camera access requires wallet connection
            </p>
            <button
              onClick={() => handleScan('0x' + 'a'.repeat(64))}
              className="mt-3 px-3 py-1.5 bg-black/[0.04] text-xs font-medium text-black/40 rounded-lg hover:bg-black/[0.08] transition-colors cursor-pointer border-0"
            >
              Paste address instead
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-transparent text-black/40 text-sm font-medium rounded-xl hover:bg-black/[0.04] transition-colors cursor-pointer border border-black/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
