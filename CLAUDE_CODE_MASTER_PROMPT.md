# 🚀 MASTER PROMPT — Spreetail Shared Expenses App
# Paste this entire prompt into Claude Code to kick off the full build.

---

You are acting as a **senior full-stack software engineering intern** building a production-ready
shared expenses web application for a placement assignment at Spreetail. You are both the
**Product Manager and the Developer** on this project.

---

## 🎯 PROJECT OVERVIEW

Four flatmates — Aisha, Rohan, Priya, and Meera — have been tracking shared expenses in a messy
spreadsheet since February. Dev joined for a trip (expenses partly in USD). Meera left end of March.
Sam joined mid-April. The spreadsheet (`expenses_export.csv`) has at least 12 deliberate data
problems. You must build a full-featured shared expenses app with a robust CSV importer.

---

## 🏗️ TECH STACK DECISIONS (justify each in DECISIONS.md)

- **Backend:** Node.js + Express (or FastAPI if you prefer Python — pick one and commit)
- **Database:** PostgreSQL (relational only — no MongoDB, no SQLite for prod)
- **ORM:** Prisma (Node) or SQLAlchemy (Python)
- **Frontend:** React + TailwindCSS (Vite scaffold)
- **Auth:** JWT-based login (bcrypt password hashing)
- **Currency conversion:** Use a free exchange rate API (e.g., frankfurter.app) for USD→INR at
  the date of each transaction
- **Deployment:** Railway / Render / Vercel+Supabase — pick one that gives you a public URL
- **Version control:** Git with meaningful, atomic commits (at least one commit per feature)

---

## 📁 REQUIRED FILE STRUCTURE

```
/
├── backend/
│   ├── prisma/schema.prisma       # Full relational schema
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── groups.js
│   │   │   ├── expenses.js
│   │   │   ├── settlements.js
│   │   │   └── import.js
│   │   ├── services/
│   │   │   ├── balanceEngine.js   # Core balance calculation logic
│   │   │   ├── csvImporter.js     # All anomaly detection logic lives here
│   │   │   ├── currencyService.js # USD → INR conversion by date
│   │   │   └── splitEngine.js     # Equal / exact / percentage / shares split
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   └── app.js
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── GroupDetail.jsx
│   │   │   ├── ExpenseDetail.jsx
│   │   │   ├── ImportWizard.jsx   # Step-by-step import with anomaly review
│   │   │   └── BalanceSummary.jsx
│   │   ├── components/
│   │   │   ├── AnomalyReviewTable.jsx
│   │   │   ├── BalanceCard.jsx
│   │   │   ├── ExpenseBreakdown.jsx
│   │   │   └── SettlementFlow.jsx
│   │   └── App.jsx
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## 🗄️ DATABASE SCHEMA (build this first — everything else depends on it)

Design and implement the following tables in PostgreSQL via Prisma migrations:

```
users               (id, name, email, password_hash, created_at)
groups              (id, name, created_at, created_by)
group_memberships   (id, group_id, user_id, joined_at, left_at nullable)
                    -- left_at IS the key to Sam's problem: expenses before joined_at
                    -- don't affect a member's balance
expenses            (id, group_id, description, total_amount, currency,
                     amount_inr, exchange_rate_used, split_type, paid_by,
                     expense_date, created_at, is_deleted, import_row_id)
expense_splits      (id, expense_id, user_id, share_amount, share_pct, share_units)
settlements         (id, group_id, from_user, to_user, amount, settled_at, note)
import_sessions     (id, group_id, filename, imported_at, imported_by, status)
import_anomalies    (id, session_id, row_number, raw_row, anomaly_type,
                     anomaly_detail, resolution, resolved_by, resolved_at)
