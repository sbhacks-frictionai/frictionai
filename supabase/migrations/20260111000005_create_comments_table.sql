-- ============================================================================
-- COMMENTS TABLE
-- Stores user comments on documents
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL,
    "author_id" uuid NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "public"."comments"
    ADD CONSTRAINT "comments_document_id_fkey" 
    FOREIGN KEY ("document_id") 
    REFERENCES "public"."documents"("id") 
    ON DELETE CASCADE;

-- Note: author_id references auth.users, but we don't add a foreign key
-- constraint to avoid dependency on auth schema in migrations
-- The application layer should enforce this relationship

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_comments_document_id" 
    ON "public"."comments"("document_id");

CREATE INDEX IF NOT EXISTS "idx_comments_author_id" 
    ON "public"."comments"("author_id");

CREATE INDEX IF NOT EXISTS "idx_comments_created_at" 
    ON "public"."comments"("created_at" DESC);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON "public"."comments"
    FOR EACH ROW
    EXECUTE FUNCTION public.update_comments_updated_at();

-- Set table owner
ALTER TABLE "public"."comments" OWNER TO "postgres";

-- Add comments for documentation
COMMENT ON TABLE "public"."comments" IS 
    'Stores user comments on documents. Each comment is associated with a document and an author.';

COMMENT ON COLUMN "public"."comments"."document_id" IS 
    'Foreign key to the documents table. Comments are deleted when the document is deleted.';

COMMENT ON COLUMN "public"."comments"."author_id" IS 
    'UUID of the user who created the comment. References auth.users.';

COMMENT ON COLUMN "public"."comments"."content" IS 
    'The text content of the comment.';
