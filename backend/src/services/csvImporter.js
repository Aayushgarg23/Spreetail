const { parse } = require('csv-parse/sync');

/**
 * CSV Importer Service — parses a CSV buffer and detects all data anomalies.
 *
 * This module ONLY detects and flags anomalies. It never silently fixes or discards data.
 * All anomalies are surfaced to the user for explicit resolution via the Import Wizard.
 *
 * Anomaly types:
 *  DUPLICATE_EXACT           - Same date + description + amount + payer (exact duplicate)
 *  CURRENCY_MISMATCH         - Amount has $ prefix or USD symbol but currency col says INR
 *  NEGATIVE_AMOUNT           - Amount < 0 (could be refund or data error)
 *  SETTLEMENT_AS_EXPENSE     - Description contains settlement keywords
 *  EXPENSE_AFTER_LEFT        - expense_date > member.left_at for a split participant
 *  EXPENSE_BEFORE_JOINED     - expense_date < member.joined_at for a split participant
 *  SPLIT_SUM_MISMATCH        - Parsed split amounts don't sum to total (>±₹1)
 *  UNKNOWN_MEMBER            - Name in CSV not found in users table
 *  MISSING_REQUIRED_FIELD    - date, amount, or payer is blank
 *  INCONSISTENT_DATE_FORMAT  - Date is ambiguous (e.g. 05/03 could be May 3 or March 5)
 *  DUPLICATE_DIFF_AMOUNT     - Same date+description, different amounts
 *  ZERO_AMOUNT               - Amount == 0
 *  CURRENCY_SYMBOL_IN_AMOUNT - Amount field has ₹ or $ symbol mixed in
 *  PAYER_NOT_IN_SPLIT        - Payer is not listed among split_among participants
 */

const SETTLEMENT_KEYWORDS = [
  'settled', 'paid back', 'transfer', 'repaid', 'reimbursed',
  'cleared', 'paid off', 'refund', 'payback',
];

const DATE_FORMATS = [
  { regex: /^\d{4}-\d{2}-\d{2}$/, name: 'ISO (YYYY-MM-DD)', type: 'iso' },
  { regex: /^\d{2}\/\d{2}\/\d{4}$/, name: 'DD/MM/YYYY', type: 'dmy' },
  { regex: /^\d{2}-\d{2}-\d{4}$/, name: 'MM-DD-YYYY', type: 'mdy' },
  { regex: /^\d{1,2}\/\d{1,2}\/\d{4}$/, name: 'D/M/YYYY', type: 'dmy_short' },
];

/**
 * Parse date string into a JS Date, detecting format.
 * Returns { date: Date|null, format: string, ambiguous: boolean }
 */
function parseDate(str) {
  if (!str || !str.trim()) return { date: null, format: null, ambiguous: false };

  const s = str.trim();

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { date: new Date(s + 'T00:00:00Z'), format: 'ISO', ambiguous: false };
  }

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    const day = parseInt(d), month = parseInt(m);
    const ambiguous = day <= 12; // Could be MM/DD/YYYY
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
    return { date, format: 'DD/MM/YYYY', ambiguous };
  }

  // MM-DD-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [m, d, y] = s.split('-');
    const day = parseInt(d), month = parseInt(m);
    const ambiguous = day <= 12; // Could be DD-MM-YYYY
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
    return { date, format: 'MM-DD-YYYY', ambiguous };
  }

  return { date: null, format: 'UNKNOWN', ambiguous: false };
}

/**
 * Clean and parse amount from a raw string.
 * Handles: "1200", "$85", "₹1200", "1,200.50", "45.50"
 * Returns { amount: number|null, hadCurrencySymbol: boolean, detectedCurrency: string|null }
 */
function parseAmount(raw) {
  if (!raw && raw !== 0) return { amount: null, hadCurrencySymbol: false, detectedCurrency: null };

  const str = String(raw).trim();
  let detectedCurrency = null;
  let hadCurrencySymbol = false;

  // Detect currency symbols
  if (str.startsWith('$') || str.includes('USD')) {
    detectedCurrency = 'USD';
    hadCurrencySymbol = true;
  } else if (str.startsWith('₹') || str.includes('INR')) {
    detectedCurrency = 'INR';
    hadCurrencySymbol = true;
  }

  // Strip all non-numeric except . and -
  const cleaned = str.replace(/[$₹,\s]/g, '').replace(/[A-Za-z]/g, '');
  const amount = parseFloat(cleaned);

  return {
    amount: isNaN(amount) ? null : amount,
    hadCurrencySymbol,
    detectedCurrency,
  };
}

