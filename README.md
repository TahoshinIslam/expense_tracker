# Expense Tracker

A simple, fast, no-backend expense tracker built with **Next.js 14** and **Tailwind CSS**. All your data is stored locally in your browser via `localStorage` — so there are zero hosting costs beyond the free static deploy on Vercel.

## Features

- Add expenses with amount, category, description, date
- Today / This Month / All-Time totals
- Pie chart breakdown by category (this month)
- Bar chart of last 7 days
- Search & filter expenses
- Export to CSV
- Multi-currency (USD, EUR, GBP, INR, BDT, JPY, CAD, AUD)
- Fully responsive
- No login, no database, no backend

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel (free)

**Option 1 — One-click via GitHub:**
1. Push this folder to a new GitHub repo
2. Go to https://vercel.com/new
3. Import the repo → click Deploy
4. Done. No env vars, no config.

**Option 2 — Vercel CLI:**
```bash
npm i -g vercel
vercel
```

That's it. Because everything is client-side, you're on Vercel's free Hobby tier forever — no serverless functions, no database bills.

## Data storage

Expenses live in `localStorage` under the key `expense-tracker:v1`. This means:

- Data stays on **your** device only (private)
- Different browsers / devices = different data
- Clearing browser data wipes expenses — use the CSV export to back up

## Tech

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Recharts (charts)
- lucide-react (icons)
