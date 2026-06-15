const { createError } = require('../middleware/errorHandler');

/**
 * Split Engine — computes per-member share amounts for an expense.
 *
 * Rounding policy (documented in DECISIONS.md):
 *   When dividing INR amounts that don't divide evenly, the remainder
 *   (always < 1 paisa * n) is assigned to the PAYER's share.
 *   This prevents the sum of shares ever exceeding total_amount.
 *
 * @param {number} totalAmountInr - Total expense amount in INR
 * @param {string} payerId - User ID of the payer (receives the remainder)
 * @param {Array<{userId: string}>} members - Members to split among
 * @param {string} splitType - 'equal' | 'exact' | 'percentage' | 'shares'
 * @param {Object} splitConfig - Additional config depending on split type
 *   For 'exact':      { amounts: { userId: number, ... } }
 *   For 'percentage': { percentages: { userId: number, ... } }
 *   For 'shares':     { units: { userId: number, ... } }
 * @returns {Array<{ userId: string, shareAmount: number, sharePct?: number, shareUnits?: number }>}
 */
function computeSplits(totalAmountInr, payerId, members, splitType, splitConfig = {}) {
  if (!members || members.length === 0) {
    throw createError(400, 'Bad Request', 'At least one member must be specified for split');
  }
  if (totalAmountInr < 0) {
    throw createError(400, 'Bad Request', 'Total amount must be non-negative');
  }

  switch (splitType) {
    case 'equal':
      return computeEqualSplit(totalAmountInr, payerId, members);
    case 'exact':
      return computeExactSplit(totalAmountInr, members, splitConfig);
    case 'percentage':
      return computePercentageSplit(totalAmountInr, payerId, members, splitConfig);
    case 'shares':
      return computeSharesSplit(totalAmountInr, payerId, members, splitConfig);
    default:
      throw createError(400, 'Bad Request', `Unknown split type: ${splitType}. Must be equal|exact|percentage|shares`);
  }
}

// ─── EQUAL SPLIT ──────────────────────────────────────────────
function computeEqualSplit(totalAmountInr, payerId, members) {
  const n = members.length;
  const baseShare = Math.floor((totalAmountInr * 100) / n) / 100; // floor to 2 decimals
  const remainder = parseFloat((totalAmountInr - baseShare * n).toFixed(2));

  return members.map((m) => ({
    userId: m.userId,
    shareAmount: m.userId === payerId
      ? parseFloat((baseShare + remainder).toFixed(2))
      : baseShare,
    sharePct: parseFloat(((1 / n) * 100).toFixed(3)),
    shareUnits: null,
  }));
}

// ─── EXACT SPLIT ──────────────────────────────────────────────
function computeExactSplit(totalAmountInr, members, { amounts = {} }) {
  const memberIds = members.map((m) => m.userId);

  // Validate all members have amounts
  for (const uid of memberIds) {
    if (amounts[uid] === undefined) {
      throw createError(400, 'Bad Request', `Missing exact amount for user ${uid}`);
    }
  }

  const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
  const diff = Math.abs(sum - totalAmountInr);
  if (diff > 1) { // allow ±₹1 rounding tolerance
    throw createError(400, 'Bad Request',
      `Exact amounts sum (₹${sum.toFixed(2)}) must equal total (₹${totalAmountInr}) within ±₹1`
    );
  }

  return members.map((m) => ({
    userId: m.userId,
    shareAmount: parseFloat(Number(amounts[m.userId]).toFixed(2)),
    sharePct: parseFloat(((amounts[m.userId] / totalAmountInr) * 100).toFixed(3)),
    shareUnits: null,
  }));
}

// ─── PERCENTAGE SPLIT ─────────────────────────────────────────
function computePercentageSplit(totalAmountInr, payerId, members, { percentages = {} }) {
  const memberIds = members.map((m) => m.userId);

  for (const uid of memberIds) {
    if (percentages[uid] === undefined) {
      throw createError(400, 'Bad Request', `Missing percentage for user ${uid}`);
    }
  }

  const totalPct = Object.values(percentages).reduce((a, b) => a + b, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw createError(400, 'Bad Request',
      `Percentages must sum to 100% (got ${totalPct.toFixed(2)}%)`
    );
  }

  const shares = members.map((m) => ({
    userId: m.userId,
    shareAmount: Math.floor((totalAmountInr * percentages[m.userId] / 100) * 100) / 100,
    sharePct: parseFloat(Number(percentages[m.userId]).toFixed(3)),
    shareUnits: null,
  }));

  // Assign remainder to payer
  const allocatedSum = shares.reduce((s, sh) => s + sh.shareAmount, 0);
  const remainder = parseFloat((totalAmountInr - allocatedSum).toFixed(2));
  const payerShare = shares.find((s) => s.userId === payerId) || shares[0];
  payerShare.shareAmount = parseFloat((payerShare.shareAmount + remainder).toFixed(2));

  return shares;
}

// ─── SHARES SPLIT ─────────────────────────────────────────────
function computeSharesSplit(totalAmountInr, payerId, members, { units = {} }) {
  const memberIds = members.map((m) => m.userId);

  for (const uid of memberIds) {
    if (units[uid] === undefined) {
      throw createError(400, 'Bad Request', `Missing share units for user ${uid}`);
    }
  }

  const totalUnits = Object.values(units).reduce((a, b) => a + b, 0);
  if (totalUnits <= 0) {
    throw createError(400, 'Bad Request', 'Total share units must be positive');
  }

  const valuePerUnit = totalAmountInr / totalUnits;

  const shares = members.map((m) => ({
    userId: m.userId,
    shareAmount: Math.floor(valuePerUnit * units[m.userId] * 100) / 100,
    sharePct: parseFloat(((units[m.userId] / totalUnits) * 100).toFixed(3)),
    shareUnits: units[m.userId],
  }));

  // Assign remainder to payer
  const allocatedSum = shares.reduce((s, sh) => s + sh.shareAmount, 0);
  const remainder = parseFloat((totalAmountInr - allocatedSum).toFixed(2));
  const payerShare = shares.find((s) => s.userId === payerId) || shares[0];
  payerShare.shareAmount = parseFloat((payerShare.shareAmount + remainder).toFixed(2));

  return shares;
}

module.exports = { computeSplits };
