import { Link } from 'react-router-dom';

export function BorrowerLanding() {
  return (
    <div className="relative">
      {/* Hero */}
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-xs font-semibold tracking-wider uppercase text-[#0F172A]/50 mb-10">
            <span className="w-2 h-2 rounded-full bg-[#D46D25]" />
            Zero-knowledge proof of solvency
          </div>

          <h1 className="heading-xl text-[#0F172A] mb-8">
            Prove creditworthiness.
            <br />
            <span className="text-[#D46D25]">Protect your privacy.</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#0F172A]/40 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
            Your financial facts stay on your device. Lenders get a network-verified
            pass or fail. Raw numbers are never revealed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/dashboard" className="btn-primary">
              Get Started
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a href="#how-it-works" className="btn-ghost">
              How it works
            </a>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" className="max-w-5xl mx-auto pb-20">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#0F172A]/25 mb-14 text-center">
          How it works
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger">
          {[
            {
              num: '01',
              title: 'Enter your facts',
              desc: 'Balance, debts, income — stored only on your device. Never uploaded, never shared.',
            },
            {
              num: '02',
              title: 'Deploy your instance',
              desc: 'Your own on-chain contract. You own it, you control it. One instance per borrower.',
            },
            {
              num: '03',
              title: 'Prove solvency',
              desc: 'Generate a zero-knowledge proof. The network verifies it. Lenders see only PASS or FAIL.',
            },
          ].map((item) => (
            <div
              key={item.num}
              className="glass rounded-2xl p-7 card-hover"
            >
              <span className="text-xs font-bold tracking-widest text-[#D46D25] mb-4 block">
                {item.num}
              </span>
              <h3 className="text-base font-semibold text-[#0F172A] mb-2">
                {item.title}
              </h3>
              <p className="text-sm text-[#0F172A]/40 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
