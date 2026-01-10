-- Fix trigger to use settings table instead of custom config parameters
-- This migration updates the trigger function to read from a table instead of non-existent config params

-- Create a settings table to store configuration (more reliable than custom config params)
CREATE TABLE IF NOT EXISTS public.edge_function_settings (
  id text PRIMARY KEY DEFAULT 'default',
  supabase_url text,
  service_role_key text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Insert default values (will be updated in production)
INSERT INTO public.edge_function_settings (id, supabase_url, service_role_key)
VALUES (
  'default',
  'http://host.docker.internal:54321', -- Default for local dev
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' -- Default anon key for local
)
ON CONFLICT (id) DO NOTHING;

-- Update the trigger function to use the settings table
CREATE OR REPLACE FUNCTION public.trigger_process_pdf()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  function_url text;
  service_role_key text;
  supabase_url text;
  request_headers jsonb;
  settings_record RECORD;
BEGIN
  -- Only process files uploaded to the "documents" bucket
  IF NEW.bucket_id != 'documents' THEN
    RETURN NEW;
  END IF;

  -- Get settings from the settings table
  SELECT edge_function_settings.supabase_url, edge_function_settings.service_role_key
  INTO settings_record
  FROM public.edge_function_settings
  WHERE id = 'default'
  LIMIT 1;

  -- Use settings from table, or fallback to defaults
  IF settings_record.supabase_url IS NOT NULL THEN
    supabase_url := settings_record.supabase_url;
  ELSE
    -- Fallback for local development
    supabase_url := 'http://host.docker.internal:54321';
  END IF;

  IF settings_record.service_role_key IS NOT NULL THEN
    service_role_key := settings_record.service_role_key;
  ELSE
    -- Fallback for local development
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  END IF;
  
  function_url := supabase_url || '/functions/v1/process-pdf';

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
  PERFORM net.http_post(
    url := function_url,
    body := payload,
    headers := request_headers,
    timeout_milliseconds := 30000
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON TABLE public.edge_function_settings TO postgres, service_role;
