# GoodSale

Nigeria's escrow-backed C2C marketplace — identity verification, Paystack payments, SafeMeet delivery, and AI shopping safety tips.

## Quick start (demo)

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `NEXT_PUBLIC_DEMO_MODE` unset, local `NODE_ENV=development` keeps demo features on (guest login, mock payments without Paystack keys, instant verify).

## Production checklist

Set these in your host environment (Vercel, Docker, etc.):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_DEMO_MODE` | **Yes → `false`** | Disables guest login, mock card/wallet credit, email SUPER_ADMIN elevation, open `/api/db` blob sync, instant ID verify |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical URL for SEO / sitemap |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Yes | Paystack Inline checkout |
| `PAYSTACK_SECRET_KEY` | Yes | Server-side `transaction.verify` |
| `PAYSTACK_WEBHOOK_SECRET` | Recommended | Webhook HMAC (`/api/payments/webhook`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Auth + storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client / RLS-scoped access |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Private ID uploads — never expose to browser |
| `GEMINI_API_KEY` | Optional | AI tips; heuristics used if missing |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | SafeMeet map |

### What this release hardens

- **Payments**: No more in-app card/CVV/PIN forms. Paystack Inline + `/api/payments/verify` + webhook receiver.
- **APIs**: Rate limits, payload size/MIME checks, sanitized errors, structured JSON logs.
- **Demo gates**: Dangerous prototype paths refuse to run when demo mode is off.
- **Ops**: `.gitignore`, `/api/health`, security headers (CSP/HSTS/etc.), Docker standalone image, GitHub Actions CI (`lint` / `typecheck` / `build`), `robots.ts` / `sitemap.ts`.

### Still required before handling real money / PII at scale

1. **Supabase Auth** (or equivalent) with httpOnly sessions — replace client-side password simulation.
2. **Normalized tables + RLS** — replace the demo full-state JSON blob (`market_state` / `/api/db`).
3. **Admin-only verification workflow** — review government IDs from a private bucket; never self-approve.
4. **Escrow ledger on the server** — delivery PIN hashing and fund release must not be client-authoritative.

## Scripts

```bash
npm run dev         # local development
npm run build       # production build
npm run start       # serve production build
npm run lint        # Next.js ESLint
npm run typecheck   # tsc --noEmit
```

## Docker

```bash
docker compose up --build
# health: GET /api/health
```

## Paystack webhook

Point Paystack to `https://<your-domain>/api/payments/webhook` and set `PAYSTACK_WEBHOOK_SECRET` (or reuse `PAYSTACK_SECRET_KEY` for HMAC).

## License

Private — All rights reserved.
