import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LiveBadge } from '../components/LiveBadge';
import { shortHex } from '../lib/client';
import { createChainReader, type ContractRead, type TxLookup } from '../lib/live/chainReader';
import { browserCodec } from '../lib/live/codecs';
import type {
  LoanDirectoryView,
  LoanView,
  RegistryView,
  SolvencyProofView,
} from '../lib/live/decode';
import {
  NETWORKS,
  NETWORK_ORDER,
  deployedContracts,
  loadDeployment,
  type DeploymentLoad,
  type DeploymentTx,
  type NetworkKey,
} from '../lib/live/deployments';
import { connectLace, isLaceInstalled, LiveWalletError, type LiveSession } from '../lib/live/wallet';

/**
 * The live view: deployed instances, the transactions that created them, and
 * each contract's public ledger read back from a Midnight indexer.
 *
 * Everything on this screen is chain data or says plainly that it is not.
 * The rest of the console runs the compiled contracts in the browser; this
 * screen never falls back to that simulation.
 */

const NETWORK_STORAGE_KEY = 'kymider:live:network';

const readStoredNetwork = (): NetworkKey => {
  try {
    const v = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (v === 'preprod' || v === 'preview' || v === 'local') return v;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'preprod';
};

type WalletState =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'connected'; session: LiveSession }
  | { state: 'error'; code: LiveWalletError['code']; message: string };

type Reads = {
  contracts: ContractRead[];
  txs: Record<number, TxLookup>;
  readAt: Date;
};

