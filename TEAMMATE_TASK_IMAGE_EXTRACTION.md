# 🎯 TASK: Image Content Extraction Implementation

**Priority:** HIGH  
**Assigned to:** Teammate  
**Location:** `python-api/lambda_function.py`  
**Status:** Ready to start

---

## ✅ What's Already Complete

The backend system is **fully functional** except for one missing piece:

- ✅ Image detection and positioning
- ✅ Chunk creation with `is_image` flag
- ✅ Database schema (`chunks.summary` field exists)
- ✅ Frontend Edge Function ready to consume image summaries
- ✅ Multimodal AI explanations working
- ✅ Heatmap and study guide generation working
- ✅ All testing complete and passing

---

## 🔴 What's Missing

**Images are detected but not analyzed.**

Currently:
```json
{
  "content": "[Image: Image123_0 at position (100, 200)]",
  "summary": null,  ← THIS IS NULL!
  "is_image": true
}
```

**Your task:** Populate the `summary` field with AI-generated descriptions using **Gemini Vision API**.

---

## 🎯 Your Goal

Extract actual image content from PDFs and generate educational descriptions using Google's Gemini Vision API.

### Expected Result:
```json
{
  "content": "[Image: Image123_0]",
  "summary": "A diagram showing the 5-stage CPU pipeline: Instruction Fetch (IF), Instruction Decode (ID), Execute (EX), Memory Access (MEM), and Write Back (WB). Arrows indicate data flow from left to right.",
  "is_image": true,
  "page_number": 3
}
```

---

## 📋 Implementation Steps

### Step 1: Add Dependencies

Update `python-api/requirements.txt`:

```txt
PyMuPDF>=1.23.0
requests>=2.31.0
google-generativeai>=0.3.0
pillow>=10.0.0
```

### Step 2: Add Image Extraction Function

Add to `lambda_function.py`:

```python
def extract_image_bytes(pdf_bytes: bytes, xref: int) -> Optional[bytes]:
    """
    Extract actual image data from PDF by xref.
    Returns image bytes that can be sent to AI vision models.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        base_image = doc.extract_image(xref)
        doc.close()
        return base_image["image"]
    except Exception as e:
        print(f"Failed to extract image {xref}: {e}")
        return None
```

### Step 3: Add Gemini Vision Analysis

```python
import google.generativeai as genai
from PIL import Image
import io
from typing import Optional

def analyze_image_with_gemini(
    image_bytes: bytes,
    course_code: str = "",
    course_name: str = "",
    page_number: int = 1
) -> str:
    """
    Analyze image using Gemini Vision API.
    Returns a technical description of the image content.
    """
    # Configure Gemini API
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "[Image analysis unavailable - API key not configured]"
    
    genai.configure(api_key=api_key)
    
    try:
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Use Gemini 2.0 Flash (fast + multimodal)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Course-aware prompt
        prompt = f"""Analyze this image from a lecture slide.

Course: {course_code} - {course_name}
Page: {page_number}

Provide a clear, technical description of what's shown in this image.

Focus on:
- Diagrams, charts, graphs, or visualizations
- Mathematical equations or formulas
- Code snippets or pseudocode
- Tables or data
- Key concepts illustrated
- Labels and annotations

Be concise but thorough. Describe what a student needs to understand from this visual.
"""
        
        # Generate content from image + prompt
        response = model.generate_content([prompt, image])
        return response.text.strip()
    
    except Exception as e:
        print(f"Gemini Vision API error: {e}")
        return f"[Image analysis failed: {str(e)}]"
```

### Step 4: Update ImageItem Dataclass

Add `xref` field to store image reference:

```python
@dataclass
class ImageItem:
    x: float
    y: float
    width: float
    height: float
    pageNumber: int
    obj_name: str
    xref: int  # ← ADD THIS to store image reference for extraction
```

### Step 5: Update SemanticChunk Dataclass

Add `summary` field:

```python
@dataclass
class SemanticChunk:
    content: str
    page_number: int
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    chunk_index: int
    is_image: bool = False
    summary: Optional[str] = None  # ← ADD THIS
```

### Step 6: Modify Image Extraction to Store xref

In `extract_image_items_with_coordinates()`, update to include xref:

```python
def extract_image_items_with_coordinates(pdf_bytes: bytes) -> List[ImageItem]:
    """Extract images with xref for content extraction."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    items: List[ImageItem] = []
    
    for page_idx in range(doc.page_count):
        page = doc[page_idx]
        image_list = page.get_images()
        
        for img_index, img in enumerate(image_list):
            xref = img[0]  # This is the image reference ID
            
            try:
                image_rects = page.get_image_rects(xref)
                
                for rect in image_rects:
                    x = round(float(rect.x0), 2)
                    y = round(float(rect.y0), 2)
                    width = round(float(rect.x1 - rect.x0), 2)
                    height = round(float(rect.y1 - rect.y0), 2)
                    
                    if width > 0 and height > 0:
                        items.append(
                            ImageItem(
                                x=x,
                                y=y,
                                width=width,
                                height=height,
                                pageNumber=page_idx + 1,
                                obj_name=f"Image{xref}_{img_index}",
                                xref=xref  # ← ADD THIS
                            )
                        )
            except Exception:
                # Keep existing fallback logic
                pass
    
    doc.close()
    return items
```

