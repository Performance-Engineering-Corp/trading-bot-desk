# Trading Bot Desk

Public, read-only Next.js trading desk for a live (or paper) bot. Dark neon terminal board with **real trades only** — open positions, closed fills, risk meters, trade tape, and win/loss stats. No Alpha signal picks.

Data is pushed by your bot into **Vercel Blob** via `POST /api/snapshot`. The page server-renders the latest snapshot + history, then the client polls `GET /api/snapshot` (~8s) and `GET /api/history` (less often, and not while the tab is hidden).

Repo: https://github.com/Performance-Engineering-Corp/trading-bot-desk

## Stack

- Next.js App Router + TypeScript + Tailwind
- `@vercel/blob` for `bot/latest.json` and `bot/history.json`

## Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/` | public | Desk UI (auto-refresh ~8s) |
| `GET` | `/api/snapshot` | public | Latest sanitized snapshot |
| `POST` | `/api/snapshot` | `x-bot-ingest-secret` | Ingest snapshot (+ optional closed trades) |
| `GET` | `/api/history` | public | Merged closed-trade history |

## Sanitize rules (enforced on ingest)

Before writing to Blob, the API recursively strips:

- `order_id`, `client_order_id`, and any `*_order_id` keys
- `api_key`, `api_secret`, `secret`, `token`, `password`, `authorization`, `auth`, `private_key`, `access_key`, `signing_key`, `passphrase`, `credential`
- Top-level `alpha_signals` / `alpha` / `picks` / `signals` / `external_signals` (desk shows **real trades only**)

Keep product ids, prices, sizes, PnL, timestamps, and human reasons. **Never put Coinbase/Alpaca API secrets in the repo or snapshot body.**

## Env (Vercel project settings)

Copy from [`.env.example`](.env.example):

```bash
BLOB_READ_WRITE_TOKEN=   # auto-added when you connect a Blob store
BOT_INGEST_SECRET=       # shared secret; must match the bot's config
```

## Local dev

```bash
npm install
cp .env.example .env.local   # fill tokens if you want live Blob reads
npm run dev                  # http://localhost:3000
```

Without Blob env vars, GET routes return an empty “no data yet” payload. You can still exercise the UI against the sample:

```bash
# After deploy (or with Blob configured locally), seed from fixture:
curl -sS -X POST "https://YOUR_DEPLOY.vercel.app/api/snapshot" \
  -H "content-type: application/json" \
  -H "x-bot-ingest-secret: $BOT_INGEST_SECRET" \
  --data-binary @fixtures/sample-snapshot.json
```

## Vercel deploy

1. Import **Performance-Engineering-Corp/trading-bot-desk** in the Vercel dashboard (or link the GitHub repo to a project).
2. Framework: Next.js (default).
3. Create / connect a **Blob** store → `BLOB_READ_WRITE_TOKEN` is injected.
4. Add env `BOT_INGEST_SECRET` (generate a long random string; same value in the bot).
5. Deploy production.
6. First ingest with the curl above (or from the bot). Confirm `GET /api/snapshot` returns JSON and `/` shows LIVE / PAPER + positions.

Optional CLI (only if already authenticated):

```bash
vercel --prod
```

## Curl ingest example

```bash
export DESK_URL="https://YOUR_DEPLOY.vercel.app"
export BOT_INGEST_SECRET="your-shared-secret"

# Minimal: latest board only
curl -sS -X POST "$DESK_URL/api/snapshot" \
  -H "content-type: application/json" \
  -H "x-bot-ingest-secret: $BOT_INGEST_SECRET" \
  -d @fixtures/sample-snapshot.json

# Body may include closed_trades and/or history — they are sanitized,
# merged into bot/history.json (deduped), and stats are recomputed.
```

Successful response shape:

```json
{ "ok": true, "url": "https://….public.blob.vercel-storage.com/bot/latest.json", "bytes": 12345, "history_url": "…", "history_trades": 5 }
```

Unauthorized → `401 { "error": "unauthorized" }`.

## Sample payload

See [`fixtures/sample-snapshot.json`](fixtures/sample-snapshot.json) — crypto opens, closed trades, tape events, and win/loss stats (no order ids or API keys).

## Design

Dark neon terminal: header with LIVE badge + day PnL, risk meter cards, open positions with SL→TP progress, closed-trades table, trade tape, win/loss strip. Matches the local Coinbase bot desk vibe without Alpha picks.
