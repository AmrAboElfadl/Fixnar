import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://haielakcqbsvtpkcszud.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhaWVsYWtjcWJzdnRwa2NzenVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTQyMDMsImV4cCI6MjA5Mzg5MDIwM30.3-6aSZsEpHLjCEtB1i-HE5F-il6P8A2audE4lnaG6QY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
