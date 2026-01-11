#!/bin/bash

# Test script for chunk-explain function

echo "🧪 Testing chunk-explain function with real data..."
echo ""

# Get some random chunk IDs from the database
echo "📝 Fetching random chunks from database..."
CHUNK_IDS=$(docker exec supabase_db_frictionai psql -U postgres -t -c "SELECT id FROM chunks WHERE content IS NOT NULL AND LENGTH(content) > 20 ORDER BY RANDOM() LIMIT 3;")

# Convert to array
IDS=($CHUNK_IDS)

if [ ${#IDS[@]} -eq 0 ]; then
    echo "❌ No chunks found in database. Please upload a PDF first."
    exit 1
fi

echo "✅ Found ${#IDS[@]} chunks to test"
echo ""

# Test each chunk
for i in "${!IDS[@]}"; do
    CHUNK_ID=$(echo "${IDS[$i]}" | xargs)
    echo "═══════════════════════════════════════════════════════"
    echo "Test $((i+1)): Chunk ${CHUNK_ID:0:8}..."
    echo "───────────────────────────────────────────────────────"
    
    # First call (should generate)
    echo "🔄 First call (generating)..."
    RESULT=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/chunk-explain \
      -H "Content-Type: application/json" \
      -d "{\"chunk_id\": \"$CHUNK_ID\", \"detail_level\": \"brief\"}")
    
    WAS_CACHED=$(echo "$RESULT" | jq -r '.was_cached // false')
    SUCCESS=$(echo "$RESULT" | jq -r '.success // false')
    EXPLANATION=$(echo "$RESULT" | jq -r '.explanation // "No explanation"' | head -c 200)
    
    if [ "$SUCCESS" = "true" ]; then
        echo "  ✅ Success! Cached: $WAS_CACHED"
        echo "  📝 Explanation: ${EXPLANATION}..."
        
        # Second call (should use cache)
        if [ "$WAS_CACHED" = "false" ]; then
            echo ""
            echo "🔄 Second call (should hit cache)..."
            sleep 1
            RESULT2=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/chunk-explain \
              -H "Content-Type: application/json" \
              -d "{\"chunk_id\": \"$CHUNK_ID\", \"detail_level\": \"brief\"}")
            
            WAS_CACHED2=$(echo "$RESULT2" | jq -r '.was_cached')
            TIMES_VIEWED=$(echo "$RESULT2" | jq -r '.times_viewed')
            echo "  ✅ Cached: $WAS_CACHED2, Times viewed: $TIMES_VIEWED"
        fi
    else
        ERROR=$(echo "$RESULT" | jq -r '.error')
        echo "  ❌ Failed: $ERROR"
    fi
    
    echo ""
    sleep 2  # Avoid rate limits
done

echo "═══════════════════════════════════════════════════════"
echo "📊 Cache Statistics:"
docker exec supabase_db_frictionai psql -U postgres -c "SELECT COUNT(*) as total_cached, SUM(times_viewed) as total_views, AVG(LENGTH(explanation))::int as avg_chars FROM chunk_explanations;"

echo ""
echo "✅ Testing complete!"
