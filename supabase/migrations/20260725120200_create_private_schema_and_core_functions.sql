-- 20260725120200_create_private_schema_and_core_functions.sql
-- The `private` schema holds functions that must never be reachable via
-- PostgREST/the Data API directly (only usable from within RLS policies,
-- triggers, and other SECURITY DEFINER functions). It is not added to
-- Supabase's exposed schema list.

create schema if not exists private;

-- Lock the schema down by default; specific EXECUTE grants are added below.
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;

-- is_admin(): true if the current authenticated user has ANY admin_users row.
create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.admin_users where id = auth.uid()
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- has_admin_role(required_role): true if the current user's admin_users
-- row matches required_role, OR is super_admin (super_admin always passes
-- any role check — it is the superset role).
create or replace function private.has_admin_role(required_role public.admin_role)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid()
      and (role = required_role or role = 'super_admin'::public.admin_role)
  );
$$;

revoke all on function private.has_admin_role(public.admin_role) from public;
grant execute on function private.has_admin_role(public.admin_role) to anon, authenticated;
