-- 10_submit_inquiry_rpc.sql
-- Run via: supabase test db
-- Self-contained — uses 00_fixtures.sql's committed published product
-- (99999999-9999-9999-9999-999999999992) and draft product
-- (99999999-9999-9999-9999-999999999979), creates everything else itself.
--
-- SECURITY MODEL UNDER TEST: submit_inquiry() is service_role-only as of
-- Module 4's security correction — NOT anon, NOT authenticated, NOT
-- PUBLIC. All business-logic tests below run `set local role
-- service_role` first, simulating the trusted server action (which holds
-- the secret key) rather than a direct publishable-key caller. Separate
-- negative tests prove anon/authenticated genuinely cannot reach it at
-- all. There is no longer a separate log_inquiry_attempt() RPC to test —
-- that design was removed; rate-limit logging is now internal to
-- submit_inquiry() itself, which is why "public callers cannot execute a
-- rate-limit logging RPC" is covered by the same anon/authenticated
-- negative tests against submit_inquiry() as a whole, not a separate
-- function.
--
-- submit_inquiry() returns a JSONB object — {"status": ..., "inquiry_id":
-- ..., "message": ...} — never a bare uuid, and never raises for
-- expected business outcomes (rejected/rate_limited/duplicate/accepted
-- are all returned, not thrown).

begin;
select plan(47);

-- ═══════════════════════════════════════════════════════════════════════
-- TEST-ONLY, TRANSACTION-SCOPED GRANT
-- ═══════════════════════════════════════════════════════════════════════
--
-- Exists ONLY for the duration of this test file's transaction — the
-- final `rollback;` at the end of this file undoes it completely (GRANT
-- is transactional DDL in Postgres). It is never committed, never
-- persisted, and has no effect on production privileges whatsoever.
--
-- service_role's real, intended production access remains exactly what
-- the grants migrations declare: EXECUTE on submit_inquiry() (and the
-- project's other RPCs) only. It deliberately has NO direct table
-- access in production — every write and read goes through the RPC
-- layer, not raw table access — and this grant does not change that.
--
-- Why it's needed here specifically: this file's own postcondition
-- assertions (checking qualification_stage, lead_score, status, etc.
-- after calling submit_inquiry() as service_role) need to read back what
-- the RPC just wrote. Without this grant, those SELECTs fail with
-- "permission denied for table inquiries" — service_role can EXECUTE the
-- RPC (proving the intended access model works) but has no direct SELECT
-- of its own, exactly as production is supposed to work. Granting SELECT
-- only, and only inside this rolled-back transaction, lets the test
-- observe outcomes without weakening anything real.
--
-- SELECT only — no INSERT, UPDATE, or DELETE privilege is granted here.
-- service_role still cannot write to any of these tables directly, only
-- through submit_inquiry() itself.
grant select on table
  public.inquiries,
  public.lead_scoring_rules,
  public.lead_activity_log,
  public.inquiry_rate_limit_log
to service_role;

set local role service_role;

-- ── Stage 1 only: minimal fields, no company/shipping info ─────────────
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999992', 'Stage One Tester', 'stage1@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-stage1', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'service_role can submit a Stage-1-only inquiry, which is accepted'
);

select is(
  (select qualification_stage from public.inquiries where email = 'stage1@example.com'),
  1::smallint,
  'a Stage-1-only submission is stored with qualification_stage = 1'
);

select is(
  (select status from public.inquiries where email = 'stage1@example.com'),
  'new'::public.lead_status,
  'status defaults to new regardless of scoring'
);

select ok(
  (select assigned_to is null from public.inquiries where email = 'stage1@example.com'),
  'assigned_to remains null for a public submission'
);

select ok(
  (select follow_up_at is null from public.inquiries where email = 'stage1@example.com'),
  'follow_up_at remains null for a public submission'
);

-- ── Stage 2: providing company_name advances the stage ──────────────────
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999992', 'Stage Two Tester', 'stage2@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', 'Acme Trading Co', null, null, null, null, null, null, null, null, false,
      'visitor-stage2', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a Stage-2 submission (company_name provided) is accepted'
);

select is(
  (select qualification_stage from public.inquiries where email = 'stage2@example.com'),
  2::smallint,
  'providing a Stage 2 field advances qualification_stage to 2'
);

-- ── Stage 3: providing shipping_country advances to stage 3 ────────────
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999992', 'Stage Three Tester', 'stage3@example.com', 'US', 'hotel_buyer'::public.business_type,
      'Interested in your handicraft products for our business', 'Grand Hotel Group', 'https://grandhotelgroup.example.com', 'https://linkedin.com/company/grandhotel',
      '5000-10000 units', 'regular_importer'::public.moq_familiarity, 'immediate'::public.purchase_timeline,
      'AU', 'fob'::public.incoterm, true, true,
      'visitor-stage3', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a full Stage-3 submission is accepted'
);

