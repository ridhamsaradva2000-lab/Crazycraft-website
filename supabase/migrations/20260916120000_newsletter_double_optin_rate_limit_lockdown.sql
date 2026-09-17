-- =========================================================================
-- Newsletter security remediation -- COMPLETE, SINGLE MIGRATION
-- =========================================================================

alter table public.newsletter_subscribers
  add column status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  add column confirmed_at timestamptz null,
  add column unsubscribed_at timestamptz null,
  add column confirmation_token_hash text null,
  add column confirmation_token_expires_at timestamptz null,
  add column confirmation_last_attempt_at timestamptz null,
  add column unsubscribe_lifecycle_nonce text not null;

alter table public.newsletter_subscribers alter column source set not null;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_source_allowlist
    check (source in ('footer', 'newsletter_page')),
  add constraint newsletter_subscribers_email_trimmed
    check (btrim(email) = email),
  add constraint newsletter_subscribers_email_length
    check (length(email) between 3 and 320),
  add constraint newsletter_subscribers_email_format
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add constraint newsletter_subscribers_confirmation_token_hash_format
    check (confirmation_token_hash is null or confirmation_token_hash ~ '^[0-9a-f]{64}$'),
  add constraint newsletter_subscribers_lifecycle_nonce_format
    check (unsubscribe_lifecycle_nonce ~ '^[0-9a-f]{64}$'),
  add constraint newsletter_subscribers_state_coherence check (
    (status = 'pending'
      and confirmed_at is null
      and unsubscribed_at is null
      and confirmation_token_hash is not null
      and confirmation_token_expires_at is not null
      and confirmation_last_attempt_at is not null)
    or
    (status = 'confirmed'
      and confirmed_at is not null
      and unsubscribed_at is null
      and confirmation_token_hash is null
      and confirmation_token_expires_at is null
      and confirmation_last_attempt_at is null)
    or
    (status = 'unsubscribed'
      and unsubscribed_at is not null
      and confirmation_token_hash is null
      and confirmation_token_expires_at is null
      and confirmation_last_attempt_at is null)
  );

create unique index uq_newsletter_subscribers_confirmation_token_hash
  on public.newsletter_subscribers (confirmation_token_hash)
  where confirmation_token_hash is not null;

-- ---- Bounded rate-limit counter table ----
create table public.newsletter_rate_limit_counters (
  identifier_type text not null check (
    identifier_type in ('visitor_burst', 'visitor_daily', 'ip_burst', 'ip_daily', 'email_daily')
  ),
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  primary key (identifier_type, identifier_hash, bucket_start)
);

create index idx_newsletter_rate_limit_counters_bucket_start
  on public.newsletter_rate_limit_counters (bucket_start);

alter table public.newsletter_rate_limit_counters enable row level security;
revoke all on table public.newsletter_rate_limit_counters from public, anon, authenticated;

-- ---- PRE-TURNSTILE atomic limiter: visitor always; IP ONLY when
-- available. NULL-safe input validation. Namespaces 11 (visitor) / 13
-- (IP) confirmed unused by inquiry's own namespaces (1/2/3). ----
create or replace function public.check_and_record_newsletter_pre_verification_limit(
  p_visitor_hash text,
  p_ip_hash text default null
) returns boolean
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_burst_bucket timestamptz := date_trunc('hour', now()) + (floor(extract(minute from now()) / 10) * interval '10 minutes');
  v_daily_bucket timestamptz := date_trunc('day', now());
  v_visitor_burst int;
  v_visitor_daily int;
  v_ip_burst int := 0;
  v_ip_daily int := 0;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid p_visitor_hash format';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid p_ip_hash format';
  end if;

  perform pg_advisory_xact_lock(11, hashtext(p_visitor_hash));

  insert into public.newsletter_rate_limit_counters (identifier_type, identifier_hash, bucket_start, attempt_count)
  values ('visitor_burst', p_visitor_hash, v_burst_bucket, 1)
  on conflict (identifier_type, identifier_hash, bucket_start)
  do update set attempt_count = newsletter_rate_limit_counters.attempt_count + 1
  returning attempt_count into v_visitor_burst;

  insert into public.newsletter_rate_limit_counters (identifier_type, identifier_hash, bucket_start, attempt_count)
  values ('visitor_daily', p_visitor_hash, v_daily_bucket, 1)
  on conflict (identifier_type, identifier_hash, bucket_start)
  do update set attempt_count = newsletter_rate_limit_counters.attempt_count + 1
  returning attempt_count into v_visitor_daily;

  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(13, hashtext(p_ip_hash));

    insert into public.newsletter_rate_limit_counters (identifier_type, identifier_hash, bucket_start, attempt_count)
    values ('ip_burst', p_ip_hash, v_burst_bucket, 1)
    on conflict (identifier_type, identifier_hash, bucket_start)
    do update set attempt_count = newsletter_rate_limit_counters.attempt_count + 1
    returning attempt_count into v_ip_burst;

    insert into public.newsletter_rate_limit_counters (identifier_type, identifier_hash, bucket_start, attempt_count)
    values ('ip_daily', p_ip_hash, v_daily_bucket, 1)
    on conflict (identifier_type, identifier_hash, bucket_start)
    do update set attempt_count = newsletter_rate_limit_counters.attempt_count + 1
    returning attempt_count into v_ip_daily;
  end if;

  delete from public.newsletter_rate_limit_counters where bucket_start < now() - interval '48 hours';

  return v_visitor_burst <= 5 and v_visitor_daily <= 20
     and v_ip_burst <= 5 and v_ip_daily <= 20;
