# Supabase Auth Setup — Module 3

This project's `/auth/confirm` route expects Supabase's **token_hash**
email link pattern (not the default `{{ .ConfirmationURL }}` pattern,
which points at Supabase's own hosted verification endpoint rather than
our app). You must customize two email templates for signup confirmation
and magic-link sign-in to work at all — without this step, clicking the
email link will not reach our `/auth/confirm` route and users will be
stuck.

## 1. Email Templates (Authentication → Email Templates)

**Important — read before editing:** every call site in this codebase
(`signUpBuyerAction`, `sendMagicLinkAction`) sets `emailRedirectTo` to our
own full URL, already including a validated `next` query parameter:

```
${NEXT_PUBLIC_SITE_URL}/auth/confirm?next=<safe-internal-path>
```

Supabase exposes whatever was passed as `emailRedirectTo` back to the
email template as `{{ .RedirectTo }}`. **The templates below build on
top of that value rather than hardcoding a destination** — this is what
makes the originally-requested `next` path (e.g. redirecting back to
`/dashboard/profile` instead of always `/dashboard`) actually survive the
email round-trip. An earlier version of this doc hardcoded
`next=/dashboard` directly in the template, which silently discarded
whatever the action had actually requested — do not reintroduce that.

Because `{{ .RedirectTo }}` already contains our own `?next=...` query
string, the templates below append `token_hash`/`type` with `&`, not
`?`. If you ever change the app code so `emailRedirectTo` might be passed
*without* an existing query string, update these templates to handle
both cases (e.g. by moving the query construction into the app's own
`emailRedirectTo` string instead, so it's never ambiguous) — keep the two
in sync.

**On the `type` value — flagging a deviation from a straightforward
"use type=email everywhere" approach:** Supabase's own current docs say
`email` is the unified replacement for the deprecated `signup`/`magiclink`
values. However, a specific, recent (January 2026) Supabase GitHub issue
(supabase/supabase#41672) reports that `type=email` produces "Email link
is invalid or has expired" specifically for **link-based** magic-link
verification via `signInWithOtp()` + `verifyOtp()` — the exact flow this
project uses — and that `type=magiclink` is still required for that case
despite being labeled deprecated. Signup confirmation is a different code
path and is not implicated in that report.

Given that, the two templates below use **different** `type` values on
purpose:
- Confirm signup → `type=email` (matches the docs' own description:
  "used when verifying an OTP sent... during sign-up")
- Magic Link → `type=magiclink` (per the specific bug report above —
  `type=email` is reported to break this exact link-based case)

This was not runtime-verified against a live project in this environment
— it's based on the specific, recent, credible bug report cited above,
not a guess. `src/app/auth/confirm/route.ts` already accepts any valid
`EmailOtpType` value generically, so no code change is needed regardless
of which value ultimately works for your pinned Supabase version — only
the template's `type=` value would need adjusting if your own testing
shows otherwise.

### Confirm signup

```html
<h2>Confirm your signup</h2>
<p>Follow this link to confirm your Crazycraft buyer account:</p>
<p>
  <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">
    Confirm your account
  </a>
</p>
```

### Magic Link

```html
<h2>Your Crazycraft sign-in link</h2>
<p>
  <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink">
    Sign in to Crazycraft
  </a>
</p>
```

The two templates differ only in that final `type=` value — the
destination difference between a signup confirmation and a magic-link
sign-in comes entirely from whatever `next` value the originating action
call embedded into `emailRedirectTo`, not from anything else in the
template.

**Open-redirect note:** this is safe by construction, not just by
convention. `emailRedirectTo` is built server-side in `actions.ts` from
`NEXT_PUBLIC_SITE_URL` plus a `next` value that has already passed
`getSafeRedirectPath()` before being embedded. Supabase's own Redirect
URLs allow-list (§2 below) independently rejects any `emailRedirectTo`
not on that list regardless. And when the link is actually clicked,
`/auth/confirm/route.ts` re-validates the `next` param a third time via
the same `getSafeRedirectPath()` helper before using it — the email
template itself never needs to "know" anything is safe, it's just
forwarding a value that was already validated twice and gets validated
again on arrival.

## 2. Redirect URLs (Authentication → URL Configuration)

Add every environment's callback and confirm routes to **Redirect URLs**
(this is Supabase's allow-list — requests to any URL not on it are
rejected):

| Environment | URLs to add |
|---|---|
| Local | `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm` |
| Preview (e.g. Vercel preview deployments) | `https://*.your-preview-domain.vercel.app/auth/callback`, `https://*.your-preview-domain.vercel.app/auth/confirm` (wildcard support depends on your Supabase plan/CLI version — if wildcards aren't available, add each preview URL explicitly as it's created) |
| Production | `https://yourdomain.com/auth/callback`, `https://yourdomain.com/auth/confirm` |

Also set **Site URL** to the correct value per environment — this is what
`{{ .SiteURL }}` resolves to in the email templates above, and must match
`NEXT_PUBLIC_SITE_URL` in that environment's `.env` file.

## 3. Google Provider Setup (Authentication → Providers → Google)

1. In [Google Cloud Console](https://console.cloud.google.com/), create
   (or reuse) an OAuth 2.0 Client ID under APIs & Services → Credentials.
2. Application type: **Web application**.
3. **Authorized redirect URI**: add Supabase's own callback URL — this is
   *not* our app's `/auth/callback`, it's Supabase's:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   (Supabase mediates the OAuth exchange and then redirects to *our*
   `/auth/callback` afterward, per the `redirectTo` we pass in
   `signInWithGoogleAction()` — that's a separate, later hop.)
4. Copy the generated **Client ID** and **Client Secret** into Supabase's
   dashboard under Authentication → Providers → Google, and toggle it on.
5. Confirm `/auth/callback` is on the Redirect URLs allow-list (step 2)
   for whichever environment you're testing in.

Without this, "Continue with Google" returns a graceful in-app error
(`signInWithGoogleAction` already handles the failure case) rather than
silently breaking — but it will not actually work until this is done.

## 4. Creating the First Admin Account

There is no self-registration path for admin accounts (by design — see
Module 2's `admin_users` table and Module 3's admin login flow). The
first admin must be created manually, in two steps:

### Step 1 — create the auth user

**Local:** via the Supabase Studio UI at `http://localhost:54323` →
Authentication → Users → Add user, or via SQL:

```sql
-- Only needed if you'd rather not use the Studio UI locally.
-- Prefer the Studio "Add user" button where possible — it handles the
-- auth.users column requirements correctly for you.
```

**Hosted:** Supabase Dashboard → Authentication → Users → Add user. Set
an email and password, and check "Auto Confirm User" so no email
confirmation step is required for this bootstrap account.

### Step 2 — bootstrap the super_admin row

Copy the new user's UUID from the Users list, then run in the SQL editor
(local Studio or hosted Dashboard):

```sql
insert into public.admin_users (id, full_name, role)
values ('<paste-the-user-uuid-here>', 'Your Name', 'super_admin');
```

That's it — this account can now sign in at `/admin/login`. Every
subsequent admin account (editor, sales, or additional super_admins)
should be created the same way (Step 1, then Step 2 with the appropriate
`role`) until Module 8 builds an in-app staff invite flow.

## Known Limitation

None of the above could be executed or verified in the sandbox that
assembled this code — no live Supabase project, no Google Cloud Console
access, no ability to send/receive email. Every step here is written
from Supabase's documented behavior and this project's own route handler
implementations, not from having actually run it. Please follow it in
your own environment and report back anything that doesn't match.
