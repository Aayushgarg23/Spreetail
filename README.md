# Spreetail — Shared Expenses App

> **Smart, transparent expense splitting for flatmates.**
> Built as a placement assignment for Spreetail.

---

## 🌐 Deployment URL

> _Deploy URL to be added after deployment. See [Deployment Config](#-deployment) below._

---

## 📋 Project Description

Spreetail is a full-featured shared expense tracking application built for a group of flatmates:
**Aisha, Rohan, Priya, and Meera** — with **Dev** (short trip visitor) and **Sam** (joined mid-April).

Key capabilities:
- **JWT-secured** accounts for all 6 users
- **4 split types**: equal, exact, percentage, shares
- **Multi-currency**: USD expenses converted to INR using historical rates from frankfurter.app
- **Membership windows**: Sam only owes expenses from April 15 onward; Meera only until March 31
- **5-step CSV Import Wizard** with 14 anomaly detectors — nothing is silently discarded
- **Drill-down balances**: every ₹ amount is traceable to specific expense rows
- **Greedy debt simplification**: minimum transactions to settle all debts
- **Activity feed**: every action timestamped and logged
- **Soft delete**: expenses are never hard-deleted, only flagged `is_deleted = true`

---

## ⚡ Quick Start (< 5 commands)

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ (running locally or via Supabase/Railway)

```bash
# 1. Clone and install
git clone https://github.com/yourname/spreetail.git
cd spreetail

# 2. Backend setup
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL to your PostgreSQL connection string
npm install
npx prisma migrate dev --name init
node prisma/seed.js

# 3. Start backend
npm run dev
# Backend running at http://localhost:3001

# 4. Frontend setup (new terminal)
cd ../frontend
npm install
npm run dev
# Frontend running at http://localhost:5173

# 5. Import the CSV
# Login as aisha@spreetail.app / Spreetail@2024
# Go to your group → Import CSV → upload expenses_export.csv
```

---

## 👤 Demo Accounts

All pre-seeded by `npm run db:seed`:

| Name  | Email                    | Password        | Status           |
|-------|--------------------------|-----------------|------------------|
| Aisha | aisha@spreetail.app      | Spreetail@2024  | Active           |
| Rohan | rohan@spreetail.app      | Spreetail@2024  | Active           |
| Priya | priya@spreetail.app      | Spreetail@2024  | Active           |
| Meera | meera@spreetail.app      | Spreetail@2024  | Left 31 Mar 2026 |
| Dev   | dev@spreetail.app        | Spreetail@2024  | Left 15 Mar 2026 |
| Sam   | sam@spreetail.app        | Spreetail@2024  | Joined 15 Apr 2026 |

---

## 📁 How to Import the CSV

1. Login to the app
2. Select or create the **"Flat 4B"** group (auto-created by seed)
3. Click **"Import CSV"** on the group page
4. **Step 1 — Upload**: drag `expenses_export.csv` from the project root
5. **Step 2 — Parse & Detect**: review the table (14 anomalies will be flagged)
6. **Step 3 — Anomaly Review**: set a resolution for each anomaly (DELETE/KEEP/MERGE/OVERRIDE/SKIP)
7. **Step 4 — Confirm**: review import summary
8. **Step 5 — Report**: see final counts and download the import report

---

## 🏗️ Architecture

```
spreetail/
├── backend/                    # Node.js + Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # 10-table PostgreSQL schema
│   │   └── seed.js             # Pre-seeds 6 users + "Flat 4B" group
│   └── src/
│       ├── routes/             # REST API endpoints
│       ├── services/           # Business logic (balance, split, currency, import)
│       ├── middleware/         # JWT auth + error handler
│       └── app.js
├── frontend/                   # React + Vite + TailwindCSS
│   └── src/
│       ├── pages/              # 6 full-page components
│       ├── components/         # 4 reusable components
│       ├── context/            # Auth state management
│       └── lib/api.js          # Axios API client
├── expenses_export.csv         # Synthetic CSV with 14+ anomalies
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## 🧪 Running Tests

```bash
cd backend
npm test
```

Tests cover:
- `balanceEngine` — 5 scenarios: equal split, percentage, membership window, USD conversion, debt simplification
- `csvImporter` — 14 anomaly type assertions with synthetic bad rows
- `splitEngine` — all 4 split types with rounding edge cases
- `api` — integration tests for auth, expense creation, balance fetch

---

## 🚀 Deployment

See [Deployment Config](#deployment-config) section. Quick deploy:

**Backend → Render:**
1. Connect GitHub repo on render.com
2. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`
3. Uses `render.yaml` at repo root

**Frontend → Vercel:**
1. Connect GitHub repo on vercel.com  
2. Set env var: `VITE_API_URL=https://your-backend.onrender.com`
3. Uses `frontend/vercel.json`

---

## 🤖 AI Tools Used

Built with **Antigravity (Claude Sonnet 4.6)** via the Antigravity AI coding assistant.
See [AI_USAGE.md](./AI_USAGE.md) for detailed prompt history and corrections.

---

## 📊 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18, Express 4 |
| Database | PostgreSQL 15 |
| ORM | Prisma 5 |
| Frontend | React 18, Vite 5 |
| Styling | TailwindCSS 3 |
| Auth | JWT + bcryptjs (10 rounds) |
| Currency | frankfurter.app (historical rates) |
| Testing | Jest 29, Supertest |
