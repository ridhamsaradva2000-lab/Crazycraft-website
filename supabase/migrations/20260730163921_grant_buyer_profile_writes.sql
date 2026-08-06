-- Allow authenticated buyers to create and update their own profile.
-- RLS policies still control which buyer row they can access.

grant insert, update
on table public.buyers
to authenticated;