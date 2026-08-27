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

-- Category rules: "if the description contains this keyword, suggest this
-- category" — used when importing a statement. Editable from the Rules tab
-- in the app; shared between both of you like everything else here.
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A starter set of rules for common Indian merchants/services. Add your own
-- from the Rules tab any time — no need to touch SQL again after this.
insert into category_rules (keyword, category_id)
select v.keyword, c.id
from (values
  ('swiggy', 'Dining'), ('zomato', 'Dining'), ('dominos', 'Dining'),
  ('mcdonald', 'Dining'), ('starbucks', 'Dining'),
  ('bigbasket', 'Groceries'), ('blinkit', 'Groceries'), ('zepto', 'Groceries'),
  ('dmart', 'Groceries'), ('grofers', 'Groceries'), ('more supermarket', 'Groceries'),
  ('amazon', 'Shopping'), ('flipkart', 'Shopping'), ('myntra', 'Shopping'),
  ('ajio', 'Shopping'), ('firstcry', 'Shopping'), ('nykaa', 'Shopping'),
  ('uber', 'Transport'), ('ola', 'Transport'), ('rapido', 'Transport'),
  ('petrol', 'Fuel'), ('fuel', 'Fuel'), ('indian oil', 'Fuel'),
  ('hpcl', 'Fuel'), ('bpcl', 'Fuel'),
  ('netflix', 'Entertainment'), ('hotstar', 'Entertainment'), ('spotify', 'Entertainment'),
  ('prime video', 'Entertainment'), ('bookmyshow', 'Entertainment'),
  ('airtel', 'Bills & Utilities'), ('jio', 'Bills & Utilities'), ('bsnl', 'Bills & Utilities'),
  ('electricity', 'Bills & Utilities'), ('water bill', 'Bills & Utilities'), ('broadband', 'Bills & Utilities'),
  ('apollo', 'Health'), ('pharmacy', 'Health'), ('hospital', 'Health'),
  ('clinic', 'Health'), ('medical', 'Health'),
  ('rent', 'Rent / EMI'), ('emi', 'Rent / EMI'), ('loan', 'Rent / EMI'),
  ('atm', 'Other'), ('charges', 'Other'), ('gst', 'Other')
) as v(keyword, category_name)
join categories c on c.name = v.category_name
on conflict (keyword) do nothing;

create index if not exists category_rules_keyword_idx on category_rules (keyword);

-- Row Level Security: locked down by default in Supabase. Since Khata has
-- no login yet and is just for the two of you, this policy lets anyone
-- holding your app's anon key (i.e. your app itself) read and write freely.
-- Don't share your app URL publicly while running this way; add real
-- authentication later if that changes.
alter table categories enable row level security;
alter table transactions enable row level security;
alter table category_rules enable row level security;

drop policy if exists "anon full access" on categories;
create policy "anon full access" on categories
  for all using (true) with check (true);

drop policy if exists "anon full access" on transactions;
create policy "anon full access" on transactions
  for all using (true) with check (true);

drop policy if exists "anon full access" on category_rules;
create policy "anon full access" on category_rules
  for all using (true) with check (true);
