-- ============================================================================
-- DIAGNOSTIC QUERIES FOR PRODUCTION TRIGGER
-- Run these in your Supabase SQL Editor to check if the trigger is set up
-- ============================================================================

-- 1. Check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_storage_object_upload';

-- 2. Check if the trigger function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name = 'trigger_process_pdf';

-- 3. Check if pg_net extension is installed
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 4. Check current settings in the settings table
SELECT * FROM public.edge_function_settings WHERE id = 'default';

-- 5. Check recent storage uploads to documents bucket
SELECT 
    id,
    bucket_id,
    name,
    created_at
FROM storage.objects
WHERE bucket_id = 'documents'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- SETUP COMMANDS (Run these if settings are missing)
-- ============================================================================

-- Update settings table with your production configuration
-- UPDATE public.edge_function_settings
-- SET 
--   supabase_url = 'https://dtdehfdqpfjyeglvsjhk.supabase.co',
--   service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE',
--   updated_at = now()
-- WHERE id = 'default';

-- ============================================================================
-- TEST THE TRIGGER MANUALLY (Optional - for debugging)
-- ============================================================================

-- This will simulate what happens when a file is uploaded
-- (Don't run this unless you want to test - it will call your edge function)
/*
DO $$
DECLARE
    test_record RECORD;
BEGIN
    -- Get the most recent file from documents bucket
    SELECT * INTO test_record
    FROM storage.objects
    WHERE bucket_id = 'documents'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Call the trigger function manually
    IF test_record.id IS NOT NULL THEN
        PERFORM public.trigger_process_pdf() FROM (SELECT test_record.*) AS t;
    END IF;
END $$;
*/
