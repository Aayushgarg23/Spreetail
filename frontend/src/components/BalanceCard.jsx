import { useMemo } from 'react';

// ─── helpers ────────────────────────────────────────────────────────────────

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
  }).format(Math.abs(amount));
}

// ─── component ──────────────────────────────────────────────────────────────

export default function BalanceCard({
  userId,
  name,
  email,
  netBalance = 0,
  totalPaid = 0,
  totalOwed = 0,
  isActive = true,
  onClick,
}) {
  const initials = useMemo(() => getInitials(name), [name]);

  // Determine variant: owed (positive), owes (negative), settled (≈0)
  const ZERO_THRESHOLD = 0.005;
  const variant =
    netBalance > ZERO_THRESHOLD
      ? 'owed'
      : netBalance < -ZERO_THRESHOLD
      ? 'owes'
      : 'settled';

  // ── variant-based style maps ──────────────────────────────────────────────
  const styles = {
    owed: {
      card: 'bg-gradient-to-br from-emerald-900/40 via-emerald-800/20 to-white/5 border-emerald-500/30',
      glow: 'shadow-[0_0_40px_-8px_rgba(16,185,129,0.45)]',
      amount: 'text-emerald-400',
      sign: '+',
      label: "You're owed",
      labelBg: 'badge-green',
      avatar: 'bg-emerald-700/60 text-emerald-200',
      ring: 'ring-1 ring-emerald-500/40',
    },
    owes: {
      card: 'bg-gradient-to-br from-red-900/40 via-red-800/20 to-white/5 border-red-500/30',
      glow: 'shadow-[0_0_40px_-8px_rgba(239,68,68,0.45)]',
      amount: 'text-red-400',
      sign: '-',
      label: 'You owe',
      labelBg: 'badge-red',
      avatar: 'bg-red-700/60 text-red-200',
      ring: 'ring-1 ring-red-500/40',
    },
    settled: {
      card: 'bg-gradient-to-br from-white/5 via-white/[0.03] to-white/5 border-white/10',
      glow: 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
      amount: 'text-white/50',
      sign: '',
      label: 'Settled up ✓',
      labelBg: 'badge bg-white/10 text-white/50 border border-white/15',
      avatar: 'bg-white/10 text-white/50',
      ring: 'ring-1 ring-white/10',
    },
  };

  const s = styles[variant];

  return (
    <button
      type="button"
      onClick={() =>
        onClick?.({ userId, name, email, netBalance, totalPaid, totalOwed })
      }
      className={[
        'group relative w-full text-left',
        'backdrop-blur-md rounded-2xl border',
        'p-5 flex flex-col gap-4',
        'cursor-pointer select-none',
        s.card,
        s.glow,
        s.ring,
        'hover:scale-[1.025] focus-visible:scale-[1.025]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
        'transition-all duration-200 ease-out',
        !isActive && 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Balance card for ${name}`}
    >
      {/* ── top row: avatar + name + badges ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* initials avatar */}
          <div
            className={[
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              'text-sm font-bold',
              s.avatar,
            ].join(' ')}
            aria-hidden="true"
          >
            {initials}
          </div>

          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate leading-tight">
              {name}
            </p>
            <p className="text-white/40 text-xs truncate leading-tight mt-0.5">
              {email}
            </p>
          </div>
        </div>

        {/* right-side badges */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={s.labelBg}>{s.label}</span>
          <span
            className={[
              'badge text-[10px]',
              isActive
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'bg-white/[0.08] text-white/35 border border-white/10',
            ].join(' ')}
          >
            {isActive ? '● Active' : '○ Past'}
          </span>
        </div>
      </div>

      {/* ── center: big balance amount ── */}
      <div className="flex flex-col items-center gap-1 py-2">
        <span
          className={[
            'font-extrabold text-4xl tracking-tight tabular-nums',
            s.amount,
          ].join(' ')}
        >
          {s.sign}₹{fmt(netBalance)}
        </span>
        <span className="text-white/35 text-xs font-medium">{s.label}</span>
      </div>

      {/* ── bottom row: paid / owed ── */}
      <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
            Paid
          </p>
          <p className="text-sm font-semibold text-emerald-400 tabular-nums">
            ₹{fmt(totalPaid)}
          </p>
        </div>

        <div className="w-px h-8 bg-white/10" />

        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
            Owed
          </p>
          <p className="text-sm font-semibold text-red-400 tabular-nums">
            ₹{fmt(totalOwed)}
          </p>
        </div>
      </div>

      {/* ── subtle hover arrow hint ── */}
      <span
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-60 transition-opacity duration-200 text-white/60 text-lg leading-none"
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  );
}
