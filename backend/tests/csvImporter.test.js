/**
 * Unit tests for csvImporter.js
 * Feeds synthetic bad rows and asserts correct anomaly types.
 */
const { parseAndDetect } = require('../src/services/csvImporter');

const KNOWN_USERS = [
  { id: 'u1', name: 'Aisha', email: 'aisha@test.com' },
  { id: 'u2', name: 'Rohan', email: 'rohan@test.com' },
  { id: 'u3', name: 'Priya', email: 'priya@test.com' },
  { id: 'u4', name: 'Meera', email: 'meera@test.com' },
  { id: 'u5', name: 'Sam', email: 'sam@test.com' },
];

const MEMBERSHIPS = [
  { userId: 'u1', name: 'Aisha', joinedAt: new Date('2026-02-01'), leftAt: null },
  { userId: 'u2', name: 'Rohan', joinedAt: new Date('2026-02-01'), leftAt: null },
  { userId: 'u3', name: 'Priya', joinedAt: new Date('2026-02-01'), leftAt: null },
  { userId: 'u4', name: 'Meera', joinedAt: new Date('2026-02-01'), leftAt: new Date('2026-03-31') },
  { userId: 'u5', name: 'Sam', joinedAt: new Date('2026-04-15'), leftAt: null },
];

function buildCsv(rows) {
  const header = 'date,description,amount,currency,paid_by,split_among,split_type,notes';
  const lines = rows.map((r) => {
    // Quote any field that contains a comma so csv-parse sees 8 columns
    const quote = (v) => {
      const s = String(v ?? '');
      return s.includes(',') ? `"${s}"` : s;
    };
    return [
      quote(r.date),
      quote(r.description),
      quote(r.amount),
      quote(r.currency),
      quote(r.paid_by),
      quote(r.split_among),   // ← multi-member lists need quoting
      quote(r.split_type),
      quote(r.notes || ''),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

describe('csvImporter — anomaly detection', () => {
  test('#9: Missing required field (date missing)', () => {
    const csv = buildCsv([
      { date: '', description: 'Groceries', amount: '1200', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('MISSING_REQUIRED_FIELD');
  });

  test('#3: Negative amount', () => {
    const csv = buildCsv([
      { date: '2026-03-15', description: 'Refund', amount: '-500', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('NEGATIVE_AMOUNT');
  });

  test('#12: Zero amount', () => {
    const csv = buildCsv([
      { date: '2026-04-20', description: 'Empty entry', amount: '0', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('ZERO_AMOUNT');
  });

  test('#4: Settlement as expense (keyword: "settled")', () => {
    const csv = buildCsv([
      { date: '2026-04-01', description: 'Aisha settled with Rohan', amount: '2300', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('SETTLEMENT_AS_EXPENSE');
  });

  test('#4: Settlement as expense (keyword: "paid back")', () => {
    const csv = buildCsv([
      { date: '2026-04-12', description: 'Rohan paid back Priya', amount: '1800', currency: 'INR', paid_by: 'Rohan', split_among: 'Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('SETTLEMENT_AS_EXPENSE');
  });

  test('#8: Unknown member in payer', () => {
    const csv = buildCsv([
      { date: '2026-05-22', description: 'Groceries', amount: '1300', currency: 'INR', paid_by: 'Devraj', split_among: 'Aisha,Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('UNKNOWN_MEMBER');
  });

  test('#1: Exact duplicate detection', () => {
    const row = { date: '2026-03-14', description: 'Groceries', amount: '1250', currency: 'INR', paid_by: 'Priya', split_among: 'Aisha,Rohan,Priya,Meera', split_type: 'equal' };
    const csv = buildCsv([row, row]); // Same row twice
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('DUPLICATE_EXACT');
  });

  test('#11: Duplicate with different amounts', () => {
    const csv = buildCsv([
      { date: '2026-05-12', description: 'Dinner out', amount: '2800', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan,Priya,Sam', split_type: 'equal' },
      { date: '2026-05-12', description: 'Dinner out', amount: '3100', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan,Priya,Sam', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('DUPLICATE_DIFF_AMOUNT');
  });

  test('#2 + #13: Currency mismatch ($ in amount field)', () => {
    const csv = buildCsv([
      { date: '2026-03-10', description: 'Dev visit dinner', amount: '$85', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('CURRENCY_SYMBOL_IN_AMOUNT');
    expect(types).toContain('CURRENCY_MISMATCH');
  });

  test('#5: Expense after member left (Meera left 2026-03-31)', () => {
    const csv = buildCsv([
      { date: '2026-04-05', description: 'April groceries', amount: '1200', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan,Priya,Meera', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('EXPENSE_AFTER_LEFT');
  });

  test('#6: Expense before member joined (Sam joined 2026-04-15)', () => {
    const csv = buildCsv([
      { date: '2026-04-10', description: 'Pre-Sam dinner', amount: '1200', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan,Sam', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('EXPENSE_BEFORE_JOINED');
  });

  test('#10: Ambiguous date format (DD/MM/YYYY where day <= 12)', () => {
    const csv = buildCsv([
      { date: '05/01/2026', description: 'Groceries', amount: '1250', currency: 'INR', paid_by: 'Rohan', split_among: 'Aisha,Rohan', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('INCONSISTENT_DATE_FORMAT');
  });

  test('#14: Payer not in split', () => {
    const csv = buildCsv([
      { date: '2026-04-30', description: 'Refund for Meera', amount: '800', currency: 'INR', paid_by: 'Aisha', split_among: 'Meera', split_type: 'equal' },
    ]);
    const { anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    const types = anomalies.map((a) => a.type);
    expect(types).toContain('PAYER_NOT_IN_SPLIT');
  });

  test('Clean row produces no anomalies', () => {
    const csv = buildCsv([
      { date: '2026-02-01', description: 'Groceries', amount: '1200', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan,Priya,Meera', split_type: 'equal' },
    ]);
    const { rows, anomalies } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    expect(rows[0].status).toBe('CLEAN');
    expect(anomalies).toHaveLength(0);
  });

  test('Summary counts are correct', () => {
    const csv = buildCsv([
      // Clean
      { date: '2026-02-01', description: 'Groceries', amount: '1200', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha,Rohan', split_type: 'equal' },
      // Warning (zero amount)
      { date: '2026-04-20', description: 'Zero entry', amount: '0', currency: 'INR', paid_by: 'Aisha', split_among: 'Aisha', split_type: 'equal' },
      // Error (missing date)
      { date: '', description: 'No date', amount: '500', currency: 'INR', paid_by: 'Rohan', split_among: 'Rohan', split_type: 'equal' },
    ]);
    const { summary } = parseAndDetect(csv, KNOWN_USERS, MEMBERSHIPS);
    expect(summary.totalRows).toBe(3);
    expect(summary.cleanRows).toBe(1);
    expect(summary.warningRows).toBe(1);
    expect(summary.errorRows).toBe(1);
  });
});
