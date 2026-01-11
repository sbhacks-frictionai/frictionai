import json
import math
import os
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

import requests
import fitz  # PyMuPDF


# ---------- Data models ----------

@dataclass
class TextItem:
    text: str
    x: float
    y: float
    width: float
    height: float
    pageNumber: int


@dataclass
class ImageItem:
    x: float
    y: float
    width: float
    height: float
    pageNumber: int
    obj_name: str


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


# ---------- PDF extraction ----------

def download_pdf_bytes(pdf_url: str, timeout_s: int = 30) -> bytes:
    # Signed URLs are just normal HTTPS GETs
    r = requests.get(pdf_url, timeout=timeout_s)
    r.raise_for_status()
    return r.content


def extract_text_items_with_coordinates(pdf_bytes: bytes) -> List[TextItem]:
    """
    Extract words (not raw characters) with bounding boxes per page.
    Uses PyMuPDF. Coordinates are in PDF space with origin at top-left in PyMuPDF.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    items: List[TextItem] = []

    for page_idx in range(doc.page_count):
        page = doc[page_idx]
        # words: list of tuples (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        words = page.get_text("words")
        for w in words:
            x0, y0, x1, y1, text, *_ = w
            text = (text or "").strip()
            if not text:
                continue
            items.append(
                TextItem(
                    text=text,
                    x=round(float(x0), 2),
                    y=round(float(y0), 2),
                    width=round(float(x1 - x0), 2),
                    height=round(float(y1 - y0), 2),
                    pageNumber=page_idx + 1,  # 1-index pages to match your TS code
                )
            )

    return items


def extract_image_items_with_coordinates(pdf_bytes: bytes) -> List[ImageItem]:
    """
    Extract images with bounding boxes per page.
    Uses PyMuPDF. Coordinates are in PDF space with origin at top-left.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    items: List[ImageItem] = []
    
    for page_idx in range(doc.page_count):
        page = doc[page_idx]
        
        # Get all images on this page
        image_list = page.get_images()
        
        for img_index, img in enumerate(image_list):
            xref = img[0]
            
            try:
                # Get all rectangles where this image appears on the page
                image_rects = page.get_image_rects(xref)
                
                for rect in image_rects:
                    x = round(float(rect.x0), 2)
                    y = round(float(rect.y0), 2)
                    width = round(float(rect.x1 - rect.x0), 2)
                    height = round(float(rect.y1 - rect.y0), 2)
                    
                    # Only add if dimensions are reasonable (not zero or negative)
                    if width > 0 and height > 0:
                        items.append(
                            ImageItem(
                                x=x,
                                y=y,
                                width=width,
                                height=height,
                                pageNumber=page_idx + 1,  # 1-indexed
                                obj_name=f"Image{xref}_{img_index}"
                            )
                        )
            except Exception:
                # If get_image_rects fails, try alternative method
                try:
                    # Try to get image from text blocks
                    text_dict = page.get_text("dict")
                    for block in text_dict.get("blocks", []):
                        if block.get("type") == 1:  # Image block
                            bbox = block.get("bbox", [])
                            if len(bbox) == 4:
                                x = round(float(bbox[0]), 2)
                                y = round(float(bbox[1]), 2)
                                width = round(float(bbox[2] - bbox[0]), 2)
                                height = round(float(bbox[3] - bbox[1]), 2)
                                
                                if width > 0 and height > 0:
                                    # Check if we already have this image (avoid duplicates)
                                    is_duplicate = any(
                                        abs(existing.x - x) < 5 and abs(existing.y - y) < 5
                                        for existing in items
                                        if existing.pageNumber == page_idx + 1
                                    )
                                    
                                    if not is_duplicate:
                                        items.append(
                                            ImageItem(
                                                x=x,
                                                y=y,
                                                width=width,
                                                height=height,
                                                pageNumber=page_idx + 1,
                                                obj_name=f"ImageBlock_{page_idx}_{len(items)}"
                                            )
                                        )
                except Exception:
                    continue
    
    doc.close()
    return items


# ---------- Chunking logic (similar spirit to your TS) ----------

def sort_reading_order(items: List[TextItem]) -> List[TextItem]:
    # top-to-bottom then left-to-right with tolerance on y
    def key(it: TextItem):
        return (it.y, it.x)
    return sorted(items, key=key)


def group_into_lines(items: List[TextItem], line_tolerance: float = 5.0) -> List[List[TextItem]]:
    lines: List[List[TextItem]] = []
    current: List[TextItem] = []
    current_y: Optional[float] = None

    for it in items:
        if not current:
            current = [it]
            current_y = it.y
            continue

        if current_y is None or abs(it.y - current_y) > line_tolerance:
            lines.append(current)
            current = [it]
            current_y = it.y
        else:
            current.append(it)

    if current:
        lines.append(current)

    # sort each line by x
    for line in lines:
        line.sort(key=lambda t: t.x)

    return lines


