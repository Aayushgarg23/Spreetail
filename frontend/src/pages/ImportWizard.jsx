import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Download,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { importApi } from '../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['Upload', 'Parse & Detect', 'Review Anomalies', 'Confirm', 'Report'];

const RESOLUTION_OPTIONS = [
  { value: 'KEEP', label: 'Keep as-is' },
  { value: 'DELETE', label: 'Delete row' },
  { value: 'SKIP', label: 'Skip (do not import)' },
  { value: 'MERGE', label: 'Merge duplicate' },
  { value: 'OVERRIDE', label: 'Override value' },
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center px-4 py-6">
      {STEPS.map((label, idx) => {
        const isDone = idx < current;
        const isActive = idx === current;
        return (
          <div key={idx} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className={
                  isDone
                    ? 'step-done'
                    : isActive
                    ? 'step-active'
                    : 'step-inactive'
                }
              >
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-white" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                  isActive
                    ? 'text-brand-400'
                    : isDone
                    ? 'text-white/60'
                    : 'text-white/25'
                }`}
              >
                {label}
              </span>
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className={`h-px w-10 sm:w-16 mx-1 sm:mx-2 mb-5 transition-colors duration-300 ${
                  idx < current ? 'bg-brand-500' : 'bg-white/15'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'clean' || status === 'ok')
    return <span className="badge badge-green">&#x2705; Clean</span>;
  if (status === 'warning')
    return <span className="badge badge-yellow">&#x26A0;&#xFE0F; Warning</span>;
  if (status === 'error')
    return <span className="badge badge-red">&#x274C; Error</span>;
  return <span className="badge badge-blue">{status}</span>;
}

// ─── STEP 1 — Upload ──────────────────────────────────────────────────────────

function StepUpload({ groupId, onNext }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      setError('Only .csv files are accepted.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importApi.upload(groupId, file);
      onNext(res.data);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Upload CSV File</h2>
        <p className="text-white/40 text-sm mt-1">Import your expenses from a CSV export</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer ${
          dragging
            ? 'border-brand-400 bg-brand-500/10 scale-[1.01]'
            : file
            ? 'border-emerald-500/50 bg-emerald-500/5 cursor-default'
            : 'border-white/20 hover:border-brand-500/60 hover:bg-brand-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {file ? (
          <div className="space-y-3 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-base truncate max-w-[280px] mx-auto">
                {file.name}
              </p>
              <p className="text-white/40 text-sm mt-0.5">{formatSize(file.size)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
              className="btn-secondary text-xs px-3 py-1.5 mx-auto"
            >
              <RotateCcw className="w-3 h-3" />
              Change File
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
              <Upload className="w-8 h-8 text-white/30" />
            </div>
            <div>
              <p className="text-white font-semibold">
                Drop your <code className="text-brand-400 text-sm">expenses_export.csv</code> here
              </p>
              <p className="text-white/40 text-sm mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-white/25 uppercase tracking-wider">CSV files only</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center gap-2 animate-fade-in">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="btn-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            Next
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}

// ─── STEP 2 — Parse & Detect ──────────────────────────────────────────────────

function StepParseDetect({ sessionId, session, onNext, onBack }) {
  const rows = session?.rows ?? [];
  const cleanCount = rows.filter((r) => r.status?.toLowerCase() === 'clean' || r.status?.toLowerCase() === 'ok').length;
  const warnCount = rows.filter((r) => r.status?.toLowerCase() === 'warning').length;
  const errCount = rows.filter((r) => r.status?.toLowerCase() === 'error').length;

  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Parse &amp; Detect</h2>
        <p className="text-white/40 text-sm mt-1">Reviewing {rows.length} rows from your file</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 justify-center">
        <div className="glass-card px-4 py-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-white/50" />
          <span className="text-white font-bold text-lg">{rows.length}</span>
          <span className="text-white/50 text-sm">Total Rows</span>
        </div>
        <div className="glass-card px-4 py-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400 font-bold text-lg">{cleanCount}</span>
          <span className="text-white/50 text-sm">Clean</span>
        </div>
        <div className="glass-card px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <span className="text-yellow-400 font-bold text-lg">{warnCount}</span>
          <span className="text-white/50 text-sm">Warnings</span>
        </div>
        <div className="glass-card px-4 py-3 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-400" />
          <span className="text-red-400 font-bold text-lg">{errCount}</span>
          <span className="text-white/50 text-sm">Errors</span>
        </div>
      </div>

      {/* Row table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full data-table min-w-[640px]">
            <thead className="sticky top-0 bg-surface-700/90 backdrop-blur-sm z-10">
              <tr>
                <th className="w-12">Row #</th>
                <th>Date</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th>Currency</th>
                <th>Paid By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="relative cursor-default"
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="text-white/40 tabular-nums">{row.rowNumber ?? i + 1}</td>
                  <td className="whitespace-nowrap">{row.parsed?.date ?? row.date ?? '—'}</td>
                  <td className="max-w-[180px] truncate">{row.parsed?.description ?? row.description ?? '—'}</td>
                  <td className="text-right tabular-nums font-medium">{row.parsed?.amount ?? row.amount ?? '—'}</td>
                  <td>{row.parsed?.currency ?? row.currency ?? '—'}</td>
                  <td>{row.parsed?.paidBy ?? row.paidBy ?? row.paid_by ?? '—'}</td>
                  <td>
                    <StatusBadge status={row.status?.toLowerCase()} />
                    {/* Anomaly tooltip */}
                    {hoveredRow === i && row.anomaly && (
                      <div className="absolute right-12 z-20 bg-surface-600 border border-white/20 rounded-xl px-3 py-2 text-xs text-white/80 max-w-[240px] shadow-2xl pointer-events-none">
                        {row.anomaly}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3 justify-between">
        <button onClick={onBack} className="btn-secondary">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button onClick={onNext} className="btn-primary">
          Next: Review Anomalies
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── STEP 3 — Anomaly Review ──────────────────────────────────────────────────

function StepAnomalyReview({ sessionId, session, onRefresh, onNext, onBack }) {
  const anomalies = session?.anomalies ?? [];
  const [filter, setFilter] = useState('all');
  const [resolutions, setResolutions] = useState({});
  const [batchLoading, setBatchLoading] = useState(false);

  const filtered = anomalies.filter((a) => {
    if (filter === 'warnings') return a.severity?.toLowerCase() === 'warning' || a.type?.toLowerCase() === 'warning' || a.anomalyType?.toLowerCase() === 'warning';
    if (filter === 'errors') return a.severity?.toLowerCase() === 'error' || a.type?.toLowerCase() === 'error' || a.anomalyType?.toLowerCase() === 'error';
    if (filter === 'pending')
      return !(resolutions[a.id] || a.resolution);
    return true;
  });

  const unresolvedCount = anomalies.filter(
    (a) => !(resolutions[a.id] || a.resolution)
  ).length;

  const setResolution = async (anomalyId, value) => {
    setResolutions((prev) => ({ ...prev, [anomalyId]: value }));
    try {
      await importApi.resolveAnomaly(sessionId, anomalyId, { resolution: value });
    } catch {
      // optimistic — keep local state
    }
  };

  const batchResolve = async (severity, resolution) => {
    setBatchLoading(true);
    const ids = anomalies
      .filter((a) => a.severity === severity && !(resolutions[a.id] || a.resolution))
      .map((a) => a.id);
    const newRes = {};
    ids.forEach((id) => (newRes[id] = resolution));
    setResolutions((prev) => ({ ...prev, ...newRes }));
    try {
      await importApi.bulkResolve(sessionId, { ids, resolution });
      onRefresh?.();
    } catch {
      // optimistic update stays
    } finally {
      setBatchLoading(false);
    }
  };

  const allResolved = unresolvedCount === 0 || anomalies.length === 0;

  const FILTERS = [
    { key: 'all', label: 'All', count: anomalies.length },
    { key: 'warnings', label: '&#x26A0;&#xFE0F; Warnings', count: anomalies.filter((a) => a.severity?.toLowerCase() === 'warning' || a.type?.toLowerCase() === 'warning' || a.anomalyType?.toLowerCase() === 'warning').length },
    { key: 'errors', label: '&#x274C; Errors', count: anomalies.filter((a) => a.severity?.toLowerCase() === 'error' || a.type?.toLowerCase() === 'error' || a.anomalyType?.toLowerCase() === 'error').length },
    { key: 'pending', label: '&#x23F3; Pending', count: unresolvedCount },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Anomaly Review</h2>
        <p className="text-white/40 text-sm mt-1">
          Resolve all issues before importing
          {unresolvedCount > 0 && (
            <span className="ml-2 badge badge-red">{unresolvedCount} unresolved</span>
          )}
          {allResolved && anomalies.length > 0 && (
            <span className="ml-2 badge badge-green">All resolved</span>
          )}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-brand-600 text-white shadow-glow'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
            }`}
            dangerouslySetInnerHTML={{ __html: `${f.label} (${f.count})` }}
          />
        ))}
      </div>

      {/* Batch resolve buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => batchResolve('warning', 'KEEP')}
          disabled={batchLoading}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5 text-yellow-400" />
          Mark All Warnings as KEEP
        </button>
        <button
          onClick={() => batchResolve('error', 'SKIP')}
          disabled={batchLoading}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          Mark All Errors as SKIP
        </button>
      </div>

      {/* Anomaly cards */}
      {anomalies.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-semibold text-lg">No anomalies detected!</p>
          <p className="text-white/40 text-sm mt-1">Your CSV looks clean. Ready to confirm import.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map((anomaly, i) => {
            const resolved = resolutions[anomaly.id] || anomaly.resolution;
            return (
              <div
                key={anomaly.id ?? i}
                className={`glass-card p-4 space-y-3 transition-all animate-fade-in ${
                  resolved ? 'opacity-60' : ''
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-white/40 font-mono">Row {anomaly.rowNumber ?? i + 1}</span>
                      <span
                        className={`badge text-xs ${
                          (anomaly.severity?.toLowerCase() === 'error' || anomaly.type?.toLowerCase() === 'error' || anomaly.anomalyType?.toLowerCase() === 'error')
                            ? 'badge-red'
                            : (anomaly.severity?.toLowerCase() === 'warning' || anomaly.type?.toLowerCase() === 'warning' || anomaly.anomalyType?.toLowerCase() === 'warning')
                            ? 'badge-yellow'
                            : 'badge-blue'
                        }`}
                      >
                        {anomaly.type ?? anomaly.severity ?? anomaly.anomalyType}
                      </span>
                      {resolved && (
                        <span className="badge badge-green text-xs">{resolved}</span>
                      )}
                    </div>
                    <p className="text-sm text-white/80">{anomaly.message ?? anomaly.description ?? anomaly.anomalyDetail}</p>
                  </div>
                </div>

                {/* Raw row data */}
                {(anomaly.rawData || anomaly.rawRow) && (
                  <div className="bg-surface-700/50 rounded-xl px-3 py-2 text-xs text-white/50 font-mono overflow-x-auto whitespace-nowrap">
                    {typeof (anomaly.rawData || anomaly.rawRow) === 'string'
                      ? (anomaly.rawData || anomaly.rawRow)
                      : Object.entries(anomaly.rawData || anomaly.rawRow)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' | ')}
                  </div>
                )}

                {/* Explanation */}
                {anomaly.explanation && (
                  <p className="text-xs text-white/40 italic">{anomaly.explanation}</p>
                )}

                {/* Resolution dropdown */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-white/50 font-medium flex-shrink-0">Resolution:</label>
                  <select
                    value={resolutions[anomaly.id] || anomaly.resolution || ''}
                    onChange={(e) => setResolution(anomaly.id, e.target.value)}
                    className="input-field py-1.5 text-xs flex-1"
                  >
                    <option value="" disabled>
                      — Select action —
                    </option>
                    {RESOLUTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value} — {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <button onClick={onBack} className="btn-secondary">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!allResolved && anomalies.length > 0}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm Import
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── STEP 4 — Confirm ─────────────────────────────────────────────────────────

function StepConfirm({ sessionId, session, onNext, onBack }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rows = session?.rows ?? [];
  const anomalies = session?.anomalies ?? [];

  const willImport = rows.filter(
    (r) => r.status?.toLowerCase() === 'clean' || r.status?.toLowerCase() === 'ok' || r.resolution === 'KEEP'
  );
  const willSkip = rows.filter(
    (r) => r.resolution === 'SKIP' || r.resolution === 'DELETE'
  );
  const withAnomalies = anomalies.filter((a) => a.resolution && a.resolution !== 'SKIP');

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await importApi.confirm(sessionId);
      onNext(res.data.reportId ?? res.data.report_id ?? sessionId);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Import failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Confirm Import</h2>
        <p className="text-white/40 text-sm mt-1">Review what will happen before executing</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-emerald-400">{willImport.length}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Will Import</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-white/40">{willSkip.length}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Will Skip</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-yellow-400">{withAnomalies.length}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Resolved</p>
        </div>
      </div>

      {/* Rows being imported */}
      {willImport.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Rows being imported</h3>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Row #</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {willImport.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td className="text-white/40 tabular-nums">{row.rowNumber ?? i + 1}</td>
                    <td className="whitespace-nowrap">{row.parsed?.date ?? row.date ?? '—'}</td>
                    <td className="max-w-[160px] truncate">{row.parsed?.description ?? row.description ?? '—'}</td>
                    <td className="text-right tabular-nums text-emerald-400 font-medium">
                      {row.parsed?.amount ?? row.amount ?? '—'}
                    </td>
                  </tr>
                ))}
                {willImport.length > 50 && (
                  <tr>
                    <td colSpan={4} className="text-center text-white/30 text-xs italic py-2">
                      …and {willImport.length - 50} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <button onClick={onBack} disabled={loading} className="btn-secondary">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button onClick={handleExecute} disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Execute Import
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── STEP 5 — Report ──────────────────────────────────────────────────────────

function StepReport({ sessionId, groupId, navigate }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    importApi
      .getReport(sessionId)
      .then((res) => setReport(res.data))
      .catch(() => setError('Could not load import report.'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_report_${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Generating report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center max-w-md mx-auto">
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-400 font-medium">{error}</p>
      </div>
    );
  }

  const imported = report?.imported ?? report?.stats?.imported ?? 0;
  const skipped = report?.skipped ?? report?.stats?.skipped ?? 0;
  const errors = report?.errors ?? report?.stats?.errors ?? 0;
  const rows = report?.rows ?? [];

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Success animation */}
      <div className="text-center space-y-3 animate-slide-up">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto shadow-glow-green">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold gradient-text">Import Complete!</h2>
        <p className="text-white/50 text-sm">Your expenses have been successfully imported.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-emerald-400">{imported}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Imported</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-white/40">{skipped}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Skipped</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-black text-red-400">{errors}</p>
          <p className="text-xs text-white/50 mt-1 font-medium uppercase tracking-wider">Errors</p>
        </div>
      </div>

      {/* Row-by-row result */}
      {rows.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <FileText className="w-4 h-4 text-white/50" />
            <h3 className="text-sm font-semibold text-white">Row Results</h3>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Row #</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="text-white/40 tabular-nums">{row.rowNumber ?? i + 1}</td>
                    <td className="max-w-[180px] truncate">{row.description ?? '—'}</td>
                    <td className="text-right tabular-nums font-medium">{row.amount ?? '—'}</td>
                    <td>
                      <StatusBadge status={row.result ?? row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={downloadReport} className="btn-secondary flex-1 justify-center">
          <Download className="w-4 h-4" />
          Download JSON Report
        </button>
        <button
          onClick={() => navigate(`/groups/${groupId}`)}
          className="btn-secondary flex-1 justify-center"
        >
          <FileText className="w-4 h-4" />
          View Group Expenses
        </button>
        <button
          onClick={() => navigate(`/groups/${groupId}/balances`)}
          className="btn-primary flex-1 justify-center"
        >
          <ChevronRight className="w-4 h-4" />
          View Balances
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);

  const fetchSession = useCallback(async (sid) => {
    if (!sid) return;
    setLoadingSession(true);
    try {
      const res = await importApi.getSession(sid);
      setSession(prev => ({
        ...prev,
        ...res.data.session,
        anomalies: res.data.session.anomalies || prev?.anomalies || []
      }));
    } catch {
      // non-fatal; use cached session data
    } finally {
      setLoadingSession(false);
    }
  }, []);

  // After upload
  const handleUploadDone = async (uploadData) => {
    const sid = uploadData.sessionId ?? uploadData.session_id ?? uploadData.id;
    setSessionId(sid);
    setSession(uploadData);
    setStep(1);
    // Optionally fetch session from DB in background, but uploadData has what we need
    await fetchSession(sid);
  };

  // Step transitions
  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleConfirmDone = (reportId) => {
    if (reportId && reportId !== sessionId) setSessionId(reportId);
    setStep(4);
  };

  const refreshSession = () => {
    if (sessionId) fetchSession(sessionId);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-surface-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(`/groups/${groupId}`)}
            className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Import Expenses</h1>
            <p className="text-xs text-white/40">CSV Import Wizard</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="border-t border-white/5">
          <StepIndicator current={step} />
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {loadingSession && step > 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}

        {!loadingSession && (
          <>
            {step === 0 && (
              <StepUpload groupId={groupId} onNext={handleUploadDone} />
            )}
            {step === 1 && (
              <StepParseDetect
                sessionId={sessionId}
                session={session}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 2 && (
              <StepAnomalyReview
                sessionId={sessionId}
                session={session}
                onRefresh={refreshSession}
                onNext={goNext}
                onBack={goBack}
              />
            )}
            {step === 3 && (
              <StepConfirm
                sessionId={sessionId}
                session={session}
                onNext={handleConfirmDone}
                onBack={goBack}
              />
            )}
            {step === 4 && (
              <StepReport
                sessionId={sessionId}
                groupId={groupId}
                navigate={navigate}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
