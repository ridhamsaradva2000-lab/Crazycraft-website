drop policy if exists "public can subscribe to newsletter"
on public.newsletter_subscribers;

create policy "public can subscribe to newsletter"
on public.newsletter_subscribers
for insert
to anon, authenticated
with check (
  char_length(btrim(email)) between 3 and 320
  and email = btrim(email)
  and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  and (
    source is null
    or (
      char_length(source) between 1 and 100
      and source !~ '[[:cntrl:]]'
    )
  )
);