### Step 7: Create New Image Chunk Function with Analysis

Replace `create_image_chunks()` with this version:

```python
def create_image_chunks_with_analysis(
    image_items: List[ImageItem],
    pdf_bytes: bytes,
    course_code: str = "",
    course_name: str = ""
) -> List[SemanticChunk]:
    """
    Create chunks for images WITH AI-generated content analysis.
    """
    chunks: List[SemanticChunk] = []
    
    # Group images by page
    by_page: Dict[int, List[ImageItem]] = {}
    for img in image_items:
        by_page.setdefault(img.pageNumber, []).append(img)
    
    for page_number in sorted(by_page.keys()):
        page_images = by_page[page_number]
        sorted_images = sorted(page_images, key=lambda img: (img.y, img.x))
        
        # Deduplicate (keep existing logic)
        deduplicated_images: List[ImageItem] = []
        position_tolerance = 15.0
        
        for image in sorted_images:
            is_duplicate = any(
                abs(existing.x + existing.width / 2 - (image.x + image.width / 2)) < position_tolerance and
                abs(existing.y + existing.height / 2 - (image.y + image.height / 2)) < position_tolerance
                for existing in deduplicated_images
            )
            
            if not is_duplicate:
                deduplicated_images.append(image)
        
        # Analyze each image with AI
        for img_index, image in enumerate(deduplicated_images):
            print(f"Analyzing image {image.obj_name} on page {page_number}...")
            
            # Extract actual image bytes
            image_bytes = extract_image_bytes(pdf_bytes, image.xref)
            
            # Generate AI description
            if image_bytes:
                summary = analyze_image_with_gemini(
                    image_bytes,
                    course_code=course_code,
                    course_name=course_name,
                    page_number=page_number
                )
            else:
                summary = "[Image could not be extracted]"
            
            print(f"  ✓ Generated summary: {summary[:100]}...")
            
            chunks.append(
                SemanticChunk(
                    content=f"[Image: {image.obj_name}]",
                    page_number=image.pageNumber,
                    x_min=image.x,
                    x_max=image.x + image.width,
                    y_min=image.y,
                    y_max=image.y + image.height,
                    chunk_index=0,
                    is_image=True,
                    summary=summary  # ← AI-generated description!
                )
            )
    
    return chunks
```

### Step 8: Update create_chunks Function

Modify signature and call new function:

```python
def create_chunks(
    text_items: List[TextItem],
    image_items: List[ImageItem],
    pdf_bytes: bytes,  # ← ADD THIS
    course_code: str = "",  # ← ADD THIS
    course_name: str = "",  # ← ADD THIS
    max_chars: int = 200
) -> Tuple[List[SemanticChunk], int]:
    """Create chunks from both text and images."""
    
    # Text chunks (existing logic)
    by_page: Dict[int, List[TextItem]] = {}
    for it in text_items:
        by_page.setdefault(it.pageNumber, []).append(it)

    text_chunks: List[SemanticChunk] = []
    pages_processed = 0

    for page_number in sorted(by_page.keys()):
        page_items = by_page[page_number]
        page_chunks = create_semantic_chunks_for_page(page_items, page_number, max_chars=max_chars)
        text_chunks.extend(page_chunks)
        pages_processed += 1

    # Image chunks WITH ANALYSIS
    image_chunks = create_image_chunks_with_analysis(
        image_items, 
        pdf_bytes,  # ← PASS PDF BYTES
        course_code,  # ← PASS COURSE INFO
        course_name
    )
    
    # Merge in reading order
    all_chunks = merge_chunks_in_reading_order(text_chunks, image_chunks)

    return all_chunks, pages_processed
```

### Step 9: Update Lambda Handler

Modify to pass new parameters:

```python
def handler(event, context):
    # ... existing validation code ...
    
    # Get course info from payload (will be passed from Edge Function)
    course_code = payload.get("course_code", "")
    course_name = payload.get("course_name", "")
    
    pdf_bytes = download_pdf_bytes(pdf_url)
    text_items = extract_text_items_with_coordinates(pdf_bytes)
    image_items = extract_image_items_with_coordinates(pdf_bytes)

    if not text_items and not image_items:
        return _json_response(422, {"success": False, "error": "No text or images extracted"})

    # Pass pdf_bytes and course info
    chunks, pages_processed = create_chunks(
        text_items, 
        image_items,
        pdf_bytes,  # ← ADD
        course_code,  # ← ADD
        course_name,  # ← ADD
        max_chars=int(max_chars)
    )

    # Return with summary field
    return _json_response(
        200,
        {
            "success": True,
            "document_id": document_id,
            "file_name": file_name,
            "pages_processed": pages_processed,
            "text_items_extracted": len(text_items),
            "image_items_extracted": len(image_items),
            "chunks_created": len(chunks),
            "chunks": [
                {
                    "content": c.content,
                    "summary": c.summary,  # ← ADD THIS
                    "page_number": c.page_number,
                    "x_min": c.x_min,
                    "x_max": c.x_max,
                    "y_min": c.y_min,
                    "y_max": c.y_max,
                    "chunk_index": c.chunk_index,
                    "is_image": c.is_image,
                }
                for c in chunks
            ],
        },
    )
```

