# Auth: email OTP (no fake confirmation codes)

GoodSale uses **Supabase Auth email OTP** for signup verification and optional passwordless login.

## Supabase dashboard settings

1. **Authentication → Providers → Email** — enabled  
2. **Authentication → Email** — turn on confirmation / OTP so signup sends a **6-digit code** (not only a magic link)  
3. Customize the **Confirm signup** / **Magic Link** templates to show `{{ .Token }}` (the OTP)  
4. Site URL + redirect: `https://YOUR_DOMAIN/auth/callback`

Users enter the code in the app (`verifyOtp`). There is no client-side simulated OTP.

## Flows in the app

| Flow | API |
|------|-----|
| Register | `signUp` → if no session, UI asks for email OTP → `verifyOtp({ type: 'signup' })` |
| Login with code | `signInWithOtp` → `verifyOtp({ type: 'email' })` |
| Login with password | `signInWithPassword` (unchanged) |
| Resend | `auth.resend({ type: 'signup' })` or `signInWithOtp` again |

## Roles at signup

`signUp` metadata includes `role` (`BUYER` \| `SELLER` \| `BUSINESS`).  
Migration **007** makes `handle_new_user` write that role onto `profiles`.  
Users can change account type anytime via Settings → `set_own_account_role`.
