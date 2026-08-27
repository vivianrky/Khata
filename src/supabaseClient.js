import { createClient } from '@supabase/supabase-js'

// Vite only exposes env vars to the browser if their name starts with VITE_.
// These two come from your .env file (see .env.example) and are safe to
// expose publicly — the "anon" key is designed to be used from the browser,
// with access controlled by Supabase's Row Level Security rules.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars. Copy .env.example to .env and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project settings.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
