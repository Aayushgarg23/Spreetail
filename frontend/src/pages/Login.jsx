import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { name: 'Aisha', emoji: '👩🏽' },
  { name: 'Rohan', emoji: '👨🏽' },
  { name: 'Priya', emoji: '👩🏻' },
  { name: 'Meera', emoji: '👩🏾' },
  { name: 'Dev',   emoji: '👨🏻' },
  { name: 'Sam',   emoji: '🧑🏼' },
];

const DEMO_PASSWORD = 'Spreetail@2024';

function Spinner() {
  return (
    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
  );
}

export default function Login() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});
  const [apiError, setApiError] = useState('');

  // Shared fields
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');

  /* ── helpers ──────────────────────────────────────── */
  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setApiError('');
  };

  const fillDemo = (demoName) => {
    setEmail(`${demoName.toLowerCase()}@spreetail.app`);
    setPassword(DEMO_PASSWORD);
    if (mode === 'register') setName(demoName);
    setErrors({});
    setApiError('');
  };

  const validate = () => {
    const e = {};
    if (mode === 'register' && !name.trim())
      e.name = 'Name is required.';
    if (!email.trim())
      e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = 'Enter a valid email address.';
    if (!password)
      e.password = 'Password is required.';
    else if (password.length < 6)
      e.password = 'Password must be at least 6 characters.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      let res;
      if (mode === 'login') {
        res = await authApi.login({ email: email.trim(), password });
      } else {
        res = await authApi.register({ name: name.trim(), email: email.trim(), password });
      }
      const { token, user } = res.data;
      login(token, user);
      navigate('/');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Something went wrong. Please try again.';
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ── render ────────────────────────────────────────── */
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">

      {/* ── Animated gradient background ── */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1040 30%, #0f0f1a 60%, #1a0a2e 100%)',
        }}
      />
      {/* Floating orbs */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-30 animate-pulse-slow"
        style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full opacity-25 animate-pulse-slow"
        style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)', animationDelay: '1s' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 animate-pulse-slow"
        style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)', animationDelay: '2s' }}
      />

      {/* ── Glass card ── */}
      <div className="glass-card w-full max-w-md p-8 animate-slide-up">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-6xl mb-3 select-none drop-shadow-lg">💸</div>
          <h1 className="text-3xl font-extrabold gradient-text tracking-tight">Spreetail</h1>
          <p className="text-white/40 text-sm mt-1 tracking-wide">Split bills. Stay friends.</p>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-6">
          {['login', 'register'].map((tab) => (
            <button
              key={tab}
              onClick={() => switchMode(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${
                mode === tab
                  ? 'bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Demo account chips */}
        <div className="mb-6">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-medium">
            Quick demo — click to fill
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(({ name: demoName, emoji }) => (
              <button
                key={demoName}
                type="button"
                onClick={() => fillDemo(demoName)}
                className="badge badge-purple hover:bg-purple-500/30 transition-all duration-150 cursor-pointer active:scale-95 py-1 px-3"
              >
                {emoji} {demoName}
              </button>
            ))}
          </div>
        </div>

        {/* API error banner */}
        {apiError && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-in">
            {apiError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">

          {/* Name (register only) */}
          {mode === 'register' && (
            <div className="animate-fade-in">
              <label className="input-label">Full Name</label>
              <input
                type="text"
                className={`input-field ${errors.name ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30' : ''}`}
                placeholder="Aisha Sharma"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: '' })); }}
                autoComplete="name"
              />
              {errors.name && (
                <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{errors.name}</p>
              )}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="input-label">Email</label>
            <input
              type="email"
              className={`input-field ${errors.email ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
              autoComplete="email"
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="input-label">Password</label>
            <input
              type="password"
              className={`input-field ${errors.password ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30' : ''}`}
              placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{errors.password}</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-3 text-base mt-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loading ? (
              <>
                <Spinner />
                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : (
              mode === 'login' ? '🔑 Sign In' : '🚀 Create Account'
            )}
          </button>
        </form>

        {/* Switch mode link */}
        <p className="text-center text-white/40 text-sm mt-6">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-brand-400 hover:text-brand-300 font-medium transition-colors duration-150"
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