def is_bullet_line(line_text: str) -> bool:
    s = line_text.lstrip()
    return (
        s.startswith("• ")
        or s.startswith("- ")
        or s.startswith("* ")
        or (len(s) > 2 and s[0].isdigit() and (s[1:3] == ". " or s[1:3] == ") "))
        or (len(s) > 2 and s[0].isalpha() and (s[1:3] == ". " or s[1:3] == ") "))
    )


def create_semantic_chunks_for_page(
    page_items: List[TextItem],
    page_number: int,
    max_chars: int = 200,
) -> List[SemanticChunk]:
    # sort + line group
    sorted_items = sort_reading_order(page_items)
    lines = group_into_lines(sorted_items, line_tolerance=5.0)

    chunks: List[SemanticChunk] = []
    chunk_index = 0

    cur_text_items: List[TextItem] = []
    x_min = math.inf
    x_max = -math.inf
    y_min = math.inf
    y_max = -math.inf

    def flush_chunk():
        nonlocal chunk_index, cur_text_items, x_min, x_max, y_min, y_max
        content = " ".join(t.text for t in cur_text_items).strip()
        if content:
            chunks.append(
                SemanticChunk(
                    content=content,
                    page_number=page_number,
                    x_min=float(x_min),
                    x_max=float(x_max),
                    y_min=float(y_min),
                    y_max=float(y_max),
                    chunk_index=chunk_index,
                    is_image=False,
                )
            )
            chunk_index += 1
        cur_text_items = []
        x_min = math.inf
        x_max = -math.inf
        y_min = math.inf
        y_max = -math.inf

    prev_line_bottom: Optional[float] = None

    for line in lines:
        line_text = " ".join(t.text for t in line).strip()
        current_text = " ".join(t.text for t in cur_text_items).strip()
        new_text = (current_text + " " + line_text).strip() if current_text else line_text

        bullet = is_bullet_line(line_text)

        # paragraph break heuristic: big vertical gap from previous line
        paragraph_break = False
        if prev_line_bottom is not None and line:
            line_top = min(t.y for t in line)
            gap = line_top - prev_line_bottom
            line_height = max((t.height for t in line), default=10.0)
            paragraph_break = gap > (line_height * 2.0)

        exceeds = len(new_text) > max_chars

        # sentence boundary heuristic: if accumulated text ends like sentence and line begins capital-like
        # (this is soft; we can just rely on size + paragraph breaks mostly)
        ends_sentence = False
        if current_text:
            ends_sentence = (current_text.endswith(".") or current_text.endswith("!") or current_text.endswith("?"))

        should_split = bool(cur_text_items) and (bullet or paragraph_break or exceeds or ends_sentence)

        if should_split:
            flush_chunk()

        # add this line to current chunk
        for it in line:
            cur_text_items.append(it)
            x_min = min(x_min, it.x)
            x_max = max(x_max, it.x + it.width)
            y_min = min(y_min, it.y)
            y_max = max(y_max, it.y + it.height)

        # update prev bottom
        if line:
            prev_line_bottom = max((t.y + t.height for t in line), default=prev_line_bottom)

    if cur_text_items:
        flush_chunk()

    # post-process: split any chunk still too large by sentence-ish breaks
    final_chunks: List[SemanticChunk] = []
    for ch in chunks:
        if len(ch.content) <= max_chars:
            final_chunks.append(ch)
            continue

        # simple sentence split
        parts: List[str] = []
        buf = ""
        for token in ch.content.replace("\n", " ").split(" "):
            if not token:
                continue
            buf = (buf + " " + token).strip()
            if len(buf) >= 120 and (buf.endswith(".") or buf.endswith("!") or buf.endswith("?")):
                parts.append(buf)
                buf = ""
        if buf:
            parts.append(buf)

        # map sentence parts back to same bbox (you can improve later)
        for p in parts:
            final_chunks.append(
                SemanticChunk(
                    content=p.strip(),
                    page_number=ch.page_number,
                    x_min=ch.x_min,
                    x_max=ch.x_max,
                    y_min=ch.y_min,
                    y_max=ch.y_max,
                    chunk_index=0,  # reindex below
                    is_image=False,
                )
            )

    # re-index sequentially (global per page)
    for idx, ch in enumerate(final_chunks):
        ch.chunk_index = idx

    return final_chunks


