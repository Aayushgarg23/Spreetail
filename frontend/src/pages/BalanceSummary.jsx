import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Download,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { balancesApi, groupsApi } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function downloadCSV(balances, settlements) {
  const rows = [
    ['Member', 'Net Balance (Rs)', 'Status'],
    ...balances.map((b) => [
      b.name,
      b.net,
      b.net > 0 ? 'Owed' : b.net < 0 ? 'Owes' : 'Settled',
    ]),
    [],
    ['From', 'To', 'Amount (Rs)'],
    ...settlements.map((s) => [s.fromName, s.toName, s.amount]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'balance_summary.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── BalanceCard ──────────────────────────────────────────────────────────────

function BalanceCard({ balance, onClick }) {
  const isPositive = balance.net > 0;
  const isNegative = balance.net < 0;

  const cardClass = isPositive
    ? 'bg-emerald-500/10 border border-emerald-500/30 shadow-glow-green hover:bg-emerald-500/15'
    : isNegative
    ? 'bg-red-500/10 border border-red-500/30 shadow-glow-red hover:bg-red-500/15'
    : 'bg-white/5 border border-white/10 hover:bg-white/8';

  const amountClass = isPositive
    ? 'text-emerald-400'
    : isNegative
    ? 'text-red-400'
    : 'text-white/50';

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : null;

  return (
    <button
      onClick={() => onClick(balance)}
      className={`group w-full text-left rounded-2xl backdrop-blur-md p-5 transition-all duration-200 cursor-pointer active:scale-[0.98] ${cardClass}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Member</p>
          <p className="text-base font-bold text-white">{balance.name}</p>
        </div>
        {Icon && (
          <span
            className={`p-1.5 rounded-lg ${
              isPositive ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}
          >
            <Icon className={`w-4 h-4 ${amountClass}`} />
          </span>
        )}
      </div>

      <p className={`text-3xl font-black tracking-tight ${amountClass}`}>
        {isPositive ? '+' : isNegative ? '\u2212' : ''}&#x20B9;{fmt(balance.net)}
      </p>
      <p className={`text-xs mt-1.5 font-medium ${amountClass}`}>
        {isPositive ? "You're owed" : isNegative ? 'You owe' : 'All settled'}
      </p>

      <p className="text-xs text-white/30 mt-3 group-hover:text-white/50 transition-colors">
        Click for breakdown &rarr;
      </p>
    </button>
  );
}

// ─── Drill-Down Drawer ────────────────────────────────────────────────────────

function DrillDownDrawer({ balance, onClose, groupId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!balance) return;
    setLoading(true);
    setError(null);
    setData(null);
    balancesApi
      .drilldown(groupId, balance.userId)
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load breakdown.'))
      .finally(() => setLoading(false));
  }, [balance, groupId]);

  if (!balance) return null;

  const paid = data?.paid ?? [];
  const owed = data?.owed ?? [];
  const totalPaid = paid.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalOwed = owed.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-surface-800 border-l border-white/10 z-50 flex flex-col shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">{balance.name}&apos;s Balance Breakdown</h2>
            <p className="text-xs text-white/40 mt-0.5">Detailed expense history</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="glass-card p-4 text-red-400 text-sm text-center">{error}</div>
          )}

          {!loading && !error && (
            <>
              {/* Expenses Paid */}
              <section>
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Expenses Paid
                </h3>
                {paid.length === 0 ? (
                  <p className="text-white/30 text-sm italic">No payments recorded.</p>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th className="text-right">Amount</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paid.map((e, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap text-white/60">{fmtDate(e.date)}</td>
                            <td className="max-w-[140px] truncate">{e.description}</td>
                            <td className="text-right text-emerald-400 font-semibold tabular-nums">
                              +&#x20B9;{fmt(e.amount)}
                            </td>
                            <td>
                              <span className="badge badge-green text-xs">{e.type ?? 'Paid'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-white/10 flex justify-between items-center">
                      <span className="text-xs text-white/50 font-medium">Running Total</span>
                      <span className="text-emerald-400 font-black text-base tabular-nums">
                        +&#x20B9;{fmt(totalPaid)}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Expenses Owed */}
              <section>
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  Expenses Owed
                </h3>
                {owed.length === 0 ? (
                  <p className="text-white/30 text-sm italic">No amounts owed.</p>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th className="text-right">Amount</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {owed.map((e, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap text-white/60">{fmtDate(e.date)}</td>
                            <td className="max-w-[140px] truncate">{e.description}</td>
                            <td className="text-right text-red-400 font-semibold tabular-nums">
                              &minus;&#x20B9;{fmt(e.amount)}
                            </td>
                            <td>
                              <span className="badge badge-red text-xs">{e.type ?? 'Owed'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 border-t border-white/10 flex justify-between items-center">
                      <span className="text-xs text-white/50 font-medium">Running Total</span>
                      <span className="text-red-400 font-black text-base tabular-nums">
                        &minus;&#x20B9;{fmt(totalOwed)}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Net */}
              <div className="border-gradient rounded-2xl p-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-white/70">Net Balance</span>
                <span
                  className={`text-xl font-black tabular-nums ${
                    balance.net > 0
                      ? 'text-emerald-400'
                      : balance.net < 0
                      ? 'text-red-400'
                      : 'text-white/50'
                  }`}
                >
                  {balance.net > 0 ? '+' : balance.net < 0 ? '\u2212' : ''}&#x20B9;{fmt(balance.net)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Settlement Confirm Modal ─────────────────────────────────────────────────

function SettleModal({ settlement, onConfirm, onClose, loading }) {
  if (!settlement) return null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-card w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Confirm Settlement</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white/5 rounded-xl p-5 mb-5 text-center space-y-2">
          <p className="text-white/60 text-sm">Recording payment</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-brand-400 font-bold text-base">{settlement.fromName}</span>
            <ArrowRight className="w-4 h-4 text-white/30" />
            <span className="text-purple-400 font-bold text-base">{settlement.toName}</span>
          </div>
          <p className="text-3xl font-black text-white pt-1">&#x20B9;{fmt(settlement.amount)}</p>
        </div>

        <p className="text-xs text-white/40 text-center mb-5">
          This will be recorded as a settlement and group balances will be updated.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1 justify-center"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(settlement)}
            className="btn-primary flex-1 justify-center"
            disabled={loading}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {loading ? 'Saving…' : 'Mark as Settled'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settlement History Accordion ─────────────────────────────────────────────

function SettlementHistoryAccordion({ settlements }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white text-sm">Settlement History</span>
          <span className="badge badge-blue">{settlements.length}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-white/40 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-white/10 animate-fade-in">
          {settlements.length === 0 ? (
            <p className="px-5 py-4 text-white/30 text-sm italic">No settlements recorded yet.</p>
          ) : (
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-white/60">
                      {fmtDate(s.createdAt ?? s.date)}
                    </td>
                    <td className="text-brand-400 font-medium">{s.fromName}</td>
                    <td className="text-purple-400 font-medium">{s.toName}</td>
                    <td className="text-right text-emerald-400 font-semibold tabular-nums">
                      &#x20B9;{fmt(s.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BalanceSummary() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drawerBalance, setDrawerBalance] = useState(null);
  const [pendingSettle, setPendingSettle] = useState(null);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleSuccess, setSettleSuccess] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupRes, balRes, settleRes] = await Promise.all([
        groupsApi.get(groupId),
        balancesApi.get(groupId),
        balancesApi.listSettlements(groupId),
      ]);
      setGroup(groupRes.data.group ?? groupRes.data);
      setBalances(balRes.data.balances ?? balRes.data ?? []);
      setSettlements(settleRes.data.settlements ?? settleRes.data ?? []);
    } catch {
      setError('Failed to load balance data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSettle = async (settlement) => {
    setSettleLoading(true);
    try {
      await balancesApi.recordSettlement(groupId, {
        fromUserId: settlement.fromUserId,
        toUserId: settlement.toUserId,
        amount: settlement.amount,
      });
      setSettleSuccess(settlement);
      setPendingSettle(null);
      await fetchData();
    } catch {
      // keep modal open on error so user can retry
    } finally {
      setSettleLoading(false);
    }
  };

  // Greedy minimum-transaction settlement plan
  const suggestedSettlements = balances.length
    ? (() => {
        const bs = balances.map((b) => ({ ...b }));
        const positives = bs
          .filter((b) => b.net > 0.005)
          .sort((a, b) => b.net - a.net);
        const negatives = bs
          .filter((b) => b.net < -0.005)
          .sort((a, b) => a.net - b.net);
        const result = [];
        let pi = 0;
        let ni = 0;
        while (pi < positives.length && ni < negatives.length) {
          const p = positives[pi];
          const n = negatives[ni];
          const amount = Math.min(p.net, -n.net);
          result.push({
            fromUserId: n.userId,
            fromName: n.name,
            toUserId: p.userId,
            toName: p.name,
            amount: parseFloat(amount.toFixed(2)),
          });
          p.net -= amount;
          n.net += amount;
          if (Math.abs(p.net) < 0.005) pi++;
          if (Math.abs(n.net) < 0.005) ni++;
        }
        return result;
      })()
    : [];

  return (
    <div className="min-h-screen">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-surface-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(`/groups/${groupId}`)}
            className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white leading-tight">Balance Summary</h1>
            {group && (
              <p className="text-xs text-white/40 truncate">{group.name}</p>
            )}
          </div>

          <button
            onClick={() => downloadCSV(balances, settlements)}
            className="btn-secondary gap-1.5 text-xs px-3 py-2 flex-shrink-0"
            disabled={loading || balances.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="glass-card h-40 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="glass-card p-8 text-center">
            <p className="text-red-400 font-medium mb-3">{error}</p>
            <button onClick={fetchData} className="btn-secondary">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Balance Cards ─────────────────────────────────── */}
            <section>
              <div className="flex items-baseline gap-3 mb-5">
                <h2 className="text-xl font-bold text-white">Member Balances</h2>
                <span className="badge badge-blue">{balances.length} members</span>
              </div>

              {balances.length === 0 ? (
                <div className="glass-card p-10 text-center text-white/40 text-sm">
                  No balance data found for this group.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {balances.map((b) => (
                    <BalanceCard key={b.userId} balance={b} onClick={setDrawerBalance} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Suggested Settlements ─────────────────────────── */}
            <section>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span role="img" aria-label="idea">&#x1F4A1;</span>
                  Suggested Settlements
                </h2>
                <p className="text-white/40 text-sm mt-1">
                  Minimum transactions to clear all debts
                </p>
              </div>

              {suggestedSettlements.length === 0 ? (
                <div className="glass-card p-10 text-center">
                  <div className="text-5xl mb-3" role="img" aria-label="party">
                    &#x1F389;
                  </div>
                  <p className="text-white font-semibold text-lg">All balances are settled!</p>
                  <p className="text-white/40 text-sm mt-1">No pending payments.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestedSettlements.map((s, i) => (
                    <div
                      key={i}
                      className="glass-card px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/5 transition-all animate-slide-up"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      {/* Flow */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-400 text-sm font-bold">
                              {s.fromName?.[0]?.toUpperCase() ?? '?'}
                            </span>
                          </div>
                          <p className="text-xs text-white/60 mt-1 font-medium max-w-[64px] truncate text-center">
                            {s.fromName}
                          </p>
                        </div>

                        <div className="flex flex-col items-center flex-1">
                          <p className="text-lg font-black text-white tabular-nums">
                            &#x20B9;{fmt(s.amount)}
                          </p>
                          <div className="flex items-center gap-1 mt-1 w-full justify-center">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
                            <ArrowRight className="w-4 h-4 text-brand-400 flex-shrink-0" />
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
                          </div>
                          <p className="text-[10px] text-white/30 mt-0.5 uppercase tracking-wider">pays</p>
                        </div>

                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-emerald-400 text-sm font-bold">
                              {s.toName?.[0]?.toUpperCase() ?? '?'}
                            </span>
                          </div>
                          <p className="text-xs text-white/60 mt-1 font-medium max-w-[64px] truncate text-center">
                            {s.toName}
                          </p>
                        </div>
                      </div>

                      {/* Action */}
                      <button
                        onClick={() => {
                          setSettleSuccess(null);
                          setPendingSettle(s);
                        }}
                        className="btn-primary flex-shrink-0 text-xs px-4 py-2"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark as Settled
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {settleSuccess && (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 flex items-center gap-3 animate-slide-up">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-300 text-sm font-medium">
                    Settlement recorded: {settleSuccess.fromName} &rarr; {settleSuccess.toName}{' '}
                    &#x20B9;{fmt(settleSuccess.amount)}
                  </p>
                  <button
                    onClick={() => setSettleSuccess(null)}
                    className="ml-auto text-white/30 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>

            {/* ── Settlement History ────────────────────────────── */}
            <section>
              <SettlementHistoryAccordion settlements={settlements} />
            </section>
          </>
        )}
      </div>

      {/* Drill-Down Drawer */}
      <DrillDownDrawer
        balance={drawerBalance}
        onClose={() => setDrawerBalance(null)}
        groupId={groupId}
      />

      {/* Settlement Confirmation Modal */}
      <SettleModal
        settlement={pendingSettle}
        onConfirm={handleSettle}
        onClose={() => setPendingSettle(null)}
        loading={settleLoading}
      />
    </div>
  );
}
