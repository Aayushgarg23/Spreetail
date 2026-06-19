/**
 * Unit tests for splitEngine.js
 * Tests all 4 split types with correct amounts and rounding.
 */
const { computeSplits } = require('../src/services/splitEngine');

const MEMBERS = [
  { userId: 'aisha' },
  { userId: 'rohan' },
  { userId: 'priya' },
  { userId: 'meera' },
];

describe('computeSplits — equal', () => {
  test('divides evenly among 4 members', () => {
    const splits = computeSplits(1200, 'aisha', MEMBERS, 'equal');
    for (const s of splits) {
      expect(s.shareAmount).toBe(300);
    }
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(1200, 2);
  });

  test('remainder goes to payer when not divisible', () => {
    // ₹1001 / 4 = ₹250.25 each; remainder ₹0.00 with floor
    // floor(100100 / 4) / 100 = floor(25025) / 100 = 250.25 per person
    // Actually ₹1001 / 4: floor = 250, so 3 get 250, payer gets 251
    const splits = computeSplits(1001, 'aisha', MEMBERS, 'equal');
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(1001, 2);
    const payerSplit = splits.find((s) => s.userId === 'aisha');
    const otherSplit = splits.find((s) => s.userId !== 'aisha');
    expect(payerSplit.shareAmount).toBeGreaterThanOrEqual(otherSplit.shareAmount);
  });

  test('single member split — full amount', () => {
    const splits = computeSplits(500, 'aisha', [{ userId: 'aisha' }], 'equal');
    expect(splits).toHaveLength(1);
    expect(splits[0].shareAmount).toBe(500);
  });
});

describe('computeSplits — exact', () => {
  test('uses provided exact amounts', () => {
    const amounts = { aisha: 800, rohan: 700, priya: 700, meera: 600 };
    const splits = computeSplits(2800, 'aisha', MEMBERS, 'exact', { amounts });
    expect(splits.find((s) => s.userId === 'aisha').shareAmount).toBe(800);
    expect(splits.find((s) => s.userId === 'rohan').shareAmount).toBe(700);
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(2800, 2);
  });

  test('rejects when sum is more than ₹1 off', () => {
    const amounts = { aisha: 100, rohan: 100, priya: 100, meera: 100 }; // sum = 400, total = 1200
    expect(() =>
      computeSplits(1200, 'aisha', MEMBERS, 'exact', { amounts })
    ).toThrow();
  });

  test('allows ±₹1 rounding tolerance', () => {
    // sum = 1199.50, within ₹1 of 1200
    const amounts = { aisha: 299.50, rohan: 300, priya: 300, meera: 300 };
    expect(() =>
      computeSplits(1200, 'aisha', MEMBERS, 'exact', { amounts })
    ).not.toThrow();
  });
});

describe('computeSplits — percentage', () => {
  test('distributes by percentage correctly', () => {
    const percentages = { aisha: 25, rohan: 25, priya: 25, meera: 25 };
    const splits = computeSplits(1200, 'aisha', MEMBERS, 'percentage', { percentages });
    for (const s of splits) {
      expect(s.shareAmount).toBeCloseTo(300, 2);
    }
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(1200, 2);
  });

  test('handles uneven percentages (40/30/20/10)', () => {
    const percentages = { aisha: 10, rohan: 40, priya: 30, meera: 20 };
    const splits = computeSplits(6000, 'rohan', MEMBERS, 'percentage', { percentages });
    expect(splits.find((s) => s.userId === 'rohan').shareAmount).toBeCloseTo(2400, 1);
    expect(splits.find((s) => s.userId === 'priya').shareAmount).toBeCloseTo(1800, 1);
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(6000, 1);
  });

  test('rejects when percentages do not sum to 100', () => {
    const percentages = { aisha: 30, rohan: 30, priya: 30, meera: 5 }; // sum = 95
    expect(() =>
      computeSplits(1200, 'aisha', MEMBERS, 'percentage', { percentages })
    ).toThrow();
  });
});

describe('computeSplits — shares', () => {
  test('divides by weighted shares (2:2:1:1)', () => {
    const units = { aisha: 2, rohan: 2, priya: 1, meera: 1 }; // total = 6 units
    const splits = computeSplits(3500, 'aisha', MEMBERS, 'shares', { units });
    // Each unit = ₹3500/6 ≈ ₹583.33
    const aishaShare = splits.find((s) => s.userId === 'aisha').shareAmount;
    const priyaShare = splits.find((s) => s.userId === 'priya').shareAmount;
    expect(aishaShare).toBeCloseTo(priyaShare * 2, 0); // Aisha pays ~2x Priya
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    expect(total).toBeCloseTo(3500, 1);
  });

  test('single unit ratio — effectively equal', () => {
    const units = { aisha: 1, rohan: 1, priya: 1, meera: 1 };
    const splits = computeSplits(1200, 'aisha', MEMBERS, 'shares', { units });
    for (const s of splits) {
      expect(s.shareAmount).toBeCloseTo(300, 2);
    }
  });
});

describe('computeSplits — edge cases', () => {
  test('throws on unknown split type', () => {
    expect(() =>
      computeSplits(100, 'aisha', MEMBERS, 'invalid_type')
    ).toThrow();
  });

  test('throws on empty members array', () => {
    expect(() =>
      computeSplits(100, 'aisha', [], 'equal')
    ).toThrow();
  });
});
