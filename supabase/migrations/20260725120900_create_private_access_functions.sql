-- 20260725120900_create_private_access_functions.sql
-- Additional private-schema helper, added now that quote_requests exists.

-- can_access_quote_request(): true if the current authenticated user owns
-- the given quote_request (buyer_id = auth.uid()). Used only for the
-- authenticated "view my own quote_request_items" SELECT policy — the
-- write path (creating a quote_request + its items) goes exclusively
-- through the atomic public.submit_quote_request() RPC (see the admin
-- RPCs migration), which computes buyer_id from auth.uid() itself and
-- never trusts a caller-supplied value. anon has no grant to execute this
-- function and no policy reads it — guest submissions get their new
-- quote_request_id back directly from the RPC's return value and have no
-- further read access, by design.
create or replace function private.can_access_quote_request(p_quote_request_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.quote_requests
    where id = p_quote_request_id
      and buyer_id = auth.uid()
  );
$$;

revoke all on function private.can_access_quote_request(uuid) from public;
grant execute on function private.can_access_quote_request(uuid) to authenticated;
