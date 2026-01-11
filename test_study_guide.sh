#!/bin/bash

# Test script for generate-study-guide function
# Tests daily study guide generation based on heatmap data

set -e

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║              TESTING STUDY GUIDE GENERATION                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

echo "📊 Step 1: Finding a document with interactions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get a document with the most clicks
DOCUMENT_ID=$(curl -s "$SUPABASE_URL/rest/v1/documents?select=id,file_name,total_clicks&order=total_clicks.desc&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" | jq -r '.[0].id // empty')

if [ -z "$DOCUMENT_ID" ]; then
  echo "❌ No documents found in database"
  echo ""
  echo "Please ensure you have:"
  echo "  1. Uploaded a PDF document"
  echo "  2. Processed chunks from the document"
  echo "  3. Generated some interactions (click on chunks)"
  echo ""
  exit 1
fi

# Get document info
DOC_INFO=$(curl -s "$SUPABASE_URL/rest/v1/documents?id=eq.$DOCUMENT_ID&select=file_name,total_clicks" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY")

DOC_NAME=$(echo "$DOC_INFO" | jq -r '.[0].file_name')
DOC_CLICKS=$(echo "$DOC_INFO" | jq -r '.[0].total_clicks')

echo "Found document:"
echo "  📄 Document ID: $DOCUMENT_ID"
echo "  📝 Name: $DOC_NAME"
echo "  🖱️  Total Clicks: $DOC_CLICKS"
echo ""

# Step 2: Check heatmap data
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Step 2: Checking heatmap data..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HEATMAP=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_document_heatmap" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "{\"p_document_id\": \"$DOCUMENT_ID\"}")

HOT_ZONES_COUNT=$(echo "$HEATMAP" | jq '[.[] | select(.is_hot_zone == true)] | length')
TOTAL_CHUNKS=$(echo "$HEATMAP" | jq 'length')
TOTAL_INTERACTIONS=$(echo "$HEATMAP" | jq '[.[] | .interactions] | add')

echo "Heatmap Statistics:"
echo "  📦 Total Chunks: $TOTAL_CHUNKS"
echo "  🔥 Hot Zones: $HOT_ZONES_COUNT"
echo "  🖱️  Total Interactions: $TOTAL_INTERACTIONS"
echo ""

if [ "$TOTAL_INTERACTIONS" -eq 0 ]; then
  echo "⚠️  Warning: No interactions found. Study guide will be generic."
  echo "   Consider clicking on some chunks to generate meaningful data."
  echo ""
fi

# Step 3: Generate study guide (first time)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST 1: Generate Study Guide (Fresh)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

START=$(date +%s)
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/generate-study-guide" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "{
    \"document_id\": \"$DOCUMENT_ID\",
    \"detail_level\": \"detailed\",
    \"force_regenerate\": false
  }")
END=$(date +%s)
DURATION=$((END - START))

echo "Response (first 500 chars):"
echo "$RESPONSE" | jq '.' | head -c 500
echo "..."
echo ""

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
WAS_CACHED=$(echo "$RESPONSE" | jq -r '.was_cached')
HOT_ZONES=$(echo "$RESPONSE" | jq -r '.hot_zones_count')
INTERACTIONS=$(echo "$RESPONSE" | jq -r '.total_interactions')

echo "Results:"
echo "  ✓ Success: $SUCCESS"
echo "  ✓ Was Cached: $WAS_CACHED"
echo "  ✓ Hot Zones Analyzed: $HOT_ZONES"
echo "  ✓ Total Interactions: $INTERACTIONS"
echo "  ✓ Generation Time: ${DURATION}s"

if [ "$SUCCESS" = "true" ] && [ "$WAS_CACHED" = "false" ]; then
  echo "  ✅ FRESH GENERATION TEST PASSED"
elif [ "$SUCCESS" = "true" ] && [ "$WAS_CACHED" = "true" ]; then
  echo "  ⚠️  Already cached (may have been generated today)"
else
  echo "  ❌ FRESH GENERATION TEST FAILED"
fi
echo ""

# Step 4: Test caching (should be instant)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST 2: Study Guide Caching (2nd request should be instant)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

START=$(date +%s)
RESPONSE2=$(curl -s -X POST "$SUPABASE_URL/functions/v1/generate-study-guide" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "{
    \"document_id\": \"$DOCUMENT_ID\",
    \"detail_level\": \"detailed\",
    \"force_regenerate\": false
  }")
END=$(date +%s)
DURATION=$((END - START))

SUCCESS2=$(echo "$RESPONSE2" | jq -r '.success')
WAS_CACHED2=$(echo "$RESPONSE2" | jq -r '.was_cached')

echo "Results:"
echo "  ✓ Success: $SUCCESS2"
echo "  ✓ Was Cached: $WAS_CACHED2"
echo "  ✓ Response Time: ${DURATION}s"

if [ "$WAS_CACHED2" = "true" ]; then
  echo "  ✅ CACHING TEST PASSED"
else
  echo "  ❌ CACHING TEST FAILED (Should be cached on 2nd request)"
fi
echo ""

# Step 5: Test force regeneration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TEST 3: Force Regeneration (force_regenerate=true)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

START=$(date +%s)
RESPONSE3=$(curl -s -X POST "$SUPABASE_URL/functions/v1/generate-study-guide" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "{
    \"document_id\": \"$DOCUMENT_ID\",
    \"detail_level\": \"brief\",
    \"force_regenerate\": true
  }")
END=$(date +%s)
DURATION=$((END - START))

SUCCESS3=$(echo "$RESPONSE3" | jq -r '.success')
WAS_CACHED3=$(echo "$RESPONSE3" | jq -r '.was_cached')

echo "Results:"
echo "  ✓ Success: $SUCCESS3"
echo "  ✓ Was Cached: $WAS_CACHED3"
echo "  ✓ Response Time: ${DURATION}s"

if [ "$SUCCESS3" = "true" ] && [ "$WAS_CACHED3" = "false" ]; then
  echo "  ✅ FORCE REGENERATION TEST PASSED"
else
  echo "  ❌ FORCE REGENERATION TEST FAILED"
fi
echo ""

# Step 6: Display sample study guide
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 SAMPLE STUDY GUIDE OUTPUT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

STUDY_GUIDE=$(echo "$RESPONSE" | jq -r '.study_guide')
echo "$STUDY_GUIDE"
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                 STUDY GUIDE TESTS COMPLETE                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Tests completed!"
echo ""
echo "Summary:"
echo "  📄 Document: $DOC_NAME"
echo "  🔥 Hot Zones: $HOT_ZONES"
echo "  🖱️  Total Interactions: $INTERACTIONS"
echo ""
echo "Next steps:"
echo "  1. Verify study guide focuses on hot zones (high interaction areas)"
echo "  2. Check that cached guides are instant (< 1s response time)"
echo "  3. Test with different detail levels (brief vs detailed)"
echo "  4. Integrate with frontend for daily study guide widget"
echo ""