```

**Key constraint:** `group_memberships.left_at` — when calculating balances for a user, only include
expenses where `expense_date >= membership.joined_at AND expense_date <= membership.left_at (or NOW)`.

---

## ✅ FEATURE REQUIREMENTS (implement all)

### 1. AUTH MODULE
- Register + Login with JWT
- Protect all routes with auth middleware
- Password hashing with bcrypt (min 10 rounds)

### 2. GROUP MANAGEMENT
- Create group, invite members by email
- Track join date and leave date per member
- A member leaving does NOT delete their historical contributions
- Show current members vs past members in UI

### 3. EXPENSE MANAGEMENT

**Split types — support ALL of these:**
- `equal` — divide total equally among selected members
- `exact` — each member owes a specific fixed amount (must sum to total)
- `percentage` — each member owes a % of total (must sum to 100%)
- `shares` — divide by weighted shares (e.g., 2:1:1)

**Per Rohan's request:**
- Every balance figure must be drillable — clicking "Rohan owes ₹2,300" shows the exact list
  of expense IDs, descriptions, dates, and per-expense share amounts that compose that number.

**Per Priya's request:**
- Store `currency` on every expense (INR or USD)
- For USD expenses, fetch the historical exchange rate for `expense_date` from frankfurter.app
  (`https://api.frankfurter.app/{YYYY-MM-DD}?from=USD&to=INR`)
- Store `exchange_rate_used` and `amount_inr` on the expense row
- All balance calculations use `amount_inr` only
- Show original currency + converted amount in UI

**Per Sam's request:**
- Balance calculation filters expenses by membership window
- A member only shares in expenses that fall within their `joined_at` → `left_at` window
- Make this a documented policy in DECISIONS.md

**Per Meera's request (Anomaly Approval Flow):**
- Duplicates and data problems are NEVER silently deleted
- They are surfaced in an **Anomaly Review UI** where Meera (or the importer) must
  explicitly approve each action: DELETE, KEEP, MERGE, or OVERRIDE

**Per Aisha's request:**
- Dashboard shows a clean settlement plan: the minimum number of transactions that clears
  all debts (use the greedy debt-simplification algorithm)
- Show "X pays Y ₹Z" — one card per required payment

### 4. BALANCE ENGINE (critical — get this right)

Implement `balanceEngine.js` (or equivalent) with the following logic:

```
For each expense in the group:
  1. Check if expense_date is within each member's membership window
  2. For members IN window: apply their split share
  3. Payer gets credit for full amount_inr
  4. Net balance per member = sum(paid) - sum(owed)

Debt simplification:
  1. Separate members into creditors (positive balance) and debtors (negative)
  2. Greedily match largest debtor to largest creditor
  3. Output minimal transaction list
```

Write unit tests for this engine covering: equal split, percentage split, membership window
exclusion, USD conversion, and debt simplification.

### 5. CSV IMPORT WIZARD (the most important feature)

Build a multi-step import UI:

**Step 1 — Upload:** Accept `expenses_export.csv`  
**Step 2 — Parse & Detect:** Run all anomaly checks, show a table of every row with status
(✅ Clean / ⚠️ Warning / ❌ Error)  
**Step 3 — Anomaly Review:** For each anomaly, show the raw row, the detected problem, and
offer resolution options. User must explicitly choose for each.  
**Step 4 — Confirm & Import:** Import only approved rows, skip or flag rejected rows  
**Step 5 — Import Report:** Show final report (save to DB as `import_sessions` + `import_anomalies`)

**Anomalies to detect (minimum — find more):**

| # | Anomaly Type | Detection Rule | Default Policy |
|---|---|---|---|
| 1 | Duplicate row | Same date + description + amount + payer | Flag, require user to pick one |
| 2 | Currency mismatch | Amount field contains $ or is labeled USD but currency col says INR | Flag as USD, convert |
| 3 | Negative amount | amount < 0 | Flag — could be refund or error, user decides |
| 4 | Settlement logged as expense | description contains "settled" / "paid back" / "transfer" | Flag — suggest moving to settlements table |
| 5 | Expense after member left | expense_date > member.left_at for a split participant | Flag — exclude that member from split, recalculate |
| 6 | Expense before member joined | expense_date < member.joined_at for a split participant | Flag — exclude from split |
| 7 | Split amounts don't sum to total | sum(splits) != total_amount (allow ±₹1 rounding) | Flag — show discrepancy, let user override |
| 8 | Unknown member name | Name in CSV doesn't match any user | Flag — let user map to existing user or skip |
| 9 | Missing required field | date/amount/payer is blank | Reject row, log reason |
| 10 | Inconsistent date format | Mix of DD/MM/YYYY, MM-DD-YYYY, ISO | Normalize, flag ambiguous ones |
| 11 | Duplicate with different amounts | Same date+description, different amounts | Flag both rows, user picks canonical |
| 12 | Zero amount expense | amount == 0 | Warn — likely data entry error |

