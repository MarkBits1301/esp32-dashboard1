import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://moatkvzafvqklvaruclx.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vYXRrdnphZnZxa2x2YXJ1Y2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2MjYxNjYsImV4cCI6MjA2MjIwMjE2Nn0.gWBVhjIQhWN3HgmfwZfxDcLqEp0ZF9lHPPhVDcEccxU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)