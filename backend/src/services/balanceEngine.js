const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Balance Engine — computes net balances and minimal settlement plan.
 *
 * Algorithm:
 * 1. Fetch memberships (with joined_at, left_at) for all group members.
 * 2. Fetch all non-deleted expenses + their splits.
 * 3. For each expense:
 *    - Credit the payer the full amount_inr.
 *    - For each split participant: check if expense_date falls within their membership window.
 *      If YES → debit them their share_amount.
 *      If NO  → the split is excluded (their share is NOT redistributed; it's noted as anomaly).
 * 4. Net balance per user = total paid - total owed.
 * 5. Run greedy debt simplification to produce minimal transaction list.
 *
 * Membership window policy (per DECISIONS.md):
 *   A member is liable for expenses where:
 *     membership.joined_at <= expense.expense_date AND
 *     (membership.left_at IS NULL OR expense.expense_date <= membership.left_at)
 */

/**
 * Compute balances for a group.
 *
 * @param {string} groupId
 * @returns {Promise<{
 *   balances: Array<{userId, name, email, netBalance, totalPaid, totalOwed}>,
 *   drillDown: Object<userId, Array<{expenseId, description, date, shareAmount, type}>>,
 *   settlements: Array<{from, to, amount, fromName, toName}>
 * }>}
 */
async function computeBalances(groupId) {
  // 1. Fetch memberships
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const membershipMap = {}; // userId -> membership
  for (const m of memberships) {
    membershipMap[m.userId] = m;
  }

  // 2. Fetch all non-deleted expenses with splits
  const expenses = await prisma.expense.findMany({
    where: { groupId, isDeleted: false },
    include: {
      splits: true,
      payer: { select: { id: true, name: true } },
    },
    orderBy: { expenseDate: 'asc' },
  });

  // 3. Accumulate balances
  // paid[userId] = total amount this user has paid
  // owed[userId] = total amount this user owes (based on splits)
  const paid = {};
  const owed = {};
  const drillDown = {}; // userId -> [{expenseId, description, ...}]

  for (const uid of Object.keys(membershipMap)) {
    paid[uid] = 0;
    owed[uid] = 0;
    drillDown[uid] = [];
  }

  for (const expense of expenses) {
    const expenseDate = new Date(expense.expenseDate);
    const payerId = expense.paidBy;
    const amountInr = Number(expense.amountInr);

    // Credit payer — but only if payer is a group member
    if (paid[payerId] !== undefined) {
      paid[payerId] += amountInr;
      drillDown[payerId].push({
        expenseId: expense.id,
        description: expense.description,
        date: expense.expenseDate,
        shareAmount: amountInr,
        currency: expense.currency,
        type: 'PAID',
      });
    }

    // Debit each split participant — filtered by membership window
    for (const split of expense.splits) {
      const uid = split.userId;
      const membership = membershipMap[uid];

      if (!membership) continue; // user not in group at all — skip

      // Membership window check
      const joinedAt = new Date(membership.joinedAt);
      const leftAt = membership.leftAt ? new Date(membership.leftAt) : null;

      const inWindow =
        expenseDate >= joinedAt && (leftAt === null || expenseDate <= leftAt);

      if (inWindow) {
        owed[uid] += Number(split.shareAmount);
        drillDown[uid].push({
          expenseId: expense.id,
          description: expense.description,
          date: expense.expenseDate,
          shareAmount: Number(split.shareAmount),
          currency: expense.currency,
          type: 'OWED',
        });
      }
    }
  }

  // 4. Also account for settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      payer: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
    },
  });

  for (const s of settlements) {
    // Settlement reduces the from_user's debt (they paid) and reduces to_user's credit
    if (paid[s.fromUser] !== undefined) paid[s.fromUser] += Number(s.amount);
    if (owed[s.toUser] !== undefined) owed[s.toUser] += Number(s.amount);
  }

  // 5. Compute net balances
  const balances = memberships.map((m) => {
    const uid = m.userId;
    const netBalance = parseFloat(((paid[uid] || 0) - (owed[uid] || 0)).toFixed(2));
    return {
      userId: uid,
      name: m.user.name,
      email: m.user.email,
      netBalance,
      totalPaid: parseFloat((paid[uid] || 0).toFixed(2)),
      totalOwed: parseFloat((owed[uid] || 0).toFixed(2)),
      isActive: !m.leftAt,
    };
  });

  // 6. Debt simplification (greedy)
  const simplifiedDebts = simplifyDebts(balances);

  return { balances, drillDown, settlements: simplifiedDebts };
}

/**
 * Greedy debt simplification algorithm.
 * Produces the minimum number of transactions to settle all debts.
 *
 * Why greedy (per DECISIONS.md): O(n log n), deterministic, easy to explain,
 * and minimizes transaction count for typical group sizes (< 20 people).
 *
 * @param {Array<{userId, name, netBalance}>} balances
 * @returns {Array<{from, fromName, to, toName, amount}>}
 */
function simplifyDebts(balances) {
  // Creditors: positive balance (owed money)
  // Debtors: negative balance (owe money)
  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ userId: b.userId, name: b.name, amount: b.netBalance }))
    .sort((a, b) => b.amount - a.amount); // largest first

  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ userId: b.userId, name: b.name, amount: -b.netBalance }))
    .sort((a, b) => b.amount - a.amount); // largest first

  const transactions = [];

  let ci = 0; // creditor index
  let di = 0; // debtor index

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];

    const settleAmount = Math.min(creditor.amount, debtor.amount);

    if (settleAmount > 0.01) {
      transactions.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: parseFloat(settleAmount.toFixed(2)),
      });
    }

    creditor.amount -= settleAmount;
    debtor.amount -= settleAmount;

    if (creditor.amount < 0.01) ci++;
    if (debtor.amount < 0.01) di++;
  }

  return transactions;
}

module.exports = { computeBalances, simplifyDebts };
