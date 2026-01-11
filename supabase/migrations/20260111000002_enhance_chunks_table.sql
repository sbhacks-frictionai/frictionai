-- Enhance chunks table for better coordinate tracking
-- This allows x/y coordinates from interactions to map back to chunks

-- Enable vector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add fields to track coordinate ranges for each chunk
ALTER TABLE "public"."chunks" 
ADD COLUMN IF NOT EXISTS "x_min" double precision,
ADD COLUMN IF NOT EXISTS "x_max" double precision,
ADD COLUMN IF NOT EXISTS "y_min" double precision,
ADD COLUMN IF NOT EXISTS "y_max" double precision,
ADD COLUMN IF NOT EXISTS "page_width" double precision,
ADD COLUMN IF NOT EXISTS "page_height" double precision,
ADD COLUMN IF NOT EXISTS "chunk_index" integer,
ADD COLUMN IF NOT EXISTS "is_image" boolean DEFAULT false;

-- Add embedding column (using text array as fallback if vector extension unavailable)
DO $$
BEGIN
  -- Try to add vector column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chunks' AND column_name = 'embedding'
  ) THEN
    BEGIN
      ALTER TABLE "public"."chunks" ADD COLUMN "embedding" vector(1536);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: use text array if vector extension not available
      ALTER TABLE "public"."chunks" ADD COLUMN "embedding" text;
    END;
  END IF;
END $$;

-- Create index for coordinate-based lookups
CREATE INDEX IF NOT EXISTS idx_chunks_coordinates ON "public"."chunks" 
  (document_id, page_number, x_min, x_max, y_min, y_max);

-- Create index for chunk lookup by document and page
CREATE INDEX IF NOT EXISTS idx_chunks_document_page ON "public"."chunks" 
  (document_id, page_number, chunk_index);

-- Create index for embedding similarity search (only if vector extension is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON "public"."chunks" 
        USING ivfflat (embedding vector_cosine_ops);
    EXCEPTION WHEN OTHERS THEN
      -- Index creation failed, skip it
      RAISE NOTICE 'Could not create vector index, continuing without it';
    END;
  END IF;
END $$;

-- Function to find chunk by coordinates (for interactions)
CREATE OR REPLACE FUNCTION public.find_chunk_by_coordinates(
  p_document_id uuid,
  p_page_number integer,
  p_x double precision,
  p_y double precision
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  chunk_id_result uuid;
BEGIN
  SELECT id INTO chunk_id_result
  FROM public.chunks
  WHERE document_id = p_document_id
    AND page_number = p_page_number
    AND x_min <= p_x
    AND x_max >= p_x
    AND y_min <= p_y
    AND y_max >= p_y
  ORDER BY chunk_index
  LIMIT 1;
  
  RETURN chunk_id_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.find_chunk_by_coordinates TO authenticated, anon, service_role;
