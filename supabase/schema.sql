-- ============================================================
-- Loopin — Supabase schema
-- Run this once in Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- ------------------------------------------------------------
-- PROFILES — one row per auth user, public display name
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ------------------------------------------------------------
-- VENUES — cafes / bars. Each has an owner (the restaurant account).
-- ------------------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null default 'Cafe',
  emoji text default '📍',
  city text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

alter table public.venues enable row level security;

create policy "venues are publicly readable"
  on public.venues for select
  using (true);

create policy "owners can insert their own venue"
  on public.venues for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "owners can update their own venue"
  on public.venues for update
  to authenticated
  using (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- CHECK-INS — a guest checking in at a venue. Points-earning event.
-- ------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points int not null default 10,
  created_at timestamptz not null default now()
);

alter table public.checkins enable row level security;

create index if not exists checkins_user_idx on public.checkins(user_id);
create index if not exists checkins_venue_idx on public.checkins(venue_id);

create policy "checkins are readable by any signed-in user"
  on public.checkins for select
  to authenticated
  using (true);

create policy "users can only check themselves in"
  on public.checkins for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- POSTS — the "memories" social feed, tied to a check-in.
-- ------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text not null check (char_length(caption) <= 500),
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create index if not exists posts_created_idx on public.posts(created_at desc);

create policy "posts are publicly readable"
  on public.posts for select
  using (true);

create policy "users can only post as themselves"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can delete their own posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- ORDERS — placed by a guest at a venue, managed by venue staff.
-- ------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  total numeric(10, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'preparing', 'served', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index if not exists orders_venue_idx on public.orders(venue_id);
create index if not exists orders_user_idx on public.orders(user_id);

create policy "guests can read their own orders"
  on public.orders for select
  to authenticated
  using (auth.uid() = user_id);

create policy "venue owners can read orders at their venue"
  on public.orders for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = orders.venue_id and v.owner_id = auth.uid()
    )
  );

create policy "guests can place their own orders"
  on public.orders for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "venue owners can update order status at their venue"
  on public.orders for update
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = orders.venue_id and v.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- INVENTORY — stock levels per venue. Owner-only.
-- ------------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  sku text not null,
  name text not null,
  qty numeric(10, 2) not null default 0,
  max_qty numeric(10, 2) not null default 100,
  updated_at timestamptz not null default now(),
  unique (venue_id, sku)
);

alter table public.inventory enable row level security;

create policy "venue owners can read their inventory"
  on public.inventory for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = inventory.venue_id and v.owner_id = auth.uid()
    )
  );

create policy "venue owners can modify their inventory"
  on public.inventory for all
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = inventory.venue_id and v.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id = inventory.venue_id and v.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Seed a few starter venues (safe to skip/edit before running)
-- ------------------------------------------------------------
insert into public.venues (name, category, emoji, city)
values
  ('Copper & Ash', 'Bar', '🍸', 'Bengaluru'),
  ('Third Wave Roast', 'Cafe', '☕', 'Bengaluru'),
  ('Firebrick Taproom', 'Bar', '🍺', 'Bengaluru'),
  ('Basil & Bloom', 'Cafe', '🥐', 'Bengaluru')
on conflict do nothing;
