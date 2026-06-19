/**
 * API integration tests — auth, expense creation, balance fetch.
 * Uses supertest against the Express app (no real DB needed for auth unit tests).
 *
 * NOTE: These tests require a running PostgreSQL database.
 * Set TEST_DATABASE_URL in your .env or they will be skipped gracefully.
 *
 * Run: npm test
 */

const request = require('supertest');
const app = require('../src/app');

// Skip all integration tests if no DB URL is configured
const hasDb = !!process.env.DATABASE_URL;
const describeWithDb = hasDb ? describe : describe.skip;

describeWithDb('Auth API', () => {
  const testEmail = `test_${Date.now()}@spreetail.app`;
  let token;

  test('POST /api/auth/register — creates a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: testEmail, password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: testEmail, name: 'Test User' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    token = res.body.token;
  });

  test('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Duplicate', email: testEmail, password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });

  test('POST /api/auth/login — returns JWT on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });

  test('POST /api/auth/login — rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — returns user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  test('GET /api/auth/me — rejects without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describeWithDb('Groups API', () => {
  let token;
  let groupId;
  const email = `group_test_${Date.now()}@spreetail.app`;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Group Tester', email, password: 'password123' });
    token = res.body.token;
  });

  test('POST /api/groups — creates a group', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Flat' });

    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Test Flat');
    groupId = res.body.group.id;
  });

  test('GET /api/groups — lists groups for current user', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.groups.length).toBeGreaterThan(0);
  });

  test('GET /api/groups/:id — returns group detail', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(groupId);
    expect(Array.isArray(res.body.group.memberships)).toBe(true);
  });
});

describeWithDb('Expenses API', () => {
  let token;
  let userId;
  let groupId;
  const email = `expense_test_${Date.now()}@spreetail.app`;

  beforeAll(async () => {
    // Register + get userId
    const authRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Expense Tester', email, password: 'password123' });
    token = authRes.body.token;
    userId = authRes.body.user.id;

    // Create group
    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Expense Test Flat' });
    groupId = groupRes.body.group.id;
  });

  test('POST /api/groups/:id/expenses — creates equal split expense', async () => {
    const res = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Test Groceries',
        totalAmount: 1200,
        currency: 'INR',
        splitType: 'equal',
        paidBy: userId,
        expenseDate: '2026-05-01',
        members: [userId],
      });

    expect(res.status).toBe(201);
    expect(res.body.expense.description).toBe('Test Groceries');
    expect(parseFloat(res.body.expense.amountInr)).toBe(1200);
    expect(res.body.expense.splits).toHaveLength(1);
  });

  test('GET /api/groups/:id/expenses — lists expenses', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.expenses)).toBe(true);
  });

  test('GET /api/groups/:id/balances — returns balances and settlement plan', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.balances)).toBe(true);
    expect(Array.isArray(res.body.settlementPlan)).toBe(true);

    // Single member group — they paid everything and owe everything: net = 0
    const myBalance = res.body.balances.find((b) => b.userId === userId);
    expect(myBalance).toBeDefined();
    expect(myBalance.netBalance).toBeCloseTo(0, 1);
  });
});

describe('Health check', () => {
  test('GET /health — returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
