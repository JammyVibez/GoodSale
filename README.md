# GoodSale

Nigeria's escrow-backed C2C marketplace with **live Supabase Auth**, realtime catalog/orders/chat/dispatch, and Paystack checkout.

Mock seed users/products/orders have been **removed**. The app loads empty until you connect Supabase.

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** → paste and run [`supabase/schema.sql`](./supabase/schema.sql)
3. (Optional) Create storage buckets: `government-ids` (private), `product-images` (public), `chat-media` (public)
4. Authentication → Providers → enable **Email**
5. Authentication → URL config → add `http://localhost:3000/auth/callback` (and your production URL)

## 2. Add credentials

```bash
cp .env.example .env.local
```

Fill in at minimum:

| Variable | Where to find it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (server only) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack Dashboard → Settings → API Keys |
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |

Restart the dev server after saving `.env.local`.

## 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up → create listings → checkout → chat → GoodDispatch jobs all hit Supabase with Realtime subscriptions.

See **[PRODUCTION.md](./PRODUCTION.md)** for the full go-live checklist (credentials only you can supply + what is already coded).

## SQL to run (order matters)

1. `supabase/schema.sql`
2. `supabase/migrations/002_production_hardening.sql`
3. `supabase/migrations/003_user_suspend.sql`
4. `supabase/migrations/004_realtime_dispatch_geo.sql`
5. `supabase/migrations/005_security_payments.sql` (RLS lockdown, disputes, refunds, withdrawals)
6. `supabase/migrations/006_payouts_and_suspend.sql` (Paystack transfer columns + suspend)
7. `supabase/migrations/007_storage_roles_otp.sql` (signup role, role switch, `user-media` storage)

Paystack step-by-step: **[docs/PAYSTACK.md](./docs/PAYSTACK.md)**. Full env list: **`.env.example`**.

**Auth note:** Enable Supabase Email OTP so signup/login codes are emailed. Uploads go to Storage buckets `product-images`, `chat-media`, `user-media`, `government-ids`.

## What is live now

- **Auth**: Supabase email/password signup & login (`AuthModal`)
- **Profiles**: created by DB trigger on `auth.users` insert
- **Catalog / orders / escrow / chat / delivery jobs**: loaded from Postgres; writes for products, orders, messages, chat rooms persist to Supabase
- **Realtime**: `messages`, `orders`, `delivery_jobs`, `products`, `notifications`, `bids`, `chat_rooms`, …
- **Payments**: Order created first as `PENDING` → Paystack Inline with `GS_<orderId>_…` → `/api/payments/verify` + webhook mark `PAID_ESCROW`
- **Escrow**: Buyer PIN `/api/orders/release-escrow`; courier `/api/orders/complete-delivery-job`; admin force `/api/admin/escrow`
- **Disputes / payouts**: `/api/disputes/*`, `/api/wallet/withdraw`, `/api/admin/withdrawals`
- **Setup banner**: shown until Supabase URL/anon key are present

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```
```bash
npm run dev
npm run build && npm run start
npm run lint
npm run typecheck
```

## Docker

```bash
docker compose up --build
```

Pass the same env vars into the compose service.

## Need help wiring credentials?

Add the Supabase + Paystack values to Cursor / Vercel / Docker secrets (or `.env.local`) and re-run. Without them the UI stays empty and the amber setup banner explains what is missing.
