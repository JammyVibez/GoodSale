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
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Cloudinary dashboard → Settings → API Keys (optional, see below) |

Restart the dev server after saving `.env.local`.

### Media uploads (Cloudinary)

Image and video uploads go through Cloudinary's CDN when all three Cloudinary keys above
are set. Uploads are **signed server-side** with the API secret (HMAC-SHA1), so the secret
never reaches the browser and no client SDK is required.

- Without those keys the app falls back to Supabase Storage automatically.
- Identity documents (`government-ids`) are **never** sent to Cloudinary — they stay on the
  private Supabase bucket and are served via short-lived signed URLs.
- Upload size limits: 8MB for images, 25MB for video.

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
7. `supabase/migrations/007_avatars_bucket.sql` (avatars storage bucket)
8. `supabase/migrations/008_platform_fee_toggle.sql` (admin-controlled platform fee — OFF at launch)
9. `supabase/migrations/009_admin_ads.sql` (ads: image/video media, placements, `ad-media` bucket)
10. `supabase/migrations/010_announcements.sql` (admin popup shown on app entry)

### Apply them from the terminal

Paste-and-run in the Supabase **SQL Editor** always works. To automate it instead, either:

- add a direct Postgres connection string as `DATABASE_URL` (Supabase → Project Settings →
  Database → Connection string, “Session pooler”), **or**
- add a Supabase **Personal Access Token** as `SUPABASE_ACCESS_TOKEN`
  (create one at https://supabase.com/dashboard/account/tokens)

then run:

```bash
npm run migrate            # applies every file in order
npm run migrate -- --from=002   # skip schema.sql, replay migrations from 002
npm run migrate -- --verify     # check RPCs, tables, the fee toggle, and admin accounts
npm run migrate -- --only=008_platform_fee_toggle.sql
```

The command is idempotent and verifies that every escrow/payout RPC is present when it finishes.

Paystack step-by-step: **[docs/PAYSTACK.md](./docs/PAYSTACK.md)**. Full env list: **`.env.example`**.

## What is live now

- **Auth**: Supabase email/password signup & login (`AuthModal`)
- **Profiles**: created by DB trigger on `auth.users` insert
- **Catalog / orders / escrow / chat / delivery jobs**: loaded from Postgres; writes for products, orders, messages, chat rooms persist to Supabase
- **Realtime**: `messages`, `orders`, `delivery_jobs`, `products`, `notifications`, `bids`, `chat_rooms`, …
- **Payments**: Order created first as `PENDING` → Paystack Inline with `GS_<orderId>_…` → `/api/payments/verify` + webhook mark `PAID_ESCROW`
- **Escrow**: Buyer PIN `/api/orders/release-escrow`; courier `/api/orders/complete-delivery-job`; admin force `/api/admin/escrow`
- **Disputes / payouts**: `/api/disputes/*`, `/api/wallet/withdraw`, `/api/admin/withdrawals`
- **Admin panel**: sign in as an `ADMIN` / `SUPER_ADMIN` account, open the account menu (top-right),
  and choose **Admin panel** → **Revenue & Payment Settings** to toggle the per-item platform fee
  and set its percentage. It is **OFF at launch** — buyers pay only the item price plus delivery.
- **Ads**: **Admin panel** → **Create an ad** — upload an image or video from your device, choose
  where it shows (home feed, category, product detail, chat, seller hub, search), then publish,
  pause or delete it. Ads render across the app through `components/AdSlot.tsx`.
- **Admin entry**: signed in as `ADMIN`/`SUPER_ADMIN` you get an **Admin** button in the header and
  as the middle tab of the mobile bottom nav — one tap to the admin panel.
- **Role-aware navigation**: registering as a **Buyer** shows a **Buy** button that jumps to the
  marketplace; **Sellers** get **Sell** and **Businesses** get **Business** (their dashboard, which
  can do everything a buyer and seller can). The profile shows your matching role badge.
- **Sign out**: avatar menu → **Log out**, or **Settings → Account Profile → Log out**.
- **Announcements**: **Admin panel → Announcements** → publish a headline/message; it pops up for
  users the next time they join or enter the app, and remembers that they dismissed it.
- **Setup banner**: shown until Supabase URL/anon key are present
- **Notifications / follows / onboarding**: written to Supabase and reloaded live — they are
  real records, not local-only state

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run migrate        # apply Supabase SQL (needs SUPABASE_ACCESS_TOKEN)
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
