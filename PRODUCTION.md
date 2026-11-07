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
     7. `supabase/migrations/007_avatars_bucket.sql` (avatars storage bucket)
     8. `supabase/migrations/008_platform_fee_toggle.sql` (admin-controlled platform fee — OFF at launch)
     9. `supabase/migrations/009_admin_ads.sql` (admin ads: image/video upload + placements)
     10. `supabase/migrations/010_announcements.sql` (admin popup shown on app entry)
    11. `supabase/migrations/011_self_service_roles.sql`
    12. `supabase/migrations/012_community_trust_areas.sql` (service coverage, reports, calls)
    13. `supabase/migrations/013_seeded_catalog.sql` (`is_seeded` markers for the launch catalog)
    14. `supabase/migrations/014_products_video.sql` (optional product video)
    15. `supabase/migrations/015_resync_id_sequences.sql` (safe bulk re-seeding)
    16. `supabase/migrations/016_compare_at_price.sql` (seller compare-at price for real discount badges)
   - Or automate it: add a direct Postgres connection string as `DATABASE_URL`
     (Project Settings → Database → Connection string), **or** a `SUPABASE_ACCESS_TOKEN`
     (a [personal access token](https://supabase.com/dashboard/account/tokens)),
     and run `npm run migrate` — it applies the files in order and verifies every RPC.
   - Copy URL, anon key, service role key into `.env.local` / host secrets
   - Auth → Email enabled; Site URL + redirect `https://YOUR_DOMAIN/auth/callback`
   - Manually promote first admin:  
     `UPDATE profiles SET role = 'SUPER_ADMIN' WHERE email = 'you@example.com';`

2. **Paystack** — full walkthrough in **[docs/PAYSTACK.md](./docs/PAYSTACK.md)**
   - Live (or test) public + secret keys
   - Webhook URL: `https://YOUR_DOMAIN/api/payments/webhook`
   - Set `PAYSTACK_WEBHOOK_SECRET` (or reuse secret key)
   - Enable **Transfers** + fund balance for seller payouts
   - Apply `supabase/migrations/025_wallet_ledger.sql`. Wallet funding, wallet checkout, seller earnings, payout state, refunds-to-wallet and the admin finance ledger depend on it. Without Paystack keys the UI stays usable for viewing/history but funding and payouts are explicitly unavailable.
   - **Regulatory note:** wallet balances are marketplace ledger entries settled through Paystack. Do not launch stored-value/wallet functionality until GoodSale's payment partner and Nigerian regulatory counsel confirm the structure. GoodSale must not hold customer funds in its own bank account without an authorised arrangement.

3. **App URL**
   - `NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN`
   - `NEXT_PUBLIC_DEMO_MODE=false`

4. **Google Maps** (SafeMeet + live GoodDispatch)
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with Maps JavaScript, Embed, Geocoding APIs

5. **Delivery logistics (Phase 3, all optional)**
   - `GOOGLE_MAPS_SERVER_API_KEY` (or reuse `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) with **Distance Matrix API** enabled — real road distance/ETA. Without it the app returns a clearly-labelled straight-line estimate and never invents a route.
   - `COURIER_API_BASE_URL`, `COURIER_API_KEY`, `COURIER_PROVIDER_CODE` — generic server-side courier adapter. Only works when the provider's REST contract matches the documented shipment/tracking shape.
   - `COURIER_CREATE_PATH` (default `/shipments`), `COURIER_TRACKING_PATH` (default `/tracking/{trackingNumber}`), `COURIER_WEBHOOK_SECRET` — adapter paths and HMAC webhook secret. Without a secret the webhook endpoint returns 503; without credentials the admin UI keeps the manual courier fallback.
   - `DELIVERY_CRON_SECRET` — bearer/`x-cron-secret` secret for `POST /api/internal/delivery-jobs`. Schedule that endpoint every few minutes to expire offers, reassign riders and process the notification outbox. Returns 503 when unset.
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — optional SMS delivery notifications. Email uses the existing `RESEND_API_KEY` + `EMAIL_FROM`. Unconfigured channels stay pending; in-app notifications always work.

6. **Premium checkout + shipment tracking (Phase 4)**
   - Apply `supabase/migrations/022_premium_tracking.sql` (included in `npm run migrate`). It adds saved buyer addresses, checkout groups, date-based order numbers, unique `GSD-` shipment IDs and the public tracking lookup RPC.
   - Apply `supabase/migrations/023_onboarding.sql` (included in `npm run migrate`). It adds buyer onboarding state (purpose, location, notification choices), seller store details and the resume/backfill rules used by `/onboarding` and `/seller/onboarding`. Without it those screens cannot save progress.
   - Apply `supabase/migrations/024_seller_verification.sql` (included in `npm run migrate`). It adds the server-authoritative seller verification lifecycle, the private `verification_documents` records, the `verification_events` audit trail, `profiles.verification_status` (the public badge source) and the `seller_save_verification` / `admin_verification_action` / `seller_public_verification` RPCs. **Confirm the `government-ids` bucket is private** (Storage → `government-ids` → Public: off) and that `SUPABASE_SERVICE_ROLE_KEY` is set server-side only — uploads and signed review links depend on it. Without this migration the seller Verification Center and the admin queue return a clear “migration 024 required” error instead of faking a badge.
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is required for the interactive tracking map and markers. Without it the map falls back to an embed preview; live coordinates are still shown only from real rider updates.
   - `GOOGLE_MAPS_SERVER_API_KEY` enables real road distance and provider ETA. Without it distances remain explicitly labelled straight-line estimates.
   - Public tracking is `/track`; the authenticated participant view exposes addresses, rider identity and live GPS only after the buyer/seller/rider/admin authorization check. No map key is needed for the timeline, but map drawing needs the key above.

7. **Optional**
   - `GEMINI_API_KEY` — AI listing / search tips
   - `RESEND_API_KEY` + `EMAIL_FROM` — dispute / payout and delivery emails
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — distributed rate limits
   - `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error capture when SDK wired

See **`.env.example`** for the complete variable list.

## Already implemented in code

| Area | Status |
|------|--------|
| Mock seed data removed | Done |
| Settings persisted server-side (Supabase auth metadata) | Done |
| Real TOTP two-factor auth (`auth.mfa`) | Done |
| Real “sign out other devices” (`signOut({ scope: 'others' })`) | Done |
| Account deactivate / reactivate (`profiles.is_suspended`) | Done |
| Supabase Auth signup/login/reset | Done |
| Realtime catalog/orders/chat/dispatch | Done |
| Persist products, orders, escrow, chat, bids, reviews, SafeMeet, ads, bundles, settings | Done |
| Server PIN escrow release RPC + API | Done |
| Courier PIN complete-delivery-job API | Done |
| Disputes open/resolve + optional email | Done |
| Seller withdrawals + admin Paystack Transfer | Done |
| Append-only wallet ledger, Paystack funding, wallet checkout, payout webhook lifecycle, refunds-to-wallet, admin finance controls | Done (migration 025) |
| Append-only wallet ledger, Paystack funding, wallet checkout, payout webhook lifecycle, refunds-to-wallet, admin finance controls | Done (migration 025) |
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
| Admin-controlled platform fee toggle + per-item % (launch default 0%) | Done (migration 008) |
| Ads: admin create (image/video upload) + placement choice, shown app-wide | Done (migration 009) |
| Admin announcements popup on app entry | Done (migration 010) |
| Role-aware nav (Buy / Sell / Business / Admin) + role badge + visible Log out | Done |
| Launch catalog seeding + admin manage of seeded sellers/listings (photos included) | Done (migration 013) |
| Monogram avatars (no third-party stock faces) + realistic product-linked reviews | Done |
| Admin edit of any listing: media (photo/video), full details, delete | Done (migration 014) |
| Order & product reviews persisted with nested replies (review_replies) | Done |

## After secrets are set

```bash
npm install
npm run build && npm start
# or: docker compose up --build
```

Smoke test: sign up → list with photos → buy with Paystack → ship → buyer PIN release → seller withdraw → admin approve Transfer.
