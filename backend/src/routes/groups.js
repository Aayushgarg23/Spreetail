const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();
const prisma = new PrismaClient();

// ─── POST /api/groups ─────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) throw createError(400, 'Bad Request', 'Group name is required');

  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.group.create({
      data: { name, createdBy: req.user.id },
    });
    // Creator auto-joins the group
    await tx.groupMembership.create({
      data: { groupId: g.id, userId: req.user.id, joinedAt: new Date() },
    });
    await tx.activityLog.create({
      data: {
        groupId: g.id,
        userId: req.user.id,
        action: 'GROUP_CREATED',
        description: `${req.user.name} created the group "${name}"`,
      },
    });
    return g;
  });

  res.status(201).json({ group });
});

// ─── GET /api/groups ──────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: req.user.id },
    include: {
      group: {
        include: {
          memberships: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          _count: { select: { expenses: { where: { isDeleted: false } } } },
        },
      },
    },
  });

  const groups = memberships.map((m) => ({
    ...m.group,
    myMembership: { joinedAt: m.joinedAt, leftAt: m.leftAt },
  }));

  res.json({ groups });
});

// ─── GET /api/groups/:id ──────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { expenses: { where: { isDeleted: false } }, settlements: true } },
    },
  });

  if (!group) throw createError(404, 'Not Found', 'Group not found');

  // Check membership
  const isMember = group.memberships.some((m) => m.userId === req.user.id);
  if (!isMember) throw createError(403, 'Forbidden', 'You are not a member of this group');

  const currentMembers = group.memberships.filter((m) => !m.leftAt);
  const pastMembers = group.memberships.filter((m) => m.leftAt);

  res.json({ group: { ...group, currentMembers, pastMembers } });
});

// ─── POST /api/groups/:id/members (invite by email) ───────────
router.post('/:id/members', authenticate, async (req, res) => {
  const { email, joinedAt } = req.body;
  if (!email) throw createError(400, 'Bad Request', 'email is required');

  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) throw createError(404, 'Not Found', 'Group not found');

  // Only existing members can invite
  const myMembership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.user.id } },
  });
  if (!myMembership) throw createError(403, 'Forbidden', 'Only group members can invite others');

  const invitee = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!invitee) throw createError(404, 'Not Found', `No user found with email: ${email}`);

  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: invitee.id } },
  });
  if (existing && !existing.leftAt) {
    throw createError(409, 'Conflict', `${invitee.name} is already a member of this group`);
  }

  const effectiveJoinedAt = joinedAt ? new Date(joinedAt) : new Date();

  let membership;
  if (existing) {
    // Re-joining after leaving — update leftAt to null, update joinedAt
    membership = await prisma.groupMembership.update({
      where: { groupId_userId: { groupId: req.params.id, userId: invitee.id } },
      data: { joinedAt: effectiveJoinedAt, leftAt: null },
    });
  } else {
    membership = await prisma.groupMembership.create({
      data: { groupId: req.params.id, userId: invitee.id, joinedAt: effectiveJoinedAt },
    });
  }

  await prisma.activityLog.create({
    data: {
      groupId: req.params.id,
      userId: req.user.id,
      action: 'MEMBER_JOINED',
      description: `${invitee.name} joined the group`,
      metadata: { invitedBy: req.user.name, joinedAt: effectiveJoinedAt },
    },
  });

  res.status(201).json({ membership, user: invitee });
});

// ─── PATCH /api/groups/:id/members/:userId (set left_at) ──────
router.patch('/:id/members/:userId', authenticate, async (req, res) => {
  const { leftAt } = req.body;
  if (!leftAt) throw createError(400, 'Bad Request', 'leftAt date is required');

  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) throw createError(404, 'Not Found', 'Group not found');

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
    include: { user: { select: { name: true } } },
  });
  if (!membership) throw createError(404, 'Not Found', 'Membership not found');

  const updated = await prisma.groupMembership.update({
    where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
    data: { leftAt: new Date(leftAt) },
  });

  await prisma.activityLog.create({
    data: {
      groupId: req.params.id,
      userId: req.user.id,
      action: 'MEMBER_LEFT',
      description: `${membership.user.name} left the group`,
      metadata: { leftAt, recordedBy: req.user.name },
    },
  });

  res.json({ membership: updated });
});

// ─── GET /api/groups/:id/activity ─────────────────────────────
router.get('/:id/activity', authenticate, async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  // Check membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'You are not a member of this group');

  const activities = await prisma.activityLog.findMany({
    where: { groupId: req.params.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset),
  });

  res.json({ activities });
});

module.exports = router;
