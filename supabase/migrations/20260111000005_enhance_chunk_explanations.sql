-- Migration to enhance chunk_explanations table for document-level study guides
-- This allows storing study guides that apply to entire documents, not just individual chunks

-- Add optional document_id column for document-level explanations (like study guides)
ALTER TABLE public.chunk_explanations
ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE;

-- Add index for efficient document-level queries
CREATE INDEX IF NOT EXISTS idx_chunk_explanations_document_id 
    ON public.chunk_explanations(document_id);

-- Add index for finding today's study guides
CREATE INDEX IF NOT EXISTS idx_chunk_explanations_daily_guides
    ON public.chunk_explanations(detail_level, document_name, course_code, created_at DESC)
    WHERE detail_level = 'daily_study_guide';

-- Update the unique constraint to handle both chunk-level and document-level explanations
-- Drop the old constraint
ALTER TABLE public.chunk_explanations
DROP CONSTRAINT IF EXISTS chunk_explanations_chunk_id_detail_level_version_key;

-- Add new constraint that allows either chunk_id OR document_id to be unique
-- For chunk-level: (chunk_id, detail_level, version) must be unique
-- For document-level: (document_id, detail_level, version, date) should be unique
-- We'll handle document-level uniqueness in the application layer (by date)

-- Create partial unique index for chunk-level explanations
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_explanations_chunk_unique
    ON public.chunk_explanations(chunk_id, detail_level, version)
    WHERE chunk_id IS NOT NULL;

-- Add check constraint: either chunk_id or document_id must be set (but not both)
ALTER TABLE public.chunk_explanations
ADD CONSTRAINT chunk_explanations_chunk_or_document_check
CHECK (
    (chunk_id IS NOT NULL AND document_id IS NULL) OR
    (chunk_id IS NULL AND document_id IS NOT NULL)
);

-- Add comment explaining the dual-use table
COMMENT ON TABLE public.chunk_explanations IS 
'Stores AI-generated explanations for both individual chunks and entire documents. 
For chunk explanations: chunk_id is set, document_id is NULL.
For document-level study guides: chunk_id is NULL, document_id is set, detail_level = "daily_study_guide".';

COMMENT ON COLUMN public.chunk_explanations.chunk_id IS 
'References a specific chunk for chunk-level explanations. NULL for document-level guides.';

COMMENT ON COLUMN public.chunk_explanations.document_id IS 
'References a document for document-level explanations (study guides). NULL for chunk-level explanations.';
