import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.MAIN_VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing MAIN_VITE_SUPABASE_URL or MAIN_VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})
