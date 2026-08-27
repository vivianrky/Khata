# Khata

A household expense tracker, shared between two people. React + Vite on the
frontend, [Supabase](https://supabase.com) (hosted Postgres) as the backend.

## Setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Create a Supabase project** (if you haven't already) at
   [supabase.com](https://supabase.com) — it's free for a project this size.

3. **Set up the database**

   Open your Supabase project → **SQL Editor** → New query, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates the `categories` and `transactions` tables and a starter
   set of categories (Groceries, Dining, Fuel, ...). Safe to re-run.

4. **Configure your environment**

   ```sh
   cp .env.example .env
   ```

   Then open `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from your Supabase project's
   **Settings → API** page. `.env` is git-ignored, so your keys never get
   committed.

5. **Run the app**

   ```sh
   npm run dev
   ```

   This starts a local dev server (Vite will print the URL, usually
   `http://localhost:5173`).

## Project structure

```
supabase/
  schema.sql          # database schema — run this in the Supabase SQL Editor
src/
  main.jsx             # app entry point
  App.jsx              # root component: loads data, shows recent expenses
  TransactionForm.jsx   # form for logging one expense
  supabaseClient.js    # Supabase client, reads config from .env
```

## Status

- ✅ Log an expense by hand (amount, date, card/UPI, category, who paid, note)
- ✅ See your 20 most recent expenses
- ⏳ Category-breakdown dashboard with trends — next up
- ⏳ Importing bank/card statement files — later, once the manual flow is solid

No login yet — see the note in `supabase/schema.sql` about what that means
for now.
