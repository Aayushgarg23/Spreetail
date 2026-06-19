import { useState, useMemo } from 'react';

// ─── constants ───────────────────────────────────────────────────────────────

const SEVERITY = {
  ERROR: {
    label: 'ERROR',
    badgeClass: 'badge-red',
    border: 'border-l-red-500',
  },
  WARNING: {
    label: 'WARNING',
    badgeClass: 'badge-yellow',
    border: 'border-l-yellow-500',
  },
};

const RESOLUTIONS = [
  {
    value: 'PENDING',
    label: 'Pending…',
    icon: '⏳',
    color: 'text-amber-400',
  },
  {
    value: 'DELETE',
    label: 'Delete row',
    icon: '🗑️',
    color: 'text-red-400',
  },
  {
    value: 'KEEP',
    label: 'Keep as-is',
    icon: '✅',
    color: 'text-emerald-400',
  },
  {
    value: 'MERGE',
    label: 'Merge duplicate',
    icon: '🔀',
    color: 'text-blue-400',
  },
  {
    value: 'OVERRIDE',
    label: 'Override values',
    icon: '✏️',
    color: 'text-purple-400',
  },
  {
    value: 'SKIP',
    label: 'Skip / ignore',
    icon: '⏭️',
    color: 'text-white/40',
  },
];

const RESOLUTION_MAP = Object.fromEntries(RESOLUTIONS.map((r) => [r.value, r]));

// ─── helpers ─────────────────────────────────────────────────────────────────

function ResolutionSelect({ value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'input-field py-2 pr-8 appearance-none cursor-pointer text-sm',
          'bg-white/5 border border-white/10 rounded-xl',
          RESOLUTION_MAP[value]?.color ?? 'text-white',
        ].join(' ')}
      >
        {RESOLUTIONS.map((r) => (
          <option key={r.value} value={r.value} className="bg-surface-900 text-white">
            {r.icon} {r.label}
          </option>
        ))}
      </select>
      {/* custom caret */}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">
        ▾
      </span>
    </div>
  );
}

function RawData({ row }) {
  if (!row) return null;
  const entries = typeof row === 'object' ? Object.entries(row) : [];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {entries.map(([k, v]) => (
        <span key={k} className="font-mono text-[11px] text-white/45">
          <span className="text-white/25">{k}:</span>{' '}
          <span className="text-white/65">{String(v ?? '—')}</span>
        </span>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AnomalyReviewTable({ anomalies = [], onResolve, sessionId }) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // local resolution state so UI responds instantly
  const [localResolutions, setLocalResolutions] = useState(() =>
    Object.fromEntries(anomalies.map((a) => [a.id, a.resolution ?? 'PENDING']))
  );

  function handleResolve(anomalyId, resolution) {
    setLocalResolutions((prev) => ({ ...prev, [anomalyId]: resolution }));
    onResolve?.(anomalyId, resolution);
  }

  const types = useMemo(
    () => ['ALL', ...new Set(anomalies.map((a) => a.type ?? 'ERROR'))],
    [anomalies]
  );

  const filtered = useMemo(() => {
    return anomalies.filter((a) => {
      const res = localResolutions[a.id] ?? 'PENDING';
      const matchType = typeFilter === 'ALL' || a.type === typeFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING' && res === 'PENDING') ||
        (statusFilter === 'RESOLVED' && res !== 'PENDING');
      return matchType && matchStatus;
    });
  }, [anomalies, typeFilter, statusFilter, localResolutions]);

  const pendingCount = anomalies.filter(
    (a) => (localResolutions[a.id] ?? 'PENDING') === 'PENDING'
  ).length;

  // ── empty / all-resolved state ────────────────────────────────────────────
  if (anomalies.length === 0 || pendingCount === 0) {
    return (
      <div className="glass-card p-10 flex flex-col items-center gap-3 text-center">
        <span className="text-5xl">✅</span>
        <p className="text-lg font-semibold text-white">All anomalies resolved!</p>
        <p className="text-white/45 text-sm">
          {anomalies.length === 0
            ? 'No anomalies were detected in your import.'
            : `All ${anomalies.length} anomalies have been addressed.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="badge-yellow">{pendingCount} pending</span>
          <span className="text-white/30 text-xs">·</span>
          <span className="text-white/45 text-xs">
            {anomalies.length} total anomalies
          </span>
          {sessionId && (
            <>
              <span className="text-white/30 text-xs">·</span>
              <span className="text-white/25 font-mono text-[10px]">
                session:{sessionId}
              </span>
            </>
          )}
        </div>

        {/* filters */}
        <div className="flex items-center gap-2">
          {/* type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field py-1.5 px-3 text-xs w-auto appearance-none"
          >
            {types.map((t) => (
              <option key={t} value={t} className="bg-surface-900">
                {t === 'ALL' ? 'All Types' : t}
              </option>
            ))}
          </select>

          {/* status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field py-1.5 px-3 text-xs w-auto appearance-none"
          >
            <option value="ALL" className="bg-surface-900">All Status</option>
            <option value="PENDING" className="bg-surface-900">Pending</option>
            <option value="RESOLVED" className="bg-surface-900">Resolved</option>
          </select>
        </div>
      </div>

      {/* ── anomaly rows ── */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="glass-card p-8 text-center text-white/40 text-sm">
            No anomalies match the selected filters.
          </div>
        ) : (
          filtered.map((anomaly) => {
            const resolution = localResolutions[anomaly.id] ?? 'PENDING';
            const isPending = resolution === 'PENDING';
            const sev = SEVERITY[anomaly.type] ?? SEVERITY.WARNING;
            const resInfo = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP.PENDING;

            return (
              <div
                key={anomaly.id}
                className={[
                  'glass-card border-l-4 px-5 py-4 flex flex-col gap-3',
                  'transition-all duration-200',
                  isPending ? sev.border : 'border-l-white/10',
                  !isPending && 'opacity-55',
                ].join(' ')}
              >
                {/* row 1: badges + resolution dropdown */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* row number */}
                    <span className="badge bg-white/10 text-white/60 border border-white/15 font-mono text-[11px]">
                      Row #{anomaly.rowNumber ?? anomaly.row ?? '?'}
                    </span>

                    {/* severity badge */}
                    <span className={sev.badgeClass}>{sev.label}</span>

                    {/* anomaly type / code */}
                    {anomaly.code && (
                      <span className="badge bg-white/8 text-white/40 border border-white/10 font-mono text-[10px]">
                        {anomaly.code}
                      </span>
                    )}
                  </div>

                  {/* resolution dropdown */}
                  <ResolutionSelect
                    value={resolution}
                    onChange={(v) => handleResolve(anomaly.id, v)}
                  />
                </div>

                {/* row 2: raw data */}
                {anomaly.rawRow && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                    <RawData row={anomaly.rawRow} />
                  </div>
                )}

                {/* row 3: explanation */}
                {anomaly.message && (
                  <p className="text-sm text-white/60 leading-relaxed">
                    {anomaly.message}
                  </p>
                )}

                {/* resolved indicator overlay */}
                {!isPending && (
                  <div className="flex items-center gap-1.5">
                    <span className={['text-sm font-medium', resInfo.color].join(' ')}>
                      {resInfo.icon} {resInfo.label}
                    </span>
                    <span className="text-white/25 text-xs">— click dropdown to change</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
