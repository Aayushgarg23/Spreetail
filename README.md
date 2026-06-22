# Spreetail - Expense Sharing Application

## Setup Instructions

### 1. Prerequisites
- Node.js (v18 or higher)
- A PostgreSQL Database (e.g., [Neon.tech](https://neon.tech/))

### 2. Environment Variables
Create a `.env` file in the `backend` directory with the following variables:
```env
DATABASE_URL="postgresql://your_db_user:your_db_password@your_db_host/your_db_name"
JWT_SECRET="any_random_secure_string_here"
NODE_ENV="development"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

### 3. Installation
Open your terminal in the root directory and install dependencies for both the frontend and backend:
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
node prisma/seed.js

cd ../frontend
npm install
```

### 4. Running Locally
Run the backend server:
```bash
cd backend
npm start
```

Run the frontend development server:
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` to view the application!

---

## AI Used
This application was rapidly prototyped and built with the assistance of **Antigravity**, an advanced agentic coding assistant powered by Gemini. The AI was utilized for:
- Database schema design via Prisma
- Full-stack React + Express boilerplate generation
- Complex CSV parsing and anomaly detection algorithms
- Tailwind CSS and Glassmorphism UI styling
- Automated deployment scripts and CI/CD configuration
