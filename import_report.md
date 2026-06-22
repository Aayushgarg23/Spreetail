# Import Report

**Session ID:** `latest`
**File Processed:** `expenses_export.csv`
**Status:** Completed

## Summary
* **Total Rows Parsed:** 43
* **Clean Rows (Imported seamlessly):** 36
* **Anomalies Detected:** 7
* **Actioned Rows:** 7

## Anomaly Breakdown & Actions Taken

| Row # | Raw Data Snapshot | Anomaly Type | Detail | User Action Taken |
|-------|-------------------|--------------|--------|-------------------|
| 6 | `2026-02-08,dinner - marina bites,Dev,3200` | **DUPLICATE_EXACT** | Exact match of Row 5 properties | **DELETE** (Row skipped) |
| 11 | `...,Groceries DMart,Priya S,1875,...` | **UNKNOWN_MEMBER** | Payer 'Priya S' is not in group | **OVERRIDE** (Changed payer to 'Priya') |
| 14 | `2026-02-25,Rohan paid Aisha back,Rohan,5000`| **SETTLEMENT_IDENTIFIED** | Row resembles a debt settlement | **SKIP** (User handled manually) |
| 23 | `...,Dev's friend Kabir` | **UNKNOWN_MEMBER** | Target split member 'Kabir' missing | **DELETE** (Excluded from split pool) |
| 26 | `12/03/2026,Parasailing refund,Dev,-30` | **NEGATIVE_AMOUNT** | Amount (-30) is below zero | **KEEP** (Refund was legitimate) |
| 28 | `15/03/2026,Groceries DMart,Priya,2105,,` | **MISSING_REQUIRED_FIELD** | Currency is blank | **OVERRIDE** (Changed to 'INR') |
| 31 | `22/03/2026,Dinner order Swiggy,Priya,0` | **ZERO_AMOUNT** | Amount is exactly 0 | **DELETE** (Invalid transaction) |

*(Note: 13 rows contained ambiguous date formats like `04/05/2026`, but these were seamlessly auto-corrected by the parser without triggering a halt, per the updated `csvImporter.js` rules.)*
