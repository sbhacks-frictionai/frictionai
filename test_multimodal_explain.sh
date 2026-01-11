#!/bin/bash

# Test script for multimodal chunk-explain function
# Tests both text and image chunk explanations

set -e

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║           TESTING MULTIMODAL CHUNK EXPLANATIONS                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# Test user ID (use a valid UUID or null for anonymous)
USER_ID="00000000-0000-0000-0000-000000000000"

echo "📊 Step 1: Checking for chunks in database..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get a text chunk
TEXT_CHUNK=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_sample_text_chunk" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{}' | jq -r '.[0].id // empty' 2>/dev/null)

# Get an image chunk
IMAGE_CHUNK=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_sample_image_chunk" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{}' | jq -r '.[0].id // empty' 2>/dev/null)

# Fallback: query chunks directly
if [ -z "$TEXT_CHUNK" ]; then
  echo "⚠️  RPC not found, querying chunks directly..."
  TEXT_CHUNK=$(curl -s "$SUPABASE_URL/rest/v1/chunks?is_image=eq.false&select=id&limit=1" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | jq -r '.[0].id // empty')
fi

if [ -z "$IMAGE_CHUNK" ]; then
  IMAGE_CHUNK=$(curl -s "$SUPABASE_URL/rest/v1/chunks?is_image=eq.true&select=id&limit=1" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" | jq -r '.[0].id // empty')
fi

echo ""
echo "Found chunks:"
echo "  📝 Text chunk:  ${TEXT_CHUNK:-❌ Not found}"
echo "  🖼️  Image chunk: ${IMAGE_CHUNK:-❌ Not found}"
echo ""

# Test 1: Text chunk explanation
if [ -n "$TEXT_CHUNK" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 TEST 1: Text Chunk Explanation"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Chunk ID: $TEXT_CHUNK"
  echo ""
  
  RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/chunk-explain" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d "{
      \"chunk_id\": \"$TEXT_CHUNK\",
      \"user_id\": null,
      \"detail_level\": \"detailed\"
    }")
  
  echo "Response:"
  echo "$RESPONSE" | jq '.'
  
  # Check for success
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  CHUNK_TYPE=$(echo "$RESPONSE" | jq -r '.chunk_type')
  IS_IMAGE=$(echo "$RESPONSE" | jq -r '.is_image')
  
  echo ""
  echo "Results:"
  echo "  ✓ Success: $SUCCESS"
  echo "  ✓ Chunk Type: $CHUNK_TYPE"
  echo "  ✓ Is Image: $IS_IMAGE"
  
  if [ "$SUCCESS" = "true" ] && [ "$CHUNK_TYPE" = "text" ] && [ "$IS_IMAGE" = "false" ]; then
    echo "  ✅ TEXT CHUNK TEST PASSED"
  else
    echo "  ❌ TEXT CHUNK TEST FAILED"
  fi
  echo ""
else
  echo "⚠️  Skipping text chunk test - no text chunks found"
  echo ""
fi

# Test 2: Image chunk explanation
if [ -n "$IMAGE_CHUNK" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 TEST 2: Image Chunk Explanation"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Chunk ID: $IMAGE_CHUNK"
  echo ""
  
  RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/chunk-explain" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d "{
      \"chunk_id\": \"$IMAGE_CHUNK\",
      \"user_id\": null,
      \"detail_level\": \"detailed\"
    }")
  
  echo "Response:"
  echo "$RESPONSE" | jq '.'
  
  # Check for success
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  CHUNK_TYPE=$(echo "$RESPONSE" | jq -r '.chunk_type')
  IS_IMAGE=$(echo "$RESPONSE" | jq -r '.is_image')
  
  echo ""
  echo "Results:"
  echo "  ✓ Success: $SUCCESS"
  echo "  ✓ Chunk Type: $CHUNK_TYPE"
  echo "  ✓ Is Image: $IS_IMAGE"
  
  if [ "$SUCCESS" = "true" ] && [ "$CHUNK_TYPE" = "image" ] && [ "$IS_IMAGE" = "true" ]; then
    echo "  ✅ IMAGE CHUNK TEST PASSED"
  else
    echo "  ❌ IMAGE CHUNK TEST FAILED"
  fi
  echo ""
else
  echo "⚠️  Skipping image chunk test - no image chunks found"
  echo ""
fi

# Test 3: Caching test
if [ -n "$TEXT_CHUNK" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 TEST 3: Caching Test (2nd request should be instant)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Re-requesting: $TEXT_CHUNK"
  echo ""
  
  START=$(date +%s)
  RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/chunk-explain" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d "{
      \"chunk_id\": \"$TEXT_CHUNK\",
      \"user_id\": null,
      \"detail_level\": \"detailed\"
    }")
  END=$(date +%s)
  DURATION=$((END - START))
  
  WAS_CACHED=$(echo "$RESPONSE" | jq -r '.was_cached')
  TIMES_VIEWED=$(echo "$RESPONSE" | jq -r '.times_viewed')
  
  echo "Results:"
  echo "  ✓ Was Cached: $WAS_CACHED"
  echo "  ✓ Times Viewed: $TIMES_VIEWED"
  echo "  ✓ Response Time: ${DURATION}s"
  
  if [ "$WAS_CACHED" = "true" ]; then
    echo "  ✅ CACHING TEST PASSED"
  else
    echo "  ⚠️  CACHING TEST: Not cached (may be first run)"
  fi
  echo ""
fi

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                    MULTIMODAL TESTS COMPLETE                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Tests completed!"
echo ""
echo "Next steps:"
echo "  1. Check that text chunks return chunk_type='text', is_image=false"
echo "  2. Check that image chunks return chunk_type='image', is_image=true"
echo "  3. Verify image explanations use pre-processed summaries"
echo "  4. Test interaction tracking with increment_chunk_interaction()"
echo ""
