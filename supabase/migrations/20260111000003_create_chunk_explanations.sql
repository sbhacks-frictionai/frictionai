-- Create chunk_explanations table for caching AI-generated explanations
-- This reduces API costs and improves response times

-- Main explanations table
CREATE TABLE IF NOT EXISTS "public"."chunk_explanations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chunk_id" "uuid" NOT NULL,
    "detail_level" "text" NOT NULL CHECK (detail_level IN ('brief', 'detailed', 'comprehensive')),
    "explanation" "text" NOT NULL,
    
    -- Track usage and quality
    "times_viewed" integer DEFAULT 0,
    "click_count" integer DEFAULT 0,
    "helpful_votes" integer DEFAULT 0,
    "unhelpful_votes" integer DEFAULT 0,
    
    -- Store context at generation time
    "course_code" "text",
    "course_name" "text",
    "document_name" "text",
    
    -- Timestamps
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    
    -- Version control (if course content changes, can regenerate)
    "version" integer DEFAULT 1 NOT NULL,
    
    CONSTRAINT "chunk_explanations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chunk_explanations_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE CASCADE,
    CONSTRAINT "chunk_explanations_unique" UNIQUE ("chunk_id", "detail_level", "version")
);

ALTER TABLE "public"."chunk_explanations" OWNER TO "postgres";

-- Table for tracking user feedback on explanations
CREATE TABLE IF NOT EXISTS "public"."explanation_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "explanation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_helpful" boolean NOT NULL,
    "feedback_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    
    CONSTRAINT "explanation_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "explanation_feedback_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "public"."chunk_explanations"("id") ON DELETE CASCADE,
    CONSTRAINT "explanation_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "explanation_feedback_unique" UNIQUE ("explanation_id", "user_id")
);

ALTER TABLE "public"."explanation_feedback" OWNER TO "postgres";

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "idx_chunk_explanations_lookup" 
    ON "public"."chunk_explanations" ("chunk_id", "detail_level", "version");

CREATE INDEX IF NOT EXISTS "idx_chunk_explanations_chunk_id" 
    ON "public"."chunk_explanations" ("chunk_id");

CREATE INDEX IF NOT EXISTS "idx_chunk_explanations_times_viewed" 
    ON "public"."chunk_explanations" ("times_viewed" DESC);

CREATE INDEX IF NOT EXISTS "idx_explanation_feedback_explanation_id" 
    ON "public"."explanation_feedback" ("explanation_id");

CREATE INDEX IF NOT EXISTS "idx_explanation_feedback_user_id" 
    ON "public"."explanation_feedback" ("user_id");

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION "public"."update_chunk_explanations_updated_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER "update_chunk_explanations_updated_at_trigger"
    BEFORE UPDATE ON "public"."chunk_explanations"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_chunk_explanations_updated_at"();

-- Function to get or generate explanation (can be called from edge function)
CREATE OR REPLACE FUNCTION "public"."get_cached_explanation"(
    p_chunk_id uuid,
    p_detail_level text,
    p_version integer DEFAULT 1
)
RETURNS TABLE (
    explanation_id uuid,
    explanation text,
    was_cached boolean,
    times_viewed integer
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_explanation_id uuid;
    v_explanation text;
    v_times_viewed integer;
BEGIN
    -- Try to get cached explanation
    SELECT id, chunk_explanations.explanation, chunk_explanations.times_viewed
    INTO v_explanation_id, v_explanation, v_times_viewed
    FROM public.chunk_explanations
    WHERE chunk_id = p_chunk_id
        AND detail_level = p_detail_level
        AND version = p_version
    LIMIT 1;
    
    IF FOUND THEN
        -- Update access stats
        UPDATE public.chunk_explanations
        SET 
            times_viewed = times_viewed + 1,
            last_accessed_at = NOW()
        WHERE id = v_explanation_id;
        
        RETURN QUERY SELECT v_explanation_id, v_explanation, true, v_times_viewed + 1;
    ELSE
        -- Return null to indicate no cache found
        RETURN QUERY SELECT NULL::uuid, NULL::text, false, 0;
    END IF;
END;
$$;

-- Grant permissions
GRANT ALL ON TABLE "public"."chunk_explanations" TO "anon";
GRANT ALL ON TABLE "public"."chunk_explanations" TO "authenticated";
GRANT ALL ON TABLE "public"."chunk_explanations" TO "service_role";

GRANT ALL ON TABLE "public"."explanation_feedback" TO "anon";
GRANT ALL ON TABLE "public"."explanation_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."explanation_feedback" TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_chunk_explanations_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_chunk_explanations_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_chunk_explanations_updated_at"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_cached_explanation"(uuid, text, integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_cached_explanation"(uuid, text, integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_cached_explanation"(uuid, text, integer) TO "service_role";
