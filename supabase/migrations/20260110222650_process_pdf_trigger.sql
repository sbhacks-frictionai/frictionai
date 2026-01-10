-- Enable pg_net extension for making HTTP requests
-- Note: This must be created AFTER any migrations that drop it
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger the process-pdf edge function when a file is uploaded
CREATE OR REPLACE FUNCTION public.trigger_process_pdf()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  function_url text;
  service_role_key text;
  supabase_url text;
  request_headers jsonb;
BEGIN
  -- Only process files uploaded to the "documents" bucket
  IF NEW.bucket_id != 'documents' THEN
    RETURN NEW;
  END IF;

  -- Try to get Supabase URL from environment variable or use default
  -- In production, set this via: ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
  -- In local dev, use host.docker.internal to reach services on the host machine
  BEGIN
    supabase_url := current_setting('app.settings.supabase_url');
  EXCEPTION WHEN OTHERS THEN
    -- Use host.docker.internal for local development (Docker container -> host machine)
    supabase_url := 'http://host.docker.internal:54321';
  END;
  
  function_url := supabase_url || '/functions/v1/process-pdf';
  
  -- Try to get service role key from environment variable
  -- In production, set this via: ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
  -- In local dev, use the default anon key
  BEGIN
    service_role_key := current_setting('app.settings.service_role_key');
  EXCEPTION WHEN OTHERS THEN
    -- Default anon key for local development (from Supabase CLI)
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  END;

  -- Build the payload with file information
  payload := jsonb_build_object(
    'bucket_id', NEW.bucket_id,
    'name', NEW.name,
    'id', NEW.id,
    'created_at', NEW.created_at,
    'updated_at', NEW.updated_at,
    'last_accessed_at', NEW.last_accessed_at,
    'metadata', NEW.metadata
  );

  -- Build headers JSONB object
  request_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_role_key
  );

  -- Make async HTTP request to the edge function
  -- Using pg_net for async HTTP requests (non-blocking)
  -- Correct function signature: net.http_post(url, body, params, headers, timeout_milliseconds)
  PERFORM net.http_post(
    url := function_url,
    body := payload,
    headers := request_headers,
    timeout_milliseconds := 30000
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on storage.objects table
-- This will fire when a new file is uploaded to the "documents" bucket
CREATE TRIGGER on_storage_object_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  WHEN (NEW.bucket_id = 'documents')
  EXECUTE FUNCTION public.trigger_process_pdf();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trigger_process_pdf() TO postgres, service_role;

-- ============================================================================
-- PRODUCTION SETUP INSTRUCTIONS:
-- ============================================================================
-- To configure this for production, run these SQL commands in your Supabase SQL editor:
--
-- 1. Set your Supabase project URL:
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project-id.supabase.co';
--
-- 2. Set your service role key (get it from Project Settings > API):
--    ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key-here';
--
-- Note: The service role key bypasses Row Level Security (RLS), so keep it secure.
-- ============================================================================