end;
$$;

revoke all on function public.check_and_record_newsletter_pre_verification_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_and_record_newsletter_pre_verification_limit(text, text) to service_role;

-- ---- Atomic lifecycle write. NULL-safe validation on every privileged
-- input. Expiry has both a lower (must be future) and upper (max 49h)
-- bound. Lifecycle advisory lock keyed on the DATABASE's own normalized
-- email (v_email_normalized), not the JS-computed hash. SELECT ... FOR
-- UPDATE serializes against direct confirm/unsubscribe UPDATEs on the
-- same row. confirmation_last_attempt_at drives a 90-second send-
-- reservation cooldown, preventing two concurrent requests from both
-- emailing a token that becomes invalid. email_daily is persisted only
-- as the HMAC hash, never the raw email. Resubscribe refreshes source
-- and subscribed_at as a genuinely new lifecycle. ----
create or replace function public.process_newsletter_signup(
  p_email text,
  p_email_hash text,
  p_source text,
  p_confirmation_token_hash text,
  p_confirmation_token_expires_at timestamptz,
  p_new_unsubscribe_lifecycle_nonce text
) returns jsonb
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_email_normalized text;
  v_daily_bucket timestamptz := date_trunc('day', now());
  v_email_daily int;
  v_existing record;
  v_cooldown constant interval := interval '90 seconds';
  v_subscriber_id uuid;
  v_nonce text;
