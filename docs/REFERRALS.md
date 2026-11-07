# GoodSale referrals and rewards

## How attribution works

- Every profile has a unique, immutable referral code generated on the server.
- Share links use `/auth/register?ref=CODE`; `/register?ref=CODE` and `/join?ref=CODE` redirect
  to the same registration page for compatibility with already-shared links.
- The registration page records a privacy-safe click (a one-way visitor hash, never a raw IP) and
  keeps the code in session storage plus a 30-day `gs_ref` cookie while the visitor completes the
  form.
- `/api/auth/register` creates the account, then calls `attribute_referral` with the service role.
  The function validates the code, rejects self-referrals, writes the single attribution row,
  stores a masked display name and sets `profiles.referred_by_id`.
- Attribution cannot be changed by the browser, and one account can never be attributed twice.

## Qualification

Admins choose one or more qualifying actions and optional checks:

| Rule | Real source |
|------|-------------|
| Email verified | `auth.users.email_confirmed_at` |
| Onboarding complete | `profiles.onboarding_completed_at` |
| First genuine purchase | completed buyer order (`DELIVERED_SUCCESS`) with no refund |
| Approved seller listing | product from a `VERIFIED` seller |
| First successful seller sale | completed seller order with no refund |
| Referrer verified / minimum age | optional campaign eligibility rules |

Registration alone never qualifies. Evaluation runs from database triggers when onboarding,
orders, products or verification change, and can be re-run by the user or an admin.

If a rewarded qualifying order later becomes refunded, cancelled or disputed and no other qualifying
action remains, the reward is reversed and the referral is disqualified when the campaign enables
refund protection.

## Rewards

- Campaigns are limited to GoodSale Coins (`GOODSALE_COINS`). Coins are promotional, separate from
  the naira wallet, non-withdrawable and never converted to cash automatically.
- Amounts are snapshotted at attribution. Reward issuance locks the referral and campaign rows,
  enforces per-user and per-campaign caps, and writes one `referral_rewards` row per beneficiary.
- Each coin credit writes a unique `good_points_transactions` ledger row. Re-running evaluation is
  idempotent.
- Admin disqualification records the reason, reverses issued coins, updates reward states, writes
  a referral event and an `audit_logs` entry, and notifies both participants.

## Fraud signals

- Self-referral is rejected.
- One attribution per referred account is enforced by a unique index.
- Browser writes to referral records, referral ownership and coin balances are blocked by triggers,
  grants and RLS.
- Shared signup IPs, new referrer accounts, high referral velocity, optional referrer verification
  and optional account-age rules are flagged for admin review. Shared IP alone never auto-bans.
- Registration already has IP rate limiting; public click and code validation endpoints are also
  rate-limited.

## Admin operations

**Admin panel → Referrals & Rewards** provides:

- campaign creation/editing, activation, pause, dates, caps, audience, reward amounts and rules
- search by code, name, email or username, and filtering by campaign
- referral lifecycle and reward transactions
- suspicious-activity flags, mark-reviewed and disqualify-with-reason
- re-evaluate a referral
- analytics: clicks, registrations, qualified, rewarded, coins issued, flagged and 30-day activity
- an audit trail for every campaign/referral action

## Verification

```bash
npm run migrate -- --only=026_referrals_rewards.sql
npm run verify:referrals
```

The verification script runs entirely inside a rolled-back transaction. It tests valid and duplicate
attribution, self-referral rejection, immutable ownership, blocked coin self-crediting, purchase
qualification, exact coin amounts, duplicate-reward prevention and admin reversal.

## Remaining limitation

Phone OTP is not implemented in GoodSale, so campaigns do not pretend to verify phone numbers. A
phone may be required as profile data, but it is not treated as a verified qualification signal.
