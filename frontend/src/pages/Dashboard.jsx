import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { groupsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  Plus,
  ArrowRight,
  LogOut,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react';

/* ── helpers ──────────────────────────────────────────────── */
function getInitials(name = '') {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatRupee(amount) {
  return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

/* ── Sub-components ───────────────────────────────────────── */
function Spinner({ size = 'md' }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <span
      className={`${cls} border-2 border-white/30 border-t-white rounded-full animate-spin inline-block`}
    />
  );
}

function BalanceBadge({ balance }) {
  if (balance > 0) {
    return (
      <span className="badge-green flex items-center gap-1">
        <TrendingUp size={12} />
        You're owed {formatRupee(balance)}
      </span>
    );
  }
  if (balance < 0) {
    return (
      <span className="badge-red flex items-center gap-1">
        <TrendingDown size={12} />
        You owe {formatRupee(balance)}
      </span>
    );
  }
  return (
    <span className="badge bg-white/10 text-white/50 border border-white/10 flex items-center gap-1">
      <DollarSign size={12} />
      Settled up
    </span>
  );
}

function GroupCard({ group, index }) {
  const memberCount  = group.memberCount  ?? group.members?.length ?? 0;
  const activeCount  = group.activeCount  ?? memberCount;
  const expenseCount = group.expenseCount ?? 0;
  const balance      = group.myBalance    ?? 0;

  return (
    <div
      className="glass-card p-5 flex flex-col gap-4 hover:border-brand-500/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow animate-slide-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center shrink-0 shadow-glow">
            <Users size={18} className="text-white" />
          </div>
          <h3 className="font-bold text-white text-base leading-tight truncate">{group.name}</h3>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-white/50">
        <span className="flex items-center gap-1">
          <Users size={12} className="text-brand-400" />
          {activeCount}/{memberCount} members
        </span>
        <span className="w-px h-3 bg-white/10" />
        <span className="flex items-center gap-1">
          <DollarSign size={12} className="text-purple-400" />
          {expenseCount} expense{expenseCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Balance chip */}
      <BalanceBadge balance={balance} />

      {/* Action */}
      <Link
        to={`/groups/${group._id ?? group.id}`}
        className="btn-secondary w-full justify-center text-sm py-2 mt-auto"
      >
        View Group
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="text-7xl mb-4 select-none">🏝️</div>
      <h3 className="text-xl font-bold text-white/80 mb-2">No groups yet</h3>
      <p className="text-white/40 text-sm mb-6 text-center max-w-xs">
        Create your first group to start splitting bills with friends and family.
      </p>
      <button onClick={onCreate} className="btn-primary">
        <Plus size={16} />
        Create your first group
      </button>
    </div>
  );
}

/* ── Create Group Modal ───────────────────────────────────── */
function CreateGroupModal({ onClose, onCreated }) {
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) { setError('Group name is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await groupsApi.create({ name: groupName.trim() });
      onCreated(res.data.group ?? res.data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to create group.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdrop}
    >
      <div className="glass-card w-full max-w-sm p-6 animate-slide-up">
        <h2 className="text-xl font-bold text-white mb-1">Create a Group</h2>
        <p className="text-white/40 text-sm mb-5">Give your group a memorable name.</p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="input-label">Group Name</label>
            <input
              type="text"
              className={`input-field ${error ? 'border-red-500/60' : ''}`}
              placeholder="e.g. Goa Trip 2026"
              value={groupName}
              autoFocus
              onChange={(e) => { setGroupName(e.target.value); setError(''); }}
            />
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 justify-center disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {loading ? <Spinner size="sm" /> : <Plus size={15} />}
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Dashboard ───────────────────────────────────────── */
export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const [groups, setGroups]         = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showModal, setShowModal]   = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true);
    setFetchError('');
    try {
      const res = await groupsApi.list();
      setGroups(res.data.groups ?? res.data ?? []);
    } catch (err) {
      setFetchError(
        err?.response?.data?.message || 'Could not load groups. Please refresh.'
      );
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleGroupCreated = (newGroup) => {
    setShowModal(false);
    setGroups((prev) => [newGroup, ...prev]);
  };

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  /* ── render ── */
  return (
    <div className="min-h-screen">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-md bg-surface-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 select-none">
            <span className="text-2xl">💸</span>
            <span className="text-lg font-extrabold gradient-text tracking-tight">Spreetail</span>
          </div>

          {/* Right: user + logout */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-glow shrink-0">
                {getInitials(user?.name)}
              </div>
              <span className="hidden sm:block text-sm font-medium text-white/80 max-w-[120px] truncate">
                {user?.name}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              title="Logout"
              className="btn-secondary py-1.5 px-3 text-white/60 hover:text-white"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Hero */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10 animate-slide-up">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-1">
              Welcome back,{' '}
              <span className="gradient-text">{firstName}!</span>
            </h1>
            <p className="text-white/40 text-sm">
              {groups.length > 0
                ? `You have ${groups.length} group${groups.length !== 1 ? 's' : ''}.`
                : 'Create a group to get started.'}
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="btn-primary shrink-0 self-start sm:self-auto"
          >
            <Plus size={16} />
            Create Group
          </button>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-in flex items-center gap-3">
            <span>⚠️</span>
            <span>{fetchError}</span>
            <button
              onClick={fetchGroups}
              className="ml-auto text-red-400 hover:text-red-300 text-xs underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loadingGroups ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-5 space-y-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10" />
                  <div className="h-4 bg-white/10 rounded-lg w-32" />
                </div>
                <div className="h-3 bg-white/10 rounded-lg w-24" />
                <div className="h-6 bg-white/10 rounded-full w-36" />
                <div className="h-9 bg-white/10 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.length === 0 ? (
              <EmptyState onCreate={() => setShowModal(true)} />
            ) : (
              groups.map((group, i) => (
                <GroupCard
                  key={group._id ?? group.id ?? i}
                  group={group}
                  index={i}
                />
              ))
            )}
          </div>
        )}
      </main>

      {/* ── Create Group Modal ── */}
      {showModal && (
        <CreateGroupModal
          onClose={() => setShowModal(false)}
          onCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}