begin
  if p_email is null
     or btrim(p_email) <> p_email
     or length(p_email) < 3
     or length(p_email) > 320
     or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'invalid p_email format';
  end if;

  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid p_email_hash format';
  end if;

  if p_source is null or p_source not in ('footer', 'newsletter_page') then
    raise exception 'invalid p_source value';
  end if;

  if p_confirmation_token_hash is null or p_confirmation_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid p_confirmation_token_hash format';
  end if;

  if p_confirmation_token_expires_at is null
     or p_confirmation_token_expires_at <= now()
     or p_confirmation_token_expires_at > now() + interval '49 hours'
  then
    raise exception 'invalid p_confirmation_token_expires_at value';
  end if;

  if p_new_unsubscribe_lifecycle_nonce is null or p_new_unsubscribe_lifecycle_nonce !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid p_new_unsubscribe_lifecycle_nonce format';
  end if;

  v_email_normalized := lower(btrim(p_email));

  perform pg_advisory_xact_lock(12, hashtext(v_email_normalized));

  insert into public.newsletter_rate_limit_counters (identifier_type, identifier_hash, bucket_start, attempt_count)
  values ('email_daily', p_email_hash, v_daily_bucket, 1)
  on conflict (identifier_type, identifier_hash, bucket_start)
  do update set attempt_count = newsletter_rate_limit_counters.attempt_count + 1
  returning attempt_count into v_email_daily;

  if v_email_daily > 3 then
    return jsonb_build_object('outcome', 'rate_limited', 'subscriber_id', null, 'unsubscribe_lifecycle_nonce', null, 'should_send', false);
  end if;

  select * into v_existing
  from public.newsletter_subscribers
  where email_normalized = v_email_normalized
  for update;

  if not found then
    insert into public.newsletter_subscribers (
      email, source, status,
      confirmation_token_hash, confirmation_token_expires_at, confirmation_last_attempt_at,
      unsubscribe_lifecycle_nonce
    ) values (
      p_email, p_source, 'pending',
      p_confirmation_token_hash, p_confirmation_token_expires_at, now(),
      p_new_unsubscribe_lifecycle_nonce
    )
    returning id, unsubscribe_lifecycle_nonce into v_subscriber_id, v_nonce;

    return jsonb_build_object('outcome', 'created', 'subscriber_id', v_subscriber_id, 'unsubscribe_lifecycle_nonce', v_nonce, 'should_send', true);
  end if;

  if v_existing.status = 'confirmed' then
    return jsonb_build_object('outcome', 'already_confirmed', 'subscriber_id', null, 'unsubscribe_lifecycle_nonce', null, 'should_send', false);
  end if;

  if v_existing.status = 'pending' then
    if v_existing.confirmation_last_attempt_at is not null
       and now() - v_existing.confirmation_last_attempt_at < v_cooldown then
      return jsonb_build_object('outcome', 'pending_cooldown', 'subscriber_id', null, 'unsubscribe_lifecycle_nonce', null, 'should_send', false);
    end if;

    update public.newsletter_subscribers
    set confirmation_token_hash = p_confirmation_token_hash,
        confirmation_token_expires_at = p_confirmation_token_expires_at,
        confirmation_last_attempt_at = now()
    where id = v_existing.id
    returning id, unsubscribe_lifecycle_nonce into v_subscriber_id, v_nonce;

    return jsonb_build_object('outcome', 'resent', 'subscriber_id', v_subscriber_id, 'unsubscribe_lifecycle_nonce', v_nonce, 'should_send', true);
  end if;

  -- status = 'unsubscribed' -- brand-new subscription lifecycle
  update public.newsletter_subscribers
  set status = 'pending',
      confirmed_at = null,
      unsubscribed_at = null,
      source = p_source,
      subscribed_at = now(),
      confirmation_token_hash = p_confirmation_token_hash,
      confirmation_token_expires_at = p_confirmation_token_expires_at,
      confirmation_last_attempt_at = now(),
      unsubscribe_lifecycle_nonce = p_new_unsubscribe_lifecycle_nonce
  where id = v_existing.id
  returning id, unsubscribe_lifecycle_nonce into v_subscriber_id, v_nonce;

  return jsonb_build_object('outcome', 'resubscribed', 'subscriber_id', v_subscriber_id, 'unsubscribe_lifecycle_nonce', v_nonce, 'should_send', true);
end;
$$;

revoke all on function public.process_newsletter_signup(text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.process_newsletter_signup(text, text, text, text, timestamptz, text) to service_role;

-- ---- Direct newsletter table lockdown -- explicit PUBLIC + anon + authenticated ----
revoke all on public.newsletter_subscribers from public;
revoke all on public.newsletter_subscribers from anon;
revoke insert, update, delete on public.newsletter_subscribers from authenticated;
-- authenticated SELECT intentionally NOT revoked -- required by the
-- existing admin RLS policy; RLS blocks non-admins, not grant absence.
revoke insert (email, source) on public.newsletter_subscribers from public, anon, authenticated;

drop policy if exists "public can subscribe to newsletter" on public.newsletter_subscribers;

-- ---- service_role -- deterministic narrowing: REVOKE first so any
-- pre-existing broader grant is actually removed, not just supplemented.
-- SELECT+UPDATE only (confirm/unsubscribe pages/actions call
-- createAdminClient() directly against this table). No INSERT (all row
-- creation goes through process_newsletter_signup, which runs as its
-- OWNER regardless of caller's own grants). No DELETE (never performed
-- directly by any application code). ----
revoke insert, delete on public.newsletter_subscribers from service_role;
grant select, update on public.newsletter_subscribers to service_role;

-- service_role never needs direct access to the rate-limit counter table
-- -- both functions that touch it run SECURITY DEFINER as their OWNER.
revoke all on public.newsletter_rate_limit_counters from service_role;

-- "admins can view newsletter_subscribers" (authenticated, USING
-- private.is_admin()) is UNCHANGED and preserved -- no statement needed.