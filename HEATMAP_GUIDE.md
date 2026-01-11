# 📊 Document Heatmap System - Implementation Guide

## Overview
The Document Heatmap System tracks user interactions with PDF chunks and provides normalized heatmap visualization. It identifies "hot zones" - sections where students need the most help.

---

## 🎯 Key Features

### 1. **Atomic Interaction Tracking**
- Thread-safe increment operations
- Updates both chunk and document counters
- Tracks detailed interaction history

### 2. **Normalized Heatmap (0.0 to 1.0)**
- Heat score is **relative to the document**
- Hottest chunk is always 1.0
- Enables fair comparison across documents

### 3. **Hot Zone Detection**
- Automatically flags chunks with ≥80% heat
- Identifies difficult or confusing content
- Useful for instructors to focus review sessions

### 4. **Integration with chunk-explain**
- Automatically tracks when students request explanations
- No additional frontend code needed

---

## 📊 Database Schema

### Existing Tables (No Changes)
```sql
chunks:
  - interactions (integer) -- Incremented on each click

documents:
  - total_clicks (integer) -- Sum of all chunk interactions

interactions:
  - chunk_id, user_id, x_coord, y_coord, created_at
```

### New Functions

#### `increment_chunk_interaction()`
```typescript
// Usage in TypeScript
const newCount = await supabase.rpc('increment_chunk_interaction', {
  p_chunk_id: 'uuid-here',
  p_user_id: 'uuid-here',  // optional
  p_page_number: 1         // optional
});
```

**What it does:**
1. Atomically increments `chunks.interactions`
2. Atomically increments `documents.total_clicks`
3. Inserts record into `interactions` table (if user_id provided)
4. Returns the new interaction count

**Parameters:**
- `p_chunk_id` (uuid) - Required
- `p_user_id` (uuid) - Optional, for tracking user behavior
- `p_x_coord` (double) - Optional, click coordinates
- `p_y_coord` (double) - Optional, click coordinates
- `p_page_number` (integer) - Optional, page number

---

#### `get_document_heatmap()`
```typescript
// Usage in TypeScript
const heatmap = await supabase.rpc('get_document_heatmap', {
  p_document_id: 'uuid-here'
});

// Returns array of:
interface HeatmapChunk {
  chunk_id: string;
  page_number: number;
  interactions: number;
  heat_score: number;        // 0.0 to 1.0
  is_hot_zone: boolean;      // true if >= 0.8
  content_preview: string;   // First 100 chars
  x_min, x_max, y_min, y_max: number;
}
```

**Heat Score Formula:**
```
heat_score = chunk.interactions / MAX(all_chunk_interactions_in_document)
```

**Example Output:**
```json
[
  {
    "chunk_id": "...",
    "page_number": 1,
    "interactions": 10,
    "heat_score": 1.0,
    "is_hot_zone": true,
    "content_preview": "Computer Architecture fundamentals..."
  },
  {
    "chunk_id": "...",
    "page_number": 1,
    "interactions": 8,
    "heat_score": 0.8,
    "is_hot_zone": true,
    "content_preview": "CPU Pipeline stages..."
  }
]
```

---

#### `get_document_hot_zones()`
```typescript
// Get only the difficult sections
const hotZones = await supabase.rpc('get_document_hot_zones', {
  p_document_id: 'uuid-here',
  p_threshold: 0.8  // optional, defaults to 0.8
});

// Returns same format as heatmap, but filtered
```

**Use Cases:**
- Show instructors where students struggle
- Highlight sections needing more explanation
- Prioritize content review

---

#### `get_chunk_interaction_timeline()`
```typescript
// Get recent interaction history for a chunk
const timeline = await supabase.rpc('get_chunk_interaction_timeline', {
  p_chunk_id: 'uuid-here',
  p_limit: 50  // optional, defaults to 50
});

// Returns:
interface Interaction {
  interaction_id: string;
  user_id: string;
  created_at: string;
  x_coord: number;
  y_coord: number;
  page_number: number;
}
```

---

## 🎨 Frontend Integration Examples

### Example 1: Display Heatmap Overlay
```typescript
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function HeatmapOverlay({ documentId }) {
  const [heatmap, setHeatmap] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    async function loadHeatmap() {
      const { data } = await supabase.rpc('get_document_heatmap', {
        p_document_id: documentId
      });
      setHeatmap(data || []);
    }
    loadHeatmap();
  }, [documentId]);

  return (
    <div className="heatmap-overlay">
      {heatmap.map(chunk => (
        <div
          key={chunk.chunk_id}
          style={{
            position: 'absolute',
            left: chunk.x_min,
            top: chunk.y_min,
            width: chunk.x_max - chunk.x_min,
            height: chunk.y_max - chunk.y_min,
            backgroundColor: `rgba(255, 0, 0, ${chunk.heat_score * 0.3})`,
            pointerEvents: 'none'
          }}
        />
      ))}
    </div>
  );
}
```