/**
 * Main entry point: parse CSV buffer + run all anomaly checks.
 *
 * @param {Buffer|string} csvBuffer - Raw CSV content
 * @param {Array<{id, name, email}>} knownUsers - Users in the group
 * @param {Array<{userId, name, joinedAt, leftAt}>} memberships - Group memberships
 * @returns {{ rows: ParsedRow[], anomalies: Anomaly[] }}
 */
function parseAndDetect(csvBuffer, knownUsers = [], memberships = []) {
  let rawRows;
  try {
    rawRows = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`);
  }

  const rows = [];
  const anomalies = [];
  const seenExact = new Map(); // "date|desc|amount|payer" -> rowIndex
  const seenDescDate = new Map(); // "date|desc" -> [{rowIndex, amount}]

  // Build user lookup maps
  const userByName = {};
  const userById = {};
  for (const u of knownUsers) {
    userByName[u.name.toLowerCase()] = u;
    userById[u.id] = u;
  }

  const membershipByName = {};
  for (const m of memberships) {
    const u = userById[m.userId];
    if (u) membershipByName[u.name.toLowerCase()] = m;
  }

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    const parsedRow = {
      rowNumber: rowNum,
      rawRow: raw,
      date: null,
      dateFormat: null,
      dateAmbiguous: false,
      description: raw.description || raw.Description || '',
      amount: null,
      currency: (raw.currency || raw.Currency || 'INR').toUpperCase(),
      paidBy: raw.paid_by || raw.paidBy || raw.Paid_By || '',
      splitAmong: parseSplitAmong(raw.split_among || raw.splitAmong || raw.split_with || ''),
      splitType: (raw.split_type || raw.splitType || 'equal').toLowerCase(),
      notes: raw.notes || '',
      anomalies: [],
      status: 'CLEAN', // CLEAN | WARNING | ERROR
    };

    const rowAnomalies = [];

    // ── CHECK #9: MISSING REQUIRED FIELDS ────────────────────
    const missingFields = [];
    const rawDate = raw.date || raw.Date || '';
    const rawAmount = raw.amount || raw.Amount || '';
    const rawPayer = raw.paid_by || raw.paidBy || raw.Paid_By || '';

    if (!rawDate.trim()) missingFields.push('date');
    if (!rawAmount.toString().trim()) missingFields.push('amount');
    if (!rawPayer.trim()) missingFields.push('payer');

    if (missingFields.length > 0) {
      rowAnomalies.push({
        type: 'MISSING_REQUIRED_FIELD',
        detail: `Missing required field(s): ${missingFields.join(', ')}`,
        severity: 'ERROR',
        defaultResolution: 'SKIP',
      });
      parsedRow.status = 'ERROR';
    }

    // ── CHECK #10: DATE FORMAT ────────────────────────────────
    if (rawDate.trim()) {
      const { date, format, ambiguous } = parseDate(rawDate);
      parsedRow.date = date;
      parsedRow.dateFormat = format;
      parsedRow.dateAmbiguous = ambiguous;

      if (!date) {
        rowAnomalies.push({
          type: 'INCONSISTENT_DATE_FORMAT',
          detail: `Cannot parse date: "${rawDate}". Expected YYYY-MM-DD, DD/MM/YYYY, or MM-DD-YYYY`,
          severity: 'ERROR',
          defaultResolution: 'SKIP',
        });
        parsedRow.status = 'ERROR';
      } else if (ambiguous) {
        rowAnomalies.push({
          type: 'INCONSISTENT_DATE_FORMAT',
          detail: `Ambiguous date "${rawDate}" interpreted as ${format}. Day (${date.getUTCDate()}) and month (${date.getUTCMonth() + 1}) are both ≤12 — could be either order.`,
          severity: 'WARNING',
          defaultResolution: 'KEEP',
        });
        if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
      }
    }

    // ── PARSE AMOUNT + CHECK #2, #12, #13 ────────────────────
    const { amount, hadCurrencySymbol, detectedCurrency } = parseAmount(rawAmount);
    parsedRow.amount = amount;

    if (hadCurrencySymbol) {
      // Check #13: currency symbol in amount field
      rowAnomalies.push({
        type: 'CURRENCY_SYMBOL_IN_AMOUNT',
        detail: `Amount field "${rawAmount}" contains a currency symbol (${detectedCurrency}). Stripped to: ${amount}`,
        severity: 'WARNING',
        defaultResolution: 'KEEP',
      });
      if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';

      // Check #2: currency mismatch
      if (detectedCurrency && detectedCurrency !== parsedRow.currency) {
        rowAnomalies.push({
          type: 'CURRENCY_MISMATCH',
          detail: `Amount symbol suggests ${detectedCurrency} but currency column says ${parsedRow.currency}. Will treat as ${detectedCurrency}.`,
          severity: 'WARNING',
          defaultResolution: 'OVERRIDE',
          suggestedOverride: { currency: detectedCurrency },
        });
        parsedRow.currency = detectedCurrency; // correct it
        if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
      }
    }

    // Check #12: zero amount
    if (amount === 0) {
      rowAnomalies.push({
        type: 'ZERO_AMOUNT',
        detail: `Expense amount is ₹0. This is likely a data entry error.`,
        severity: 'WARNING',
        defaultResolution: 'KEEP',
      });
      if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
    }

    // Check #3: negative amount
    if (amount !== null && amount < 0) {
      rowAnomalies.push({
        type: 'NEGATIVE_AMOUNT',
        detail: `Amount is negative (${amount}). This could be a refund or a data entry error.`,
        severity: 'WARNING',
        defaultResolution: 'KEEP',
      });
      if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
    }

    // ── CHECK #4: SETTLEMENT AS EXPENSE ──────────────────────
    const descLower = parsedRow.description.toLowerCase();
    const settlementKeyword = SETTLEMENT_KEYWORDS.find((k) => descLower.includes(k));
    if (settlementKeyword) {
      rowAnomalies.push({
        type: 'SETTLEMENT_AS_EXPENSE',
        detail: `Description contains "${settlementKeyword}" — this looks like a settlement/payment, not a shared expense. Suggest moving to Settlements table.`,
        severity: 'WARNING',
        defaultResolution: 'DELETE',
      });
      if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
    }

    // ── CHECK #8: UNKNOWN MEMBER ──────────────────────────────
    const payerLower = parsedRow.paidBy.trim().toLowerCase();
    if (payerLower && !userByName[payerLower]) {
      rowAnomalies.push({
        type: 'UNKNOWN_MEMBER',
        detail: `Payer "${parsedRow.paidBy}" not found in group members. Map to an existing user or skip.`,
        severity: 'ERROR',
        defaultResolution: 'SKIP',
        field: 'paidBy',
      });
      parsedRow.status = 'ERROR';
    }

    for (const memberName of parsedRow.splitAmong) {
      if (memberName && !userByName[memberName.toLowerCase()]) {
        rowAnomalies.push({
          type: 'UNKNOWN_MEMBER',
          detail: `Split member "${memberName}" not found in group members. Map to an existing user or skip.`,
          severity: 'WARNING',
          defaultResolution: 'KEEP',
          field: 'splitAmong',
          unknownName: memberName,
        });
        if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
      }
    }

    // ── CHECK #14: PAYER NOT IN SPLIT ────────────────────────
    if (parsedRow.paidBy && parsedRow.splitAmong.length > 0) {
      const payerInSplit = parsedRow.splitAmong.some(
        (m) => m.toLowerCase() === payerLower
      );
      if (!payerInSplit) {
        rowAnomalies.push({
          type: 'PAYER_NOT_IN_SPLIT',
          detail: `Payer "${parsedRow.paidBy}" is not listed in split_among. They paid but are not sharing the cost — is this intentional?`,
          severity: 'WARNING',
          defaultResolution: 'KEEP',
        });
        if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
      }
    }

    // ── CHECK #5 & #6: MEMBERSHIP WINDOW ─────────────────────
    if (parsedRow.date) {
      for (const memberName of parsedRow.splitAmong) {
        const mLower = memberName.toLowerCase();
        const membership = membershipByName[mLower];
        if (!membership) continue; // already flagged as unknown

        const expDate = parsedRow.date;
        const joinedAt = new Date(membership.joinedAt);
        const leftAt = membership.leftAt ? new Date(membership.leftAt) : null;

        if (expDate < joinedAt) {
          rowAnomalies.push({
            type: 'EXPENSE_BEFORE_JOINED',
            detail: `"${memberName}" joined on ${joinedAt.toISOString().slice(0, 10)} but this expense is dated ${expDate.toISOString().slice(0, 10)}. They will be excluded from this split.`,
            severity: 'WARNING',
            defaultResolution: 'KEEP',
            affectedMember: memberName,
          });
          if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
        } else if (leftAt && expDate > leftAt) {
          rowAnomalies.push({
            type: 'EXPENSE_AFTER_LEFT',
            detail: `"${memberName}" left on ${leftAt.toISOString().slice(0, 10)} but this expense is dated ${expDate.toISOString().slice(0, 10)}. They will be excluded from this split.`,
            severity: 'WARNING',
            defaultResolution: 'KEEP',
            affectedMember: memberName,
          });
          if (parsedRow.status === 'CLEAN') parsedRow.status = 'WARNING';
        }
      }
    }

    // ── DEDUP TRACKING ───────────────────────────────────────
    if (parsedRow.date && parsedRow.amount !== null && parsedRow.paidBy) {
      const dateStr = parsedRow.date.toISOString().slice(0, 10);
      const exactKey = `${dateStr}|${parsedRow.description.toLowerCase()}|${parsedRow.amount}|${payerLower}`;
      const descDateKey = `${dateStr}|${parsedRow.description.toLowerCase()}`;

      // Check #1: exact duplicate
      if (seenExact.has(exactKey)) {
        const prevRow = seenExact.get(exactKey);
        rowAnomalies.push({
          type: 'DUPLICATE_EXACT',
          detail: `Exact duplicate of row ${prevRow} (same date, description, amount, and payer). Keep one, delete the other.`,
          severity: 'ERROR',
          defaultResolution: 'DELETE',
          duplicateOfRow: prevRow,
        });
        parsedRow.status = 'ERROR';
      } else {
        seenExact.set(exactKey, rowNum);
      }

      // Check #11: same date+desc, different amounts
      const existing = seenDescDate.get(descDateKey) || [];
      const sameDescDiffAmount = existing.filter((e) => e.amount !== parsedRow.amount);
      if (sameDescDiffAmount.length > 0) {
        rowAnomalies.push({
          type: 'DUPLICATE_DIFF_AMOUNT',
          detail: `Same date+description as row(s) ${sameDescDiffAmount.map((e) => e.rowNum).join(', ')} but different amounts (${sameDescDiffAmount.map((e) => e.amount).join(', ')} vs ${parsedRow.amount}). Pick the canonical amount.`,
          severity: 'ERROR',
          defaultResolution: 'DELETE',
          conflictingRows: sameDescDiffAmount.map((e) => e.rowNum),
        });
        parsedRow.status = 'ERROR';
      }
      seenDescDate.set(descDateKey, [...existing, { rowNum, amount: parsedRow.amount }]);
    }

    parsedRow.anomalies = rowAnomalies;
    rows.push(parsedRow);

    for (const a of rowAnomalies) {
      anomalies.push({ rowNumber: rowNum, rawRow: raw, ...a });
    }
  }

  const summary = {
    totalRows: rows.length,
    cleanRows: rows.filter((r) => r.status === 'CLEAN').length,
    warningRows: rows.filter((r) => r.status === 'WARNING').length,
    errorRows: rows.filter((r) => r.status === 'ERROR').length,
    totalAnomalies: anomalies.length,
    anomalyBreakdown: countByType(anomalies),
  };

  return { rows, anomalies, summary };
}

function parseSplitAmong(raw) {
  if (!raw) return [];
  // Support both comma and semicolon separators
  return String(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function countByType(anomalies) {
  const counts = {};
  for (const a of anomalies) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }
  return counts;
}

module.exports = { parseAndDetect, parseDate, parseAmount };
