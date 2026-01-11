-- ============================================================================
-- DOCUMENT HEATMAP SYSTEM
-- Tracks chunk interactions and provides normalized heatmap visualization
-- ============================================================================

-- ============================================================================
-- 1. ATOMIC INCREMENT FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_chunk_interaction(
  p_chunk_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_x_coord double precision DEFAULT NULL,
  p_y_coord double precision DEFAULT NULL,
  p_page_number integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_document_id uuid;
  v_new_count integer;
BEGIN
  -- Get the document_id for this chunk
  SELECT document_id INTO v_document_id
  FROM public.chunks
  WHERE id = p_chunk_id;
  
  IF v_document_id IS NULL THEN
    RAISE EXCEPTION 'Chunk not found: %', p_chunk_id;
  END IF;
  
  -- Atomically increment chunk interactions
  UPDATE public.chunks
  SET interactions = COALESCE(interactions, 0) + 1
  WHERE id = p_chunk_id
  RETURNING interactions INTO v_new_count;
  
  -- Atomically increment document total_clicks
  UPDATE public.documents
  SET total_clicks = COALESCE(total_clicks, 0) + 1
  WHERE id = v_document_id;
  
  -- Insert interaction record for detailed tracking (if user_id provided)
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.interactions (chunk_id, user_id, x_coord, y_coord, page_number)
    VALUES (p_chunk_id, p_user_id, p_x_coord, p_y_coord, p_page_number);
  END IF;
  
  RETURN v_new_count;
END;
$$;

-- ============================================================================
-- 2. HEATMAP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_document_heatmap(
  p_document_id uuid
)
RETURNS TABLE (
  chunk_id uuid,
  page_number integer,
  interactions integer,
  heat_score double precision,
  is_hot_zone boolean,
  content_preview text,
  x_min double precision,
  x_max double precision,
  y_min double precision,
  y_max double precision
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_max_interactions integer;
BEGIN
  -- Get the maximum interaction count for this document
  SELECT MAX(COALESCE(c.interactions, 0))
  INTO v_max_interactions
  FROM public.chunks c
  WHERE c.document_id = p_document_id;
  
  -- Handle case where no interactions exist
  IF v_max_interactions IS NULL OR v_max_interactions = 0 THEN
    v_max_interactions := 1; -- Avoid division by zero
  END IF;
  
  -- Return heatmap data with normalized heat scores
  RETURN QUERY
  SELECT 
    c.id as chunk_id,
    c.page_number,
    COALESCE(c.interactions, 0) as interactions,
    CASE 
      WHEN v_max_interactions > 0 THEN 
        CAST(COALESCE(c.interactions, 0) AS double precision) / v_max_interactions
      ELSE 0.0
    END as heat_score,
    CASE 
      WHEN v_max_interactions > 0 THEN 
        (CAST(COALESCE(c.interactions, 0) AS double precision) / v_max_interactions) >= 0.8
      ELSE FALSE
    END as is_hot_zone,
    LEFT(c.content, 100) as content_preview,
    c.x_min,
    c.x_max,
    c.y_min,
    c.y_max
  FROM public.chunks c
  WHERE c.document_id = p_document_id
  ORDER BY c.page_number, c.chunk_index;
END;
$$;

-- ============================================================================
-- 3. HELPER FUNCTION: Get Hot Zones Only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_document_hot_zones(
  p_document_id uuid,
  p_threshold double precision DEFAULT 0.8
)
RETURNS TABLE (
  chunk_id uuid,
  page_number integer,
  interactions integer,
  heat_score double precision,
  content_preview text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.chunk_id,
    h.page_number,
    h.interactions,
    h.heat_score,
    h.content_preview
  FROM public.get_document_heatmap(p_document_id) h
  WHERE h.heat_score >= p_threshold
  ORDER BY h.heat_score DESC, h.page_number;
END;
$$;

-- ============================================================================
-- 4. ANALYTICS FUNCTION: Get Interaction Timeline
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_chunk_interaction_timeline(
  p_chunk_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  interaction_id uuid,
  user_id uuid,
  created_at timestamptz,
  x_coord double precision,
  y_coord double precision,
  page_number integer
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as interaction_id,
    i.user_id,
    i.created_at,
    i.x_coord,
    i.y_coord,
    i.page_number
  FROM public.interactions i
  WHERE i.chunk_id = p_chunk_id
  ORDER BY i.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 5. SECURITY & PERMISSIONS
-- ============================================================================

-- Grant execute permissions on increment function
GRANT EXECUTE ON FUNCTION public.increment_chunk_interaction TO authenticated, anon, service_role;

-- Grant execute permissions on heatmap functions (read-only, safe for public)
GRANT EXECUTE ON FUNCTION public.get_document_heatmap TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_document_hot_zones TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_chunk_interaction_timeline TO authenticated, anon, service_role;

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for fast heatmap queries
CREATE INDEX IF NOT EXISTS idx_chunks_document_interactions 
  ON public.chunks(document_id, interactions DESC);

-- Index for interaction timeline queries
CREATE INDEX IF NOT EXISTS idx_interactions_chunk_created 
  ON public.interactions(chunk_id, created_at DESC);

-- Index for user interaction history
CREATE INDEX IF NOT EXISTS idx_interactions_user_created 
  ON public.interactions(user_id, created_at DESC);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.increment_chunk_interaction IS 
  'Atomically increments chunk and document interaction counts. Optionally tracks detailed interaction in interactions table.';

COMMENT ON FUNCTION public.get_document_heatmap IS 
  'Returns normalized heatmap data (0.0 to 1.0) for all chunks in a document. Heat score is relative to the most-clicked chunk.';

COMMENT ON FUNCTION public.get_document_hot_zones IS 
  'Returns only chunks with heat_score >= threshold (default 0.8). Useful for identifying difficult sections.';

COMMENT ON FUNCTION public.get_chunk_interaction_timeline IS 
  'Returns recent interaction history for a specific chunk, including user and timestamp data.';
