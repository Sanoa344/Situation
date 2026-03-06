# Situation — Polymarket Intelligence

Real-time dashboard for tracking the best Polymarket traders.

## Deploy to Vercel (fastest)

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import your repo
3. Vercel auto-detects Next.js — just click Deploy

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## How it works

- Fetches real data from `data-api.polymarket.com` (tries direct, then corsproxy.io fallback)
- 100 traders from the monthly leaderboard, enriched with trades/positions/value
- Falls back to realistic mock data if APIs are unreachable
- Auto-refreshes every 90 seconds

## Data sources

- `data-api.polymarket.com/trader-leaderboard-rankings`
- `data-api.polymarket.com/trades?user={addr}`
- `data-api.polymarket.com/positions?user={addr}`
- `data-api.polymarket.com/closed-positions?user={addr}`
- `data-api.polymarket.com/value?user={addr}`