select is(
  (select qualification_stage from public.inquiries where email = 'stage3@example.com'),
  3::smallint,
  'providing shipping/incoterm/private-label/sample fields advances qualification_stage to 3'
);

select ok(
  (select lead_score from public.inquiries where email = 'stage3@example.com') > 0,
  'a submission with business email, company website, LinkedIn, hotel_buyer type, volume, and Stage 3 completion scores above zero'
);

-- ── Lead scoring: a low-quality submission scores at (or near) zero ────
select is(
  (
    select (public.submit_inquiry(
      null, 'Low Quality Tester', 'lowquality@gmail.com', 'US', 'other'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-lowquality', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a low-quality (free email, no company) submission still succeeds'
);

select is(
  (select lead_score from public.inquiries where email = 'lowquality@gmail.com'),
  0,
  'a free-email, no-company submission scores 0 (clamped, never negative)'
);

-- ── Target-market-country scoring (newly wired this round): a seeded ───
-- ── target country scores exactly 8 points (lead_scoring_rules' ────────
-- ── configured value) more than an otherwise-identical submission from
-- ── a non-target country. Uses a genuine business email and Stage 1
-- ── only for both, so the only variable between the two is country —
-- ── the comparison isolates the target_market_country rule's
-- ── contribution regardless of what any other rule's points happen to
-- ── be, without hardcoding a duplicate of lead_scoring_rules' values here.
select is(
  (
    select (public.submit_inquiry(
      null, 'Target Country Tester', 'targetcountry-test@somecompany.com', 'US', 'other'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-targetcountry', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a submission from a seeded target-market country (US) succeeds'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Non Target Country Tester', 'nontargetcountry-test@somecompany.com', 'Freedonia', 'other'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-nontargetcountry', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'an otherwise-identical submission from an unseeded (non-target) country also succeeds'
);

select is(
  (
    (select lead_score from public.inquiries where email = 'targetcountry-test@somecompany.com')
    -
    (select lead_score from public.inquiries where email = 'nontargetcountry-test@somecompany.com')
  ),
  (select points from public.lead_scoring_rules where factor_key = 'target_market_country'),
  'a seeded target-market country scores exactly as many points more than a non-target country as lead_scoring_rules currently configures for target_market_country — proves the rule is actually wired (was previously a no-op) and genuinely reads its points from the config table rather than duplicating the value here'
);

-- ── Regression test: explicit false (not null) for both stage-3 ────────
-- ── booleans — exactly what a real caller always sends for an ─────────
-- ── unchecked checkbox — must NOT advance the stage. ─────────────────────
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999992', 'False Booleans Tester', 'falsebooleans@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-falsebooleans', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a submission with private_label_required=false and wants_sample=false (not null) succeeds'
);

select is(
  (select qualification_stage from public.inquiries where email = 'falsebooleans@example.com'),
  1::smallint,
  'explicit false (not null) for both stage-3 booleans correctly remains Stage 1 — proves the coalesce(..., false) fix, not just an is-not-null check'
);

-- ── Regression test: LinkedIn URL as the ONLY Stage-2 field provided ───
-- ── must still advance to Stage 2 — an earlier revision's Stage-2 ──────
-- ── condition omitted p_linkedin_url entirely, contradicting the ───────
-- ── documented "any Stage-2 field advances the stage" contract.
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999992', 'LinkedIn Only Tester', 'linkedinonly@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, 'https://linkedin.com/company/linkedin-only-tester', null, null, null,
      null, null, false, false,
      'visitor-linkedinonly', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'a submission with ONLY linkedin_url as a Stage-2 field succeeds'
);

select is(
  (select qualification_stage from public.inquiries where email = 'linkedinonly@example.com'),
  2::smallint,
  'linkedin_url alone correctly advances qualification_stage to 2 — proves the missing p_linkedin_url check is fixed'
);

-- ── Invalid / draft product: returned as a structured rejection, ───────
-- ── not raised ────────────────────────────────────────────────────────────
select is(
  (
    select (public.submit_inquiry(
      '99999999-9999-9999-9999-999999999979', 'Draft Product Tester', 'draftproduct@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-draft', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'rejected',
  'submit_inquiry returns status=rejected for a draft (unpublished) product, rather than raising'
);

-- ── Missing/blank product interest (p_message) is rejected — restores ──
-- ── the frozen Stage-1 field contract (name, business email, country, ──
-- ── product interest, business type), enforced server-side as defense ──
-- ── in depth on top of the client-side Zod requirement. ─────────────────
select is(
  (
    select (public.submit_inquiry(
      null, 'No Product Interest Tester', 'noproductinterest@example.com', 'US', 'importer'::public.business_type,
      null, null, null, null, null, null, null, null, null, null, false,
      'visitor-noproductinterest', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'rejected',
  'a submission with no product interest (null message) is rejected'
);

select is(
  (select count(*)::int from public.inquiries where email = 'noproductinterest@example.com'),
  0,
  'no inquiry row was created for the missing-product-interest submission'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Blank Product Interest Tester', 'blankproductinterest@example.com', 'US', 'importer'::public.business_type,
      '   ', null, null, null, null, null, null, null, null, null, false,
      'visitor-blankproductinterest', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'rejected',
  'a submission with a whitespace-only product interest is also rejected (trim, not just null-check)'
);

select is(
  (select count(*)::int from public.inquiries where email = 'blankproductinterest@example.com'),
  0,
  'no inquiry row was created for the whitespace-only product-interest submission'
);

-- ── Duplicate detection: a second submission from the same email is ────
-- ── accepted but reported as a distinct status, and logged ─────────────
select is(
  (
    select (public.submit_inquiry(
      null, 'Duplicate Tester', 'duplicate-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-dup-1', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'the first submission from an email is accepted'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Duplicate Tester Two', 'duplicate-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-dup-2', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'duplicate',
  'a second submission from the SAME email is reported as status=duplicate (still created, never hard-blocked)'
);

select ok(
  exists (
    select 1 from public.lead_activity_log lal
    join public.inquiries i on i.id = lal.inquiry_id
    where i.email = 'duplicate-test@example.com'
      and lal.event_type = 'duplicate_detected'
  ),
  'the duplicate submission logs a duplicate_detected activity entry'
);

-- ── Honeypot: a filled hidden field is returned as a rejection, not ────
-- ── raised, and creates no row ───────────────────────────────────────────
select is(
  (
    select (public.submit_inquiry(
      null, 'Bot Tester', 'bot-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
      'visitor-bot', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'i-am-a-bot')->>'status')
  ),
  'rejected',
  'a filled honeypot returns status=rejected, not an error'
);

select is(
  (select count(*)::int from public.inquiries where email = 'bot-test@example.com'),
  0,
  'no inquiry row was created for the honeypot-triggered submission'
);

-- ── Rate limiting: threshold is 5 attempts per visitor_id per 10 ───────
-- ── minutes; the 6th attempt is rate-limited (returned, not raised) ────
do $$
begin
  for i in 1..5 loop
    perform public.submit_inquiry(
      null, 'Rate Limit Tester', format('ratelimit-%s@example.com', i), 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-ratelimit-test', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null);
  end loop;
end $$;

select is(
  (
    select (public.submit_inquiry(
      null, 'Rate Limit Tester Overflow', 'ratelimit-overflow@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-ratelimit-test', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'rate_limited',
  'the 6th submission attempt from the same visitor_id within 10 minutes is rate-limited (returned, not raised)'
);

select ok(
  (
    select count(*)::int from public.inquiry_rate_limit_log
    where visitor_id = 'visitor-ratelimit-test' and created_at > now() - interval '10 minutes'
  ) = 6,
  'the rate-limited (6th) attempt itself remains recorded in the log — returning a structured result instead of raising means nothing here is rolled back'
);

-- ── IP-specific rate limit — same threshold/mechanics as the visitor- ───
-- ── based check above, but exercised in isolation: one FIXED client_ip,
-- ── a unique email per attempt (so duplicate detection doesn't
-- ── interfere with the 'accepted' vs 'duplicate' status), and a null
-- ── visitor_id throughout (so the visitor-based limit tested above
-- ── can't be what's actually gating these attempts instead).
do $$
begin
  for i in 1..5 loop
    perform public.submit_inquiry(
      null, 'IP Limit Tester', format('iplimit-%s@example.com', i), 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      null, '203.0.113.77'::inet, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null
    );
  end loop;
end $$;

select is(
  (select count(*)::int from public.inquiries where email like 'iplimit-%@example.com'),
  5,
  'the first 5 attempts sharing one client_ip (with unique emails and no visitor_id) are all created successfully'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'IP Limit Overflow Tester', 'iplimit-overflow@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      null, '203.0.113.77'::inet, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null)->>'status')
  ),
  'rate_limited',
  'the 6th attempt sharing the same client_ip within 10 minutes is rate-limited'
);

select ok(
  (
    select count(*)::int from public.inquiry_rate_limit_log
    where client_ip = '203.0.113.77'::inet and created_at > now() - interval '10 minutes'
  ) = 6,
  'the rate-limited (6th) IP-based attempt itself remains recorded in the log'
);

select is(
  (select count(*)::int from public.inquiries where email = 'iplimit-overflow@example.com'),
  0,
  'no inquiry row was created for the rate-limited (6th) IP-based attempt'
);

-- ── Email-specific rate limit (the off-by-one fix): at most 3 ──────────
-- ── successfully-created inquiries per email per hour — the 4th is ─────
-- ── rate-limited. Each call uses a DIFFERENT visitor_id and a null ──────
-- ── client_ip specifically so the visitor/IP-based limits (tested ───────
-- ── above, separately) cannot interfere with this email-specific check.
select is(
  (
    select (public.submit_inquiry(
      null, 'Email Limit One', 'emaillimit-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-emaillimit-1', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'accepted',
  'the 1st submission from this email succeeds'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Email Limit Two', 'emaillimit-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-emaillimit-2', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'duplicate',
  'the 2nd submission from this email succeeds (reported as duplicate, since a prior row from this email now exists)'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Email Limit Three', 'emaillimit-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-emaillimit-3', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'duplicate',
  'the 3rd submission from this email succeeds'
);

select is(
  (select count(*)::int from public.inquiries where email_normalized = 'emaillimit-test@example.com'),
  3,
  'exactly 3 inquiry rows exist from this email so far'
);

select is(
  (
    select (public.submit_inquiry(
      null, 'Email Limit Four', 'emaillimit-test@example.com', 'US', 'importer'::public.business_type,
      'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, false, false,
      'visitor-emaillimit-4', null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null)->>'status')
  ),
  'rate_limited',
  'the 4th submission from this email within an hour is rate-limited — proves the >=3 fix (>3 would have incorrectly allowed a 4th through)'
);

select is(
  (select count(*)::int from public.inquiries where email_normalized = 'emaillimit-test@example.com'),
  3,
  'still exactly 3 inquiry rows — the rate-limited 4th attempt was never inserted'
);

select ok(
  exists (
    select 1 from public.inquiry_rate_limit_log
    where visitor_id = 'visitor-emaillimit-4' and created_at > now() - interval '10 minutes'
  ),
  'the 4th (rate-limited) attempt itself still remains recorded in the log'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- SECURITY BOUNDARY TESTS — anon/authenticated must not reach this
-- function AT ALL, regardless of arguments
-- ══════════════════════════════════════════════════════════════════════

set local role anon;

select throws_ok(
  $$ select public.submit_inquiry(
       null, 'Anon Direct Caller', 'anon-direct-rpc@example.com', 'US', 'importer'::public.business_type,
       'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
       'visitor-anon-direct', null, null, null, null, null, null, null, null, null,
       null, null, null, null, null, null, null) $$,
  '42501',
  null,
  'anon cannot execute submit_inquiry() at all — service_role-only, no Turnstile/IP check can be bypassed this way'
);

reset role;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select throws_ok(
  $$ select public.submit_inquiry(
       null, 'Authenticated Direct Caller', 'authenticated-direct-rpc@example.com', 'US', 'importer'::public.business_type,
       'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
       'visitor-authenticated-direct', null, null, null, null, null, null, null, null, null,
       null, null, null, null, null, null, null) $$,
  '42501',
  null,
  'authenticated cannot execute submit_inquiry() at all either — the same trusted-caller boundary applies regardless of buyer login state'
);

-- ── The revoked direct-INSERT grant (20260726090200) was previously ────
-- ── only proven for anon (see file 02) — this proves it for ────────────
-- ── authenticated too, since the migration revokes both roles equally.
select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, message)
     values ('Authenticated Direct Insert Tester', 'authenticated-direct-insert@example.com', 'US', 'importer', 'test') $$,
  '42501',
  null,
  'authenticated cannot INSERT into inquiries directly either, even using only fully buyer-facing columns — no grant exists for either role'
);

-- ── The trusted-scoring GUC cannot be abused outside the RPC: setting ──
-- ── it directly does not grant the ability to name lead_score in a ─────
-- ── raw INSERT, since that column is absent from the grant regardless ──
-- ── of GUC state, and INSERT on inquiries is revoked entirely anyway ────
-- ── (see 20260726090200_revoke_direct_inquiries_insert.sql) ─────────────
select throws_ok(
  $$ select set_config('app.trusted_scoring_context', 'on', true);
     insert into public.inquiries (name, email, country, business_type, lead_score)
     values ('GUC Abuse Tester', 'guc-abuse@example.com', 'US', 'importer', 99) $$,
  '42501',
  null,
  'setting the trusted-scoring GUC directly does not enable a caller to insert into inquiries at all, let alone set lead_score'
);

reset role;

-- ── Proof the discarded public.log_inquiry_attempt() RPC genuinely does
-- ── not exist — not in any overload, not under any signature. Checked
-- ── directly against pg_proc by name (more thorough than
-- ── to_regprocedure(), which would only rule out one specific guessed
-- ── signature) so this can't pass by accident if some other overload of
-- ── the same name were ever reintroduced.
select ok(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_inquiry_attempt'
  ),
  'the discarded public.log_inquiry_attempt() RPC does not exist in any form — rate-limit logging is internal to submit_inquiry() only'
);

select * from finish();
rollback;