def create_image_chunks(image_items: List[ImageItem]) -> List[SemanticChunk]:
    """
    Create chunks for images. Each image becomes its own chunk.
    """
    chunks: List[SemanticChunk] = []
    
    # Group images by page
    by_page: Dict[int, List[ImageItem]] = {}
    for img in image_items:
        by_page.setdefault(img.pageNumber, []).append(img)
    
    # Sort images by position (top to bottom, left to right)
    for page_number in sorted(by_page.keys()):
        page_images = by_page[page_number]
        sorted_images = sorted(page_images, key=lambda img: (img.y, img.x))
        
        # Deduplicate images at the same location
        deduplicated_images: List[ImageItem] = []
        position_tolerance = 15.0  # Pixels tolerance for same position
        
        for image in sorted_images:
            is_duplicate = any(
                abs(existing.x + existing.width / 2 - (image.x + image.width / 2)) < position_tolerance and
                abs(existing.y + existing.height / 2 - (image.y + image.height / 2)) < position_tolerance
                for existing in deduplicated_images
            )
            
            if not is_duplicate:
                deduplicated_images.append(image)
        
        # Create a chunk for each unique image
        for img_index, image in enumerate(deduplicated_images):
            chunks.append(
                SemanticChunk(
                    content=f"[Image: {image.obj_name} at position ({int(image.x)}, {int(image.y)}) with dimensions {int(image.width)}x{int(image.height)}]",
                    page_number=image.pageNumber,
                    x_min=image.x,
                    x_max=image.x + image.width,
                    y_min=image.y,
                    y_max=image.y + image.height,
                    chunk_index=0,  # Will be reindexed when merged with text chunks
                    is_image=True,
                )
            )
    
    return chunks


def merge_chunks_in_reading_order(
    text_chunks: List[SemanticChunk],
    image_chunks: List[SemanticChunk],
) -> List[SemanticChunk]:
    """
    Merge text and image chunks in reading order (top to bottom, left to right).
    Re-indexes chunks sequentially.
    """
    # Combine all chunks
    all_chunks = text_chunks + image_chunks
    
    # Sort by page, then by position (y, then x)
    all_chunks.sort(key=lambda c: (c.page_number, c.y_min, c.x_min))
    
    # Re-index sequentially
    for idx, chunk in enumerate(all_chunks):
        chunk.chunk_index = idx
    
    return all_chunks


def create_chunks(
    text_items: List[TextItem],
    image_items: List[ImageItem],
    max_chars: int = 200
) -> Tuple[List[SemanticChunk], int]:
    """
    Create chunks from both text and images, merged in reading order.
    """
    # Group text by page and create text chunks
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

    # Create image chunks
    image_chunks = create_image_chunks(image_items)
    
    # Merge text and image chunks in reading order
    all_chunks = merge_chunks_in_reading_order(text_chunks, image_chunks)

    return all_chunks, pages_processed


# ---------- Lambda handler ----------

def _json_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def handler(event, context):
    """
    Expects API Gateway / Function URL event.
    Body JSON should include:
      - document_id: string
      - pdf_url: string (signed URL from Supabase edge)
      - file_name: optional
      - max_chars: optional (default 200)
    """
    headers = event.get("headers") or {}
    provided = headers.get("x-shared-secret")

    expected = os.environ.get("LAMBDA_SHARED_SECRET")
    if expected and provided != expected:
        return {
            "statusCode": 401,
            "body": json.dumps({ "success": False, "error": "Unauthorized" }),
        }

    try:
        raw_body = event.get("body") or "{}"
        if isinstance(raw_body, str):
            payload = json.loads(raw_body)
        else:
            payload = raw_body

        document_id = payload.get("document_id")
        pdf_url = payload.get("pdf_url")
        file_name = payload.get("file_name")
        max_chars = payload.get("max_chars", 200)

        if not document_id:
            return _json_response(400, {"success": False, "error": "document_id is required"})
        if not pdf_url:
            return _json_response(400, {"success": False, "error": "pdf_url is required"})

        pdf_bytes = download_pdf_bytes(pdf_url)
        text_items = extract_text_items_with_coordinates(pdf_bytes)
        image_items = extract_image_items_with_coordinates(pdf_bytes)

        if not text_items and not image_items:
            return _json_response(422, {"success": False, "error": "No text or images extracted from PDF"})

        chunks, pages_processed = create_chunks(text_items, image_items, max_chars=int(max_chars))

        # return big json payload (edge function can insert into Supabase)
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

    except requests.HTTPError as e:
        return _json_response(502, {"success": False, "error": f"PDF download failed: {str(e)}"})
    except Exception as e:
        return _json_response(500, {"success": False, "error": str(e)})
