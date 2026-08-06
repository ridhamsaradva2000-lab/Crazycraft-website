drop policy if exists "public can log attribution_events"
on public.attribution_events;

create policy "public can log attribution_events"
on public.attribution_events
for insert
to anon, authenticated
with check (
  char_length(btrim(visitor_id)) between 1 and 128
  and char_length(event_type) between 1 and 64
  and event_type ~ '^[a-z0-9_]+$'
  and (page_path is null or char_length(page_path) <= 2048)
  and (utm_source is null or char_length(utm_source) <= 255)
  and (utm_medium is null or char_length(utm_medium) <= 255)
  and (utm_campaign is null or char_length(utm_campaign) <= 255)
  and (referrer is null or char_length(referrer) <= 2048)
  and (landing_page is null or char_length(landing_page) <= 2048)
);