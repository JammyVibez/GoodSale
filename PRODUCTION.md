# Production go-live checklist

## You must provide (cannot be automated)

1. **Supabase project**
   - Create project → run in order:
     1. `supabase/schema.sql`
     2. `supabase/migrations/002_production_hardening.sql`
     3. `supabase/migrations/003_user_suspend.sql`
     4. `supabase/migrations/004_realtime_dispatch_geo.sql`
     5. `supabase/migrations/005_security_payments.sql` (**required** — locked RPCs, disputes, withdrawals)
     6. `supabase/migrations/006_payouts_and_suspend.sql` (transfer metadata + `is_suspended`)
     7. `supabase/migrations/007_storage_roles_otp.sql` (**required** — signup role, role switch RPC, `user-media` bucket)
   - Copy URL, anon key, service role key into `.env.local` / host secrets
   - Auth → Email enabled; Site URL + redirect `https://YOUR_DOMAIN/auth/callback`
   - Auth → Email templates: enable **OTP / 6-digit codes** for signup & magic link (app uses `verifyOtp`, not fake OTPs)
   - Prefer OTP over long confirmation links (Confirm email can stay on — users enter the code in-app)
   - Manually promote first admin:  
     `UPDATE profiles SET role = 'SUPER_ADMIN' WHERE email = 'you@example.com';`

2. **Paystack** — full walkthrough in **[docs/PAYSTACK.md](./docs/PAYSTACK.md)**
   - Live (or test) public + secret keys
   - Webhook URL: `https://YOUR_DOMAIN/api/payments/webhook`
   - Set `PAYSTACK_WEBHOOK_SECRET` (or reuse secret key)
   - Enable **Transfers** + fund balance for seller payouts

3. **App URL**
   - `NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN`
   - `NEXT_PUBLIC_DEMO_MODE=false`

4. **Google Maps** (SafeMeet + live GoodDispatch)
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with Maps JavaScript, Embed, Geocoding APIs

5. **Optional**
   - `GEMINI_API_KEY` — AI listing / search tips
   - `RESEND_API_KEY` + `EMAIL_FROM` — dispute / payout emails
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — distributed rate limits
   - `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error capture when SDK wired

See **`.env.example`** for the complete variable list.

## Already implemented in code

| Area | Status |
|------|--------|
| Mock seed data removed | Done |
| Supabase Auth signup/login/reset | Done |
| Realtime catalog/orders/chat/dispatch | Done |
| Persist products, orders, escrow, chat, bids, reviews, SafeMeet, ads, bundles, settings | Done |
| Server PIN escrow release RPC + API | Done |
| Courier PIN complete-delivery-job API | Done |
| Disputes open/resolve + optional email | Done |
| Seller withdrawals + admin Paystack Transfer | Done |
| Admin force escrow API | Done |
| Orders UPDATE locked (RPC-only status changes) | Done (migration 005) |
| `credit_wallet` / `mark_order_paid` service_role only | Done (migration 005) |
| Paystack order-first checkout (`GS_<orderId>_`) | Done |
| Payment unit tests (vitest) | Done |
| Order ship / out-for-delivery API | Done |
| Paystack verify + webhook → DB | Done |
| Media upload API (products / chat / IDs) | Done |
| AI route auth when not demo | Done |
| CSP without `unsafe-eval` | Done |
| Upstash-optional rate limits | Done |
| Landing feed/ratings from real data | Done |
| Security headers, CI, Docker, health | Done |
| Setup banner when env missing | Done |

## After secrets are set

```bash
npm install
npm run build && npm start
# or: docker compose up --build
```

Smoke test: sign up → list with photos → buy with Paystack → ship → buyer PIN release → seller withdraw → admin approve Transfer.
