# Crazycraft — B2B Handicraft Exporter Platform

## Status

- **Module 1 (Project Foundation)** — runtime-verified and approved.
- **Module 2 (Database)** — runtime-verified and approved (17 migrations,
  151 pgTAP assertions passing, `supabase db lint` clean).
- **Module 3 (Authentication)** — runtime-verified and approved.
- **Module 4 (RFQ System)** — COMPLETE AND RUNTIME-VERIFIED (21 migrations
  total, 200 pgTAP assertions, `npm run lint`/`type-check`/`build` all
  passing on the real generated `database.types.ts`).
- **Module 5 (CRM)** — RUNTIME-VERIFIED: `supabase db reset` PASS,
  database tests Files=12/Tests=350/PASS, `supabase db lint`
  (public+private) PASS, types generated, `next typegen` PASS, ESLint
  PASS, type-check PASS, production build PASS.
- **Module 6 (Public Marketing Website & Product Catalogue)** — prepared,
  not yet runtime-verified. See the Module 6 Notes section below.

## Prerequisites

- Node.js 24.18.0 (see `.nvmrc`).
- Docker Desktop (or another container runtime) for the local Supabase stack.
- A Supabase project with the current Publishable/Secret API key model enabled.
- **For Module 3's Google sign-in button to work**: enable the Google
  provider in your Supabase project's dashboard under Authentication →
  Providers, with a Google OAuth client ID/secret configured there. This
  is external platform configuration, not something in this codebase —
  without it, "Continue with Google" returns a graceful error rather than
  silently failing.

## Setup

```bash
nvm install 24.18.0
nvm use
npm install
cp .env.local.example .env.local
# Fill in ALL required values (see Environment Variables below for the
# full list and explanations) — as of Module 4 this is more than just
# the Supabase URL/publishable key:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#   NEXT_PUBLIC_SITE_URL
#   NEXT_PUBLIC_TURNSTILE_SITE_KEY   (local-dev test key already filled in)
#   TURNSTILE_SECRET_KEY             (local-dev test key already filled in)
#   SUPABASE_SECRET_KEY               (you must fill this in yourself)
# TRUSTED_CLIENT_IP_HEADER is optional — leave it blank (the default in
# .env.local.example) unless you've verified a specific header for your
# own infrastructure; a blank value is correctly treated as "not set",
# not as a validation error.
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run lint
npm run type-check
npm run build
npm run dev
```

### About `npm run supabase:start`

This runs `supabase start -x logflare,vector` — excluding the Analytics
(Logflare) and Vector log-shipping containers. These aren't needed for
local development of this project, and excluding them avoids a real,
common failure mode on Windows and other resource-constrained Docker
setups (Logflare/Vector can fail to start cleanly or consume resources
disproportionate to what this project needs locally).

If you specifically need the full stack (e.g. testing Analytics-related
behavior), use:

```bash
npm run supabase:start:full
```

## Module 3 Notes

- **See `AUTH_SETUP.md`** for required Supabase dashboard configuration:
  email templates (token_hash pattern), redirect URL allow-lists per
  environment, Google OAuth provider setup, and the first-admin bootstrap
  procedure. None of this is optional — signup confirmation and magic
  links will not work until the email templates are customized.
- `src/types/database.types.ts` — see the Module 4 Notes section below
  for its current status; that module changed how this file is handled.
- Route protection (unauthenticated/unauthorized redirects for
  `/dashboard` and `/admin`) lives in `src/proxy.ts` /
  `src/lib/supabase/proxy.ts`. Every Server Component layout in those
  trees also does its own redirect check as defense in depth — never rely
  on middleware alone.

## Module 4 Notes

- **Four new migrations**, plus one security correction to the second and
  a full function restatement in the fourth:
  - `20260726090000_module4_scoring_support.sql` — a minimal, documented
    amendment to `private.inquiries_guard_insert()` allowing the trusted
    scoring RPC to write a computed `lead_score`; plus a new
    `inquiry_rate_limit_log` table.
  - `20260726090100_create_submit_inquiry_rpc.sql` — `public.submit_inquiry()`,
    the sole entry point for the progressive inquiry form. **Security
    correction applied**: this function is **service_role-only** —
    revoked from `PUBLIC`, `anon`, and `authenticated` explicitly, granted
    only to `service_role`. An earlier revision granted it to
    `anon, authenticated` directly, which would have let anyone with just
    the publishable key call it through the Data API and skip Turnstile
    verification and trusted server-side IP extraction entirely, since
    neither check can be expressed inside Postgres itself. It also
    returns a structured JSONB result (`{"status": "accepted" |
    "duplicate" | "rate_limited" | "rejected", ...}`) rather than raising
    exceptions for expected business outcomes — this is what lets a
    rate-limited attempt's log entry actually persist (nothing is rolled
    back when nothing raises), and uses transaction-level advisory locks
    to close a concurrent-request race at the rate-limit boundary.
  - `20260726090200_revoke_direct_inquiries_insert.sql` — revokes
    Module 2's direct `anon`/`authenticated` INSERT grant on `inquiries`
    entirely. `submit_inquiry()` is the only creation path, full stop.
  - `20260726090300_target_market_country_scoring.sql` — adds a new
    admin-editable `target_market_countries` reference table (same RLS
    shape as `lead_scoring_rules`: any admin can view, only `super_admin`
    can edit) and a full `CREATE OR REPLACE` of `submit_inquiry()` that
    (a) fixes a Stage-2 derivation bug where `linkedin_url` alone
    incorrectly failed to advance `qualification_stage` to 2, and (b)
    actually wires the previously-inert `target_market_country` scoring
    rule — it existed in `lead_scoring_rules` and looked active to any
    admin viewing that table, but the RPC silently ignored it.
  - Nothing else in Module 2/3 was touched.
