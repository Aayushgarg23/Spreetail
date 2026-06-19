import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Trash2, DollarSign, Calendar, User, Tag,
  AlertTriangle, CheckCircle, ExternalLink
} from 'lucide-react';
import { expensesApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const SPLIT_TYPE_LABELS = {
  equal: 'Equal Split',
  exact: 'Exact Amounts',
  percentage: 'By Percentage',
  shares: 'By Shares',
};

const SPLIT_TYPE_COLORS = {
  equal: 'badge-blue',
  exact: 'badge-purple',
  percentage: 'badge-green',
  shares: 'badge-yellow',
};

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name = '') {
  const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 55%, 40%)`;
}

export default function ExpenseDetail() {
  const { expenseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    fetchExpense();
  }, [expenseId]);

  async function fetchExpense() {
    try {
      setLoading(true);
      const res = await expensesApi.get(expenseId);
      setExpense(res.data.expense);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expense');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      await expensesApi.delete(expenseId);
      setDeleted(true);
      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete expense');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Loading expense...</p>
        </div>
      </div>
    );
  }

  if (error && !expense) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <button onClick={() => navigate(-1)} className="btn-secondary">← Go Back</button>
        </div>
      </div>
    );
  }

  if (!expense) return null;

  const isUSD = expense.currency === 'USD';
  const payer = expense.payer;
  const splits = expense.splits || [];
  const amountInr = parseFloat(expense.amountInr);
  const totalAmount = parseFloat(expense.totalAmount);
  const rate = expense.exchangeRateUsed ? parseFloat(expense.exchangeRateUsed) : null;

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-surface-900/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="btn-secondary p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Expense Detail</p>
            <h1 className="text-lg font-bold text-white truncate">{expense.description}</h1>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fade-in">

        {/* Deleted banner */}
        {deleted && (
          <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-emerald-300 text-sm font-medium">Expense deleted successfully. Redirecting…</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="glass-card p-4 border border-red-500/30 bg-red-500/10 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Header card */}
        <div className="glass-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-3xl font-extrabold gradient-text mb-1">{expense.description}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`badge ${SPLIT_TYPE_COLORS[expense.splitType] || 'badge-blue'}`}>
                  {SPLIT_TYPE_LABELS[expense.splitType] || expense.splitType}
                </span>
                {isUSD && (
                  <span className="badge badge-yellow">
                    <DollarSign className="w-3 h-3" /> USD Expense
                  </span>
                )}
                {expense.isRecurring && (
                  <span className="badge badge-purple">🔁 Recurring</span>
                )}
                {expense.isDeleted && (
                  <span className="badge badge-red">🗑️ Deleted</span>
                )}
              </div>
            </div>
            {!expense.isDeleted && (
              <button
                onClick={() => setDeleteModal(true)}
                className="btn-danger"
                title="Soft delete this expense"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Amount */}
            <div className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                <DollarSign className="w-3.5 h-3.5" /> Amount
              </div>
              <p className="text-2xl font-bold text-white">
                ₹{amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              {isUSD && (
                <p className="text-xs text-white/40 mt-0.5">
                  ${totalAmount.toFixed(2)} USD
                </p>
              )}
            </div>

            {/* Date */}
            <div className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                <Calendar className="w-3.5 h-3.5" /> Date
              </div>
              <p className="text-lg font-semibold text-white">
                {new Date(expense.expenseDate).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>

            {/* Paid By */}
            <div className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                <User className="w-3.5 h-3.5" /> Paid By
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: getAvatarColor(payer?.name) }}
                >
                  {getInitials(payer?.name)}
                </div>
                <p className="text-sm font-semibold text-white truncate">{payer?.name}</p>
              </div>
            </div>

            {/* Group */}
            <div className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                <Tag className="w-3.5 h-3.5" /> Group
              </div>
              {expense.group && (
                <Link
                  to={`/groups/${expense.group.id}`}
                  className="flex items-center gap-1 text-brand-400 hover:text-brand-300 text-sm font-semibold transition-colors"
                >
                  {expense.group.name}
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* USD Conversion Banner */}
        {isUSD && rate && (
          <div className="glass-card p-5 border border-amber-500/25 bg-amber-500/5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <DollarSign className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-300 mb-1">Currency Conversion</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded">
                    ${totalAmount.toFixed(2)} USD
                  </span>
                  <span className="text-white/40">×</span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded">
                    ₹{rate.toFixed(4)}
                  </span>
                  <span className="text-white/40">=</span>
                  <span className="font-mono bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded font-bold">
                    ₹{amountInr.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-white/40 mt-1.5">
                  Historical rate on {new Date(expense.expenseDate).toLocaleDateString('en-IN')} via frankfurter.app
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Split Breakdown */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="text-base font-bold text-white">Split Breakdown</h3>
            <p className="text-xs text-white/40 mt-0.5">
              {splits.length} participant{splits.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th className="text-right">Share Amount</th>
                  <th className="text-right">Share %</th>
                  {expense.splitType === 'shares' && <th className="text-right">Units</th>}
                </tr>
              </thead>
              <tbody>
                {splits.map((split) => {
                  const isPayer = split.userId === payer?.id;
                  const shareAmt = parseFloat(split.shareAmount);
                  const sharePct = split.sharePct ? parseFloat(split.sharePct) : null;

                  return (
                    <tr key={split.id} className={isPayer ? 'bg-emerald-500/5' : ''}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: getAvatarColor(split.user?.name) }}
                          >
                            {getInitials(split.user?.name)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {split.user?.name}
                              {split.userId === user?.id && (
                                <span className="ml-1 text-xs text-brand-400">(you)</span>
                              )}
                            </p>
                            <p className="text-xs text-white/40">{split.user?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {isPayer ? (
                          <span className="badge badge-green">Paid</span>
                        ) : (
                          <span className="badge badge-blue">Owes</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className={`font-bold ${isPayer ? 'text-emerald-400' : 'text-white'}`}>
                          ₹{shareAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="text-right text-white/60 text-sm">
                        {sharePct !== null ? `${sharePct.toFixed(1)}%` : '—'}
                      </td>
                      {expense.splitType === 'shares' && (
                        <td className="text-right text-white/60 text-sm">
                          {split.shareUnits ?? '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td colSpan={expense.splitType === 'shares' ? 4 : 3} className="px-4 py-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Total</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-white">
                      ₹{amountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  {expense.splitType === 'shares' && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-white/40">
          <div className="glass-card p-3">
            <p className="uppercase tracking-wider mb-1">Expense ID</p>
            <p className="font-mono text-white/60 truncate">{expense.id}</p>
          </div>
          <div className="glass-card p-3">
            <p className="uppercase tracking-wider mb-1">Created</p>
            <p className="text-white/60">
              {new Date(expense.createdAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          {expense.isDeleted && (
            <div className="glass-card p-3 border border-red-500/20">
              <p className="uppercase tracking-wider mb-1 text-red-400">Deleted At</p>
              <p className="text-red-300">
                {expense.deletedAt
                  ? new Date(expense.deletedAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDeleteModal(false)}
        >
          <div
            className="glass-card p-6 w-full max-w-sm animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-red-500/20">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Expense?</h3>
            </div>
            <p className="text-sm text-white/60 mb-2">
              This will soft-delete <span className="text-white font-medium">"{expense.description}"</span>.
            </p>
            <p className="text-xs text-white/40 mb-6">
              The record is never permanently deleted — it's marked as deleted with an audit trail.
              Balances will be recalculated automatically.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => setDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-danger flex-1 justify-center"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
