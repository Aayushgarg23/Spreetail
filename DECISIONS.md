# DECISIONS.md — Architecture & Policy Decisions

All decisions documented as: **Options Considered → Choice → Reason**

---

## 1. Tech Stack — Why PostgreSQL over SQLite

**Options Considered:**
- SQLite (embedded, zero-setup)
- PostgreSQL (relational, hosted)
- MongoDB (document store)

**Choice:** PostgreSQL

**Reason:** The spec explicitly requires PostgreSQL. Additionally, the data model has complex relational integrity requirements: `group_memberships` references both `users` and `groups`, `expense_splits` references both `expenses` and `users`, and the membership window query (`expense_date BETWEEN joined_at AND left_at`) benefits from proper date indexing. SQLite lacks hosted scalability and has weaker Decimal type support — critical for financial data. MongoDB was ruled out by spec.

---

## 2. Balance Calculation — When Does Sam Start Owing?

**Options Considered:**
- A: Sam owes from the first expense ever (unfair — he wasn't there)
- B: Sam owes from the date he joined (`joined_at` = April 15, 2026)
- C: Manual per-expense include/exclude toggle

**Choice:** Option B — `joined_at` date (`2026-04-15`)

**Reason:** A member can only be liable for shared costs incurred during their membership. This is consistent with how landlords prorate rent. The `group_memberships.joined_at` field serves as the exact cutoff. Any expense with `expense_date < joined_at` is excluded from Sam's splits, regardless of what the CSV says. This is enforced in `balanceEngine.js` and applied both during live expense creation and CSV import (EXPENSE_BEFORE_JOINED anomaly).

**Corollary for Meera:** Meera left on March 31, 2026 (`left_at = 2026-03-31`). Any expense dated after March 31 that lists Meera as a split participant is flagged as `EXPENSE_AFTER_LEFT` and Meera is excluded from the recalculated split.

---

## 3. Currency Conversion — Historical Rate vs Live Rate

**Options Considered:**
- A: Use today's exchange rate for all calculations (simple, always current)
- B: Use the rate as of the `expense_date` for each expense (historical)
- C: Allow user to manually enter the rate

**Choice:** Option B — historical rate per `expense_date`

**Reason:** Using today's rate would cause balances to change daily with currency fluctuations — a ₹300 discrepancy could appear or disappear overnight with no new expenses. Historical rates ensure **balance immutability**: once an expense is recorded, its INR value is frozen. This is the policy used by banks, accounting software (Xero, QuickBooks), and split apps (Splitwise). The rate is fetched from `https://api.frankfurter.app/{YYYY-MM-DD}?from=USD&to=INR` and stored in `exchange_rate_used` on the expense row for auditing.

**Exchange rate caching:** Fetched rates are stored in `exchange_rate_cache` (keyed by `date + from + to`). This avoids repeated API calls for the same date (e.g., multiple USD expenses on March 10).

---

## 4. Duplicate Detection — Exact Match vs Fuzzy Match

**Options Considered:**
- A: Exact match on `(date, description, amount, payer)` — zero false positives
- B: Fuzzy match on description (Levenshtein distance) — catches typos but risks false positives
- C: User-defined deduplication rules

**Choice:** Option A — Exact match only

**Reason:** Financial data requires precision. Fuzzy matching risks incorrectly flagging "Groceries Feb 14" and "Groceries Feb 15" as duplicates. The cost of a false positive (incorrectly deleting a real expense) is worse than a false negative (missing a duplicate). For the import use case, the user reviews all flags anyway — so exact matching is sufficient as the first pass, and users can manually identify near-duplicates from the `DUPLICATE_DIFF_AMOUNT` flag (#11).

---

## 5. Debt Simplification — Why Greedy Algorithm

**Options Considered:**
- A: No simplification — show raw balances, let users figure it out
- B: Greedy algorithm — O(n log n), minimizes transactions
- C: Optimal ILP (Integer Linear Programming) — technically optimal but O(2^n)

**Choice:** Option B — Greedy algorithm

**Reason:** For typical group sizes (2–20 people), the greedy algorithm produces the optimal minimum number of transactions in practice, runs in O(n log n), and is trivially explainable to users ("Pay the person who's owed the most first"). The theoretical optimal (ILP) is NP-hard and overkill for groups of 6. The greedy approach is the same algorithm used by Splitwise and Tricount.

**Implementation:** Separate members into creditors (positive balance) and debtors (negative). Sort both by absolute amount descending. Match largest debtor to largest creditor iteratively, creating a transaction for `min(debtor.amount, creditor.amount)`.

---

## 6. Settlement vs Expense — How to Distinguish in Import

**Options Considered:**
- A: Keyword matching on description only
- B: Separate CSV column `type: expense|settlement`
- C: Heuristic: single-member split + settlement keywords

**Choice:** A with C as reinforcement

**Reason:** The CSV doesn't have a `type` column. The `SETTLEMENT_AS_EXPENSE` detector checks if description contains any of: `["settled", "paid back", "transfer", "repaid", "reimbursed", "cleared", "paid off", "refund", "payback"]`. Additionally, if a row has exactly 1 member in `split_among` and matches a keyword, confidence is higher. The user must explicitly resolve whether to DELETE (move to settlements table) or KEEP (import as expense). Never silently reclassified.

---

## 7. Rounding Policy — How to Handle ₹0.33 Splits

**Options Considered:**
- A: Round each share to 2 decimal places independently (may leave residual)
- B: Floor all shares, give remainder to payer
- C: Banker's rounding (round half to even)
- D: Distribute remainder round-robin

**Choice:** Option B — Floor all shares, remainder to payer

**Reason:** Flooring guarantees `sum(shares) ≤ total_amount` always. The payer absorbs the residual (≤ 1 paisa × n members, typically < ₹1). This is fair: the payer is already managing the cash. Option A can cause `sum(shares) > total_amount` due to independent rounding. Option D is complex to implement and explain. This policy is enforced in `splitEngine.js` for all 4 split types.

**Example:** ₹1001 / 4 members = ₹250.25 each. With floor: each gets ₹250, remainder = ₹1. Payer gets ₹251 instead of ₹250.

---

## 8. Membership Window — Does a Member Who Left Owe Expenses from Their Tenure?

**Options Considered:**
- A: Yes, members who left still owe for expenses during their membership period
- B: No, leaving clears all past debts
- C: User-configurable per group

**Choice:** Option A — Past tenure debts remain

**Reason:** Leaving the flat does not retroactively erase your share of costs you benefited from. If Meera paid zero toward the February electricity bill, she still owes her share — even if she's now gone. The membership window ensures her balance correctly reflects everything she owed during February 1 – March 31. Settlements can be recorded after her departure to clear those debts. This is consistent with the spec requirement: "A member leaving does NOT delete their historical contributions."

---

## 9. Soft Delete Policy

**Options Considered:**
- A: Hard delete — remove from DB immediately
- B: Soft delete — set `is_deleted = true`, keep record

**Choice:** Option B — Soft delete

**Reason:** Financial records must never be permanently destroyed. If an expense is deleted in error, it must be recoverable. Soft delete also maintains the audit trail for `import_sessions` (deleted imported rows remain traceable). Balance calculations filter `WHERE is_deleted = false`. The `deleted_at` and `deleted_by` fields provide full audit capability.

---

## 10. Exchange Rate API — Why frankfurter.app

**Options Considered:**
- Open Exchange Rates (requires API key, free tier limited)
- CurrencyLayer (paid for historical)
- frankfurter.app (free, no key, ECB-sourced, historical support)
- Hardcoded rates (violates spec hard rule)

**Choice:** frankfurter.app

**Reason:** Free, no API key required, provides historical rates by date (`/{YYYY-MM-DD}?from=USD&to=INR`), backed by ECB data. The spec explicitly recommends it. Hardcoding rates is explicitly forbidden by the spec.
