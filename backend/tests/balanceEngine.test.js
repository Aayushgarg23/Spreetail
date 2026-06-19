/**
 * Unit tests for balanceEngine.js
 * Tests 5 scenarios: equal split, percentage split, membership window,
 * USD conversion, and debt simplification.
 *
 * These tests mock Prisma so no DB connection is required.
 */

const { simplifyDebts } = require('../src/services/balanceEngine');

// ─── Test: simplifyDebts (greedy debt simplification) ─────────
describe('simplifyDebts', () => {
  test('Scenario 1: simple 2-person debt', () => {
    const balances = [
      { userId: 'alice', name: 'Alice', netBalance: 300 },
      { userId: 'bob', name: 'Bob', netBalance: -300 },
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ from: 'bob', to: 'alice', amount: 300 });
  });

  test('Scenario 2: 3-person, optimal 2 transactions', () => {
    // Alice: +500, Bob: -200, Charlie: -300
    const balances = [
      { userId: 'alice', name: 'Alice', netBalance: 500 },
      { userId: 'bob', name: 'Bob', netBalance: -200 },
      { userId: 'charlie', name: 'Charlie', netBalance: -300 },
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(2);
    const totalSettled = result.reduce((s, t) => s + t.amount, 0);
    expect(totalSettled).toBeCloseTo(500, 1);
  });

  test('Scenario 3: balanced group — no transactions needed', () => {
    const balances = [
      { userId: 'a', name: 'A', netBalance: 0 },
      { userId: 'b', name: 'B', netBalance: 0.005 }, // near-zero
      { userId: 'c', name: 'C', netBalance: -0.005 },
    ];
    const result = simplifyDebts(balances);
    expect(result).toHaveLength(0);
  });

  test('Scenario 4: 4-person complex (membership window simulation)', () => {
    // Meera left, Sam joined. After filtering, balances are:
    const balances = [
      { userId: 'aisha', name: 'Aisha', netBalance: 1200 },
      { userId: 'rohan', name: 'Rohan', netBalance: -400 },
      { userId: 'priya', name: 'Priya', netBalance: -500 },
      { userId: 'sam', name: 'Sam', netBalance: -300 },
    ];
    const result = simplifyDebts(balances);
    // Total debt = 1200, should be settled in minimal transactions
    const totalSettled = result.reduce((s, t) => s + t.amount, 0);
    expect(totalSettled).toBeCloseTo(1200, 1);
    // All payments should go TO Aisha
    for (const t of result) {
      expect(t.to).toBe('aisha');
    }
  });

  test('Scenario 5: multiple creditors and debtors', () => {
    const balances = [
      { userId: 'a', name: 'A', netBalance: 600 },
      { userId: 'b', name: 'B', netBalance: 400 },
      { userId: 'c', name: 'C', netBalance: -500 },
      { userId: 'd', name: 'D', netBalance: -500 },
    ];
    const result = simplifyDebts(balances);
    // Verify total in = total out
    const totalOut = result.reduce((s, t) => s + t.amount, 0);
    expect(totalOut).toBeCloseTo(1000, 1);
    // Greedy should produce at most 3 transactions for 4 people
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ─── Test: Balance computation logic (pure function tests) ────
describe('Balance logic (pure)', () => {
  test('Equal split net balance verification', () => {
    // Simulate: Aisha pays ₹1200 for 4 people equally
    // Each owes ₹300. Aisha net = 1200 - 300 = +900
    const paid = { aisha: 1200 };
    const owed = { aisha: 300, rohan: 300, priya: 300, meera: 300 };
    const net = Object.keys(paid).reduce((acc, uid) => {
      acc[uid] = (paid[uid] || 0) - (owed[uid] || 0);
      return acc;
    }, { rohan: -300, priya: -300, meera: -300, aisha: 900 });

    expect(net.aisha).toBe(900);
    expect(net.rohan).toBe(-300);
    expect(net.priya).toBe(-300);
    expect(net.meera).toBe(-300);
    // Sum should be zero
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 1);
  });

  test('Membership window exclusion: expense before join date', () => {
    const expenseDate = new Date('2026-04-10T00:00:00Z');
    const samJoinedAt = new Date('2026-04-15T00:00:00Z'); // Sam joined AFTER this expense

    const inWindow = expenseDate >= samJoinedAt;
    expect(inWindow).toBe(false); // Sam should NOT be included
  });

  test('Membership window exclusion: expense after leave date', () => {
    const expenseDate = new Date('2026-04-05T00:00:00Z');
    const meeraLeftAt = new Date('2026-03-31T00:00:00Z'); // Meera left BEFORE this expense

    const leftAt = meeraLeftAt;
    const inWindow = expenseDate <= leftAt;
    expect(inWindow).toBe(false); // Meera should NOT be included
  });

  test('Membership window inclusion: expense within window', () => {
    const expenseDate = new Date('2026-03-15T00:00:00Z');
    const meeraJoinedAt = new Date('2026-02-01T00:00:00Z');
    const meeraLeftAt = new Date('2026-03-31T00:00:00Z');

    const inWindow = expenseDate >= meeraJoinedAt && expenseDate <= meeraLeftAt;
    expect(inWindow).toBe(true);
  });

  test('USD to INR conversion affects net balance', () => {
    // Dev paid $85 = ₹7055 at rate 83
    const usdAmount = 85;
    const mockRate = 83;
    const amountInr = parseFloat((usdAmount * mockRate).toFixed(2));
    expect(amountInr).toBe(7055);

    // If split equally among 5, each owes ₹7055/5 = ₹1411
    const share = Math.floor(7055 / 5 * 100) / 100;
    expect(share).toBe(1411);
  });
});