### Example 2: Hot Zones Widget
```typescript
export function HotZonesWidget({ documentId }) {
  const [hotZones, setHotZones] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    async function loadHotZones() {
      const { data } = await supabase.rpc('get_document_hot_zones', {
        p_document_id: documentId
      });
      setHotZones(data || []);
    }
    loadHotZones();
  }, [documentId]);

  return (
    <div className="hot-zones-panel">
      <h3>🔥 Difficult Sections</h3>
      {hotZones.map(zone => (
        <div key={zone.chunk_id} className="hot-zone-item">
          <span className="page">Page {zone.page_number}</span>
          <span className="heat">{(zone.heat_score * 100).toFixed(0)}%</span>
          <p className="content">{zone.content_preview}</p>
          <span className="clicks">{zone.interactions} clicks</span>
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Click Handler (Already Integrated!)
```typescript
// The chunk-explain function already uses this!
// When a user clicks for an explanation:

async function handleChunkClick(chunkId: string, userId: string) {
  // This is automatically called by chunk-explain function
  await supabase.rpc('increment_chunk_interaction', {
    p_chunk_id: chunkId,
    p_user_id: userId,
    p_page_number: currentPage
  });
  
  // Then get explanation...
}
```

---

## 📈 Analytics Queries

### Most Clicked Chunks Across All Documents
```sql
SELECT 
  c.id,
  d.file_name,
  c.page_number,
  LEFT(c.content, 50) as preview,
  c.interactions
FROM chunks c
JOIN documents d ON d.id = c.document_id
ORDER BY c.interactions DESC
LIMIT 20;
```

### Documents with Most Engagement
```sql
SELECT 
  d.file_name,
  co.department || ' ' || co.course_number as course,
  d.total_clicks,
  COUNT(c.id) as total_chunks,
  ROUND(d.total_clicks::numeric / NULLIF(COUNT(c.id), 0), 2) as avg_clicks_per_chunk
FROM documents d
JOIN courses co ON co.id = d.course_id
LEFT JOIN chunks c ON c.document_id = d.id
GROUP BY d.id, d.file_name, co.department, co.course_number, d.total_clicks
ORDER BY d.total_clicks DESC;
```

### User Engagement Timeline
```sql
SELECT 
  DATE(i.created_at) as date,
  COUNT(*) as interactions,
  COUNT(DISTINCT i.user_id) as unique_users,
  COUNT(DISTINCT i.chunk_id) as unique_chunks
FROM interactions i
WHERE i.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(i.created_at)
ORDER BY date DESC;
```

---

## 🔒 Security

### RLS Policies (Currently Open for Testing)
```sql
-- For production, add:
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read heatmap
CREATE POLICY "Users can view heatmap"
  ON chunks FOR SELECT
  TO authenticated
  USING (true);

-- Users can only create interactions for themselves
CREATE POLICY "Users track own interactions"
  ON interactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

---

## 🧪 Testing

Run the test suite:
```bash
./test_heatmap.sh
```

This tests:
- ✅ Full document heatmap
- ✅ Hot zone detection
- ✅ Atomic increments
- ✅ Document statistics
- ✅ API access via RPC

---

## 🚀 Performance Optimizations

### Indexes (Already Created)
```sql
-- Fast heatmap queries
idx_chunks_document_interactions ON chunks(document_id, interactions DESC)

-- Fast timeline queries
idx_interactions_chunk_created ON interactions(chunk_id, created_at DESC)

-- User history
idx_interactions_user_created ON interactions(user_id, created_at DESC)
```

### Caching Strategy
- Heatmap data can be cached on frontend (5-10 min TTL)
- Hot zones are relatively stable (cache longer)
- Real-time updates not critical for this use case

---

## 📊 Example Use Cases

### For Students
- See which sections classmates find difficult
- Prioritize study time on hot zones
- Understand common confusion points

### For Instructors
- Identify content needing clarification
- Adjust lecture focus based on data
- Create targeted review materials

### For TAs
- Know where to offer extra help
- Create FAQ based on hot zones
- Proactively address common issues

---

## ✅ What's Already Working

1. ✅ `chunk-explain` function integrated
2. ✅ Atomic increment function
3. ✅ Heatmap calculation (normalized 0-1)
4. ✅ Hot zone detection (≥0.8 threshold)
5. ✅ Database indexes for performance
6. ✅ RPC functions accessible via Supabase client
7. ✅ Anonymous interaction tracking (no user required)

---

## 🎯 Next Steps

1. **Frontend Visualization**
   - Build heatmap overlay component
   - Add hot zones sidebar
   - Show engagement metrics

2. **Instructor Dashboard**
   - Analytics page
   - Trend charts
   - Export reports

3. **Student Features**
   - "Popular sections" badge
   - Difficulty indicators
   - Peer learning suggestions

---

## 🔧 Troubleshooting

### Issue: Heat scores all 0.0
**Solution:** Make sure chunks have interactions > 0

### Issue: Hot zones not appearing
**Solution:** Check if any chunk has heat_score >= 0.8

### Issue: Total_clicks not updating
**Solution:** Use `increment_chunk_interaction()` instead of manual UPDATE

### Issue: Foreign key errors on user_id
**Solution:** Pass `NULL` for anonymous tracking or ensure user exists

---

## 📚 API Reference Summary

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `increment_chunk_interaction` | Track a click | chunk_id, user_id?, coords? | integer |
| `get_document_heatmap` | Get all chunks with heat | document_id | array of chunks |
| `get_document_hot_zones` | Get difficult sections | document_id, threshold? | array of chunks |
| `get_chunk_interaction_timeline` | Get click history | chunk_id, limit? | array of interactions |

---

**🎉 The heatmap system is fully operational and ready for frontend integration!**
