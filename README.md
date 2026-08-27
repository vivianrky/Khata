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

3. **Configure your environment**

   ```sh
   cp .env.example .env
   ```

   Then open `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from your Supabase project's
   **Settings → API** page. `.env` is git-ignored, so your keys never get
   committed.

4. **Run the app**

   ```sh
   npm run dev
   ```

   This starts a local dev server (Vite will print the URL, usually
   `http://localhost:5173`).

## Project structure

```
src/
  main.jsx          # app entry point
  App.jsx           # root component
  supabaseClient.js # Supabase client, reads config from .env
```

## Status

This is the initial scaffold — a working React + Vite app wired up to talk
to Supabase, with a simple connection check on screen. Expense tracking
features (adding, listing, splitting expenses) come next.
