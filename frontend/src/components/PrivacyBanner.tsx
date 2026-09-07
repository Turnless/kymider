export function PrivacyBanner({ message = 'Your financial data never leaves this device' }: { message?: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
      <svg className="w-4 h-4 text-[#D46D25] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <p className="text-xs text-[#0F172A]/40 font-medium">{message}</p>
    </div>
  );
}
