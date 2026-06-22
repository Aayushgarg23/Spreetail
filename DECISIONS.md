# Decision Log

This document tracks significant architectural and product decisions made during development.

### 1. Monorepo Structure vs Separated Repos
* **Options Considered:** 
  1. Two separate GitHub repositories (Frontend and Backend).
  2. Next.js full-stack framework.
  3. Monorepo folder structure with React + Express.
* **Decision:** Monorepo with React (Vite) and Express.
* **Why:** We needed a robust relational database mapping (Prisma) and a separate staging area for bulk data ingestion logic, which is cleaner to manage in a dedicated Express API layer. A monorepo ensures the frontend and backend are tightly coupled for rapid iteration.

### 2. Single Unified Deployment
* **Options Considered:**
  1. Deploy Frontend to Vercel/Netlify, Backend to Render.
  2. Deploy everything as a single web service on Render.
* **Decision:** Single unified web service on Render.
* **Why:** By configuring Express to serve the static Vite React build (`express.static`), we eliminate CORS configuration issues and ensure the API and Frontend share the exact same domain. This reduces the number of hosted services to maintain from two to one.

### 3. Handling CSV Import Anomalies (The Staging Approach)
* **Options Considered:**
  1. Reject the entire CSV file if any errors are found (Strict).
  2. Import all clean rows and silently drop bad rows (Silent failure).
  3. Store rows in a temporary database session and provide a UI wizard to resolve them (Staging).
* **Decision:** Staging approach with a resolution UI wizard.
* **Why:** Shared expense CSVs are notoriously messy (typos, negative values, missing data). Rejecting the file frustrates users. We decided to create `ImportSession`, `ImportRow`, and `ImportAnomaly` tables to temporarily hold the parsed data. This allows the user to manually `OVERRIDE` or `SKIP` specific bad rows through a clean UI *before* the data is permanently written to the actual `Expense` ledgers.

### 4. Split Engine Rounding
* **Options Considered:**
  1. Leave floating point errors as-is (e.g., ₹100 / 3 = 33.33, losing 0.01).
  2. Arbitrarily assign the missing/extra 0.01 to the first person in the array.
  3. Always assign the remainder to the person who *paid* the expense.
* **Decision:** Assign the remainder to the Payer.
* **Why:** If Aisha pays ₹100 and splits it 3 ways, the system assigns shares of 33.33. The missing 0.01 is added to Aisha's share (33.34). This ensures the sum of shares perfectly equals the total amount, and applying the rounding error to the person who initiated the transaction prevents unfair debt accumulation for passive members.

### 5. Date Parsing Automation
* **Options Considered:**
  1. Force users to strictly format CSV dates as `YYYY-MM-DD`.
  2. Attempt to parse `DD-MM-YYYY` and `MM-DD-YYYY` with strict warnings.
* **Decision:** Silently accept and auto-parse ambiguous dates.
* **Why:** Originally, we warned users about dates like `03/03/2026` because the system couldn't guarantee if it was `MM/DD` or `DD/MM`. However, this cluttered the Anomaly Review wizard with warnings. We decided to optimize for user speed by defaulting ambiguous dates to `DD/MM/YYYY` (the regional standard) without throwing an anomaly warning.