- **Product interest is required at Stage 1**, restoring the frozen
  Stage-1 field contract (name, business email, country, product
  interest, business type). The existing `message`/`p_message` field
  does double duty as "product interest / requirement" — no new database
  column — and is enforced in two places: the client-side Zod schema
  (`min(1, ...)`, no longer optional) and, as defense in depth,
  `submit_inquiry()` itself (`20260726090300`'s required-field check),
  since a Server Action can in principle be reached independent of the
  visible form.
- **A new privileged, secret-key-based client** (`src/lib/supabase/admin.ts`)
  — this is the client Module 1/2 deferred creating "until the module
  that first needs it." It's the only way to reach `submit_inquiry()`,
  used exclusively from the Server Action (`src/lib/inquiries/actions.ts`)
  after that action has independently verified Turnstile and extracted a
  trusted IP from real request headers — never from anything the browser
  claims. `SUPABASE_SECRET_KEY` is now a required env var; see
  `.env.local.example` for where to find it (Settings → API Keys →
  Secret key) — left blank there intentionally, never commit a real
  value.
- **Turnstile is required, not optional.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  and `TURNSTILE_SECRET_KEY` are validated-required env vars as of this
  module — the app will not boot without them. For local development, use
  Cloudflare's published always-pass test keys (already in
  `.env.local.example`); replace both with your real Turnstile site's keys
  before deploying anywhere public. See
  https://developers.cloudflare.com/turnstile/troubleshooting/testing/
  for the full test-key reference (visible/invisible/always-blocks
  variants) if you want to test failure paths deliberately.
- **`src/types/database.types.ts` is deliberately NOT included in the
  Module 4 patch** — this preserves whatever real, locally-generated
  types file you already have rather than risking it being silently
  overwritten by a hand-written stand-in. **Regeneration is required, not
  just recommended**, before running type-check: `submit_inquiry()`'s
  signature changed again this round (the unused `p_authenticated_user_id`
  parameter was removed — see below), so any types file generated against
  an earlier version of this migration is now stale and will not match
  the actual function signature. After applying all four of Module 4's
  migrations, regenerate it for real:

  ```bash
  npx supabase gen types typescript --local > src/types/database.types.ts
  ```

  On Windows, redirecting into a `src\types\...` path from a shell that
  doesn't handle the forward-slash form the same way can be unreliable —
  use:

  ```
  cmd /c "npx supabase gen types typescript --local > src\types\database.types.ts"
  ```

  There is no reference/placeholder copy of this file provided alongside
  this patch — regenerate directly from your own applied migrations
  rather than relying on any hand-written stand-in.
- **The direct `anon`/`authenticated` INSERT grant on `inquiries` (from
  Module 2) is now revoked** — see
  `20260726090200_revoke_direct_inquiries_insert.sql`. `submit_inquiry()`
  is the only creation path; a direct `.from("inquiries").insert()` call
  fails with `42501` for both anon and authenticated, with no exceptions.

## Module 5 Notes (CRM)

- **One migration, corrected in place** (not yet applied to any real
  environment when the correction was made — consistent with this
  project's convention that pre-application edits happen in place, not
  as a separate later migration): `20260727100000_create_admin_lead_overview.sql`.

- **`public.admin_lead_overview`** — a unified, read-only list of
  `inquiries` + `quote_requests` for the leads dashboard.
  - `security_invoker = true` is essential but **not sufficient on its
    own** — this was a real, corrected leak, not just a theoretical
    concern. `quote_requests` used to have its own `"buyers can view own
    quote_requests"` RLS policy (Module 2); a buyer viewing their own
    quote request was reasonable, intended behavior *at the time*. An
    earlier revision of this view relied on `security_invoker` alone,
    with no predicate of its own — so a buyer
    querying this specific combined view directly through the Data API
    (admin route protection in `proxy.ts`/the dashboard layout only
    protects Next.js *routes*, not the underlying database object) would
    have their own row pass straight through, exposing
    `lead_score`/`status`/`assigned_to`/`follow_up_at` — fields never
    meant for buyer eyes.
  - **Fixed**: both UNION branches now carry an explicit
    `where private.has_admin_role('sales'::public.admin_role)`,
    independent of and in addition to `security_invoker`. A buyer's own
    row still passes the *base table's* RLS (unchanged, correct), but
    this view's own predicate independently requires CRM/sales access
    before a row is ever produced — a buyer has no `admin_users` row, so
    the check is false for them regardless of what the base table alone
    would permit. `has_admin_role()` already treats `super_admin` as a
    superset of every specific role check, so this one condition
    correctly admits both `sales` and `super_admin`.
  - Sample requests are deliberately excluded — different pipeline
    entirely (fulfillment/shipping status, not sales-qualification
    status), own separate list at `/admin/samples`.

