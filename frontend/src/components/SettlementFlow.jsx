import { useState, useEffect, useRef } from 'react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function fmt(amount) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}

// Deterministic hue from string for avatar background
function nameToHue(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'md' }) {
  const hue = nameToHue(name);
  const sizeClass = size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';

  return (
    <div
      className={[
        sizeClass,
        'rounded-full flex items-center justify-center font-bold flex-shrink-0',
        'border border-white/10',
      ].join(' ')}
      style={{
        background: `hsl(${hue} 55% 30% / 0.8)`,
        color: `hsl(${hue} 70% 80%)`,
      }}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({ settlement, onConfirm, onCancel }) {
  const { from, to, amount } = settlement;

  // close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      aria-modal="true"
      role="dialog"
      aria-label="Confirm settlement"
    >
      <div
        className="glass-card w-full max-w-sm p-6 flex flex-col gap-5 animate-[fadeInScale_200ms_ease-out_both]"
        style={{
          // inline keyframe via style since Tailwind arbitrary animation doesn't exist by default
          animation: 'fadeInScale 200ms ease-out both',
        }}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-white">Confirm Settlement</h3>
          <p className="text-white/50 text-sm">
            This will mark the payment as settled in your group.
          </p>
        </div>

        {/* summary */}
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-1 text-sm text-center">
          <span className="text-white/70">
            <span className="font-semibold text-white">{from}</span>
            {' will pay '}
            <span className="font-semibold text-white">{to}</span>
          </span>
          <span className="text-2xl font-extrabold text-brand-400 tabular-nums">
            ₹{fmt(amount)}
          </span>
        </div>

        {/* actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1 justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary flex-1 justify-center"
          >
            Confirm ✓
          </button>
        </div>
      </div>

      {/* CSS keyframe injected once */}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.93) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}

// ─── Settlement Card ──────────────────────────────────────────────────────────

function SettlementCard({ settlement, index, onSettle, groupMembers }) {
  const [settled, setSettled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [visible, setVisible] = useState(false);

  // staggered slide-up entrance
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  function resolveName(idOrName) {
    if (!groupMembers) return idOrName;
    const member = groupMembers.find(
      (m) => m.id === idOrName || m.userId === idOrName || m.name === idOrName
    );
    return member?.name ?? idOrName;
  }

  const fromName = resolveName(settlement.fromUser ?? settlement.from);
  const toName = resolveName(settlement.toUser ?? settlement.to);
  const amount = settlement.amount;

  function handleSettleClick() {
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    setSettled(true);
    onSettle?.({
      fromUser: settlement.fromUser ?? settlement.from,
      toUser: settlement.toUser ?? settlement.to,
      amount,
    });
  }

  return (
    <>
      <div
        className={[
          'glass-card px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4',
          'transition-all duration-500',
          visible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-6',
          settled && 'ring-1 ring-emerald-500/40',
        ].join(' ')}
      >
        {/* from → to */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* from */}
          <div className="flex flex-col items-center gap-1 min-w-0">
            <Avatar name={fromName} size="lg" />
            <span className="text-xs text-white/60 truncate max-w-[80px] text-center">
              {fromName}
            </span>
          </div>

          {/* arrow */}
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0 px-1">
            <span className="gradient-text text-xl font-bold leading-none">→</span>
          </div>

          {/* to */}
          <div className="flex flex-col items-center gap-1 min-w-0">
            <Avatar name={toName} size="lg" />
            <span className="text-xs text-white/60 truncate max-w-[80px] text-center">
              {toName}
            </span>
          </div>
        </div>

        {/* amount */}
        <div className="flex flex-col items-center flex-shrink-0">
          <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
            ₹{fmt(amount)}
          </span>
          <span className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">
            to settle
          </span>
        </div>

        {/* action */}
        <div className="flex-shrink-0">
          {settled ? (
            <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/25 rounded-xl px-4 py-2.5">
              <span className="text-emerald-400 text-lg leading-none">✓</span>
              <span className="text-emerald-300 text-sm font-semibold">Settled ✓</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSettleClick}
              className="btn-primary whitespace-nowrap"
            >
              ✓ Mark as Settled
            </button>
          )}
        </div>
      </div>

      {/* confirmation modal */}
      {confirming && (
        <ConfirmModal
          settlement={{ from: fromName, to: toName, amount }}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SettlementFlow({ settlements = [], onSettle, groupMembers = [] }) {
  // ── all-settled empty state ──────────────────────────────────────────────
  if (settlements.length === 0) {
    return (
      <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
        <span className="text-6xl">🎉</span>
        <p className="text-xl font-bold text-white">All settled up!</p>
        <p className="text-white/45 text-sm">
          No payments needed. Everyone is even.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Pending Settlements
        </h2>
        <span className="badge-yellow">{settlements.length} payment{settlements.length !== 1 ? 's' : ''}</span>
      </div>

      {/* cards */}
      {settlements.map((settlement, index) => (
        <SettlementCard
          key={settlement.id ?? `${settlement.fromUser ?? settlement.from}-${settlement.toUser ?? settlement.to}-${index}`}
          settlement={settlement}
          index={index}
          onSettle={onSettle}
          groupMembers={groupMembers}
        />
      ))}
    </div>
  );
}