export function LiveView() {
  const [network, setNetwork] = useState<NetworkKey>(readStoredNetwork);
  // Results are stored with the request they answer, so "loading" is derived
  // (the latest result answers an older request) rather than set in an effect.
  const [loaded, setLoaded] = useState<{ network: NetworkKey; result: DeploymentLoad } | null>(null);
  const [readResult, setReadResult] = useState<{ key: string; reads: Reads } | null>(null);
  const [wallet, setWallet] = useState<WalletState>({ state: 'idle' });
  const [tick, setTick] = useState(0);

  const info = NETWORKS[network];

  const pickNetwork = (next: NetworkKey) => {
    setNetwork(next);
    setWallet((w) => (w.state === 'connected' && w.session.network !== next ? { state: 'idle' } : w));
    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, next);
    } catch {
      // Not remembered; harmless.
    }
  };

  // 1. The deployment file for this network.
  useEffect(() => {
    const controller = new AbortController();
    loadDeployment(network, { base: import.meta.env.BASE_URL, signal: controller.signal })
      .then((result) => setLoaded({ network, result }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          network,
          result: { state: 'invalid', url: '', error: e instanceof Error ? e.message : String(e) },
        });
      });
    return () => controller.abort();
  }, [network]);

  const load: DeploymentLoad | 'loading' =
    loaded && loaded.network === network ? loaded.result : 'loading';
  const deployment = load !== 'loading' && load.state === 'found' ? load.deployment : null;
  const contracts = useMemo(() => (deployment ? deployedContracts(deployment) : []), [deployment]);
  const indexer = deployment?.indexer ?? info.indexer;
  const readKey = deployment ? `${network}:${deployment.generatedAt}:${tick}` : null;

  // 2. Each contract's public state, and each recorded tx, from the indexer.
  useEffect(() => {
    if (!deployment || !readKey) return;
    let cancelled = false;
    const reader = createChainReader({
      endpoint: { indexer: deployment.indexer, indexerWS: deployment.indexerWS },
      codec: browserCodec,
    });
    const txLookups = Promise.all(
      deployment.txs.map((t, i) =>
        t.txHash || t.txId
          ? reader.lookupTx(t).then((r) => [i, r] as const)
          : Promise.resolve([i, { status: 'error', error: 'no hash recorded' } as TxLookup] as const),
      ),
    );
    Promise.all([reader.readAll(contracts), txLookups]).then(([contractReads, txs]) => {
      if (cancelled) return;
      setReadResult({
        key: readKey,
        reads: { contracts: contractReads, txs: Object.fromEntries(txs), readAt: new Date() },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [deployment, contracts, readKey]);

  const reads: Reads | 'loading' | null = !readKey
    ? null
    : readResult && readResult.key === readKey
      ? readResult.reads
      : 'loading';

  const connect = useCallback(async () => {
    setWallet({ state: 'connecting' });
    try {
      const session = await connectLace(network);
      setWallet({ state: 'connected', session });
    } catch (e) {
      const err = e instanceof LiveWalletError ? e : new LiveWalletError('failed', String(e));
      setWallet({ state: 'error', code: err.code, message: err.message });
    }
  }, [network]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-espresso px-[3px] py-[2px]">
              <LiveBadge mode="live" network={info.label} />
            </span>
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Live chain</h1>
          <p className="mt-1 max-w-[560px] text-[12px] leading-[1.6] text-[rgba(15,23,42,0.5)]">
            Deployed Kymider contracts and their public ledgers, read from the {info.label} indexer.
            Nothing on this screen is simulated.
          </p>
        </div>
        <NetworkPicker value={network} onChange={pickNetwork} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {load === 'loading' ? (
            <section className="card px-5 py-14 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
              Looking for the {info.label} deployment…
            </section>
          ) : load.state === 'missing' ? (
            <NotDeployed network={info.label} file={`deployments/${network}.json`} />
          ) : load.state === 'invalid' ? (
            <section className="card p-5">
              <p className="label mb-2">Deployment file unreadable</p>
              <p className="text-[13px] text-[#dc2626]">{load.error}</p>
              {load.url && <p className="mono mt-2 text-[11px] text-[rgba(15,23,42,0.45)]">{load.url}</p>}
            </section>
          ) : (
            <>
              <section className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
                  <h2 className="text-[13px] font-semibold">Contracts</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
                      {reads && reads !== 'loading'
                        ? `Read ${reads.readAt.toLocaleTimeString()}`
                        : reads === 'loading'
                          ? 'Reading…'
                          : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-quiet px-3 py-[6px] text-[12px]"
                      onClick={() => setTick((t) => t + 1)}
                      disabled={reads === 'loading'}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                {contracts.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
                    The deployment file lists no contracts yet.
                  </p>
                ) : (
                  <ul>
                    {contracts.map((c, i) => {
                      const read = reads && reads !== 'loading' ? reads.contracts[i] : undefined;
                      return (
                        <li
                          key={c.address}
                          className="flex flex-col gap-2 border-t border-[rgba(15,23,42,0.06)] px-5 py-[13px] first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold">{c.label}</div>
                            <HexCopy value={c.address} lead={10} tail={6} />
                          </div>
                          <ReadStatus read={read} loading={reads === 'loading'} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {reads && reads !== 'loading' && (
                <div className="flex flex-col gap-5">
                  {reads.contracts.map((r) =>
                    r.status === 'ok' ? (
                      <StateCard key={r.address} read={r} label={labelFor(contracts, r.address)} />
                    ) : null,
                  )}
                </div>
              )}

              <section className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
                  <h2 className="text-[13px] font-semibold">Transactions</h2>
                  <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
                    {load.deployment.txs.length} recorded
                  </span>
                </div>
                {load.deployment.txs.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
                    No transactions recorded in the deployment file.
                  </p>
                ) : (
                  <ul>
                    {load.deployment.txs.map((t, i) => (
                      <TxRow
                        key={`${t.label}-${i}`}
                        tx={t}
                        lookup={reads && reads !== 'loading' ? reads.txs[i] : undefined}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <WalletCard wallet={wallet} network={info.label} onConnect={connect} />

          <section className="card-dark p-5">
            <p className="label-dark mb-4">Source</p>
            <dl className="flex flex-col gap-[10px] text-[11px]">
              <DarkRow label="Network" value={info.label} />
              <DarkRow label="Indexer" value={hostOf(indexer)} title={indexer} />
              {deployment && <DarkRow label="File written" value={formatIso(deployment.generatedAt)} />}
            </dl>
            <p className="mt-5 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
              Reading needs no wallet: public ledger state is public. Each contract's state is
              fetched as serialized bytes and decoded with the same compiled contract the circuits
              run, so a field shown here is the field on chain.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

// --- pieces ---------------------------------------------------------------

function NetworkPicker({ value, onChange }: { value: NetworkKey; onChange: (n: NetworkKey) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="flex max-w-full overflow-x-auto rounded-[11px] bg-[rgba(15,23,42,0.05)] p-[3px]"
    >
      {NETWORK_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={[
            'shrink-0 rounded-[9px] px-[14px] py-[7px] text-[12px] font-semibold transition-colors',
            value === key
              ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-[rgba(15,23,42,0.48)]',
          ].join(' ')}
        >
          {NETWORKS[key].label}
        </button>
      ))}
    </div>
  );
}

function NotDeployed({ network, file }: { network: string; file: string }) {
  return (
    <section className="card px-5 py-12 text-center">
      <p className="text-[15px] font-semibold">Not deployed to {network} yet</p>
      <p className="mx-auto mt-2 max-w-[460px] text-[12px] leading-[1.6] text-[rgba(15,23,42,0.5)]">
        The deploy job writes <span className="mono">{file}</span> with the contract addresses and
        transaction hashes once it has run on {network}. Until then there is nothing on chain to
        show, and this screen will not make anything up.
      </p>
    </section>
  );
}

function ReadStatus({ read, loading }: { read: ContractRead | undefined; loading: boolean }) {
  if (loading || !read) {
    return <span className="badge badge-neutral self-start sm:self-auto">Reading</span>;
  }
  if (read.status === 'ok') {
    const h = read.anchor.blockHeight;
    return (
      <span className="flex items-center gap-2 self-start sm:self-auto">
        {h !== null && (
          <span className="tnum text-[11px] text-[rgba(15,23,42,0.45)]">block {h.toLocaleString()}</span>
        )}
        <span className="badge badge-pass">On chain</span>
      </span>
    );
  }
  if (read.status === 'not-found') {
    return (
      <span className="badge badge-pending self-start sm:self-auto" title="The indexer has no contract at this address">
        Not on indexer
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2 self-start sm:self-auto">
      <span className="truncate text-[11px] text-[#dc2626]" title={read.error}>
        {read.error}
      </span>
      <span className="badge badge-fail">Unread</span>
    </span>
  );
}

function TxRow({ tx, lookup }: { tx: DeploymentTx; lookup: TxLookup | undefined }) {
  const hash = tx.txHash ?? tx.txId;
  const height = lookup?.status === 'found' ? lookup.blockHeight : tx.blockHeight ?? null;
  return (
    <li className="flex flex-col gap-2 border-t border-[rgba(15,23,42,0.06)] px-5 py-[13px] first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{tx.label}</div>
        {hash ? (
          <HexCopy value={hash} lead={10} tail={6} prefix={tx.txHash ? 'hash' : 'id'} />
        ) : (
          <span className="text-[11px] text-[rgba(15,23,42,0.4)]">no hash recorded</span>
        )}
      </div>
      <span className="flex items-center gap-2 self-start sm:self-auto">
        {height !== null && height !== undefined && (
          <span className="tnum text-[11px] text-[rgba(15,23,42,0.45)]">block {height.toLocaleString()}</span>
        )}
        {lookup === undefined ? (
          <span className="badge badge-neutral">Checking</span>
        ) : lookup.status === 'found' ? (
          <span className="badge badge-pass" title="The indexer returned this transaction">
            Confirmed
          </span>
        ) : lookup.status === 'not-found' ? (
          <span className="badge badge-pending" title="The indexer does not know this transaction">
            Not found
          </span>
        ) : (
          <span className="badge badge-neutral" title={lookup.error}>
            Unchecked
          </span>
        )}
      </span>
    </li>
  );
}

function WalletCard({
  wallet,
  network,
  onConnect,
}: {
  wallet: WalletState;
  network: string;
  onConnect: () => void;
}) {
  const installed = useMemo(() => isLaceInstalled(), []);
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="label">Wallet</p>
        <WalletBadge wallet={wallet} />
      </div>

      {wallet.state === 'connected' ? (
        <dl className="flex flex-col gap-[10px] text-[11px]">
          <LightRow label="Wallet" value={wallet.session.wallet.name || wallet.session.wallet.rdns} />
          <LightRow label="Network id" value={wallet.session.networkId} />
          <LightRow
            label="Address"
            value={shortHex(wallet.session.addresses.unshielded, 12, 6)}
            title={wallet.session.addresses.unshielded}
            mono
          />
          <LightRow
            label="Coin key"
            value={shortHex(wallet.session.addresses.coinPublicKey, 8, 4)}
            title={wallet.session.addresses.coinPublicKey}
            mono
          />
          <LightRow label="Indexer" value={hostOf(wallet.session.config.indexerUri)} title={wallet.session.config.indexerUri} />
          <LightRow
            label="Proving"
            value={wallet.session.providers.proving === 'wallet' ? 'By Lace' : hostOf(wallet.session.config.proverServerUri ?? '')}
          />
          <LightRow
            label="Private state"
            value={wallet.session.providers.privateStorage === 'indexeddb' ? 'This browser (IndexedDB)' : 'This tab only'}
          />
        </dl>
      ) : (
        <>
          <p className="mb-4 text-[12px] leading-[1.6] text-[rgba(15,23,42,0.55)]">
            {installed
              ? `Connect Lace on ${network} to build the full provider stack: Lace balances, signs and submits; keys never reach this page.`
              : `Reading the chain needs no wallet. To act on ${network}, install the Lace wallet with Midnight enabled.`}
          </p>
          <button
            type="button"
            className="btn btn-ink w-full"
            onClick={onConnect}
            disabled={wallet.state === 'connecting'}
          >
            {wallet.state === 'connecting' ? 'Waiting for Lace…' : 'Connect Lace'}
          </button>
          {wallet.state === 'error' && (
            <p role="alert" className="mt-3 text-[12px] leading-[1.5] text-[#dc2626]">
              {wallet.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function WalletBadge({ wallet }: { wallet: WalletState }) {
  switch (wallet.state) {
    case 'connected':
      return <span className="badge badge-pass">Connected</span>;
    case 'connecting':
      return <span className="badge badge-pending">Connecting</span>;
    case 'error':
      return (
        <span className="badge badge-fail">
          {wallet.code === 'not-installed'
            ? 'Not installed'
            : wallet.code === 'rejected'
              ? 'Declined'
              : wallet.code === 'wrong-network'
                ? 'Wrong network'
                : 'Error'}
        </span>
      );
    default:
      return <span className="badge badge-neutral">Not connected</span>;
  }
}

// --- state cards ----------------------------------------------------------

function StateCard({ read, label }: { read: Extract<ContractRead, { status: 'ok' }>; label: string }) {
  const v = read.view;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-[13px] font-semibold">{label}</h2>
          <span className="mono truncate text-[11px] text-[rgba(15,23,42,0.4)]">
            {shortHex('0x' + read.address, 8, 4)}
          </span>
        </div>
        <span className="label" title="Decoded from the indexer's serialized contract state">
          Live ledger
          {read.anchor.blockHeight !== null && ` · block ${read.anchor.blockHeight.toLocaleString()}`}
        </span>
      </div>
      <div className="p-5">
        {v.kind === 'solvencyProof' ? (
          <SolvencyBody v={v} />
        ) : v.kind === 'registry' ? (
          <RegistryBody v={v} />
        ) : v.kind === 'loanDirectory' ? (
          <DirectoryBody v={v} />
        ) : (
          <LoanBody v={v} />
        )}
      </div>
    </section>
  );
}

function SolvencyBody({ v }: { v: SolvencyProofView }) {
  return (
    <>
      <Figures>
        <Fig label="Lenders" value={v.lenderCount} />
        <Fig label="Claims" value={v.claimCount} note={`${v.openClaimCount} open`} />
        <Fig label="Attestations" value={v.attestationCount} note={`${v.passCount} pass · ${v.failCount} fail`} />
      </Figures>
      <Fields>
        <Field label="Owner" hex={v.owner} />
        <Field label="Facts commitment" hex={v.commitment} />
        <Field label="Circuit tag" hex={v.verifierKey} />
      </Fields>
    </>
  );
}

function RegistryBody({ v }: { v: RegistryView }) {
  return (
    <>
      <Figures>
        <Fig label="Borrowers" value={Number(v.borrowerCount)} />
        <Fig label="Active" value={v.borrowers.filter((b) => b.status === 'ACTIVE').length} />
        <Fig label="Suspended" value={v.borrowers.filter((b) => b.status === 'SUSPENDED').length} />
      </Figures>
      {v.borrowers.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {v.borrowers.map((b) => (
            <li key={b.owner} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="mono text-[rgba(15,23,42,0.6)]">instance {shortHex('0x' + b.instance, 8, 4)}</span>
              <span className={`badge ${b.status === 'ACTIVE' ? 'badge-pass' : b.status === 'SUSPENDED' ? 'badge-fail' : 'badge-neutral'}`}>
                {b.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DirectoryBody({ v }: { v: LoanDirectoryView }) {
  return (
    <>
      <Figures>
        <Fig label="Listings" value={Number(v.listingCount)} />
        <Fig label="Repaid on record" value={v.recordedCount} note={`${v.repaidLeaves} Merkle leaves`} />
        <Fig label="History proofs" value={v.historyProofs.length} note="Loans that proved 2 repaid" />
      </Figures>
      {v.listings.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="label">
                <th className="py-[8px] pr-4 text-left font-bold">Loan</th>
                <th className="py-[8px] pr-4 text-left font-bold">Principal</th>
                <th className="py-[8px] text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {v.listings.map((l) => (
                <tr key={l.loan} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="mono py-[9px] pr-4 text-[11px]">{shortHex('0x' + l.loan, 8, 4)}</td>
                  <td className="tnum py-[9px] pr-4 text-[12px]">{l.principal.toLocaleString('en-US')}</td>
                  <td className="py-[9px] text-right">
                    <StatusPill status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LoanBody({ v }: { v: LoanView }) {
  const rate = Number(v.terms.interestBps) / 100;
  const days = Number(v.terms.periodSeconds) / 86_400;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill status={v.status} />
        <span
          className={`badge ${v.tier === 'VERIFIED' ? 'badge-pass' : v.tier === 'STANDARD' ? 'badge-pending' : 'badge-neutral'}`}
          title={v.tier === 'VERIFIED' ? '110% collateral tier, proved in zero knowledge' : undefined}
        >
          Tier {v.tier.toLowerCase()}
        </span>
        {v.latePayments > 0n && <span className="badge badge-fail">{v.latePayments.toString()} late</span>}
      </div>
      <Figures>
        <Fig label="Collateral" value={v.collateralRequired.toLocaleString('en-US')} note={collateralNote(v)} />
        <Fig label="Owed" value={v.balanceOwed.toLocaleString('en-US')} note={v.disbursed ? 'Remaining balance' : 'Not disbursed'} />
        <Fig
          label="Payments"
          value={`${v.paymentsMade} / ${v.terms.installments}`}
          note={v.nextDueAt > 0n && v.status === 'ACTIVE' ? `Next due ${formatUnix(v.nextDueAt)}` : '—'}
        />
      </Figures>
      <Fields>
        <Field
          label="Terms"
          text={`${v.terms.principal.toLocaleString('en-US')} at ${rate}% over ${v.terms.installments} × ${days % 1 === 0 ? days : days.toFixed(2)} d`}
        />
        <Field label="History commitment" hex={v.historyCommitment} />
        <Field label="Facts commitment" hex={v.factsCommitment} />
        <Field label="Lender" hex={v.lender} />
      </Fields>
    </>
  );
}

const collateralNote = (v: LoanView): string => {
  if (v.status === 'OFFERED' && v.terms.principal > 0n) {
    const offered = Number((v.offeredCollateral * 1000n) / v.terms.principal) / 10;
    return `Offered ${v.offeredCollateral.toLocaleString('en-US')} (${offered}%), not yet accepted`;
  }
  if (v.collateralRequired === 0n || v.terms.principal === 0n) return 'Not accepted yet';
  const pct = Number((v.collateralRequired * 1000n) / v.terms.principal) / 10;
  return `${pct}% of principal`;
};

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'REPAID' || status === 'ACTIVE'
      ? 'badge-pass'
      : status === 'DEFAULTED' || status === 'DECLINED'
        ? 'badge-fail'
        : status === 'APPLIED' || status === 'OFFERED' || status === 'OPEN'
          ? 'badge-pending'
          : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status.toLowerCase()}</span>;
}

function Figures({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
  );
}

function Fig({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div>
      <p className="label mb-[6px]">{label}</p>
      <p className="tnum text-[22px] font-bold leading-none tracking-[-0.02em]">
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </p>
      {note && <p className="mt-[6px] text-[11px] text-[rgba(15,23,42,0.42)]">{note}</p>}
    </div>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-5 flex flex-col gap-[9px] border-t border-[rgba(15,23,42,0.06)] pt-4 text-[11px]">
      {children}
    </dl>
  );
}

function Field({ label, hex, text }: { label: string; hex?: string; text?: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <dt className="text-[rgba(15,23,42,0.5)]">{label}</dt>
      <dd className="min-w-0">
        {hex !== undefined ? <HexCopy value={hex} lead={10} tail={6} /> : <span className="tnum">{text}</span>}
      </dd>
    </div>
  );
}

// --- small helpers --------------------------------------------------------

function HexCopy({
  value,
  lead = 8,
  tail = 4,
  prefix,
}: {
  value: string;
  lead?: number;
  tail?: number;
  prefix?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (insecure context): the full value is in the title.
    }
  };
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      {prefix && <span className="label">{prefix}</span>}
      <span className="mono truncate text-[11px] text-[rgba(15,23,42,0.6)]" title={value}>
        {shortHex(value, lead, tail)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-[7px] border border-[rgba(15,23,42,0.12)] px-[7px] py-[2px] text-[10px] font-semibold text-[rgba(15,23,42,0.6)] transition-colors hover:bg-[rgba(15,23,42,0.04)]"
        aria-label={`Copy ${value}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function DarkRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <dt className="text-[rgba(255,247,235,0.5)]">{label}</dt>
      <dd className="mono truncate text-[rgba(255,247,235,0.9)]">{value}</dd>
    </div>
  );
}

function LightRow({
  label,
  value,
  title,
  mono = false,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <dt className="shrink-0 text-[rgba(15,23,42,0.5)]">{label}</dt>
      <dd className={`${mono ? 'mono ' : ''}truncate text-right font-medium`}>{value}</dd>
    </div>
  );
}

const labelFor = (list: { address: string; label: string }[], address: string): string =>
  list.find((c) => c.address === address)?.label ?? 'Contract';

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url || '—';
  }
};

const formatIso = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const formatUnix = (seconds: bigint): string =>
  new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
