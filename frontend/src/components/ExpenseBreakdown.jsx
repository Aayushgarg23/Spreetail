import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ─── split table ──────────────────────────────────────────────────────────────

function SplitTable({ expense }) {
  const { splits = [], payer, currency = 'INR', originalAmount, exchangeRate } = expense;

  const showConversion = currency !== 'INR' && originalAmount && exchangeRate;

  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* currency conversion banner */}
      {showConversion && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <span className="text-blue-400 text-sm">💱</span>
          <p className="text-blue-300 text-xs">
            Original:{' '}
            <span className="font-semibold font-mono">
              {currency} {fmt(originalAmount, currency)}
            </span>{' '}
            · Rate:{' '}
            <span className="font-semibold font-mono">1 {currency} = ₹{exchangeRate}</span>
          </p>
        </div>
      )}

      {/* splits table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="data-table w-full">
          <thead>
            <tr className="bg-white/[0.04]">
              <th className="rounded-tl-xl">Member</th>
              <th>Share Amount</th>
              <th>Share %</th>
              <th className="rounded-tr-xl">Role</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split, idx) => {
              const isPayer =
                split.userId === (payer?.id ?? payer?.userId) ||
                split.name === payer?.name;

              return (
                <tr key={split.userId ?? idx}>
                  {/* member name + initials */}
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className={[
                          'w-7 h-7 rounded-full flex items-center justify-center',
                          'text-[10px] font-bold flex-shrink-0',
                          isPayer
                            ? 'bg-emerald-700/60 text-emerald-200'
                            : 'bg-brand-700/50 text-brand-200',
                        ].join(' ')}
                      >
                        {getInitials(split.name ?? split.userName ?? '')}
                      </div>
                      <span className="font-medium text-white/85 truncate">
                        {split.name ?? split.userName ?? '—'}
                      </span>
                    </div>
                  </td>

                  {/* amount */}
                  <td className="font-mono font-semibold text-white/90 tabular-nums">
                    ₹{fmt(split.amount)}
                  </td>

                  {/* percentage */}
                  <td className="text-white/50 tabular-nums">
                    {split.percentage != null
                      ? `${Number(split.percentage).toFixed(1)}%`
                      : expense.totalAmount && split.amount
                      ? `${((split.amount / expense.totalAmount) * 100).toFixed(1)}%`
                      : '—'}
                  </td>

                  {/* role badge */}
                  <td>
                    {isPayer ? (
                      <span className="badge-green">Paid</span>
                    ) : (
                      <span className="badge-blue">Owes</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* total row */}
            {splits.length > 0 && (
              <tr className="bg-white/[0.03]">
                <td className="font-semibold text-white/60 uppercase text-[11px] tracking-wider">
                  Total
                </td>
                <td className="font-mono font-bold text-white tabular-nums">
                  ₹{fmt(expense.totalAmount ?? splits.reduce((s, r) => s + (r.amount ?? 0), 0))}
                </td>
                <td className="font-semibold text-white/50">100%</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ExpenseBreakdown({ expense }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);
  const navigate = useNavigate();

  // measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [open, expense]);

  if (!expense) return null;

  const {
    id,
    description,
    date,
    payer,
    totalAmount = 0,
    currency = 'INR',
  } = expense;

  const payerName = payer?.name ?? payer?.userName ?? 'Unknown';
  const currencyIsUSD = currency === 'USD';

  function handleDescriptionClick(e) {
    e.stopPropagation();
    if (id) navigate(`/expenses/${id}`);
  }

  return (
    <div
      className={[
        'glass-card overflow-hidden transition-all duration-200',
        open && 'ring-1 ring-brand-500/30',
      ].join(' ')}
    >
      {/* ── collapsed header (always visible) ── */}
      <button
        type="button"
        className="w-full text-left px-5 py-4 flex items-center gap-4 group"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* expand chevron */}
        <span
          className={[
            'flex-shrink-0 w-6 h-6 rounded-full bg-white/8 flex items-center justify-center',
            'text-white/50 text-xs transition-transform duration-300',
            open ? 'rotate-90' : 'rotate-0',
          ].join(' ')}
          aria-hidden="true"
        >
          ›
        </span>

        {/* description — clickable to navigate */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={handleDescriptionClick}
            className="text-sm font-semibold text-white hover:text-brand-300 transition-colors duration-150 text-left truncate max-w-full block"
            tabIndex={-1}
          >
            {description ?? 'Untitled expense'}
          </button>
          <p className="text-xs text-white/40 mt-0.5">{fmtDate(date)}</p>
        </div>

        {/* payer chip */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-brand-700/50 flex items-center justify-center text-[9px] font-bold text-brand-200">
            {getInitials(payerName)}
          </div>
          <span className="text-xs text-white/50 truncate max-w-[100px]">{payerName}</span>
        </div>

        {/* currency badge */}
        <span
          className={[
            'badge flex-shrink-0',
            currencyIsUSD
              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
              : 'bg-white/8 text-white/50 border border-white/10',
          ].join(' ')}
        >
          {currency}
        </span>

        {/* total amount */}
        <span className="flex-shrink-0 text-white font-bold tabular-nums text-sm">
          ₹{fmt(totalAmount)}
        </span>
      </button>

      {/* ── expandable split details ── */}
      <div
        style={{
          maxHeight: open ? `${contentHeight + 200}px` : '0px',
          overflow: 'hidden',
          transition: 'max-height 350ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div ref={contentRef} className="px-5 pb-5">
          <div className="border-t border-white/[0.06] pt-1">
            <SplitTable expense={expense} />
          </div>
        </div>
      </div>
    </div>
  );
}
