# Scope & Anomaly Log

## Data Problems Detected in CSV (Anomaly Log)
During the ingestion of `expenses_export.csv`, our custom importer identifies several types of anomalies. Here is exactly what problems were found and how the system handles them:

1. **MISSING_REQUIRED_FIELD**
   - *Problem:* A row is missing a critical field like `currency` or `description` (e.g., Row 28 was missing currency, Row 13 was missing the payer).
   - *Handling:* The system defaults the currency to `INR` if missing, but flags it as a `WARNING`. For missing payers or descriptions, it flags as an `ERROR` and requires the user to manually use the **OVERRIDE** tool to input the missing data before proceeding.

2. **NEGATIVE_AMOUNT**
   - *Problem:* An expense amount is negative (e.g., Row 26 "Parasailing refund" for `-30 USD`).
   - *Handling:* The system flags this as a `WARNING`. The user is prompted to verify if it is a genuine refund or a typo. They can choose **KEEP** to accept the negative value (which adjusts balances accordingly) or **OVERRIDE** to flip the sign.

3. **UNKNOWN_MEMBER**
   - *Problem:* The `paid_by` or `split_with` columns contain names not in the group (e.g., Row 11 "Priya S", Row 23 "Dev's friend Kabir", or the typo "Alsha").
   - *Handling:* Flagged as an `ERROR`. The user must either use the **OVERRIDE** option to correct the typo to an existing user's name, or they must go back, invite the missing user to the group, and refresh the import session.

4. **DUPLICATE_EXACT**
   - *Problem:* An identical row exists in the CSV (e.g., Row 6 is an exact duplicate of Row 5 "Dinner at Marina Bites").
   - *Handling:* Flagged as an `ERROR`. The default resolution is **DELETE**, which drops the row from the final import payload entirely.

5. **INCONSISTENT_DATE_FORMAT**
   - *Problem:* Ambiguous dates like `04/05/2026` could be interpreted as April 5th or May 4th.
   - *Handling:* Originally flagged as a `WARNING`, but we updated the importer to silently accept and auto-parse ambiguous dates as `DD/MM/YYYY` to streamline the user experience, while strict invalid dates like `99-99-2026` are flagged as `SKIP`.

---

## Database Schema
The database uses PostgreSQL via Prisma. Below is the core architectural outline:

* **User:** Stores authentication details (`id`, `name`, `email`, `passwordHash`).
* **Group:** Stores shared expense environments (`id`, `name`, `currency`).
* **GroupMembership:** Many-to-many link between Users and Groups (`joinedAt`, `leftAt`).
* **Expense:** The core transaction record (`description`, `totalAmount`, `amountInr`, `currency`, `splitType`, `paidBy`).
* **ExpenseSplit:** Maps how much of an `Expense` is owed by specific users (`shareAmount`, `sharePct`, `shareUnits`).
* **Settlement:** Records payments made specifically to clear debts between two users (`amount`, `status`).
* **ImportSession:** Acts as a staging area for CSV uploads.
* **ImportRow:** Stores the raw JSON data of each line in the CSV.
* **ImportAnomaly:** Links to an ImportRow to store detected issues, providing a resolution state (`DELETE`, `KEEP`, `MERGE`, `OVERRIDE`, `SKIP`) and an `overrideData` JSON payload.
