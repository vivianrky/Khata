-- Khata database schema.
--
-- How to use: open your Supabase project -> SQL Editor -> New query,
-- paste this whole file, and click "Run". It's safe to re-run (uses
-- "if not exists" / "on conflict" everywhere).

-- Categories: the fixed list you pick from when adding a transaction.
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- A starter set of categories. Add/rename/remove rows in this table
-- any time (via the Supabase Table Editor) to fit how you actually spend.
insert into categories (name) values
  ('Groceries'),
  ('Dining'),
  ('Fuel'),
  ('Bills & Utilities'),
  ('Shopping'),
  ('Entertainment'),
  ('Health'),
  ('Transport'),
  ('Rent / EMI'),
  ('Transfers'),
  ('Other')
on conflict (name) do nothing;

-- Transactions: every card/UPI expense you log.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  transaction_date date not null default current_date,
  account_type text not null check (account_type in ('credit_card', 'debit_card', 'upi')),
  account_name text, -- e.g. "HDFC Credit Card", "Google Pay"
  category_id uuid references categories(id) on delete set null,
  paid_by text not null, -- e.g. "Vivian" or your wife's name
  note text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_date_idx on transactions (transaction_date);
create index if not exists transactions_category_idx on transactions (category_id);

-- Row Level Security: locked down by default in Supabase. Since Khata has
-- no login yet and is just for the two of you, this policy lets anyone
-- holding your app's anon key (i.e. your app itself) read and write freely.
-- Don't share your app URL publicly while running this way; add real
-- authentication later if that changes.
alter table categories enable row level security;
alter table transactions enable row level security;

drop policy if exists "anon full access" on categories;
create policy "anon full access" on categories
  for all using (true) with check (true);

drop policy if exists "anon full access" on transactions;
create policy "anon full access" on transactions
  for all using (true) with check (true);
