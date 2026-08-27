-- Khata database schema.
--
-- How to use: open your Supabase project -> SQL Editor -> New query,
-- paste this whole file, and click "Run". It's safe to re-run (uses
-- "if not exists" / "on conflict" everywhere) EXCEPT the one spot flagged
-- below, which only matters if you already have real data.

-- Categories: no fixed starter list — the app builds this table from
-- whatever you actually use. A category is created the first time its name
-- shows up: from a "Category" column in an imported file, from the app's
-- own built-in description-based guess for PDF/photo imports, or from
-- typing a new one by hand. Shared between both of you — not tied to a
-- login, since a category name like "Groceries" isn't private information,
-- and keeping one shared list means you don't have to maintain two copies.
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Transactions: every card/UPI expense you log. Private per login — see the
-- user_id column and the RLS policy below. This create statement is only
-- for a brand new project; if the table already exists from an earlier run,
-- it's left as-is and the alters below patch it up instead (this table may
-- hold real data, so nothing here ever drops or recreates it).
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  transaction_date date not null default current_date,
  account_type text not null check (account_type in ('credit_card', 'debit_card', 'upi')),
  account_name text, -- e.g. "HDFC Credit Card", "Google Pay"
  category_id uuid references categories(id) on delete set null,
  paid_by text not null, -- your username, filled in automatically by the app
  note text,
  created_at timestamptz not null default now()
);

-- Adds the login-linked column whether this table is brand new (from the
-- create above) or already existed from before logins were added. New rows
-- get it filled in automatically; existing rows keep user_id = null until
-- you claim them — see the note at the bottom of this file.
alter table transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table transactions alter column user_id set default auth.uid();

create index if not exists transactions_date_idx on transactions (transaction_date);
create index if not exists transactions_category_idx on transactions (category_id);
create index if not exists transactions_user_idx on transactions (user_id);

-- The category_rules table (a user-editable keyword -> category list) is
-- gone — categorization for PDF/photo imports is now a fixed, built-in
-- guess in the app's own code (src/categorize.js), not a database table or
-- a screen you maintain. If you ran an earlier version of this file, this
-- drops that table; harmless since nothing else references it.
drop table if exists category_rules;

-- Salary budgeting: each login's own monthly salary and how much of it
-- they're allocating to each category. Private per login — keyed by
-- user_id + month, not by typed-in name.
--
-- These two tables replace an earlier version keyed by a typed-in "person"
-- name instead of a real login. Dropped and recreated (not altered) since
-- they were only just added and, as of this migration, nothing has been
-- entered into them yet — if that's no longer true for you, stop here and
-- ask for a non-destructive version instead of running this file.
drop table if exists budget_allocations;
drop table if exists salaries;

create table if not exists salaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null, -- always the 1st of the month, e.g. 2026-08-01
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null,
  category_id uuid not null references categories(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

create index if not exists budget_allocations_user_month_idx on budget_allocations (user_id, month);

-- Row Level Security. categories is shared reference data — any logged-in
-- user (either of you) can read and create rows in it (that's how the
-- category list "builds itself"), but you must be logged in at all.
-- transactions, salaries, and budget_allocations are private: each policy's
-- "using / with check (auth.uid() = user_id)" means a query can only ever
-- see or write its own rows — Postgres enforces this on every query, so
-- the app doesn't have to remember to filter.
alter table categories enable row level security;
alter table transactions enable row level security;
alter table salaries enable row level security;
alter table budget_allocations enable row level security;

drop policy if exists "anon full access" on categories;
drop policy if exists "authenticated full access" on categories;
create policy "authenticated full access" on categories
  for all to authenticated using (true) with check (true);

drop policy if exists "anon full access" on transactions;
drop policy if exists "own rows only" on transactions;
create policy "own rows only" on transactions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "anon full access" on salaries;
drop policy if exists "own rows only" on salaries;
create policy "own rows only" on salaries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "anon full access" on budget_allocations;
drop policy if exists "own rows only" on budget_allocations;
create policy "own rows only" on budget_allocations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: lets the app pick up changes live (e.g. adding an expense on
-- your phone shows up on your laptop without a manual refresh) instead of
-- only refreshing right after your own edits. Still scoped by the RLS
-- policies above — a realtime event never carries a row you couldn't
-- otherwise SELECT. "ADD TABLE" errors if run twice, so each is wrapped to
-- stay safe to re-run.
do $$ begin
  alter publication supabase_realtime add table transactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table salaries;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table budget_allocations;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table categories;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- One-time, MANUAL step — only if you logged real expenses before today
-- ---------------------------------------------------------------------
-- Transactions added before login existed have no user_id, so the policy
-- above hides them from everyone (NULL never matches auth.uid()). To bring
-- them into your account after you've signed up once:
--
--   1. Run: select id, email from auth.users;   -- find your new user's id
--   2. Run: update transactions set user_id = 'paste-your-id-here'
--           where user_id is null;
--
-- Do this once, from whichever of you the old data actually belongs to.

-- ---------------------------------------------------------------------
-- Optional cleanup — only if you ran an earlier version of this file
-- ---------------------------------------------------------------------
-- Earlier versions seeded 11 fixed categories (Groceries, Dining, ...).
-- This version stops doing that, but on purpose does NOT delete rows that
-- already exist — any of those 11 could already be referenced by a real
-- transaction or budget allocation, and deleting a category a transaction
-- points to would either fail (the foreign key) or silently blank out that
-- transaction's category, neither of which this file should decide for
-- you. If you want to remove ones you never actually used:
--
--   delete from categories
--   where name in ('Groceries','Dining','Fuel','Bills & Utilities',
--                   'Shopping','Entertainment','Health','Transport',
--                   'Rent / EMI','Transfers','Other')
--     and id not in (select category_id from transactions where category_id is not null)
--     and id not in (select category_id from budget_allocations);
