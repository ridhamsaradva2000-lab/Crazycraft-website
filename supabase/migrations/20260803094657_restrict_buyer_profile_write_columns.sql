-- Remove the broad table-level write grants that accidentally allowed
-- authenticated buyers to write protected columns such as verified.
revoke insert, update
on table public.buyers
from authenticated;

-- Buyers may create only their own editable profile fields.
grant insert (
  id,
  company_name,
  business_type,
  country,
  phone,
  website
)
on table public.buyers
to authenticated;

-- Buyers may update only normal profile fields.
grant update (
  company_name,
  business_type,
  country,
  phone,
  website
)
on table public.buyers
to authenticated;