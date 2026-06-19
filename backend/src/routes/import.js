const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { parseAndDetect } = require('../services/csvImporter');
const { computeSplits } = require('../services/splitEngine');
const { convertToInr } = require('../services/currencyService');

const router = express.Router();
const prisma = new PrismaClient();

// Multer: store CSV in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv|txt)$/i)) {
      return cb(createError(400, 'Bad Request', 'Only CSV files are accepted'));
    }
    cb(null, true);
  },
});

// ─── POST /api/import/upload ─────────────────────────────────
// Step 1+2: Upload CSV, parse, detect anomalies, create session
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) throw createError(400, 'Bad Request', 'No file uploaded');

  const { groupId } = req.body;
  if (!groupId) throw createError(400, 'Bad Request', 'groupId is required');

  // Check group membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  // Fetch group members and memberships for anomaly detection
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const knownUsers = memberships.map((m) => m.user);
  const membershipData = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
  }));

  // Parse CSV + detect anomalies
  const { rows, anomalies, summary } = parseAndDetect(
    req.file.buffer, knownUsers, membershipData
  );

  // Create import session
  const session = await prisma.importSession.create({
    data: {
      groupId,
      filename: req.file.originalname,
      importedBy: req.user.id,
      status: 'REVIEWING',
      totalRows: summary.totalRows,
    },
  });

  // Store all anomalies (PENDING resolution)
  if (anomalies.length > 0) {
    await prisma.importAnomaly.createMany({
      data: anomalies.map((a) => ({
        sessionId: session.id,
        rowNumber: a.rowNumber,
        rawRow: a.rawRow,
        anomalyType: a.type,
        anomalyDetail: a.detail,
        resolution: 'PENDING',
        overrideData: a.suggestedOverride || null,
      })),
    });
  }

  res.status(201).json({
    sessionId: session.id,
    summary,
    rows: rows.map((r) => ({
      rowNumber: r.rowNumber,
      status: r.status,
      parsed: {
        date: r.date,
        description: r.description,
        amount: r.amount,
        currency: r.currency,
        paidBy: r.paidBy,
        splitAmong: r.splitAmong,
        splitType: r.splitType,
      },
      anomalies: r.anomalies,
    })),
    anomalies,
  });
});

// ─── GET /api/import/:sessionId ──────────────────────────────
// Get session status + all anomalies
router.get('/:sessionId', authenticate, async (req, res) => {
  const session = await prisma.importSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      anomalies: {
        include: {
          resolver: { select: { id: true, name: true } },
        },
        orderBy: { rowNumber: 'asc' },
      },
    },
  });

  if (!session) throw createError(404, 'Not Found', 'Import session not found');

  // Check group membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: session.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const pendingCount = session.anomalies.filter((a) => a.resolution === 'PENDING').length;

  res.json({ session, pendingAnomalies: pendingCount });
});

// ─── PATCH /api/import/:sessionId/anomalies/:anomalyId ───────
// Step 3: Resolve an anomaly
router.patch('/:sessionId/anomalies/:anomalyId', authenticate, async (req, res) => {
  const { resolution, overrideData } = req.body;

  const validResolutions = ['DELETE', 'KEEP', 'MERGE', 'OVERRIDE', 'SKIP'];
  if (!validResolutions.includes(resolution)) {
    throw createError(400, 'Bad Request', `resolution must be one of: ${validResolutions.join(', ')}`);
  }

  const anomaly = await prisma.importAnomaly.findUnique({
    where: { id: req.params.anomalyId },
    include: { session: true },
  });

  if (!anomaly) throw createError(404, 'Not Found', 'Anomaly not found');
  if (anomaly.sessionId !== req.params.sessionId) throw createError(400, 'Bad Request', 'Anomaly does not belong to this session');

  // Check group membership
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: anomaly.session.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  const updated = await prisma.importAnomaly.update({
    where: { id: req.params.anomalyId },
    data: {
      resolution,
      resolvedBy: req.user.id,
      resolvedAt: new Date(),
      overrideData: overrideData || anomaly.overrideData,
    },
  });

  res.json({ anomaly: updated });
});

