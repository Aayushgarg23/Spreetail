# SCOPE.md — Full System Scope

## Database Schema (Field-Level Comments)

### `users`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Display name (e.g. "Aisha") |
| email | VARCHAR UNIQUE | Login email |
| password_hash | VARCHAR | bcrypt hash (10 rounds) |
| created_at | TIMESTAMP | Account creation time |

### `groups`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Group name (e.g. "Flat 4B") |
| created_at | TIMESTAMP | Group creation time |
| created_by | UUID FK→users | Who created the group |

### `group_memberships`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID FK→groups | Which group |
| user_id | UUID FK→users | Which user |
| joined_at | DATE | When they joined (used as balance window start) |
| left_at | DATE NULLABLE | When they left (NULL = still active; used as balance window end) |

> **Key policy:** Balance calculations only include expenses where `joined_at ≤ expense_date ≤ left_at (or NOW)`.

### `expenses`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID FK→groups | Which group |
| description | TEXT | Expense description |
| total_amount | DECIMAL(12,2) | Original amount in original currency |
| currency | VARCHAR(3) | "INR" or "USD" |
| amount_inr | DECIMAL(12,2) | Always in INR; = total_amount × exchange_rate_used for USD |
| exchange_rate_used | DECIMAL(10,4) NULLABLE | Historical USD→INR rate on expense_date; NULL for INR expenses |
| split_type | ENUM | equal / exact / percentage / shares |
| paid_by | UUID FK→users | Who paid the full amount |
| expense_date | DATE | When the expense occurred (used for balance window and rate lookup) |
| created_at | TIMESTAMP | When the record was created |
| is_deleted | BOOLEAN | Soft delete flag (true = hidden from all queries) |
| deleted_at | TIMESTAMP NULLABLE | When it was soft-deleted |
| deleted_by | UUID FK→users NULLABLE | Who soft-deleted it |
| import_row_id | UUID FK→import_anomalies NULLABLE | Links to the import anomaly if from CSV |
| is_recurring | BOOLEAN | True if this is a recurring expense template |
| recurring_interval | VARCHAR NULLABLE | "monthly" or "weekly" |

### `expense_splits`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| expense_id | UUID FK→expenses | Which expense |
| user_id | UUID FK→users | Which member owes |
| share_amount | DECIMAL(12,2) | INR amount this member owes |
| share_pct | DECIMAL(6,3) NULLABLE | Percentage (for percentage splits) |
| share_units | INT NULLABLE | Units (for shares splits) |

> **Unique constraint:** (expense_id, user_id) — one split row per member per expense.

### `settlements`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID FK→groups | Which group |
| from_user | UUID FK→users | Who paid |
| to_user | UUID FK→users | Who received |
| amount | DECIMAL(12,2) | Amount paid in INR |
| settled_at | TIMESTAMP | When it was recorded |
| note | TEXT NULLABLE | Optional note |

### `import_sessions`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID FK→groups | Which group |
| filename | VARCHAR | Original CSV filename |
| imported_at | TIMESTAMP | When upload started |
| imported_by | UUID FK→users | Who uploaded |
| status | ENUM | PENDING / REVIEWING / CONFIRMED / COMPLETED / FAILED |
| total_rows | INT | Total rows in CSV |
| imported_rows | INT | Successfully imported |
| skipped_rows | INT | Skipped (deleted/rejected) |
| report_json | JSON | Full import report document |

### `import_anomalies`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID FK→import_sessions | Which import session |
| row_number | INT | 1-indexed CSV row number (2 = first data row) |
| raw_row | JSON | Original CSV row as key-value JSON |
| anomaly_type | VARCHAR | Machine-readable type (e.g. "DUPLICATE_EXACT") |
| anomaly_detail | TEXT | Human-readable explanation |
| resolution | ENUM | PENDING / DELETE / KEEP / MERGE / OVERRIDE / SKIP |
| resolved_by | UUID FK→users NULLABLE | Who set the resolution |
| resolved_at | TIMESTAMP NULLABLE | When it was resolved |
| override_data | JSON NULLABLE | User-provided corrected values |

### `exchange_rate_cache`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| date | DATE | The date of the rate |
| from_currency | VARCHAR(3) | Source currency (e.g. "USD") |
| to_currency | VARCHAR(3) | Target currency (e.g. "INR") |
| rate | DECIMAL(10,4) | Exchange rate |
| fetched_at | TIMESTAMP | When it was fetched from API |

> **Unique constraint:** (date, from_currency, to_currency) — one rate per date per pair.

### `activity_log`
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID FK→groups | Which group |
| user_id | UUID FK→users | Who performed the action |
| action | VARCHAR | Machine-readable action (e.g. "EXPENSE_ADDED") |
| description | TEXT | Human-readable (e.g. "Rohan added Dinner ₹800") |
| metadata | JSON NULLABLE | Extra context (expense ID, amounts, etc.) |
| created_at | TIMESTAMP | When the action occurred |

---

## Complete Anomaly Log — `expenses_export.csv`

### Anomalies in the CSV

