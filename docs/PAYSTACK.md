# Paystack setup for GoodSale

GoodSale uses Paystack for **buyer checkout** (escrow deposit) and **seller payouts** (Transfers after admin approval).

## 1. Create an account

1. Go to [https://dashboard.paystack.com](https://dashboard.paystack.com) and sign up (Nigeria business).
2. Complete business verification when you are ready for **live** keys (test mode works without full KYC).

## 2. Get API keys

1. Dashboard → **Settings** → **API Keys & Webhooks**.
2. Copy:
   - **Public key** → `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` (`pk_test_…` or `pk_live_…`)
   - **Secret key** → `PAYSTACK_SECRET_KEY` (`sk_test_…` or `sk_live_…`)
3. Never put the secret key in client code or commit it to git.

## 3. Configure the webhook

1. Same page → **Webhooks**.
2. Callback URL:

   ```text
   https://YOUR_DOMAIN/api/payments/webhook
   ```

   Locally you can use a tunnel (ngrok / Cloudflare Tunnel) pointing at `http://localhost:3000/api/payments/webhook`.

3. Copy the **webhook secret** (if shown) into `PAYSTACK_WEBHOOK_SECRET`.  
   If Paystack only signs with your secret key, set `PAYSTACK_WEBHOOK_SECRET` to the same value as `PAYSTACK_SECRET_KEY`.

4. Subscribe at least to:
   - `charge.success` (buyer paid → order moves to escrow)
   - `transfer.success` / `transfer.failed` (seller payouts)

## 4. How checkout works in GoodSale

1. Buyer confirms cart → app creates a **PENDING** order in Supabase.
2. Frontend opens **Paystack Inline** with reference `GS_<orderId>_…` and amount in **kobo**.
3. After payment:
   - Client calls `/api/payments/verify`
   - Paystack also hits `/api/payments/webhook`
4. Server verifies the charge and marks the order **PAID_ESCROW** (funds held until delivery PIN / admin).

Test cards (test mode): see [Paystack test payments](https://paystack.com/docs/payments/test-payments/).

## 5. Enable Transfers (seller withdrawals)

1. Dashboard → **Settings** → **Preferences** / **Transfers** — enable Transfers and fund your Paystack balance.
2. Sellers request withdrawal in-app (`/api/wallet/withdraw`).
3. Admin approves via `/api/admin/withdrawals` → GoodSale:
   - Creates a **Transfer Recipient** (NUBAN)
   - Calls **Transfer** for the naira amount
4. Pass `bankCode` on approve when the bank name is ambiguous, or set `PAYSTACK_DEFAULT_BANK_CODE` (e.g. `058` for GTBank).

Common codes: GTBank `058`, Access `044`, Zenith `057`, UBA `033`, First Bank `011`, Kuda `50211`, OPay `999992`.

## 6. Go live checklist

| Step | Action |
|------|--------|
| 1 | Switch env from `pk_test_` / `sk_test_` to **live** keys |
| 2 | Update webhook URL to production domain (HTTPS) |
| 3 | Confirm `NEXT_PUBLIC_DEMO_MODE=false` |
| 4 | Run a ₦100–₦500 live smoke charge + refund/dispute path |
| 5 | Confirm Transfer balance is funded before approving payouts |

## 7. Env vars (Paystack-related)

```bash
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_WEBHOOK_SECRET=...          # webhook secret or same as secret key
PAYSTACK_DEFAULT_BANK_CODE=058       # optional
```
