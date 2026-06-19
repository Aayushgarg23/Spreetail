import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users, Plus, Upload, BarChart2, Calendar, Filter,
  ChevronRight, X, Check, ArrowLeft, Clock,
} from 'lucide-react';
import { groupsApi, expensesApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(name = '') {
  const palette = [
    'from-indigo-500 to-purple-600',
    'from-pink-500 to-rose-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-fuchsia-600',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function fmt(amount, currency = 'INR') {
  const n = Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${n}` : `\u20B9${n}`;
}

function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const SPLIT_TYPES = ['equal', 'exact', 'percentage', 'shares'];
const PAGE_SIZE = 50;

// ─── Activity icon / colour map ──────────────────────────────────────────────

const ACTIVITY_CONFIG = {
  EXPENSE_ADDED: {
    icon: Plus,
    cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  },
  SETTLEMENT_RECORDED: {
    icon: Check,
    cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  },
  MEMBER_JOINED: {
    icon: Users,
    cls: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  },
  MEMBER_LEFT: {
    icon: X,
    cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  },
  CSV_IMPORTED: {
    icon: Upload,
    cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  },
};

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function Avatar({ name, size = 'md' }) {
  const sz =
    size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br ${avatarColor(
        name
      )} flex items-center justify-center font-bold text-white flex-shrink-0`}
    >
      {initials(name)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD EXPENSE MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function AddExpenseModal({ groupId, members, onClose, onCreated }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'INR',
    expenseDate: new Date().toISOString().split('T')[0],
    paidBy: members[0]?.id || '',
    splitType: 'equal',
    splitAmong: members.map((m) => m.id),
  });
  const [splitValues, setSplitValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleMember = (uid) => {
    setForm((prev) => {
      const has = prev.splitAmong.includes(uid);
      return {
        ...prev,
        splitAmong: has
          ? prev.splitAmong.filter((id) => id !== uid)
          : [...prev.splitAmong, uid],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.description.trim()) {
      setError('Description is required.');
      return;
    }
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      setError('Enter a valid positive amount.');
      return;
    }
    if (!form.paidBy) {
      setError('Select who paid.');
      return;
    }
    if (form.splitAmong.length === 0) {
      setError('Select at least one member to split among.');
      return;
    }

    if (form.splitType === 'exact') {
      const total = form.splitAmong.reduce(
        (s, id) => s + Number(splitValues[id] || 0),
        0
      );
      if (Math.abs(total - Number(form.amount)) > 0.01) {
        setError(
          `Exact amounts must sum to ${Number(form.amount).toFixed(2)}. Currently: ${total.toFixed(2)}`
        );
        return;
      }
    }
    if (form.splitType === 'percentage') {
      const total = form.splitAmong.reduce(
        (s, id) => s + Number(splitValues[id] || 0),
        0
      );
      if (Math.abs(total - 100) > 0.01) {
        setError(
          `Percentages must sum to 100%. Currently: ${total.toFixed(2)}%`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        description: form.description.trim(),
        totalAmount: Number(form.amount),
        currency: form.currency,
        expenseDate: form.expenseDate,
        paidBy: form.paidBy,
        splitType: form.splitType,
        splitAmong: form.splitAmong,
        splitValues:
          form.splitType !== 'equal' ? splitValues : undefined,
      };
      await expensesApi.create(groupId, payload);
      onCreated();
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to create expense. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const needsValues = ['exact', 'percentage', 'shares'].includes(
    form.splitType
  );
  const valuePlaceholder = {
    exact: '0.00',
    percentage: '0',
    shares: '1',
  }[form.splitType];
  const valueLabel = {
    exact: 'Amount (INR)',
    percentage: 'Percentage (%)',
    shares: 'Shares (units)',
  }[form.splitType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-400" />
            Add Expense
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <label className="input-label">Description</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Team dinner, Groceries"
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>

          {/* Amount + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="input-label">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input-field"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, amount: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="input-label">Currency</label>
              <div className="flex rounded-xl border border-white/10 overflow-hidden h-[46px]">
                {['INR', 'USD'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({ ...p, currency: c }))
                    }
                    className={`px-4 text-sm font-semibold transition-colors ${
                      form.currency === c
                        ? 'bg-brand-600 text-white'
                        : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    {c === 'INR' ? '\u20B9' : '$'} {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="input-label">Date</label>
            <input
              type="date"
              className="input-field"
              value={form.expenseDate}
              onChange={(e) =>
                setForm((p) => ({ ...p, expenseDate: e.target.value }))
              }
            />
          </div>

          {/* Paid By */}
          <div>
            <label className="input-label">Paid By</label>
            <select
              className="input-field"
              value={form.paidBy}
              onChange={(e) =>
                setForm((p) => ({ ...p, paidBy: e.target.value }))
              }
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Split Type */}
          <div>
            <label className="input-label">Split Type</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
              {SPLIT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm((p) => ({ ...p, splitType: t }))
                  }
                  className={`px-2 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                    form.splitType === t
                      ? 'bg-brand-600 text-white shadow-lg'
                      : 'text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Split Among */}
          <div>
            <label className="input-label">Split Among</label>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {members.map((m) => {
                const selected = form.splitAmong.includes(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={`flex-1 flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                        selected
                          ? 'border-brand-500/50 bg-brand-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          selected
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-white/30'
                        }`}
                      >
                        {selected && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <Avatar name={m.name} size="sm" />
                      <span className="text-sm text-white/80">
                        {m.name}
                      </span>
                    </button>
                    {needsValues && selected && (
                      <input
                        type="number"
                        min="0"
                        step={
                          form.splitType === 'shares' ? '1' : '0.01'
                        }
                        placeholder={valuePlaceholder}
                        value={splitValues[m.id] || ''}
                        onChange={(e) =>
                          setSplitValues((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {needsValues && (
              <p className="mt-1.5 text-xs text-white/40">
                Enter {valueLabel.toLowerCase()} for each selected member
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {submitting ? 'Adding...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVITE MEMBER MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function InviteMemberModal({ groupId, onClose, onInvited }) {
  const [email, setEmail] = useState('');
  const [joinedAt, setJoinedAt] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await groupsApi.inviteMember(groupId, {
        email: email.trim(),
        joinedAt,
      });
      onInvited();
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to invite member.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card w-full max-w-sm p-6 z-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-400" />
            Invite Member
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">Email Address</label>
            <input
              type="email"
              className="input-field"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">
              Join Date{' '}
              <span className="normal-case text-white/30 ml-1">
                (optional)
              </span>
            </label>
            <input
              type="date"
              className="input-field"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              {submitting ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK LEFT DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

function MarkLeftDialog({ member, groupId, onClose, onMarked }) {
  const [leftAt, setLeftAt] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await groupsApi.setMemberLeft(groupId, member.id, leftAt);
      onMarked();
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to update member.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card w-full max-w-sm p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Mark as Left</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-white/60 text-sm mb-5">
          Set the departure date for{' '}
          <span className="text-white font-semibold">{member.name}</span>.
          Past expenses will still be counted up to this date.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">Left On</label>
            <input
              type="date"
              className="input-field"
              value={leftAt}
              onChange={(e) => setLeftAt(e.target.value)}
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-danger flex-1"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ExpensesTab({ groupId, members, onAddExpense }) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    payerId: '',
    splitType: '',
    currency: '',
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo }),
        ...(filters.payerId && { payerId: filters.payerId }),
        ...(filters.splitType && { splitType: filters.splitType }),
        ...(filters.currency && { currency: filters.currency }),
      };
      const res = await expensesApi.list(groupId, params);
      setExpenses(res.data.expenses || []);
      setTotal(res.data.total || 0);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, page, filters]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

  const getUserShare = (expense) => {
    if (!expense.splits) return null;
    const split = expense.splits.find((s) => s.userId === user?.id);
    return split ? Number(split.shareAmount) : null;
  };

  const splitBadgeCls = (type) =>
    ({
      equal: 'badge-blue',
      exact: 'badge-purple',
      percentage: 'badge-yellow',
      shares: 'badge-green',
    }[type] || 'badge');

  const hasFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.payerId ||
    filters.splitType ||
    filters.currency;

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────── */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="input-label">From</label>
            <input
              type="date"
              className="input-field w-40"
              value={filters.dateFrom}
              onChange={(e) => {
                setFilters((p) => ({ ...p, dateFrom: e.target.value }));
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="input-label">To</label>
            <input
              type="date"
              className="input-field w-40"
              value={filters.dateTo}
              onChange={(e) => {
                setFilters((p) => ({ ...p, dateTo: e.target.value }));
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="input-label">Payer</label>
            <select
              className="input-field w-44"
              value={filters.payerId}
              onChange={(e) => {
                setFilters((p) => ({ ...p, payerId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All Payers</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Split Type</label>
            <select
              className="input-field w-36"
              value={filters.splitType}
              onChange={(e) => {
                setFilters((p) => ({
                  ...p,
                  splitType: e.target.value,
                }));
                setPage(1);
              }}
            >
              <option value="">All Types</option>
              {SPLIT_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Currency</label>
            <div className="flex rounded-xl border border-white/10 overflow-hidden h-[46px]">
              {['', 'INR', 'USD'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setFilters((p) => ({ ...p, currency: c }));
                    setPage(1);
                  }}
                  className={`px-3 text-xs font-semibold transition-colors ${
                    filters.currency === c
                      ? 'bg-brand-600 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {c === '' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
          {hasFilters && (
            <button
              className="btn-secondary text-xs py-2 px-3 self-end"
              onClick={() => {
                setFilters({
                  dateFrom: '',
                  dateTo: '',
                  payerId: '',
                  splitType: '',
                  currency: '',
                });
                setPage(1);
              }}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <div className="ml-auto self-end">
            <button className="btn-primary" onClick={onAddExpense}>
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>
        </div>
      </div>

      {/* ── Expense table ──────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <Filter className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-white/40 text-sm">
              {hasFilters
                ? 'No expenses match your filters'
                : 'No expenses yet'}
            </p>
            <button
              className="btn-primary mt-2"
              onClick={onAddExpense}
            >
              <Plus className="w-4 h-4" /> Add First Expense
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Currency</th>
                    <th>Paid By</th>
                    <th>Split</th>
                    <th>Your Share</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => {
                    const payer = memberMap[exp.paidBy];
                    const share = getUserShare(exp);
                    return (
                      <tr key={exp.id}>
                        {/* Date */}
                        <td className="text-white/50 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {fmtDate(exp.expenseDate)}
                          </span>
                        </td>

                        {/* Description */}
                        <td>
                          <Link
                            to={`/expenses/${exp.id}`}
                            className="font-medium text-white hover:text-brand-400 transition-colors hover:underline underline-offset-2"
                          >
                            {exp.description}
                          </Link>
                          {exp.isRecurring && (
                            <span className="ml-2 badge badge-yellow text-[10px] py-0">
                              recurring
                            </span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="font-semibold text-white">
                          {fmt(exp.totalAmount, exp.currency)}
                          {exp.currency === 'USD' &&
                            exp.exchangeRateUsed && (
                              <div className="text-xs text-amber-400/70 mt-0.5">
                                \u2248 {fmt(exp.amountInr, 'INR')}
                              </div>
                            )}
                        </td>

                        {/* Currency badge */}
                        <td>
                          {exp.currency === 'USD' ? (
                            <span className="badge badge-yellow">
                              USD\u2192INR
                              {exp.exchangeRateUsed && (
                                <span className="text-[10px] ml-1 opacity-70">
                                  @
                                  {Number(
                                    exp.exchangeRateUsed
                                  ).toFixed(2)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="badge badge-green">
                              INR
                            </span>
                          )}
                        </td>

                        {/* Payer */}
                        <td>
                          {payer ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar name={payer.name} size="sm" />
                              <span className="text-white/80">
                                {payer.name}
                              </span>
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </td>

                        {/* Split type */}
                        <td>
                          <span
                            className={`${splitBadgeCls(exp.splitType)} capitalize`}
                          >
                            {exp.splitType}
                          </span>
                        </td>

                        {/* Your share */}
                        <td>
                          {share !== null ? (
                            <span
                              className={
                                share === 0
                                  ? 'text-white/30'
                                  : 'text-white font-medium'
                              }
                            >
                              {fmt(share)}
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </td>

                        {/* Arrow */}
                        <td>
                          <Link
                            to={`/expenses/${exp.id}`}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white inline-flex transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-xs text-white/40">
                  Showing{' '}
                  {(page - 1) * PAGE_SIZE + 1}
                  {'\u2013'}
                  {Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  {Array.from(
                    { length: Math.min(totalPages, 7) },
                    (_, i) => {
                      let pg = i + 1;
                      if (totalPages > 7) {
                        // show pages around current
                        const start = Math.max(
                          1,
                          Math.min(page - 3, totalPages - 6)
                        );
                        pg = start + i;
                      }
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            pg === page
                              ? 'bg-brand-600 text-white'
                              : 'text-white/50 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    }
                  )}
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMBERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function MembersTab({ groupId, members, onRefresh }) {
  const [showInvite, setShowInvite] = useState(false);
  const [markingLeft, setMarkingLeft] = useState(null);

  const activeMembers = members.filter((m) => !m.leftAt);
  const pastMembers = members.filter((m) => m.leftAt);

  const MemberCard = ({ m, isPast }) => (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/[0.08] hover:border-white/15 transition-all group">
      <Avatar name={m.name} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{m.name}</p>
        <p className="text-xs text-white/50 truncate">{m.email}</p>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <span className="text-xs text-white/30 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Joined {fmtDate(m.joinedAt)}
          </span>
          {isPast && m.leftAt && (
            <span className="text-xs text-orange-400/70 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Left {fmtDate(m.leftAt)}
            </span>
          )}
        </div>
      </div>
      {!isPast && (
        <button
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity btn-danger text-xs px-3 py-1.5"
          onClick={() => setMarkingLeft(m)}
        >
          Mark as Left
        </button>
      )}
      {isPast && <span className="badge badge-red">Past</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Active members */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <span className="badge-green">{activeMembers.length} active</span>
            Active Members
          </h3>
          <button
            className="btn-primary"
            onClick={() => setShowInvite(true)}
          >
            <Plus className="w-4 h-4" /> Invite Member
          </button>
        </div>
        {activeMembers.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">
            No active members yet.
          </p>
        ) : (
          <div className="space-y-2">
            {activeMembers.map((m) => (
              <MemberCard key={m.id} m={m} isPast={false} />
            ))}
          </div>
        )}
      </div>

      {/* Past members */}
      {pastMembers.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white/60 flex items-center gap-2 mb-4">
            <span className="badge-red">{pastMembers.length} past</span>
            Past Members
          </h3>
          <div className="space-y-2">
            {pastMembers.map((m) => (
              <MemberCard key={m.id} m={m} isPast />
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteMemberModal
          groupId={groupId}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            onRefresh();
          }}
        />
      )}
      {markingLeft && (
        <MarkLeftDialog
          member={markingLeft}
          groupId={groupId}
          onClose={() => setMarkingLeft(null)}
          onMarked={() => {
            setMarkingLeft(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityTab({ groupId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchActivity = useCallback(
    async (pg = 1) => {
      setLoading(true);
      try {
        const res = await groupsApi.getActivity(groupId, {
          page: pg,
          limit: 30,
        });
        const items = res.data.activities || [];
        setActivities((prev) => (pg === 1 ? items : [...prev, ...items]));
        setHasMore(items.length === 30);
      } catch {
        setActivities([]);
      } finally {
        setLoading(false);
      }
    },
    [groupId]
  );

  useEffect(() => {
    fetchActivity(1);
  }, [fetchActivity]);

  if (loading && activities.length === 0) return <Spinner />;

  if (activities.length === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
          <Clock className="w-6 h-6 text-white/20" />
        </div>
        <p className="text-white/40 text-sm">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="relative">
        {/* Timeline connector */}
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

        <div className="space-y-1">
          {activities.map((a) => {
            const config =
              ACTIVITY_CONFIG[a.action] || ACTIVITY_CONFIG.EXPENSE_ADDED;
            const Icon = config.icon;
            return (
              <div key={a.id} className="flex gap-4 py-3">
                <div
                  className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.cls}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 pt-1.5">
                  <p className="text-sm text-white/80 leading-relaxed">
                    {a.description}
                  </p>
                  <p className="text-xs text-white/30 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {fmtDate(a.createdAt)}
                    {a.user?.name && (
                      <span className="ml-1 text-white/40">
                        \u00B7 {a.user.name}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-6">
            <button
              className="btn-secondary text-sm"
              disabled={loading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                fetchActivity(next);
              }}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: GROUP DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = ['Expenses', 'Members', 'Activity'];

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Expenses');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseKey, setExpenseKey] = useState(0);

  const fetchGroup = useCallback(async () => {
    try {
      const res = await groupsApi.get(groupId);
      setGroup(res.data.group || res.data);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [groupId, navigate]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!group) return null;

  // Normalise membership data from the API response
  const members = (group.memberships || []).map((m) => ({
    id: m.userId || m.user?.id,
    name: m.user?.name || 'Unknown',
    email: m.user?.email || '',
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
  }));

  const activeCount = members.filter((m) => !m.leftAt).length;
  const activeMembers = members.filter((m) => !m.leftAt);

  return (
    <div className="min-h-screen">
      {/* ── Page Header ──────────────────────────────── */}
      <div className="border-b border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {/* Back */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>

          {/* Group title + actions */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold gradient-text">
                {group.name}
              </h1>
              <p className="text-white/40 text-sm mt-1.5 flex flex-wrap items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {activeCount} active member
                {activeCount !== 1 ? 's' : ''}
                <span className="text-white/20 mx-1">\u00B7</span>
                <Calendar className="w-3.5 h-3.5" />
                Created {fmtDate(group.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="btn-secondary text-sm"
                onClick={() =>
                  navigate(`/groups/${groupId}/balances`)
                }
              >
                <BarChart2 className="w-4 h-4" /> View Balances
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={() =>
                  navigate(`/groups/${groupId}/import`)
                }
              >
                <Upload className="w-4 h-4" /> Import CSV
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-6 p-1 bg-white/5 rounded-xl border border-white/[0.08] w-fit">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'Expenses' && (
          <ExpensesTab
            key={expenseKey}
            groupId={groupId}
            members={members}
            onAddExpense={() => setShowAddExpense(true)}
          />
        )}
        {activeTab === 'Members' && (
          <MembersTab
            groupId={groupId}
            members={members}
            onRefresh={fetchGroup}
          />
        )}
        {activeTab === 'Activity' && (
          <ActivityTab groupId={groupId} />
        )}
      </div>

      {/* ── Add Expense Modal ────────────────────────── */}
      {showAddExpense && (
        <AddExpenseModal
          groupId={groupId}
          members={activeMembers}
          onClose={() => setShowAddExpense(false)}
          onCreated={() => {
            setShowAddExpense(false);
            setExpenseKey((k) => k + 1);
            setActiveTab('Expenses');
          }}
        />
      )}
    </div>
  );
}
