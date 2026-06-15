const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { computeBalances } = require('../services/balanceEngine');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

// ─── GET /api/groups/:groupId/balances ───────────────────────
router.get('/:groupId/balances', authenticate, async (req, res) => {
  const { groupId } = req.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const { balances, settlements } = await computeBalances(groupId);
  res.json({ balances, settlementPlan: settlements });
});

// ─── GET /api/groups/:groupId/balances/:userId/drilldown ─────
router.get('/:groupId/balances/:userId/drilldown', authenticate, async (req, res) => {
  const { groupId, userId } = req.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const { drillDown, balances } = await computeBalances(groupId);
  const userBalance = balances.find((b) => b.userId === userId);
  const userDrill = drillDown[userId] || [];

  res.json({
    userId,
    balance: userBalance,
    breakdown: userDrill,
  });
});

// ─── POST /api/groups/:groupId/settlements ───────────────────
router.post('/:groupId/settlements', authenticate, async (req, res) => {
  const { groupId } = req.params;
  const { fromUser, toUser, amount, note } = req.body;

  if (!fromUser || !toUser || !amount) {
    throw createError(400, 'Bad Request', 'fromUser, toUser, and amount are required');
  }
  if (fromUser === toUser) {
    throw createError(400, 'Bad Request', 'fromUser and toUser must be different');
  }
  if (Number(amount) <= 0) {
    throw createError(400, 'Bad Request', 'Settlement amount must be positive');
  }

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const [fromUserData, toUserData] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUser }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: toUser }, select: { id: true, name: true } }),
  ]);
  if (!fromUserData) throw createError(404, 'Not Found', 'fromUser not found');
  if (!toUserData) throw createError(404, 'Not Found', 'toUser not found');

  const settlement = await prisma.$transaction(async (tx) => {
    const s = await tx.settlement.create({
      data: { groupId, fromUser, toUser, amount: Number(amount), note },
      include: {
        payer: { select: { id: true, name: true } },
        payee: { select: { id: true, name: true } },
      },
    });

    await tx.activityLog.create({
      data: {
        groupId,
        userId: req.user.id,
        action: 'SETTLEMENT_RECORDED',
        description: `${fromUserData.name} paid ₹${Number(amount).toFixed(2)} to ${toUserData.name}`,
        metadata: { settlementId: s.id, fromUser, toUser, amount },
      },
    });

    return s;
  });

  res.status(201).json({ settlement });
});

// ─── GET /api/groups/:groupId/settlements ────────────────────
router.get('/:groupId/settlements', authenticate, async (req, res) => {
  const { groupId } = req.params;

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      payer: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
    },
    orderBy: { settledAt: 'desc' },
  });

  res.json({ settlements });
});

module.exports = router;