| # | Row | Anomaly Type | Description | Detection Method | Policy |
|---|-----|---|---|---|---|
| 1 | Row 22 | DUPLICATE_EXACT | "Groceries, 2026-03-14, ₹1250, Priya" appears twice (rows 15 & 22) | Exact match on (date, description, amount, payer) | Flag both; user picks one to DELETE |
| 2 | Row 14 | CURRENCY_MISMATCH + CURRENCY_SYMBOL_IN_AMOUNT | Amount "$85" in row 14 — has USD symbol but currency column says INR | Amount field regex: `^\\$` | Treat as USD; convert historically |
| 3 | Row 37 | NEGATIVE_AMOUNT | Row 37: amount = -800 (Meera refund) | `amount < 0` check | Flag; user decides if refund or error |
| 4 | Row 23 | SETTLEMENT_AS_EXPENSE | "Aisha settled with Rohan" — description contains "settled" | Keyword match on description | Flag; suggest moving to settlements table |
| 5 | Row 28 | SETTLEMENT_AS_EXPENSE | "Rohan paid back Priya" — description contains "paid back" | Keyword match | Flag; suggest settlements table |
| 6 | Row 55 | EXPENSE_AFTER_LEFT | "Meera trip contribution" dated 2026-06-08, but Meera left 2026-03-31 | `expense_date > membership.left_at` for Meera | Flag; exclude Meera from split |
| 7 | Row 30 | EXPENSE_BEFORE_JOINED | "Sam welcome dinner" dated 2026-04-15, split includes Sam (joined Apr 15) — borderline; other dates in same block | `expense_date < membership.joined_at` | Flag; Sam excluded from pre-join expenses |
| 8 | Row 49 | UNKNOWN_MEMBER | Payer is "Devraj" — not in group members (should be "Dev") | Name lookup against users table | Flag; user maps to "Dev" or skips |
| 9 | Row 57 | MISSING_REQUIRED_FIELD | Row 57: date column is blank | `date.trim() === ''` | Reject; log reason |
| 10 | Row 38 | INCONSISTENT_DATE_FORMAT | "05/01/2026" — DD/MM/YYYY where day=5 and month=1 is unambiguous, but format differs from ISO | Format regex + flag non-ISO | Normalize to 2026-01-05; warn on format |
| 11 | Row 39 | INCONSISTENT_DATE_FORMAT | "05-03-2026" — MM-DD-YYYY format, ambiguous (could be March 5 or May 3) | Both day and month ≤ 12 | Flag as ambiguous; require user confirmation |
| 12 | Rows 44,45 | DUPLICATE_DIFF_AMOUNT | "Dinner out, 2026-05-12" appears with ₹2800 AND ₹3100 | Same (date+desc), different amounts | Flag both; user picks canonical amount |
| 13 | Row 33 | ZERO_AMOUNT | "Groceries, 2026-04-20, ₹0" | `amount === 0` | Warn; likely data entry error |
| 14 | Row 58 | DUPLICATE_EXACT | Row 58 is exact copy of row 44 (dinner out, 2026-05-12, ₹2800, Aisha) | Exact duplicate detection | Flag; user picks one to DELETE |
| 15 | Row 59 | DUPLICATE_EXACT | Row 59 is exact copy of row 41 (house party, 2026-05-08, ₹6000, Rohan) | Exact duplicate detection | Flag; user picks one to DELETE |

### Anomaly Summary

| Anomaly Type | Count |
|---|---|
| DUPLICATE_EXACT | 3 |
| CURRENCY_MISMATCH | 1 |
| CURRENCY_SYMBOL_IN_AMOUNT | 1 |
| NEGATIVE_AMOUNT | 1 |
| SETTLEMENT_AS_EXPENSE | 2 |
| EXPENSE_AFTER_LEFT | 1 |
| EXPENSE_BEFORE_JOINED | 1 |
| UNKNOWN_MEMBER | 1 |
| MISSING_REQUIRED_FIELD | 1 |
| INCONSISTENT_DATE_FORMAT | 2 |
| DUPLICATE_DIFF_AMOUNT | 1 |
| ZERO_AMOUNT | 1 |
| **Total** | **16** |

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login + get JWT |
| GET | /api/auth/me | Current user info |
| PATCH | /api/auth/me | Update name/password |

### Groups
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/groups | List my groups |
| POST | /api/groups | Create group |
| GET | /api/groups/:id | Group detail + members |
| POST | /api/groups/:id/members | Invite member by email |
| PATCH | /api/groups/:id/members/:userId | Set member's left_at date |
| GET | /api/groups/:id/activity | Activity feed |

### Expenses
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/groups/:groupId/expenses | List expenses (filterable) |
| POST | /api/groups/:groupId/expenses | Create expense |
| GET | /api/expenses/:id | Expense detail + splits |
| PATCH | /api/expenses/:id | Update expense |
| DELETE | /api/expenses/:id | Soft delete |

### Balances & Settlements
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/groups/:groupId/balances | Balances + settlement plan |
| GET | /api/groups/:groupId/balances/:userId/drilldown | Per-user expense breakdown |
| POST | /api/groups/:groupId/settlements | Record a settlement payment |
| GET | /api/groups/:groupId/settlements | Settlement history |

### CSV Import
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/import/upload | Upload CSV, parse + detect anomalies |
| GET | /api/import/:sessionId | Get session + anomalies |
| PATCH | /api/import/:sessionId/anomalies/:anomalyId | Resolve single anomaly |
| PATCH | /api/import/:sessionId/anomalies | Bulk resolve anomalies |
| POST | /api/import/:sessionId/confirm | Execute import |
| GET | /api/import/:sessionId/report | Get final report |