// ─── PATCH /api/import/:sessionId/anomalies (bulk resolve) ───
router.patch('/:sessionId/anomalies', authenticate, async (req, res) => {
  const { anomalyIds, resolution } = req.body;

  const validResolutions = ['DELETE', 'KEEP', 'MERGE', 'OVERRIDE', 'SKIP'];
  if (!validResolutions.includes(resolution)) {
    throw createError(400, 'Bad Request', `resolution must be one of: ${validResolutions.join(', ')}`);
  }
  if (!anomalyIds || !Array.isArray(anomalyIds)) {
    throw createError(400, 'Bad Request', 'anomalyIds array is required');
  }

  await prisma.importAnomaly.updateMany({
    where: { id: { in: anomalyIds }, sessionId: req.params.sessionId },
    data: { resolution, resolvedBy: req.user.id, resolvedAt: new Date() },
  });

  res.json({ message: `Resolved ${anomalyIds.length} anomalies as ${resolution}` });
});

// ─── POST /api/import/:sessionId/confirm ─────────────────────
// Step 4: Execute import with resolved anomalies
router.post('/:sessionId/confirm', authenticate, async (req, res) => {
  const session = await prisma.importSession.findUnique({
    where: { id: req.params.sessionId },
    include: { anomalies: true },
  });

  if (!session) throw createError(404, 'Not Found', 'Import session not found');
  if (session.status === 'COMPLETED') throw createError(400, 'Bad Request', 'Session already completed');

  // Check for unresolved anomalies
  const pending = session.anomalies.filter((a) => a.resolution === 'PENDING');
  if (pending.length > 0) {
    throw createError(400, 'Bad Request',
      `${pending.length} anomalies still have PENDING resolution. Resolve all anomalies before confirming.`
    );
  }

  // Fetch group memberships for import
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: session.groupId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const userByName = {};
  for (const m of memberships) {
    userByName[m.user.name.toLowerCase()] = m.user;
  }

  // Re-parse the original CSV — we need the actual row data
  // Group anomalies by row number and resolution
  const anomalyByRow = {};
  for (const a of session.anomalies) {
    if (!anomalyByRow[a.rowNumber]) anomalyByRow[a.rowNumber] = [];
    anomalyByRow[a.rowNumber].push(a);
  }

  const report = {
    sessionId: session.id,
    filename: session.filename,
    importedAt: new Date().toISOString(),
    rows: [],
    imported: 0,
    skipped: 0,
    errors: [],
  };

  // Process each anomaly set by row
  const rowsToImport = [];
  const rowNumbers = new Set(session.anomalies.map((a) => a.rowNumber));

  // Build row import data from anomaly raw_row
  for (const rowNum of rowNumbers) {
    const rowAnomalies = anomalyByRow[rowNum];
    const rawRow = rowAnomalies[0].rawRow;

    // Determine if row should be imported
    const shouldDelete = rowAnomalies.some((a) => a.resolution === 'DELETE' || a.resolution === 'SKIP');
    if (shouldDelete) {
      report.rows.push({ rowNumber: rowNum, action: 'SKIPPED', reason: rowAnomalies[0].anomalyType });
      report.skipped++;
      continue;
    }

    // Apply overrides
    let effectiveRow = { ...rawRow };
    for (const a of rowAnomalies) {
      if (a.resolution === 'OVERRIDE' && a.overrideData) {
        effectiveRow = { ...effectiveRow, ...a.overrideData };
      }
    }

    rowsToImport.push({ rowNum, effectiveRow, rawRow, anomalies: rowAnomalies });
  }

  // Import rows
  for (const { rowNum, effectiveRow, anomalies: rowAnoms } of rowsToImport) {
    try {
      const rawDate = effectiveRow.date || '';
      const rawAmount = effectiveRow.amount || '0';
      const currency = (effectiveRow.currency || 'INR').toUpperCase();
      const description = effectiveRow.description || '';
      const payerName = effectiveRow.paid_by || effectiveRow.paidBy || effectiveRow.Paid_By || '';
      
      const rawSplit = effectiveRow.split_among || effectiveRow.splitAmong || effectiveRow.split_with || '';
      const splitAmong = String(rawSplit).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const splitType = (effectiveRow.split_type || effectiveRow.splitType || 'equal').toLowerCase();
      
      const rawDetails = effectiveRow.split_details || effectiveRow.splitDetails || '';

      // Parse date
      const dateMatch = rawDate.match(/\d{4}-\d{2}-\d{2}/) ||
        rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      let expenseDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
        expenseDate = new Date(rawDate.trim() + 'T00:00:00Z');
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate.trim())) {
        const [d, m, y] = rawDate.trim().split('/');
        expenseDate = new Date(`${y}-${m}-${d}T00:00:00Z`);
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(rawDate.trim())) {
        const [m, d, y] = rawDate.trim().split('-');
        expenseDate = new Date(`${y}-${m}-${d}T00:00:00Z`);
      } else {
        throw new Error(`Cannot parse date: ${rawDate}`);
      }

      // Parse amount
      const amountStr = String(rawAmount).replace(/[$₹,\s]/g, '').replace(/[A-Za-z]/g, '');
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) throw new Error(`Invalid amount: ${rawAmount}`);

      // Resolve payer
      const payer = userByName[payerName.toLowerCase()];
      if (!payer) throw new Error(`Unknown payer: ${payerName}`);

      // Resolve split members (skip unknowns if KEEP was chosen)
      const splitMembers = splitAmong
        .map((name) => userByName[name.toLowerCase()])
        .filter(Boolean)
        .map((u) => ({ userId: u.id }));

      if (splitMembers.length === 0) {
        splitMembers.push({ userId: payer.id });
      }

      // Convert currency
      const { amountInr, rate } = await convertToInr(amount, currency, expenseDate);

      // Parse split_details for exact/percentage/shares
      const splitConfig = { amounts: {}, percentages: {}, units: {} };
      if (rawDetails) {
        const parts = String(rawDetails).split(';');
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^([a-zA-Z\s]+)\s+([\d.]+)%?$/);
          if (match) {
            const name = match[1].trim().toLowerCase();
            const val = parseFloat(match[2]);
            const u = userByName[name];
            if (u) {
              if (splitType === 'exact' || splitType === 'unequal') splitConfig.amounts[u.id] = val;
              if (splitType === 'percentage') splitConfig.percentages[u.id] = val;
              if (splitType === 'share' || splitType === 'shares') splitConfig.units[u.id] = val;
            }
          }
        }
      }

      // Compute splits
      const normalizedSplitType = splitType === 'unequal' ? 'exact' : splitType === 'share' ? 'shares' : splitType;
      const splits = computeSplits(amountInr, payer.id, splitMembers, normalizedSplitType, splitConfig);

      // Create expense
      const expense = await prisma.$transaction(async (tx) => {
        const exp = await tx.expense.create({
          data: {
            groupId: session.groupId,
            description,
            totalAmount: amount,
            currency,
            amountInr,
            exchangeRateUsed: currency !== 'INR' ? rate : null,
            splitType,
            paidBy: payer.id,
            expenseDate,
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

        return exp;
      });

      report.rows.push({ rowNumber: rowNum, action: 'IMPORTED', expenseId: expense.id });
      report.imported++;
    } catch (err) {
      report.rows.push({ rowNumber: rowNum, action: 'ERROR', error: err.message });
      report.errors.push({ rowNumber: rowNum, error: err.message });
    }
  }

  // Mark session complete and store report
  await prisma.importSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      importedRows: report.imported,
      skippedRows: report.skipped,
      reportJson: report,
    },
  });

  // Activity log
  await prisma.activityLog.create({
    data: {
      groupId: session.groupId,
      userId: req.user.id,
      action: 'CSV_IMPORTED',
      description: `${req.user.name} imported "${session.filename}": ${report.imported} imported, ${report.skipped} skipped`,
      metadata: { sessionId: session.id, imported: report.imported, skipped: report.skipped },
    },
  });

  res.json({ report, sessionId: session.id });
});

// ─── GET /api/import/:sessionId/report ───────────────────────
router.get('/:sessionId/report', authenticate, async (req, res) => {
  const session = await prisma.importSession.findUnique({
    where: { id: req.params.sessionId },
    include: { anomalies: true },
  });

  if (!session) throw createError(404, 'Not Found', 'Import session not found');

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId: session.groupId, userId: req.user.id } },
  });
  if (!membership) throw createError(403, 'Forbidden', 'Not a group member');

  res.json({ session, report: session.reportJson });
});

module.exports = router;
