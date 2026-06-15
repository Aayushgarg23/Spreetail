const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * JWT authentication middleware.
 * Reads the Bearer token from Authorization header,
 * verifies it, and attaches the full user object to req.user.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
  }

  req.user = user;
  next();
};

/**
 * Group membership guard.
 * Verifies that req.user is a member of req.params.groupId.
 * Must be used AFTER authenticate.
 */
const requireGroupMember = async (req, res, next) => {
  const { groupId, id: paramId } = req.params;
  const gid = groupId || paramId; // support both /groups/:id and /groups/:groupId

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: gid, userId: req.user.id } },
  });

  if (!membership) {
    return res.status(403).json({ error: 'Forbidden', message: 'You are not a member of this group' });
  }

  req.membership = membership;
  next();
};

module.exports = { authenticate, requireGroupMember };