- **`public.list_crm_assignment_admins()`** — CRM assignment dropdowns
  and timeline actor-name resolution need every sales-role admin to see
  the *full* staff list, not just their own record (Module 2's existing
  `admin_users` policies only allow that).
  - **Corrected design — a real bug, not just a hardening pass.** An
    earlier revision tried to solve this with an additive `admin_users`
    SELECT policy (granting every staff row to any sales session) plus a
    narrower `security_invoker` view on top exposing only
    `id, full_name, role`. That view was never an actual security
    boundary: RLS restricts *rows*, never *columns*, and `authenticated`
    already held Module 2's original table-level SELECT GRANT on
    `admin_users` — so once the additive policy made every row visible
    to a sales session, that session could simply run
    `select * from public.admin_users` directly and see every column of
    every row, bypassing the "narrow" view entirely. The view was an
    unenforced convention, not a boundary.
  - **Fixed**: that additive policy and the view are both removed
    entirely. `admin_users`' original Module 2 policies — `"admins can
    view own record"`, `"super_admins can view all admin records"`,
    `"super_admins manage admin_users"` — are back to their untouched
    original state; an ordinary (non-`super_admin`) admin querying
    `admin_users` directly is back to seeing only their own row.
  - In their place: `public.list_crm_assignment_admins()`, a
    `SECURITY DEFINER` function whose own `RETURNS TABLE(id uuid,
    full_name text, role public.admin_role)` clause is what genuinely
    limits exposure — a function's return signature is an actual
    boundary in a way a view sitting on top of a broad grant never was.
    It explicitly checks `private.has_admin_role('sales'::public.admin_role)`
    internally (raising `42501` for anyone else — this does not rely on,
    or get affected by, whatever direct-table access `admin_users`
    otherwise has); `has_admin_role()` already treats `super_admin` as a
    superset, so both roles pass through the same single check. Uses a
    fixed `search_path = ''` with every reference fully schema-qualified
    (`public.admin_users`, `private.has_admin_role`), takes no caller-
    controlled SQL identifiers, and is granted `EXECUTE` only to
    `authenticated` (revoked from `PUBLIC` and `anon` explicitly) —
    editor and ordinary buyer sessions are rejected by the function's own
    internal check regardless of holding that grant.
  - **Returns only `sales`/`super_admin` rows — `editor` is excluded from
    the result set entirely**, not just from being able to call the
    function. An editor has no CRM access at all, so a lead/sample
    assigned to one would be an unusable assignment; the directory simply
    never offers that option.
  - `src/lib/crm/data.ts` calls this RPC exclusively for staff lookups —
    no Module 5 code queries `admin_users` directly for CRM purposes.

- **The `assigned_to` guard trigger** — a dropdown only excluding editor
  is a UI-layer suggestion, not enforcement. `private.validate_crm_assigned_to()`
  is the actual database-level boundary: a `BEFORE INSERT OR UPDATE OF
  assigned_to` trigger on all three CRM-pipeline tables (`inquiries`,
  `quote_requests`, `samples`) that rejects (`23514`) any non-null
  `assigned_to` that doesn't reference a `sales`/`super_admin`
  `admin_users` row — an editor id, a buyer id, or a nonexistent uuid all
  fail, from any write path, present or future, not just today's
  `admin_update_*()` RPCs.
  - **Corrected design — a real bug, not a hardening pass.** An earlier
    revision of this trigger was not `SECURITY DEFINER`, so its internal
    `admin_users` check ran with the *calling session's own* privileges —
    and an ordinary sales admin's own `admin_users` RLS only lets them
    see their own row. Validating an assignment to a *different* sales
    admin, or to `super_admin`, requires checking a row that session's
    own RLS would otherwise hide from a plain query, so the check would
    incorrectly reject an entirely valid assignment purely because of
    who was making it. `SECURITY DEFINER` fixes this: the trigger's own
    check now sees the full `admin_users` table regardless of the
    calling session's visibility — which is exactly what "does this id
    genuinely have this role" needs — without exposing any row data to
    the caller (it only ever returns `NEW` unchanged or raises) and
    without touching `admin_users`' own RLS or grants at all. `EXECUTE`
    is also explicitly revoked from `PUBLIC`/`anon`/`authenticated`, so
    the function is only ever invoked by the three triggers, never
    called directly.

- **`public.search_samples(p_search text)`** — the samples list's search
  box does not build a PostgREST `.or()` filter string with the raw
  search term interpolated into it (that string is filter *grammar* the
  client parses — commas separate conditions, periods separate
  column/operator/value — so unescaped user input could alter which
  filters actually apply). This function takes the search term as a
  genuine bound SQL parameter instead, immune to that entire class of
  issue — no caller-controlled filter grammar reaches PostgREST or SQL at
  all.
  - **CRM-only contract, corrected.** An earlier revision omitted an
    explicit role check and relied on `samples`' own RLS alone — which
    meant a buyer session could also use this function to search their
    own sample. Not a cross-buyer leak (RLS still correctly limited them
    to their own row), but not the approved admin-only CRM contract
    either. It now carries an explicit
    `private.has_admin_role('sales'::public.admin_role)` predicate,
    layered *on top of* RLS rather than replacing it — still
    `SECURITY INVOKER` (the default). Buyer-facing sample access never
    went through this function and still doesn't — see the "Buyer vs.
    Admin Data Access" section below for where it actually goes now
    (`public.buyer_samples`, not a base-table RLS policy, which has
    since been removed entirely for a separate, more serious reason).
  - **Oversized input is rejected, not truncated.** A search term over
    100 characters raises a validation exception (`22023`) rather than
    silently searching on only the first 100 characters — silently
    changing what a direct-RPC caller asked for (bypassing the UI/Zod
    length check entirely) would be a worse outcome than a clear error.

