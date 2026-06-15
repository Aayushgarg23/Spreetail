const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { computeSplits } = require('../services/splitEngine');
const { convertToInr } = require('../services/currencyService');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

// ─── GET /api/groups/:groupId/expenses ───────────────────────
router.get('/:groupId/expenses', authenticate, async (req, res) => {
  const { groupId } = req.params;
  const { startDate, endDate, paidBy, splitType, currency, page = 1, limit = 50 } = req.query;

  // Check membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const where = { groupId, isDeleted: false };
  if (startDate) where.expenseDate = { ...where.expenseDate, gte: new Date(startDate) };
  if (endDate) where.expenseDate = { ...where.expenseDate, lte: new Date(endDate) };
  if (paidBy) where.paidBy = paidBy;
  if (splitType) where.splitType = splitType;
  if (currency) where.currency = currency.toUpperCase();

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        payer: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { expenseDate: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    }),
    prisma.expense.count({ where }),
  ]);

  res.json({ expenses, total, page: parseInt(page), limit: parseInt(limit) });
});

// ─── POST /api/groups/:groupId/expenses ──────────────────────
router.post('/:groupId/expenses', authenticate, async (req, res) => {
  const { groupId } = req.params;
  const {
    description,
    totalAmount,
    currency = 'INR',
    splitType,
    paidBy,
    expenseDate,
    splitConfig = {},
    members,
    isRecurring = false,
    recurringInterval = null,
  } = req.body;

  // Validation
  if (!description) throw createError(400, 'Bad Request', 'description is required');
  if (totalAmount === undefined || totalAmount === null) throw createError(400, 'Bad Request', 'totalAmount is required');
  if (totalAmount < 0) throw createError(400, 'Bad Request', 'totalAmount cannot be negative');
  if (!splitType) throw createError(400, 'Bad Request', 'splitType is required');
  if (!paidBy) throw createError(400, 'Bad Request', 'paidBy is required');
  if (!expenseDate) throw createError(400, 'Bad Request', 'expenseDate is required');
  if (!members || members.length === 0) throw createError(400, 'Bad Request', 'At least one member required');

  // Check group membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  // Currency conversion
  const { amountInr, rate: exchangeRateUsed } = await convertToInr(
    Number(totalAmount), currency.toUpperCase(), expenseDate
  );

  // Compute splits
  const splitMembers = members.map((userId) => ({ userId }));
  const splits = computeSplits(amountInr, paidBy, splitMembers, splitType, splitConfig);

  // Create expense + splits in a transaction
  const expense = await prisma.$transaction(async (tx) => {
    const exp = await tx.expense.create({
      data: {
        groupId,
        description,
        totalAmount: Number(totalAmount),
        currency: currency.toUpperCase(),
        amountInr,
        exchangeRateUsed: currency.toUpperCase() !== 'INR' ? exchangeRateUsed : null,
        splitType,
        paidBy,
        expenseDate: new Date(expenseDate),
        isRecurring,
        recurringInterval,
      },
    });

    await tx.expenseSplit.createMany({
      data: splits.map((s) => ({
        expenseId: exp.id,
        userId: s.userId,
        shareAmount: s.shareAmount,
        sharePct: s.sharePct,
        shareUnits: s.shareUnits,
      })),
    });

    // Activity log
    await tx.activityLog.create({
      data: {
        groupId,
        userId: req.user.id,
        action: 'EXPENSE_ADDED',
        description: `${req.user.name} added "${description}" ₹${amountInr.toFixed(2)}`,
        metadata: { expenseId: exp.id, amount: amountInr, currency, splitType },
      },
    });

    return exp;
  });

  const fullExpense = await prisma.expense.findUnique({
    where: { id: expense.id },
    include: {
      payer: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  res.status(201).json({ expense: fullExpense });
});

// ─── GET /api/expenses/:id ───────────────────────────────────
router.get('/expenses/:id', authenticate, async (req, res) => {
  const expense = await prisma.expense.findUnique({
    where: { id: req.params.id },
    include: {
      payer: { select: { id: true, name: true, email: true } },
      splits: { include: { user: { select: { id: true, name: true, email: true } } } },
      group: { select: { id: true, name: true } },
    },
  });

  if (!expense || expense.isDeleted) {
    throw createError(404, 'Not Found', 'Expense not found');
  }

  // Check group membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: expense.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  res.json({ expense });
});

// ─── PATCH /api/expenses/:id ─────────────────────────────────
router.patch('/expenses/:id', authenticate, async (req, res) => {
  const { description, totalAmount, currency, expenseDate, splitType, paidBy, members, splitConfig } = req.body;

  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) throw createError(404, 'Not Found', 'Expense not found');

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: existing.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const newCurrency = currency || existing.currency;
  const newAmount = totalAmount !== undefined ? Number(totalAmount) : Number(existing.totalAmount);
  const newDate = expenseDate || existing.expenseDate;

  const { amountInr, rate: exchangeRateUsed } = await convertToInr(newAmount, newCurrency, newDate);

  const updated = await prisma.$transaction(async (tx) => {
    const exp = await tx.expense.update({
      where: { id: req.params.id },
      data: {
        description: description || existing.description,
        totalAmount: newAmount,
        currency: newCurrency,
        amountInr,
        exchangeRateUsed: newCurrency !== 'INR' ? exchangeRateUsed : null,
        splitType: splitType || existing.splitType,
        paidBy: paidBy || existing.paidBy,
        expenseDate: new Date(newDate),
      },
    });

    if (members && members.length > 0) {
      await tx.expenseSplit.deleteMany({ where: { expenseId: exp.id } });
      const splits = computeSplits(amountInr, paidBy || existing.paidBy,
        members.map((uid) => ({ userId: uid })), splitType || existing.splitType, splitConfig || {});
      await tx.expenseSplit.createMany({
        data: splits.map((s) => ({ expenseId: exp.id, userId: s.userId, shareAmount: s.shareAmount, sharePct: s.sharePct, shareUnits: s.shareUnits })),
      });
    }

    await tx.activityLog.create({
      data: {
        groupId: existing.groupId,
        userId: req.user.id,
        action: 'EXPENSE_UPDATED',
        description: `${req.user.name} updated "${exp.description}"`,
        metadata: { expenseId: exp.id },
      },
    });

    return exp;
  });

  res.json({ expense: updated });
});

// ─── DELETE /api/expenses/:id (soft delete) ──────────────────
router.delete('/expenses/:id', authenticate, async (req, res) => {
  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) throw createError(404, 'Not Found', 'Expense not found');

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: existing.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: req.params.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id },
    });

    await tx.activityLog.create({
      data: {
        groupId: existing.groupId,
        userId: req.user.id,
        action: 'EXPENSE_DELETED',
        description: `${req.user.name} deleted "${existing.description}"`,
        metadata: { expenseId: existing.id },
      },
    });
  });

  res.json({ message: 'Expense soft-deleted successfully' });
});

module.exports = router;
