-- ============================================================
-- Loopin — one-time setup AFTER your first sign-in
-- Run in Supabase Dashboard -> SQL Editor -> New query
-- ============================================================
--
-- Why this exists:
--   schema.sql seeds four venues with owner_id = NULL, and the venues
--   UPDATE policy is `auth.uid() = owner_id`. NULL never equals your uid,
--   so a venue with no owner can't be claimed from the app — only here,
--   where the SQL editor runs with elevated rights.
--
--   Until a venue is yours, the Restaurant and Intelligence views stay
--   empty: the orders and inventory policies both filter on
--   venues.owner_id = auth.uid().
--
-- Step 1: sign in to the app once (magic link) so your auth user exists.
-- Step 2: set the email below to the one you signed in with.
-- Step 3: run it.

do $$
declare
  me uuid;
begin
  -- 👇 CHANGE THIS to the email you signed in with
  select id into me from auth.users where email = 'you@example.com';

  if me is null then
    raise exception 'No auth user for that email. Sign in to the app once first, then re-run.';
  end if;

  -- Claim every currently unowned venue.
  update public.venues set owner_id = me where owner_id is null;

  -- Give each of your venues a starting inventory, so the Restaurant
  -- view and the low-stock alerts in Intelligence have data to show.
  insert into public.inventory (venue_id, sku, name, qty, max_qty)
  select v.id, s.sku, s.name, s.qty, s.max_qty
  from public.venues v
  cross join (values
    ('ESP-001', 'Espresso Beans (kg)',  12, 40),
    ('MLK-001', 'Whole Milk (L)',       18, 60),
    ('GIN-001', 'Gin (bottles)',         6, 24),
    ('TON-001', 'Tonic Water (bottles)', 9, 48),
    ('FLR-001', 'Flatbread Bases',       4, 50),
    ('FRI-001', 'Fries (kg)',           15, 30)
  ) as s(sku, name, qty, max_qty)
  where v.owner_id = me
  on conflict (venue_id, sku) do nothing;

  raise notice 'Claimed % venue(s) for %', (select count(*) from public.venues where owner_id = me), me;
end $$;