### Step 10: Update Edge Function to Pass Course Info

In `supabase/functions/chunk-process/index.ts`, fetch course info and pass to Lambda:

```typescript
// After fetching document, get course info
const { data: docData } = await supabase
  .from('documents')
  .select(`
    id,
    courses (
      department,
      course_number,
      title
    )
  `)
  .eq('id', document_id)
  .single();

const course = docData?.courses;
const courseCode = course ? `${course.department} ${course.course_number}` : "";
const courseName = course?.title || "";

// Pass to Lambda
const lambdaResp = await fetch(lambdaUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(sharedSecret ? { "x-shared-secret": sharedSecret } : {}),
  },
  body: JSON.stringify({
    document_id,
    pdf_url: signedUrl,
    file_name,
    max_chars: 200,
    course_code: courseCode,  // ← ADD
    course_name: courseName,  // ← ADD
  }),
});
```

---

## 🧪 Testing

### Local Testing

```bash
# Set environment variable
export GEMINI_API_KEY="your-actual-gemini-api-key"

# Test with a PDF containing images
python lambda_function.py
```

### Expected Output

For a pipeline diagram image:

```json
{
  "content": "[Image: Image45_0]",
  "summary": "A diagram showing the 5-stage CPU pipeline architecture. The stages are arranged horizontally: Instruction Fetch (IF), Instruction Decode (ID), Execute (EX), Memory Access (MEM), and Write Back (WB). Each stage is represented as a rectangular box with arrows indicating sequential data flow from left to right. Register file connections are shown between stages.",
  "is_image": true,
  "page_number": 3,
  "x_min": 100.5,
  "x_max": 500.5,
  "y_min": 200.0,
  "y_max": 350.0
}
```

---

## ✅ Acceptance Criteria

- [ ] Image chunks have `summary` field populated with AI descriptions
- [ ] Summaries are course-aware (use course code/name in analysis)
- [ ] Summaries are technical and educational (not generic)
- [ ] Works with diagrams, charts, equations, tables
- [ ] Handles extraction failures gracefully (fallback messages)
- [ ] No crashes on corrupted images
- [ ] Reasonable performance (2-4 seconds per image is acceptable)
- [ ] All existing text chunk functionality still works

---

## 🔧 Environment Variables Needed

Make sure these are set in your Lambda/Docker environment:

```bash
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

---

## 🚨 Important Notes

### 1. **Don't break existing functionality**
   - Keep all text chunk processing exactly as is
   - Only modify image-related code

### 2. **Error handling**
   - If image extraction fails → use fallback message
   - If Gemini API fails → use fallback message
   - Never crash the entire PDF processing

### 3. **Performance**
   - Each image adds ~2-4 seconds (Gemini API call)
   - This is acceptable for initial implementation
   - Can optimize later with batching/caching

### 4. **API Costs**
   - Gemini Vision is relatively cheap
   - ~$0.00025 per image (Flash model)
   - For 20-image PDF = ~$0.005

---

## 📚 Resources

- **Gemini API Docs**: https://ai.google.dev/docs
- **PyMuPDF Image Extraction**: https://pymupdf.readthedocs.io/en/latest/recipes-images.html
- **PIL Documentation**: https://pillow.readthedocs.io/

---

## 🎯 Success Criteria

When this is done:

1. Upload a PDF with images to the system
2. Process it through the Lambda function
3. Check database: `chunks.summary` should have AI-generated descriptions for image chunks
4. Click an image in the frontend
5. Get a meaningful explanation based on the image content

---

## ❓ Questions?

**Q: Where do I get course_code and course_name?**  
A: They're passed from the Edge Function. I'll update `chunk-process/index.ts` to fetch and pass them.

**Q: What if Gemini API is slow?**  
A: That's okay for now. Typical time is 2-4 seconds per image. We can optimize later.

**Q: What models should I use?**  
A: Use `gemini-2.0-flash` - it's fast, cheap, and supports vision.

**Q: What about rate limits?**  
A: Gemini Flash has high limits. Add a small delay (0.5s) between images if needed.

---

## 🚀 Priority: CRITICAL

This is the **last piece** needed for the system to be fully functional. Everything else is ready and tested!

Once this is done, the system will be **100% complete** and ready for production! 🎉

---

**Good luck! You got this!** 💪