Generate and store an **Import Report JSON** in `import_sessions` that lists every row, its
anomaly (if any), and the resolution taken.

---

## 📄 DOCUMENTATION FILES (write these as you build, not at the end)

### README.md
- Project description
- Local setup (step by step — someone should be able to clone and run in < 5 commands)
- Deployment URL
- AI tools used (Claude Code)
- How to import the CSV

### SCOPE.md
- Full database schema (with field-level comments)
- Complete anomaly log: every data problem found in the CSV, detection method, policy chosen

### DECISIONS.md — document EACH of these decisions with: Options Considered → Choice → Reason:
1. Tech stack selection (why PostgreSQL over SQLite)
2. Balance calculation: when does Sam start owing? (joined_at policy)
3. Currency conversion: live rate vs historical rate — why historical?
4. Duplicate detection algorithm: exact match vs fuzzy match
5. Debt simplification: why greedy algorithm
6. Settlement vs expense: how do you distinguish them in import
7. Rounding policy: how do you handle ₹0.33 splits
8. Membership window: does a member who left owe expenses from their tenure

### AI_USAGE.md
- Tools used: Claude Code
- 5+ key prompts you gave and what they produced
- At least 3 concrete cases where Claude produced something WRONG, how you caught it,
  what you changed, and what you learned

---

## 🎨 UI/UX REQUIREMENTS

- Mobile-responsive (Tailwind breakpoints)
- Dashboard: group list → group detail → balance summary → drill-down
- Balance cards with color coding (green = owed to you, red = you owe)
- Expense list with filter by date, payer, split type, currency
- Import Wizard as a stepper component (not a single page dump)
- Anomaly review table with inline resolution dropdowns
- Settlement confirmation modal

---

## 🧪 TESTING

Write tests for (use Jest or Pytest):
1. `balanceEngine` — 5 scenarios including membership window and USD conversion
2. `csvImporter` — feed synthetic bad rows, assert correct anomaly types returned
3. `splitEngine` — test all 4 split types for correctness and rounding
4. API endpoint tests — at least auth, expense creation, and balance fetch

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] PostgreSQL hosted (Railway / Supabase / Render)
- [ ] Backend deployed with env vars (DATABASE_URL, JWT_SECRET, EXCHANGE_API)
- [ ] Frontend deployed (Vercel / Netlify / Render static)
- [ ] CORS configured correctly
- [ ] Public URL tested: login → create group → import CSV → see balances

---

## ⚡ EXTRA INNOVATIONS (add these to stand out beyond minimum requirements)

1. **Recurring expense support** — mark an expense as monthly recurring, auto-generate entries
2. **Activity feed** — timestamped log of every action in the group ("Rohan added dinner ₹800")
3. **Export** — download current balances as PDF or CSV
4. **Exchange rate caching** — cache fetched rates in DB to avoid repeated API calls for same date
5. **Soft delete** — never hard-delete expenses; use `is_deleted` flag with audit trail

---

## 📋 BUILD ORDER (follow this sequence)

1. Init repo + git + folder structure
2. DB schema → Prisma migrations
3. Auth routes (register/login) + middleware
4. Group CRUD + membership model
5. Expense CRUD + split engine
6. Balance engine + debt simplification
7. Settlement recording
8. CSV importer + anomaly detection
9. Import Wizard UI
10. Balance UI + drill-down
11. Dashboard + settlement flow UI
12. Tests
13. Deploy
14. Write all documentation files

**Commit after each step. Never make a single bulk commit.**

---

## 🔴 HARD RULES (do not violate these)

- Never edit `expenses_export.csv` before importing — the importer must handle it as-is
- Never use a NoSQL database
- Never silently discard or silently fix a data anomaly — always surface it
- Never hardcode exchange rates — fetch historically per date
- Every balance number shown in the UI must be traceable to specific expense rows

---

Begin by scaffolding the project structure, initializing git with an initial commit, then proceed
through the build order above. Ask me to clarify any product decision before making a silent
assumption — document every significant assumption you do make in DECISIONS.md.
