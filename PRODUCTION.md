# Production go-live checklist

## You must provide (cannot be automated)

1. **Supabase project**
   - Create project → run in order:
     1. `supabase/schema.sql`
     2. `supabase/migrations/002_production_hardening.sql`
     3. `supabase/migrations/003_user_suspend.sql`
     4. `supabase/migrations/004_realtime_dispatch_geo.sql`
     5. `supabase/migrations/005_security_payments.sql` (**required** for locked RPCs, disputes, withdrawals)
   - Copy URL, anon key, service role key into `.env.local` / host secrets
   - Auth → Email enabled; Site URL + redirect `https://YOUR_DOMAIN/auth/callback`
   - Manually promote first admin:  
     `UPDATE profiles SET role = 'SUPER_ADMIN' WHERE email = 'you@example.com';`

2. **Paystack**
   - Live public + secret keys
   - Webhook URL: `https://YOUR_DOMAIN/api/payments/webhook`
   - Set `PAYSTACK_WEBHOOK_SECRET` (or reuse secret key)

3. **App URL**
   - `NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN`
   - `NEXT_PUBLIC_DEMO_MODE=false`

4. **Optional**
   - `GEMINI_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (enable Maps JavaScript, Embed, and Geocoding APIs for live GoodDispatch tracking)

## Already implemented in code

| Area | Status |
|------|--------|
| Mock seed data removed | Done |
| Supabase Auth signup/login/reset | Done |
| Realtime catalog/orders/chat/dispatch | Done |
| Persist products, orders, escrow, chat | Done |
| Server PIN escrow release RPC + API | Done |
| Courier PIN complete-delivery-job API | Done |
| Disputes open/resolve RPCs + Paystack refund attempt | Done |
| Seller withdrawals + admin approve/reject | Done |
| Admin force escrow API | Done |
| Orders UPDATE locked (RPC-only status changes) | Done (migration 005) |
| `credit_wallet` / `mark_order_paid` service_role only | Done (migration 005) |
| Paystack order-first checkout (`GS_<orderId>_`) | Done |
| Payment unit tests (vitest) | Done |
| Order ship / out-for-delivery API | Done |
| Paystack verify + webhook → DB | Done |
| Media upload API (products / chat / IDs) | Done |
| Role/wallet self-tamper guards | Done (migration 002) |
| Security headers, CI, Docker, health | Done |
| Setup banner when env missing | Done |

## After secrets are set

```bash
npm install
npm run build && npm start
# or: docker compose up --build
```

Smoke test: sign up → list with photos → buy with Paystack → ship → buyer PIN release → seller wallet credit.