- **Browser-local date display, UTC storage.** Every CRM timestamp shown
  to an admin (lead/quote-request/sample created/updated/follow-up dates,
  activity timeline entries) renders via a shared `LocalDateTime` client
  component — never `toLocaleString()`/`toLocaleDateString()` called
  directly inside a Server Component, which would format using whatever
  timezone the server process runs in (typically UTC on Vercel), not the
  admin's own. `LocalDateTime` starts empty (identical on server and
  client, nothing for React to mismatch during hydration) and fills in
  the real, browser-local string in an effect that only ever runs after
  mount. The same principle applies to `LeadUpdateForm`'s follow-up
  `datetime-local` input: its initial value is populated via `useEffect`
  after mount, never computed during the initial render, which could
  otherwise differ between a UTC server and an India-local browser. The
  *stored* value is always an absolute UTC ISO timestamp regardless —
  this only affects how it's displayed/edited, never what's persisted.

- **Operational failures are never silently rendered as normal empty/
  missing data.** `listAdminUsers()`/`getActivityLog()` return `{data,
  error}` shapes rather than collapsing a query failure into an empty
  array — a failed staff-directory lookup shows "Assignment info
  unavailable", not "Unassigned"; a failed product lookup shows "Product
  name unavailable", not "Unknown product". `ActivityLogResult` further
  separates a full timeline-load failure (`error`) from an actor-name-
  resolution-only failure (`actorNamesError`) — if entries load but
  authorship can't be resolved, the (genuinely valid) entries are still
  shown, with a small warning and a neutral "Staff member" fallback,
  rather than discarding real timeline data over a secondary lookup
  failing. All logging uses safe, non-sensitive context only (operation
  name, error code) — raw database error messages never reach the
  browser.

