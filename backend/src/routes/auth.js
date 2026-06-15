const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

/**
 * Sign a JWT for a given user ID.
 */
const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw createError(400, 'Bad Request', 'name, email, and password are required');
  }
  if (password.length < 8) {
    throw createError(400, 'Bad Request', 'Password must be at least 8 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw createError(409, 'Conflict', 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  const token = signToken(user.id);
  res.status(201).json({ user, token });
});

// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw createError(400, 'Bad Request', 'email and password are required');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw createError(401, 'Unauthorized', 'Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw createError(401, 'Unauthorized', 'Invalid email or password');
  }

  const token = signToken(user.id);
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// ─── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const { passwordHash, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

// ─── PATCH /api/auth/me ───────────────────────────────────────
router.patch('/me', authenticate, async (req, res) => {
  const { name, password } = req.body;
  const updates = {};

  if (name) updates.name = name;
  if (password) {
    if (password.length < 8) throw createError(400, 'Bad Request', 'Password must be at least 8 characters');
    updates.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: updates,
    select: { id: true, name: true, email: true, createdAt: true },
  });

  res.json({ user: updated });
});

module.exports = router;
