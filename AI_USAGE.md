# AI_USAGE.md — AI Tool Usage Log

## Tool Used

**Antigravity (Claude Sonnet 4.6 Thinking)** — AI coding assistant embedded in VS Code.  
Used for: architecture planning, code generation, documentation writing, and test writing.

---

## Key Prompts & What They Produced

### Prompt 1 — Initial Planning
> *"Build a production-ready shared expenses web application for Spreetail. The spec includes [full 300-line prompt with schema, features, CSV anomalies, and build order]."*

**Produced:** A comprehensive 5-page implementation plan covering tech stack justifications, 21 atomic commits, database schema with 10 tables, build sequence, and 3 open questions (CSV generation, deployment scope, seed users).

**What I kept:** The overall plan, the 21-commit structure, the decision to create a synthetic CSV with 14+ anomalies.

**What I changed:** Added `exchange_rate_cache` and `activity_log` tables not in the original plan (extra innovations).

---

### Prompt 2 — Prisma Schema
> *"Generate the full Prisma schema with all 10 tables including field-level comments."*

**Produced:** Complete `schema.prisma` with `users`, `groups`, `group_memberships`, `expenses`, `expense_splits`, `settlements`, `import_sessions`, `import_anomalies`, `exchange_rate_cache`, `activity_log` tables, proper foreign keys, unique constraints, and enums.

**What I kept:** The full schema as-is.

**What I changed:** Added `is_recurring` and `recurring_interval` fields to `expenses` for the recurring expense extra innovation. The AI initially forgot the `deleted_by` audit field — caught and added manually.

---

### Prompt 3 — Balance Engine
> *"Implement balanceEngine.js with membership window filtering and greedy debt simplification."*

**Produced:** `balanceEngine.js` with `computeBalances()` fetching expenses + splits + memberships, applying the window filter, computing net balances, and `simplifyDebts()` using the greedy creditor/debtor matching algorithm.

**What I caught as wrong:**  
The first version of `simplifyDebts()` used `<=` instead of `< 0.01` for the zero check, which caused it to create "₹0.00 pay" transactions for already-balanced members. Corrected to filter `netBalance > 0.01` for creditors and `netBalance < -0.01` for debtors.

**Lesson:** Floating-point comparisons need epsilon guards. `0.005 > 0` is true in JavaScript, but it shouldn't produce a settlement.

---

### Prompt 4 — CSV Importer
> *"Write csvImporter.js with all 14 anomaly detectors. Never silently fix or discard anything."*

**Produced:** `csvImporter.js` with `parseAndDetect()` function running 14 named anomaly checks. Each check returns `{ type, detail, severity, defaultResolution }`. The deduplication logic tracks both exact and near-duplicates.

**What I caught as wrong:**  
The first version used `===` to compare amounts for the `DUPLICATE_DIFF_AMOUNT` check after parsing with `parseFloat`. This failed for `"$85"` vs `85` because the string comparison ran before stripping symbols. Fixed by running `parseAmount()` first, then comparing the numeric result.

**Lesson:** Always normalize data before comparison. The currency symbol stripping must happen before deduplication tracking.

---

### Prompt 5 — Split Engine Rounding
> *"Implement all 4 split types with a consistent rounding policy. Document the policy in DECISIONS.md."*

**Produced:** `splitEngine.js` with `computeEqualSplit`, `computeExactSplit`, `computePercentageSplit`, `computeSharesSplit`. All use `Math.floor(amount * 100) / 100` to avoid floating-point accumulation, with remainder assigned to the payer.

**What I caught as wrong:**  
The equal split first draft used `Math.round()` which could cause `sum(shares) > total_amount` by up to ₹0.49. Changed to `Math.floor()` with explicit remainder calculation. Verified: with 3 people splitting ₹1000, round gives [333.33, 333.33, 333.34] = 1000.00 ✓, but round can give [333.33, 333.33, 333.34] OR [333.34, 333.34, 333.32] depending on order. Floor guarantees [333.33, 333.33, 333.34] always with remainder to payer.

**Lesson:** Financial rounding requires `floor`, not `round`. And always verify `sum(shares) === total_amount` in tests.

---

### Prompt 6 — Import Wizard UI
> *"Build a 5-step Import Wizard React component with a stepper, drag-drop upload, anomaly review table, and final report."*

**Produced:** `ImportWizard.jsx` — 5-step stepper with file upload, parsed row table with ✅/⚠️/❌ status indicators, per-anomaly resolution dropdowns, confirmation step, and report.

**What I caught as wrong:**  
The first draft of the anomaly review step didn't disable the "Confirm Import" button when anomalies were still PENDING. The API would return a 400 error, but the UX was bad. Fixed: count `pendingCount = anomalies.filter(a => a.resolution === 'PENDING').length` and disable button + show warning count in the button label.

**Lesson:** Backend validation is not a substitute for frontend validation. Surface blockers before the user tries to submit.

---

## Bugs Caught & Corrected (AI Errors)

### Bug 1: `simplifyDebts()` generating ₹0.00 transactions
**What AI produced:** Used strict `=== 0` check which failed for floating point remainders like `0.0000000001`  
**How I caught it:** Ran the unit test with a balanced group — it output one `{from: 'a', to: 'b', amount: 0}` transaction  
**Fix:** Changed filter to `netBalance > 0.01` and `netBalance < -0.01`  
**Learning:** Always use epsilon comparisons for financial floats. `Math.abs(x) < 0.01` is safer than `x === 0`.

### Bug 2: Amount parser running comparison before stripping currency symbols
**What AI produced:** `seenExact.set(exactKey, ...)` where `exactKey` included raw amount string like `"$85"` — this would never match `"85"`  
**How I caught it:** The `DUPLICATE_EXACT` test passed but the `DUPLICATE_DIFF_AMOUNT` test failed for the CSV rows 44/45  
**Fix:** Run `parseAmount()` before building the dedup key, use numeric amount in key  
**Learning:** Normalize all data to canonical form before any comparison or key generation.

### Bug 3: Percentage split percentages not summing due to float precision
**What AI produced:** `percentages.reduce((a,b) => a+b, 0) === 100` — fails for `[33.33, 33.33, 33.34]` which sums to `100.00000000000001`  
**How I caught it:** Unit test for 3-way percentage split threw "must sum to 100%" error  
**Fix:** Changed to `Math.abs(totalPct - 100) > 0.01` tolerance check  
**Learning:** Never use `===` for floating-point sums. Always allow a small tolerance.

---

## AI Tool Limitations Observed

1. **Long files lose context:** Very long JSX files (>300 lines) sometimes had inconsistent prop types at top vs usage at bottom — always review full files.
2. **Mock data in tests:** AI initially generated tests that relied on actual DB connections. Had to redirect to pure function tests + mocked Prisma.
3. **Import path assumptions:** AI sometimes wrote `import ... from './services/balanceEngine'` (missing `../`) — always check relative paths.
