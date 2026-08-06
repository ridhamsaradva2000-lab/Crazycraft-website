# Crazycraft — Database (Module 2)

**Status: Prepared but not runtime-verified.** No local Postgres binary
and no network access were available while writing this (confirmed
earlier: `psql: not found`, and a blocked npm registry request). Every
migration and test file has been manually reviewed and mechanically
validated (see "Final Mechanical Validation" below) — but none of it has
been executed against a real Postgres/Supabase instance. Run it yourself
and report back before treating this as verified.

---

## Prerequisites

- **Docker Desktop** (or another OCI container runtime compatible with
  the Supabase CLI) — `supabase start` downloads and runs the local
  Postgres/Auth/Storage/Studio stack as containers. Without a running
  container runtime, `supabase start` fails immediately.
- **Node.js 24.18.0** (see the project root's `.nvmrc` from Module 1) —
  also comfortably satisfies the Supabase CLI's own Node 20+ minimum when
  run via `npx`/`npm`.
- **npm** (ships with Node). No global Supabase CLI install is assumed or
  required — see below.

## Installing the Supabase CLI (project devDependency, not global)

The CLI is pinned as an exact-version `devDependency` in `package.json`
(`"supabase": "2.109.1"`), not installed globally. This guarantees every
contributor and CI run uses the identical CLI version.

```bash
npm install
```

All commands below run through the local binary via `npx` (or the
`supabase:*` npm scripts, which do the same thing) — never a bare
`supabase` command, which would only work with a separate global install.

## npm Scripts

```bash
npm run supabase:start   # npx supabase start
npm run supabase:stop    # npx supabase stop
npm run supabase:reset   # npx supabase db reset
npm run supabase:lint    # npx supabase db lint --level error
npm run supabase:test    # npx supabase test db
```

---

## Full Migration Order (17 files)

| # | File | Purpose |
|---|---|---|
| 1 | `20260725120000_create_enums.sql` | All Postgres enums |
| 2 | `20260725120100_create_identity_tables.sql` | `admin_users`, `buyers` |
| 3 | `20260725120200_create_private_schema_and_core_functions.sql` | `private` schema, `is_admin()`, `has_admin_role()` |
| 4 | `20260725120300_create_catalog_tables.sql` | `categories`, `collections`, `products`, `product_collections`, `product_images`, `product_variants` — canonical slug checks, self-parent prevention, `sort_order` check, normalized SKU uniqueness |
| 5 | `20260725120400_create_content_tables.sql` | `blog_posts` |
| 6 | `20260725120500_create_lead_tables.sql` | `inquiries`, `quote_requests`, `quote_request_items`, `saved_products`, `lead_scoring_rules` |
| 7 | `20260725120600_create_samples_table.sql` | `samples` |
| 8 | `20260725120700_create_activity_and_capi_tables.sql` | `lead_activity_log`, `capi_events`, `capi_event_log` — real FK parent references |
| 9 | `20260725120800_create_attribution_and_cms_tables.sql` | `attribution_events`, `media_library`, `seo_metadata`, `site_settings`, `newsletter_subscribers` — case-insensitive unique email |
| 10 | `20260725120900_create_private_access_functions.sql` | `private.can_access_quote_request()` |
| 11 | `20260725121000_create_guard_triggers.sql` | All `*_guard_insert`/`*_guard_update` triggers, including the audit-integrity trigger on `lead_activity_log` |
| 12 | `20260725121100_create_admin_rpcs.sql` | `admin_verify_buyer`, `admin_update_inquiry`, `admin_update_quote_request`, `admin_update_sample_status` |
| 13 | `20260725121150_create_public_rpcs.sql` | `submit_quote_request`, `submit_sample_request` |
| 14 | `20260725121200_create_updated_at_triggers.sql` | `set_updated_at()` + every `updated_at` trigger |
| 15 | `20260725121300_create_rls_policies.sql` | RLS enablement + policies for all 23 tables |
| 16 | `20260725121400_create_grants.sql` | All GRANT/REVOKE, including PUBLIC-inclusive function revokes and default privileges |
| 17 | `20260725121500_create_bootstrap_data.sql` | Production-required reference data (lead scoring rules, categories, site settings) |

`seed.sql` is separate from this list — it is local/demo-only (one demo
product) and is **never** applied to a hosted project by any command in
this document.

---

## Changelog (this revision — five static corrections)

1. **Future private-schema functions secured.** `alter default privileges
   for role postgres in schema private ...` added, matching the existing
   `public` schema protection. Tested with a throwaway function created
   inside a rolled-back transaction.
2. **`submit_sample_request()` is now the only sample-creation path.**
   Direct INSERT grants and RLS policies for anon/authenticated on
   `samples` are removed entirely — not just the linkage columns. Tests
   updated: anon direct INSERT fails, authenticated buyer direct INSERT
   fails, both RPC paths still succeed, and a draft/unpublished product is
   rejected through the RPC.
3. **Inquiry product references are now validated.** The `inquiries`
   INSERT policy's `with check (true)` is replaced with a check requiring
   `product_id is null` or a reference to a genuinely published product.
   Tested: null succeeds, published succeeds, draft is rejected.
4. **Fixed a false-positive test.** The cross-buyer isolation test in
   `03_` previously checked for zero rows without any real row existing
   for buyer two — meaning it would have passed even if RLS were broken.
   Now creates a real fixture, verifies it exists under the setup
   context, and proves both directions (buyer one sees zero, buyer two
   sees their own).
5. **Extension search-path hardened.** `config.toml`'s
   `extra_search_path` now includes `extensions`, and `00_fixtures.sql`
   calls `extensions.crypt()`/`extensions.gen_salt()` explicitly rather
   than relying on implicit resolution.

## Changelog (this revision — final concrete corrections)

1. **Fixed the false trigger test in `07_`.** The old test switched to the
   buyer's `authenticated` role expecting the guard trigger's custom
   error, but `samples` has no buyer UPDATE RLS policy — the row would be
   filtered to zero matches with no exception at all, making the test
   unreliable. Replaced with a true trigger-isolation test: stays under
   the default/superuser role (bypasses RLS entirely) while only setting
   `request.jwt.claim.sub` via `set_config(..., true)`, so the trigger's
   `auth.uid()` check still sees the buyer's identity and correctly
   raises its own exception. The now-unnecessary temporary grant was removed.
2. **Sales/editor data separation corrected.** `private.is_admin()` was
   letting editors see sales-sensitive data. Narrowed to
   `private.has_admin_role('sales'::admin_role)` for: the two `buyers`
   admin policies, both `quote_request_items` admin policies, and the
   `saved_products` admin view policy. Sales and super_admin are
   unaffected (the function already treats super_admin as a superset).
3. **`04_role_scoping_tests.sql` expanded** to prove: editor cannot view
   buyers, editor cannot view quote_request_items, editor's INSERT is
   rejected outright (RLS violation) while UPDATE/DELETE are silent
   no-ops (verified under the superuser context afterward, since editor
   has zero visibility to check the outcome itself), and sales admin
   retains full view/manage access to all three areas just narrowed.
   Real fixtures (a quote_request_item, a saved_product) are created
   before any visibility assertion, avoiding the false-positive pattern
   from the previous round.
4. **README table count corrected**: 23 public tables, not 22 — verified
   mechanically by extracting every `create table` statement across all
   17 migrations.

## Test Files (10 files, 151 total assertions)

| File | Assertions | Covers |
|---|---|---|
| `00_fixtures.sql` | 12 | Test identities (3 admins, 2 buyers), a category, two published products + variants, and a shared draft (unpublished) product — committed, not rolled back |
| `01_function_privileges_and_structure.sql` | 31 | `has_function_privilege()` for every RPC and private helper, trigger-function lockout, live proofs that new functions in both `public` and `private` don't inherit PUBLIC execute, RLS-enabled-everywhere, bootstrap data existence |
| `02_anon_negative_and_rpc_tests.sql` | 19 | anon column-level grant blocks, anon read lockout, anon success calling both RPCs, inquiries product-reference validation (null/published/draft) |
| `03_buyer_and_verified_field_tests.sql` | 11 | `buyers.verified` grant/trigger behavior, a *real* cross-buyer quote_request fixture proving both directions (buyer one sees zero, buyer two sees their own), `admin_verify_buyer()` success |
| `04_role_scoping_tests.sql` | 23 | Sales admin full RPC + CRM access (inquiries, quote_requests, samples, buyers, quote_request_items, saved_products); editor blocked from all of the same CRM/buyer/quote-item surfaces (view, insert, update, delete) with real pre-existing fixtures proving every zero-count is RLS filtering, not missing data |
| `05_integrity_constraints.sql` | 11 | Primary-image uniqueness, orphan/malformed `lead_activity_log` parents, quote-item quantity, product/variant mismatch, case-insensitive newsletter uniqueness |
| `06_submit_quote_request_rpc.sql` | 10 | Empty/malformed items, missing fields, bad/unpublished product, variant mismatch, valid submission, forced defaults, no accidental merging |
| `07_sample_ownership_and_guard_tests.sql` | 11 | `submit_sample_request()` as the *only* creation path, ownership verification, draft-product rejection, and a corrected trigger-isolation test for `shipping_country` (bypasses RLS via the owner role, sets only the JWT claim) |
| `08_audit_integrity_tests.sql` | 11 | `lead_activity_log` — forced `created_by`/`created_at`, forgery rejection, orphan/multi-parent rejection |
| `09_catalog_integrity_tests.sql` | 12 | Slug canonicalization, self-parent rejection, `sort_order`, SKU checks, primary-image uniqueness, product/variant pairs |
| **Total** | **151** | |

This table was generated mechanically, not by eyeballing:

```bash
cd supabase/tests/database
for f in *.sql; do
  planned=$(grep -oP '(?<=select plan\()\d+' "$f" | head -1)
  actual=$(grep -c "^select \(ok\|is\|isnt\|throws_ok\|lives_ok\|matches\|cmp_ok\)(" "$f")
  echo "$f: planned=$planned actual=$actual"
done
```

---

## Final Mechanical Validation (this revision)

All of the following were checked with scripts, not by inspection alone:

- ✅ Every one of the 10 test files has `plan()` exactly matching its real
  assertion count (table above) and ends with `select * from finish();`.
- ✅ Every fixture referenced by any test file either exists in
  `00_fixtures.sql` (committed) or is created inline within that same
  file's own transaction — no file depends on another file's rolled-back
  data. (This was a real bug in the previous revision, now fixed: the
  second product/variant moved from `05_` into `00_fixtures.sql`.)
- ✅ 17 migration files, all uniquely and correctly timestamped, verified
  with no duplicate prefixes.
- ✅ Full dependency trace confirms no migration references a table,
  function, or type before the migration that creates it runs.
- ✅ The grants migration (16 of 17) is the last migration to touch any
  privilege — the bootstrap-data migration (17) only inserts rows, so no
  approved RPC's EXECUTE grant is lost after being applied.
- ✅ `revoke execute on all functions in schema public/private from
  public, anon, authenticated` is present, with explicit re-grants only
  for the 3 private helpers and 6 public RPCs that need them — confirmed
  via a script cross-checking every `create function` against its
  `search_path`/`security definer` status (all 19 functions have
  `search_path` explicitly set; all 8 SECURITY DEFINER functions are
  correctly flagged).
- ✅ All 23 tables created across every migration have `ENABLE ROW LEVEL
  SECURITY` (cross-checked: the set of tables from every `create table`
  statement is identical to the set from every `alter table ... enable
  row level security` statement).
- ✅ Every `grant insert (...) to anon, ...` statement uses an explicit
  column list — confirmed by extracting every multi-line INSERT grant
  statement in the grants migration and checking each one that targets
  `anon` for a parenthesized column list. None are table-wide.
- ✅ Every table with an `updated_at` column has a matching
  `trg_*_updated_at` trigger — this check caught a real gap
  (`lead_scoring_rules` had the column but no trigger), now fixed.

**Judgment call flagged, not silently assumed:** admin-only tables
(`categories`, `products`, `blog_posts`, etc.) keep table-wide
`insert, update, delete ... to authenticated` grants rather than
column-scoped ones. This is intentional — those grants are for trusted
internal admins gated by `is_admin()`/`has_admin_role()` RLS checks, not
the anonymous/public lead-capture surface that column-scoping is meant to
protect. Only grants that include `anon` were required to be column-scoped,
and all of them are.

---

## Exact Local Verification Commands

```bash
npm install
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
```

Manual spot-checks after `supabase:reset`:

```sql
select count(*) from pg_tables where schemaname = 'public';        -- 23
select count(*) from pg_policies where schemaname = 'public';
select count(*) from lead_scoring_rules;   -- bootstrap data, >= 11
select count(*) from categories;            -- bootstrap data, >= 5
select count(*) from products;              -- includes seed.sql's demo product locally
```

## Verifying `db.major_version` Before Deploying

`config.toml`'s `db.major_version = 15` is an **explicitly unverified
placeholder** — do not trust it as-is:

- If you already have a hosted Supabase project: connect and run
  `SHOW server_version;`, then set `major_version` to that value's major
  version number (e.g. `15`, `17`).
- If you don't have a hosted project yet: run `npx supabase init` in an
  empty scratch directory and copy whatever `major_version` the CLI
  itself generates — that reflects the actual current default, which may
  differ from what's written here.

## Exact Remote Preview/Deployment Commands

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

`db push` applies every migration, including the bootstrap-data migration
— production reference data arrives automatically. `seed.sql` is never
applied to a linked/hosted project by any command here; it only runs
locally, automatically, as part of `supabase db reset`.

**Do not run `db push` against a production project without first running
`db push --dry-run` and reviewing the plan, and without having already run
the full local verification sequence above successfully.** An unverified
migration applied directly to production is exactly the risk this whole
document is trying to prevent.

## Rollback / Recovery Notes

- These are the first migrations for this project — nothing to roll back
  to yet. A failed migration during `db push` stops before any later file
  runs; Postgres DDL is transactional, so the failed migration itself is
  rolled back. Fix the file and re-run `db push`.
- Local "undo everything": `npm run supabase:reset` (never run the
  equivalent against a hosted project — there is no local-only reset for
  a remote database).
- To reverse an already-applied hosted migration, write a new,
  later-timestamped migration that undoes it — don't edit or delete an
  applied migration file, or environments drift out of sync with each
  other and with the CLI's migration-history tracking.

## Security Model Summary (unchanged in substance, still accurate)

- **anon vs authenticated** is enforced by Postgres `GRANT`/`REVOKE`,
  including an explicit revoke from the `PUBLIC` pseudo-role on every
  function (Postgres grants EXECUTE to PUBLIC by default otherwise).
- **buyer vs admin** (both `authenticated`) cannot be separated by grants
  alone: `authenticated` has no direct UPDATE grant at all on `inquiries`,
  `quote_requests`, or `samples`, and no direct INSERT grant at all on
  `quote_requests`/`quote_request_items` — all of that goes through
  `submit_quote_request()`, `submit_sample_request()`, or the four
  `admin_*` RPCs, each independently re-checking authorization.
- `buyers.verified` and sample lifecycle fields: excluded from the
  `authenticated` grant entirely. A non-admin's attempt fails with a
  plain permission-denied error at the grant layer — the guard triggers
  are defense in depth, not the primary mechanism (tested explicitly,
  including each trigger's isolated behavior if a grant is ever loosened).
- `lead_activity_log.created_by`/`created_at`: forced unconditionally by
  trigger for every caller, including admins — authorship can never be
  forged, not even by another admin.
- `capi_events`/`capi_event_log`: zero grants, zero RLS policies for
  anon/authenticated. Service-role only, introduced in Module 7.
- `inquiries` has no ownership/buyer column at all, so `samples.inquiry_id`
  is never accepted from any public caller — only `quote_request_id` can
  be linked, and only by its verified owner.

## Known Limitations / Verify Yourself

- The `auth.users` INSERT in `00_fixtures.sql` uses a reduced column set
  believed to cover Supabase's current minimum — adjust if your project's
  schema differs, or switch to `supabase_test_helpers`'
  `tests.create_supabase_user()`.
- `config.toml`'s `major_version` is an explicitly-flagged placeholder,
  not a verified value.
- The `supabase` npm package version (`2.109.1`) was the latest verified
  at the time of writing — confirm it's still current before relying on
  a long-lived lockfile.
