# AI Usage Report

## AI Tool Used
**Antigravity** (Google DeepMind Agentic Coding Assistant powered by Gemini)

## Key Prompts Used
1. *"Write two complete React JSX files for the Spreetail shared expenses app. Use TailwindCSS with the custom classes... Create a CSV Import Wizard at /groups/:groupId/import. A 5-step stepper UI."*
2. *"The share people not showig up so calucalutate all these properly and how the zero amount if someone has to get none or give also show how much to get and give properly."*
3. *"Make the UI for the override and rest parts as well."*

---

## Concrete Cases Where the AI Was Wrong & How It Was Fixed

### 1. PowerShell Syntax Errors in Build Commands
* **What the AI did wrong:** When instructing me to test deployment commands locally, the AI provided chained bash commands using `&&` (e.g., `cd frontend && npm install && npm run build`). Since my terminal environment was Windows PowerShell, the `&&` operator threw a `ParserError`.
* **How I caught it:** The terminal instantly spit out red text reading `The token '&&' is not a valid statement separator in this version.`
* **What changed:** The AI adapted by recognizing the PowerShell limitation. Instead of relying on local PowerShell chained execution, we used NPM's `--prefix` flag (`npm install --prefix frontend`) which works universally, and ensured the `&&` syntax was only supplied for the Render environment (which uses Linux bash).

### 2. Incorrect Path Given for Database Seed Script
* **What the AI did wrong:** When the database threw an error because it lacked tables/users, the AI told me to run `node src/scripts/seed.js` inside the Render Build Command to inject demo users.
* **How I caught it:** The Render deployment failed completely, throwing a `MODULE_NOT_FOUND: Cannot find module '/opt/render/.../src/scripts/seed.js'`.
* **What changed:** The AI used its terminal tools to inspect the backend directory tree. It discovered the script was actually located at `prisma/seed.js`, not `src/scripts/seed.js`. The AI provided the corrected build command (`node prisma/seed.js`) and explained the error.

### 3. Semicolon Delimiters Ignored in Split Engine
* **What the AI did wrong:** The initial backend parsing logic assumed that the `split_with` column in the CSV was strictly comma-separated (e.g., `Aisha, Rohan, Priya`). However, the actual CSV contained semicolons (`Aisha;Rohan;Priya`). The AI's backend silently failed to parse the names, resulting in an empty split array. The system incorrectly defaulted to charging 100% of the expense to the payer.
* **How I caught it:** I noticed that in the UI, the "YOUR SHARE" column was showing `—` (a dash indicating zero share) for almost every single expense, even ones I was supposed to be part of.
* **What changed:** The AI inspected the `POST /confirm` logic in `import.js` and modified the string-splitting regex from a simple comma split to a regex that handles both commas and semicolons: `String(rawSplit).split(/[,;]/).map(s => s.trim())`. This correctly populated the `splitMembers` array, and the UI math instantly fixed itself.
