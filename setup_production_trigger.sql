-- ============================================================================
-- PRODUCTION TRIGGER SETUP
-- Run these commands in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

-- Update the settings table with your production configuration
-- IMPORTANT: Replace 'YOUR_SERVICE_ROLE_KEY' with your actual service role key
UPDATE public.edge_function_settings
SET 
  supabase_url = 'https://dtdehfdqpfjyeglvsjhk.supabase.co',
  service_role_key = 'YOUR_SERVICE_ROLE_KEY',
  updated_at = now()
WHERE id = 'default';

-- Verify the settings were applied
SELECT * FROM public.edge_function_settings WHERE id = 'default';

-- ============================================================================
-- HOW TO GET YOUR SERVICE ROLE KEY:
-- 1. Go to https://supabase.com/dashboard/project/dtdehfdqpfjyeglvsjhk/settings/api
-- 2. Scroll down to "Project API keys"
-- 3. Copy the "service_role" key (the secret one, not the anon key)
-- 4. Replace 'YOUR_SERVICE_ROLE_KEY' above with that value
-- ============================================================================
