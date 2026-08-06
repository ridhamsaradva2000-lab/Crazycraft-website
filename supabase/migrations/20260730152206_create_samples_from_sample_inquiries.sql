-- Automatically create a fulfillment sample row whenever a valid
-- sample-type inquiry is created for a specific product.

create unique index if not exists uq_samples_inquiry_id
on public.samples (inquiry_id)
where inquiry_id is not null;


create or replace function public.create_sample_from_sample_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.inquiry_type = 'sample'::public.inquiry_type
     and new.product_id is not null then

    insert into public.samples (
      inquiry_id,
      name,
      email,
      company_name,
      country,
      product_id,
      shipping_country
    )
    values (
      new.id,
      new.name,
      new.email,
      new.company_name,
      new.country,
      new.product_id,
      new.shipping_country
    )
    on conflict (inquiry_id)
    where inquiry_id is not null
    do nothing;

  end if;

  return new;
end;
$$;


revoke all
on function public.create_sample_from_sample_inquiry()
from public, anon, authenticated;


drop trigger if exists trg_create_sample_from_sample_inquiry
on public.inquiries;


create trigger trg_create_sample_from_sample_inquiry
after insert on public.inquiries
for each row
execute function public.create_sample_from_sample_inquiry();


-- Backfill sample inquiries that already exist.
insert into public.samples (
  inquiry_id,
  name,
  email,
  company_name,
  country,
  product_id,
  shipping_country
)
select
  i.id,
  i.name,
  i.email,
  i.company_name,
  i.country,
  i.product_id,
  i.shipping_country
from public.inquiries i
where i.inquiry_type = 'sample'::public.inquiry_type
  and i.product_id is not null
on conflict (inquiry_id)
where inquiry_id is not null
do nothing;