- **Buyer vs. Admin Data Access — a critical fix, not a hardening pass.**
  `authenticated` holds a genuine table-level SELECT GRANT on both
  `quote_requests` and `samples` (Module 2) — RLS restricts which *rows*
  a role can see, never which *columns*. Module 2's original
  `"buyers can view own quote_requests"` / `"buyers can view own
  samples"` policies correctly restricted buyers to their own row, but
  that row came back with **every column**, including
  `lead_score`/`status`/`assigned_to`/`follow_up_at`/`notes` (the last
  explicitly documented as *"internal sales notes — admin-only, never
  buyer-submitted"*) on `quote_requests`, and internal staff/fulfillment
  fields on `samples`. `admin_lead_overview`'s own predicate fix (above)
  does not protect against this at all — it only closed a leak through
  *that specific view*; a buyer bypassing the view and querying the base
  table directly was never affected by it, since the buyer policy on the
  base table itself was untouched.
  - **Fixed** by removing the buyer SELECT policies from both base
    tables entirely — `authenticated`'s table-level GRANT is deliberately
    *not* revoked globally, since sales/super_admin sessions use the
    exact same `authenticated` database role and their own "sales
    can view ..." policies must keep working; without a matching buyer
    policy, a buyer session now gets **zero rows** from either base
    table directly, exactly like editor/anon already did.
  - **`public.buyer_quote_requests`** and **`public.buyer_samples`** —
    new, narrow, explicit-column-list views take over buyer-facing
    access. Each is `security_barrier = true` with `security_invoker`
    left at its default (`false`) — the "trusted owner" execution model,
    the *opposite* choice from `admin_lead_overview`'s
    `security_invoker = true`, deliberately: with the buyer policy gone,
    a buyer has no RLS path into the base table at all, so the view
    itself must read on the buyer's behalf via its owner's privileges,
    the same mechanism a `SECURITY DEFINER` function uses. Each view's
    own explicit `where buyer_id = auth.uid()` predicate does the exact
    job the removed RLS policy used to do. Each view's explicit,
    hand-picked column list (never `select *`) is what actually keeps
    internal fields out — `buyer_quote_requests` exposes only
    `id/buyer_id/company_name/email/phone/country/created_at/updated_at`;
    `buyer_samples` exposes the buyer-facing fulfillment/shipping/payment
    fields but never `assigned_to` (internal staff id), `inquiry_id`
    (inquiries have no buyer-ownership concept at all), or
    `email_normalized` (an internal generated column).
  - **A buyer-facing quote-progress indicator, if wanted later, should
    be its own deliberately-safe field** — never the internal
    `lead_status` enum exposed directly through either view.
  - **`private.can_access_quote_request(uuid)`** (Module 2,
    `SECURITY DEFINER`) is unaffected by any of this — it already
    checked buyer ownership by querying `quote_requests` with its own
    bypassed privileges, never relying on the (now-removed) buyer RLS
    policy in the first place. `quote_request_items`' own buyer
    visibility is built entirely on top of that same function, not on
    the `quote_requests` buyer policy, so it continues to work exactly
    as before.
  - **Summary**: sales/super_admin CRM work uses the original, secured
    base tables (`quote_requests`, `samples`) and `admin_lead_overview`
    directly — nothing changed for them. Buyers never query
    `quote_requests` or `samples` directly at all anymore; any buyer
    account page must query `buyer_quote_requests` / `buyer_samples`
    instead, which expose exact safe columns only, filtered to that
    buyer's own rows, with zero internal score/status/assignment/
    follow-up/notes/attribution data ever reaching a buyer session.

- **Routes**:
  - `/admin/leads` — unified list of inquiries + quote_requests,
    filterable by status and by "due for follow-up", sortable by
    score/follow-up date/newest.
  - `/admin/leads/inquiry/[id]` and `/admin/leads/quote-request/[id]` —
    detail pages (one dynamic `[type]/[id]` route internally) with full
    lead details, activity timeline, a manual note form, and an update
    form for status/score/assignment/follow-up (+ internal notes for
    quote requests). Dynamic route params are validated as genuine UUIDs
    before any query runs — a malformed id is a clean 404, never a raw
    database cast error.
  - `/admin/samples` — sample request list: status, buyer/contact
    identity, linked product name (UUID kept only as secondary
    diagnostic text), assigned admin, requested + updated dates, detail
    link. Search via `search_samples()` (see above).
  - `/admin/samples/[id]` — detail page with linked buyer/product/quote
    request info (product and quote-request names resolved, not shown as
    bare UUIDs), activity timeline, note form, and an update form for
    fulfillment status/payment/courier/tracking/shipping. Same UUID
    param validation as the lead detail pages.

- **CRM authorization model — no service-role usage anywhere in this
  module.** Every read and write goes through the requesting admin's own
  authenticated session:
  - Reads rely on existing RLS plus each view's own predicate described
    above — an editor or buyer session reaching any of these pages
    simply sees no rows.
  - Writes go through `admin_update_inquiry()` / `admin_update_quote_request()`
    / `admin_update_sample_status()` (all Module 2, all `SECURITY DEFINER`
    but each independently re-checks `has_admin_role('sales')` against the
    calling session before doing anything) — or, for manual timeline
    notes, a direct `lead_activity_log` INSERT, itself RLS-gated to
    `has_admin_role('sales')` directly.
  - Every server action validates its target id (as a genuine UUID) and
    its update body together, as one composite Zod schema — an id is
    exactly as much untrusted input as the rest of the form.
  - This is a deliberately different model from Module 4's public inquiry
    form, which genuinely needed a privileged client because anonymous
    site visitors have no session to check RLS against. Every CRM caller
    already has an authenticated admin session by the time any Module 5
    code runs (enforced by `proxy.ts` and the admin dashboard layout, per
    Module 3) — there is no anonymous path here to defend against.
  - Query errors are distinguished from genuinely-missing records:
    a Supabase error triggers a logged (safe context only, never raw
    error details) generic operational message, never a misleading
    `notFound()` and never a silently-empty list.

- **Activity timeline**: `lead_activity_log` entries, newest first, shown
  on every lead/sample detail page. The guard-insert trigger from
  Module 2 unconditionally forces `created_by`/`created_at` regardless of
  what the app sends.

- **Assignment/status/follow-up workflow**: assignment is a
  `list_crm_assignment_admins()`-backed dropdown (see above); status is
  the same `lead_status` enum pipeline (`new → contacted → quoted →
  nurturing → won/lost`) for both inquiries and quote requests;
  follow-up is a plain `timestamptz`, surfaced on the leads list as a
  "due for follow-up" filter (`follow_up_at <= now()`).

- **Browser-local → UTC conversion for follow-up dates.** An HTML
  `<input type="datetime-local">` value carries no timezone information
  of its own — it represents whatever local time the admin's browser
  shows, nothing more. `LeadUpdateForm` converts this to a proper UTC ISO
  string **at submit time**, using the browser's own `Date` object (which
  correctly knows the browser's actual timezone) — never sending the bare
  `datetime-local` string to the server to be reinterpreted in whatever
  timezone the server happens to run in. The server-side schema
  (`timezoneAwareDateTimeOrEmpty`) enforces this: it requires either an
  empty string (clear the reminder) or a genuine timezone-bearing ISO
  string, and rejects a bare, timezone-less value as a validation error —
  never silently treats an unparseable value as "clear the reminder".

## Module 6 Notes (Public Marketing Website & Product Catalogue)

- **No migration.** Every catalogue read uses existing Module 2 tables
  and RLS — `categories`/`collections`/`product_collections` are fully
  public; `products` RLS already scopes anon/authenticated SELECT to
  `status = 'published'` only, and `product_images`/`product_variants`
  RLS mirrors that via an EXISTS check back to `products`, so a draft
  product's images/variants can never leak through a join either. Every
  query in `src/lib/catalog/data.ts` still adds an explicit
  `.eq("status", "published")` anyway, as a second, redundant layer —
  this project's established convention throughout Modules 2–5 of never
  relying on RLS being the *only* thing standing between a query and
  draft-product exposure.
- **No service-role client anywhere in this module.** Every catalogue
  read goes through the ordinary cookie-scoped `createClient()`
  (publishable key) — the exact same client already used for every other
  public/RLS-respecting read in this project.

- **Routes**: `/` (homepage), `/products` (listing + search/filter),
  `/products/[slug]` (detail), `/categories/[slug]`, `/collections/[slug]`,
  `/about`, `/why-us`, `/sustainability`, `/certifications`,
  `/factory-tour`. `/contact` (Module 4) is extended, not duplicated —
  see Quote Integration below.
- **Canonical search approach: `/products?q=...`** (not a separate
  `/search` route) — one clear, canonical listing endpoint that also
  handles category/collection filtering and pagination, rather than two
  competing routes for overlapping functionality.

- **Search validation.** `productsQuerySchema` (Zod) trims `q` and caps
  it at 100 characters — an oversized value is a **validation error**,
  surfaced to the page as its own distinct state (never a silent
  fallback to "no search," which would otherwise turn an invalid request
  into an unfiltered "show everything" result — the exact class of
  mistake corrected in Module 5's `search_samples()`). Search itself is
  a single bound `.ilike("name", ...)` call — never a raw PostgREST
  `.or()` expression built from user input, which would parse
  caller-controlled text as filter grammar (commas separate conditions,
  periods separate column/operator/value). `category`/`collection`
  params are validated against the canonical slug pattern
  (`^[a-z0-9-]+$`) before ever reaching a query.

- **Pagination.** Real database-level pagination (`.range()`), 12
  products per page (`PAGE_SIZE`, exported from `data.ts` so the page
  components never duplicate the number) — the full catalogue is never
  fetched to filter/paginate client-side. Canonical URL behavior: page 1
  never appears as `?page=1` in a link (`/products` and
  `/products?page=1` are the same canonical URL, not two different ones).

- **Empty vs. error, always distinguished.** Every catalogue read
  returns `{data, error}` (mirroring the Module 5 CRM pattern) — a
  genuine database failure renders a distinct "something went wrong"
  message, never silently collapsed into "no products match." An
  empty-but-valid catalogue (no categories yet, no products yet) renders
  its own graceful, on-brand empty state instead of an error, a broken
  layout, or a crash — checked explicitly on the homepage, `/products`,
  category pages, and collection pages.

- **`notFound()` vs. operational error, always distinguished** on
  `/products/[slug]`, `/categories/[slug]`, `/collections/[slug]`: an
  unknown, malformed, or unpublished slug is `{data: null, error: false}`
  → clean `notFound()`. A genuine query failure is
  `{data: null, error: true}` → a distinct operational-error message,
  never a misleading 404. A malformed slug (fails the canonical
  `^[a-z0-9]+(-[a-z0-9]+)*$` pattern) is rejected before it ever reaches
  a database query at all. `generateMetadata()` on each of these three
  pages makes the identical distinction independently — a genuine
  database failure gets its own "Temporarily Unavailable" title, never a
  "Not Found" title, since `generateMetadata()` runs separately from the
  page body and would otherwise need to re-derive this correctly on its
  own (an earlier revision didn't, and mislabeled an operational failure
  as "Not Found"). `/contact`'s `?product=` lookup follows the same
  principle: a malformed, oversized, repeated, unknown, or unpublished
  slug safely falls back to a general inquiry with no product context,
  but a genuine operational failure on an otherwise validly-shaped slug
  instead shows a plain, non-raw notice ("The selected product could not
  be loaded right now...") rather than silently looking identical to "no
  such product."

- **Image fallback.** `ProductCard` and the product detail gallery both
  render a fixed-dimension placeholder box (same `aspect-square` sizing
  as a real image) when no primary image exists yet — the grid/layout
  never shifts depending on which products happen to have a photo. The
  placeholder is `aria-hidden` (the product name, a real heading, already
  labels the card for a screen reader); every real `<Image>` uses the
  product's actual `alt_text` (a required, not optional, column).

- **Quote integration — no second lead-submission route.** Product pages
  link to `/contact?product=<slug>`; the contact page resolves that slug
  server-side via `getProductBySlug()` (published-only, real product
  record) and passes the confirmed `id`/`name` to the *existing*
  `InquiryForm` (Module 4) — never a raw client-supplied id, and an
  unknown/unpublished/malformed slug just falls back to a general
  inquiry rather than erroring the page. `submit_inquiry()` (Module 4)
  independently re-validates the product id server-side regardless of
  what this page passes through — this is a UX nicety layered on top of
  an already-sufficient boundary, not a new one. No Turnstile, rate
  limit, or `submit_inquiry()` bypass; no second unprotected form.

- **SEO.** Every catalogue page has `generateMetadata()` with a
  canonical URL, title, and description — using `meta_title`/
  `meta_description` when a product has them, with a safe fallback
  otherwise. `BreadcrumbList` JSON-LD on the product detail page;
  `Organization` JSON-LD on the homepage using only verified project
  copy (no fabricated address/registration details); `Product` JSON-LD
  on product pages **without an Offer** — there is no genuine public
  price to publish (B2B pricing is MOQ/negotiation-based, matching the
  schema itself: `products` has no price column at all, only an
  optional `price_note` text field on variants).

- **No fabricated claims anywhere in this module.** `/about`, `/why-us`,
  `/sustainability`, `/certifications`, and `/factory-tour` were written
  to make no unverified claims — no invented company history, team
  members, factory ownership, certification numbers/logos, or
  sustainability guarantees. Certifications and documentation are
  explicitly framed as "depends on product and order, confirmed with our
  team" rather than listing invented certificate details. Factory Tour
  is framed as production/artisan-workshop **visit coordination subject
  to confirmation** — not a claim of factory ownership, since no such
  ownership is documented anywhere in this project's approved content.

- **Header/Footer.** Header is session-aware via `getBuyerProfile()`
  specifically — not the broader `getCurrentUser()` — so a logged-in
  *admin* browsing the public site correctly still sees "Buyer Login"
  rather than a broken "My Account" link into a buyer dashboard they
  have no profile for (both share the same `authenticated` Postgres
  role, so a bare user-exists check can't tell them apart). The Products
  dropdown uses a native `<details>/<summary>` element — keyboard
  operable without any JavaScript — and gracefully shows only "All
  Products" when there are no categories yet, rather than an empty or
  broken dropdown. `MobileMenu` is the one Client Component in this
  module: Escape-to-close, body-scroll lock while open (always cleaned
  up on close/unmount), focus moved into the panel, `aria-expanded`/
  `aria-controls`/`aria-label` throughout. Footer stays a **Server
  Component** — the copyright year (`new Date().getFullYear()`) is
  computed once during server rendering and never re-executed in the
  browser (Server Components don't hydrate/re-run client-side at all),
  so there is no year hydration-mismatch risk regardless of viewer
  timezone.

- **No new package dependency.** Every new file in this module imports
  only `next`, `next/image`, `next/link`, `react`, and `zod` — all
  already dependencies before this module.

### Manual browser verification checklist (to run against a real deployment)

- [ ] Mobile header: menu opens/closes, Escape closes it, body scroll is
      locked while open, focus lands inside the panel
- [ ] Homepage renders correctly with categories/products present
- [ ] Homepage renders correctly with an **empty** catalogue (no
      categories, no products) — graceful empty states, no crash
- [ ] `/products` — search, category filter, pagination, "Clear filters"
- [ ] `/products?q=` with a 101+ character value — validation-error
      state, not an unfiltered product list
- [ ] A valid published product page — all present fields render,
      absent fields are omitted (not shown as blank/"N/A")
- [ ] An unpublished or unknown product slug — clean 404, not a raw
      error page
- [ ] A category page and a collection page, including their own empty
      states
- [ ] "Request Quote" from a product page — confirm the contact page
      shows "Inquiring about: <product name>" and the existing Turnstile
      + rate-limited `submit_inquiry()` flow still completes normally
- [ ] Keyboard-only navigation through the header, filters, and product
      grid — visible focus states throughout

## Scripts

- `npm run dev` — local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, `eslint .`)
- `npm run type-check` — TypeScript, no emit

## Environment Variables

**Required as of Module 4** (the app will not boot without all of these —
each is validated at startup via `env.client.ts`/`env.server.ts`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key. Use
  Cloudflare's published always-pass test key for local dev (see
  `.env.local.example`); use your real site's key in any public
  deployment.
- `NEXT_PUBLIC_TURNSTILE_ACTION` — the `action` value both the widget and
  the server's verification check against, so a token issued for a
  different Turnstile widget can't be replayed against this form.
  **Local dev: `test`.** Cloudflare's dummy siteverify backend (used with
  the test keys above) echoes back a fixed `"test"` action regardless of
  what the widget actually requested — a hardcoded `"submit_inquiry"`
  check would make every local Turnstile verification fail against the
  dummy keys. **Production: `submit_inquiry`**, once real Turnstile keys
  are configured — leaving it as `test` against a real site provides no
  actual action-binding protection.
- `TURNSTILE_SECRET_KEY` — the matching Turnstile secret, server-only.
  Same local-dev test-key note applies.
- `SUPABASE_SECRET_KEY` — your Supabase project's **secret** key
  (Settings → API Keys → Secret key, `sb_secret_...` — never the
  publishable key). Server-only, bypasses Row Level Security entirely.
  Used exclusively by `src/lib/supabase/admin.ts`, which is the only way
  to call `submit_inquiry()` (service_role-only as of Module 4). Never
  prefix this `NEXT_PUBLIC_`, never log it, never commit a real value —
  `.env.local.example` documents the variable name with a blank value
  intentionally.

**Optional, deployment-specific:**

- `TRUSTED_CLIENT_IP_HEADER` — names the single HTTP header the inquiry
  form's IP-based rate limiting should trust as the caller's genuine IP.
  **This header must contain exactly one edge-verified client IP — never
  an X-Forwarded-For-style comma-separated chain.** If the configured
  header's value ever contains a comma, it's rejected outright (treated
  as not configured) rather than guessing which position in the chain to
  trust: without an explicitly configured trusted-proxy-hop count, there
  is no generically safe way to know which entry a chain's closest,
  most-trusted hop actually appended versus what an earlier hop (or the
  client itself) supplied — picking the wrong position could return a
  shared proxy IP instead of the real client's, silently merging
  unrelated buyers under one rate-limit identity.
  **Leave this unset unless you have specifically verified, against your
  own infrastructure's documentation, that the header you name is
  guaranteed to be set or overwritten by trusted edge/proxy
  infrastructure, delivers a single IP (not a chain), and cannot simply
  be supplied by the client itself.** `x-forwarded-for` in particular
  must **not** be assumed trustworthy by default — per the
  X-Forwarded-For convention, each hop *appends* its own observed address
  rather than replacing the header outright, so a client can prepend its
  own fabricated entry before any real proxy ever sees the request; this
  is exactly the chain-shaped header this variable's contract excludes.
  - **When left unset (the default): IP-based rate limiting is silently
    skipped.** This is a safe default, not a coverage gap — visitor-ID
    and normalized-email based rate limiting (see
    `submit_inquiry()` in `20260726090100_create_submit_inquiry_rpc.sql`)
    remain fully active regardless, and neither depends on this variable.

`NEXT_PUBLIC_META_PIXEL_ID` and `META_CONVERSIONS_API_TOKEN` remain
documented in `.env.local.example` as commented placeholders for Module 7
— do not set them yet.

## Architecture Notes (Module 1 Scope)

- Route groups `(marketing)`, `(buyer)`, `(admin)` isolate layouts without
  affecting URL structure. Root `layout.tsx` contains only `<html>`/`<body>`,
  fonts, and global styles — no navigation chrome.
- `(marketing)/layout.tsx` renders the public Header/Footer. `(buyer)` and
  `(admin)` were, AT THIS POINT IN MODULE 1, separate, empty-shell layouts
  with no page yet, proving the isolation boundary before any real page
  existed so public navigation could never leak into buyer or admin
  routes later. **This describes Module 1's state only** — Module 3 built
  out real `(buyer)`/`(admin)` authentication pages, and Module 5 built
  out the full CRM (`/admin/leads`, `/admin/samples`, etc. — see the
  Module 5 Notes section below for the current state of those routes).
- `src/proxy.ts` (Next.js 16's renamed middleware convention, function named
  `proxy`) only runs Supabase session refresh on `/admin/:path*`,
  `/dashboard/:path*`, and `/auth/:path*` — public marketing/catalog pages
  (where Meta ad traffic lands) pay zero session-refresh overhead.
- `src/lib/supabase/proxy.ts` refreshes sessions via `getClaims()`
  (local/JWKS JWT verification) rather than `getUser()`.
- `src/lib/env.client.ts` and `src/lib/env.server.ts` are strictly separated.
  `env.server.ts` is guarded by `import "server-only"`. As of Module 4 it
  exports real required secrets (`TURNSTILE_SECRET_KEY`,
  `SUPABASE_SECRET_KEY`) plus one optional deployment-specific setting
  (`TRUSTED_CLIENT_IP_HEADER`) — see the Environment Variables section
  below for the complete, current list.
- Tailwind CSS 4 is configured CSS-first: design tokens (brand colors,
  fonts, radii) live in `src/app/globals.css` under `@theme`, not in a
  `tailwind.config.ts`.
- `Button` uses `@radix-ui/react-slot` for an accessible `asChild` pattern
  (e.g., rendering as a `Link` without a nested-button a11y issue).

## Explicitly Out of Scope for Module 1

No database schema, authentication authorization/route protection, RFQ
system, lead scoring, CRM, Meta Pixel/CAPI, or admin panel functionality is
included. These are built in later modules per the approved plan.

## Explicitly Out of Scope for Module 6

Not implemented in this module: Meta Pixel, Meta Conversions API,
consent-management tracking, advertising events, admin product/category/
collection CRUD, an admin CMS, buyer-account redesign, checkout or
payment, public product prices, a shopping cart, fixed retail pricing,
service-role catalogue reads, or any Module 7+ feature. These remain for
later modules per the approved plan.

## Local Testing Checklist

- [ ] `npm install` completes with no errors; `package-lock.json` generated and committed
- [ ] `npm run lint` — zero errors
- [ ] `npm run type-check` — zero errors
- [ ] `npm run build` — production build succeeds
- [ ] `npm run dev` → `/` renders Header + Footer via the `(marketing)` layout
- [ ] Tab through header nav links — visible focus ring appears
- [ ] Temporarily add a test `page.tsx` under `(admin)` and `(buyer)` — confirm
      neither renders the public Header/Footer, then delete the test pages
- [ ] Visit a nonexistent path — confirm the custom 404 renders

## Vercel Deployment Checklist

- [ ] Set every **required** variable in Vercel Project Settings
      (Production + Preview) — see Environment Variables above for the
      complete current list (5 public, 2 server-only as of Module 4).
      The app will fail to boot if any required variable is missing —
      this is intentional (validated via Zod in `env.client.ts`/
      `env.server.ts`), not a bug to work around by leaving one unset.
- [ ] Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to
      your **real** Turnstile site's keys, not the local-dev always-pass
      test keys — using the test keys in a public deployment means
      Turnstile provides no actual spam protection at all.
- [ ] Set `NEXT_PUBLIC_TURNSTILE_ACTION` to `submit_inquiry` (not `test`)
      once real Turnstile keys are configured.
- [ ] Set `SUPABASE_SECRET_KEY` to your Supabase project's real secret
      key. Double-check it is never prefixed `NEXT_PUBLIC_` and is only
      ever added as a server-only environment variable in Vercel (not
      exposed to the client bundle).
- [ ] `TRUSTED_CLIENT_IP_HEADER` is optional — only set it after
      confirming, against your actual Vercel configuration (and any CDN/
      proxy in front of it, if any), which single header your specific
      setup guarantees is edge-controlled, delivers exactly one IP (never
      a comma-separated chain), and is not client-forgeable. If
      left unset, IP-based rate limiting is simply skipped — visitor-ID
      and normalized-email based rate limiting remain fully active
      regardless, so this is a safe, non-blocking default.
- [ ] Confirm Vercel's Node.js version setting is 24.x
- [ ] Deploy → confirm homepage renders, no build errors in the deployment log
- [ ] Submit a test inquiry through `/contact` in the deployed environment
      and confirm it succeeds end-to-end with your real Turnstile keys
      configured

## Pending Improvements After Module 6

- Buyer ke selected country ke basis par phone country code automatically
  lagana aur database mein full international format save karna.
  Example: India + 9773085876 → +919773085876.

  - Product image upload feature mein har product ke liye maximum 8 images
  allow karni hain. Ek image primary hogi aur baaki product gallery mein
  dikhengi.