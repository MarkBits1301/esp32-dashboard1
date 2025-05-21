import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://detpjnajemrsvntqccnh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHBqbmFqZW1yc3ZudHFjY25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUxMzYwNzAsImV4cCI6MjA2MDcxMjA3MH0.akVvkUxTg64LTT0c6uVH1CiWk-AUVLYlwdZiyjnkuKg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)