alter table if exists public.ipo_items
  add column if not exists listing_date date;

create index if not exists idx_ipo_items_listing_date on public.ipo_items(listing_date asc);
