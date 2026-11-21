-- ============================================================================
-- BachatHub Pakistan — Optional PostgreSQL / Supabase Reference Schema + RLS
-- Note: By default, BachatHub runs 100% zero-cost via AES-256-GCM Encrypted
-- GitHub Shards (`data/vault/*.enc.json`) + Browser Web Crypto Device Vault.
-- Use this schema if you ever decide to mirror or migrate to PostgreSQL/Supabase.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.brands (
  id text primary key,
  name text not null,
  initials text not null,
  avatar_color text not null,
  category text not null,
  trust_score integer not null default 75 check (trust_score between 0 and 100),
  verified boolean not null default false,
  blacklisted boolean not null default false,
  google_rating numeric(2,1) not null default 4.2,
  review_count integer not null default 0,
  positive_comment_pct integer not null default 80,
  likes integer not null default 0,
  dislikes integer not null default 0,
  key_facts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.stores_malls (
  id text primary key,
  brand_id text not null references public.brands(id) on delete cascade,
  mall_name text not null,
  city text not null,
  area text not null,
  floor text not null,
  distance_km numeric(5,2),
  open_until text,
  phone text,
  has_deal boolean not null default false
);

create table if not exists public.deals (
  id text primary key,
  rank integer not null default 99,
  brand_id text not null references public.brands(id) on delete cascade,
  brand_name text not null,
  title text not null,
  subtitle text,
  category text not null,
  city text not null,
  area text not null,
  badge_text text not null,
  discount_pct integer not null default 0,
  original_price integer,
  sale_price integer,
  is_cash_only boolean not null default false,
  channel text not null check (channel in ('in-store', 'online', 'both')),
  promo_code text,
  checks jsonb not null default '{}'::jsonb,
  checks_passed integer not null default 0,
  real_votes integer not null default 0,
  fake_votes integer not null default 0,
  pinned boolean not null default false,
  ends_label text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fake_alerts (
  id text primary key,
  brand_name text not null,
  title text not null,
  category text not null,
  city text not null,
  status text not null check (status in ('fake_inflated', 'expired', 'clearance_near_expiry', 'risky_site')),
  claimed_discount_text text not null,
  normal_price integer not null,
  raised_price integer not null,
  sale_price integer not null,
  real_discount_pct integer not null default 0,
  proof_summary text not null,
  reports_count integer not null default 1,
  detected_at timestamptz not null default now()
);

create table if not exists public.bank_cards (
  id text primary key,
  bank text not null,
  card_name text not null,
  tier text not null,
  network text not null,
  max_discount_pct integer not null,
  monthly_cap_rs integer not null,
  annual_fee_rs integer not null default 0,
  perks jsonb not null default '[]'::jsonb,
  gradient text not null
);

create table if not exists public.fun_events (
  id text primary key,
  title text not null,
  category text not null,
  city text not null,
  venue text not null,
  date_label text not null,
  price_label text not null,
  is_free boolean not null default false,
  attendees integer not null default 0
);

create table if not exists public.users_vault (
  id text primary key,
  name text not null,
  email_hash text unique not null,
  masked_email text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'brand_partner', 'admin')),
  city text not null default 'Karachi',
  area text not null default 'Clifton / DHA',
  encrypted_profile jsonb not null default '{}'::jsonb,
  community_blocked boolean not null default false,
  app_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.community_messages (
  id text primary key,
  city text not null,
  area text not null,
  user_id text not null,
  author_name text not null,
  text text not null,
  kind text not null default 'text',
  payload jsonb,
  reported boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id text primary key,
  type text not null check (type in ('customer_deal', 'brand_registration', 'fake_report', 'receipt')),
  submitted_by text,
  brand_name text not null,
  city text not null,
  url text,
  details text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'more_info')),
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_items (
  id text primary key,
  origin text not null check (origin in ('user', 'system')),
  type text not null check (type in ('bug', 'improvement', 'system_advisory')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  title text not null,
  description text not null,
  page text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id text primary key,
  actor text not null,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

-- Enable Row-Level Security across all tables
alter table public.brands enable row level security;
alter table public.stores_malls enable row level security;
alter table public.deals enable row level security;
alter table public.fake_alerts enable row level security;
alter table public.bank_cards enable row level security;
alter table public.fun_events enable row level security;
alter table public.users_vault enable row level security;
alter table public.community_messages enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback_items enable row level security;
alter table public.admin_logs enable row level security;

-- Public read-only policies for catalog tables
create policy "Public read brands" on public.brands for select using (true);
create policy "Public read stores" on public.stores_malls for select using (true);
create policy "Public read deals" on public.deals for select using (true);
create policy "Public read fake alerts" on public.fake_alerts for select using (true);
create policy "Public read bank cards" on public.bank_cards for select using (true);
create policy "Public read fun events" on public.fun_events for select using (true);
create policy "Public read community" on public.community_messages for select using (true);
