// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ChunkProcessRequest {
	document_id: string;
	bucket_path: string;
	file_name: string;
}

interface TextItem {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	pageNumber: number;
}

interface SemanticChunk {
	content: string;
	page_number: number;
	x_min: number;
	x_max: number;
	y_min: number;
	y_max: number;
	chunk_index: number;
	embedding?: number[];
}

Deno.serve(async (req) => {
	try {
		// Parse the request body
		const payload: ChunkProcessRequest = await req.json();

		console.log("Processing chunks for document:", {
			document_id: payload.document_id,
			file_name: payload.file_name,
		});

		const { document_id, bucket_path, file_name } = payload;

		if (!document_id) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "document_id is required",
				}),
				{
					headers: { "Content-Type": "application/json" },
					status: 400,
				}
			);
		}

		// Create Supabase client
		const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
		const supabaseServiceKey =
			Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
			Deno.env.get("SUPABASE_ANON_KEY") ??
			"";

		if (!supabaseUrl || !supabaseServiceKey) {
			throw new Error("Missing Supabase environment variables");
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		// Step 1: Download PDF from storage
		console.log("Downloading PDF from storage...");
		const { data: pdfData, error: downloadError } = await supabase.storage
			.from("documents")
			.download(bucket_path);

		if (downloadError || !pdfData) {
			console.error("Error downloading PDF:", downloadError);
			throw new Error(
				`Failed to download PDF: ${downloadError?.message}`
			);
		}

		// Convert blob to array buffer for PDF processing
		const pdfArrayBuffer = await pdfData.arrayBuffer();
		const pdfBytes = new Uint8Array(pdfArrayBuffer);

		// Step 2: Parse PDF and extract text with coordinates
		console.log("Parsing PDF...");
		const textItems = await parsePDFWithCoordinates(pdfBytes);

		if (textItems.length === 0) {
			throw new Error("No text extracted from PDF");
		}

		console.log(`Extracted ${textItems.length} text items from PDF`);

		// Step 3: Group text items by page
		const textByPage = new Map<number, TextItem[]>();
		for (const item of textItems) {
			if (!textByPage.has(item.pageNumber)) {
				textByPage.set(item.pageNumber, []);
			}
			textByPage.get(item.pageNumber)!.push(item);
		}

		// Step 4: Create semantic chunks for each page
		const allChunks: SemanticChunk[] = [];
		const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

		for (const [pageNumber, items] of textByPage.entries()) {
			console.log(
				`Processing page ${pageNumber} with ${items.length} text items`
			);

			// Sort items by reading order (top to bottom, left to right)
			const sortedItems = items.sort((a, b) => {
				const yDiff = a.y - b.y;
				if (Math.abs(yDiff) > 10) {
					// Different lines
					return yDiff;
				}
				// Same line, sort by x
				return a.x - b.x;
			});

			// Get page dimensions (assume standard PDF size if not available)
			const pageWidth = Math.max(...items.map((i) => i.x + i.width), 612); // Default: 8.5" at 72 DPI
			const pageHeight = Math.max(
				...items.map((i) => i.y + i.height),
				792
			); // Default: 11" at 72 DPI

			// Create semantic chunks using OpenAI embeddings for semantic boundaries
			const pageChunks = await createSemanticChunks(
				sortedItems,
				pageNumber,
				pageWidth,
				pageHeight,
				openaiApiKey
			);

			allChunks.push(...pageChunks);
		}

		console.log(`Created ${allChunks.length} semantic chunks`);

		// Step 5: Generate embeddings for all chunks (for semantic search)
		if (openaiApiKey) {
			console.log("Generating embeddings for chunks...");
			await generateEmbeddings(allChunks, openaiApiKey);
		}

		// Step 6: Calculate page dimensions from chunks
		const pageDimensions = new Map<
			number,
			{ width: number; height: number }
		>();
		for (const chunk of allChunks) {
			if (!pageDimensions.has(chunk.page_number)) {
				pageDimensions.set(chunk.page_number, {
					width: chunk.x_max,
					height: chunk.y_max,
				});
			} else {
				const dims = pageDimensions.get(chunk.page_number)!;
				dims.width = Math.max(dims.width, chunk.x_max);
				dims.height = Math.max(dims.height, chunk.y_max);
			}
		}

		// Step 7: Insert chunks into database
		const chunksToInsert = allChunks.map((chunk) => {
			const pageDims = pageDimensions.get(chunk.page_number) || {
				width: chunk.x_max,
				height: chunk.y_max,
			};

			// Prepare embedding - check if vector extension is available
			// If embedding exists, format it properly for vector type or text
			let embeddingValue: string | number[] | null = null;
			if (chunk.embedding && chunk.embedding.length > 0) {
				// Format as array string for vector type: '[0.1, 0.2, ...]'
				embeddingValue = `[${chunk.embedding.join(",")}]`;
			}

			return {
				document_id,
				page_number: chunk.page_number,
				content: chunk.content,
				summary: null, // Leave blank - will be filled by chunk-summary function
				x_min: chunk.x_min,
				x_max: chunk.x_max,
				y_min: chunk.y_min,
				y_max: chunk.y_max,
				chunk_index: chunk.chunk_index,
				page_width: pageDims.width,
				page_height: pageDims.height,
				bounding_box: {
					x: chunk.x_min,
					y: chunk.y_min,
					width: chunk.x_max - chunk.x_min,
					height: chunk.y_max - chunk.y_min,
				},
				interactions: 0,
				embedding: embeddingValue,
			};
		});

		// Insert chunks in batches to avoid payload size issues
		const batchSize = 50;
		const allInsertedChunks: any[] = [];

		for (let i = 0; i < chunksToInsert.length; i += batchSize) {
			const batch = chunksToInsert.slice(i, i + batchSize);
			const { data: chunksData, error: insertError } = await supabase
				.from("chunks")
				.insert(batch)
				.select();

			if (insertError) {
				console.error(
					`Error inserting chunk batch ${i / batchSize + 1}:`,
					insertError
				);
				throw insertError;
			}

			if (chunksData) {
				allInsertedChunks.push(...chunksData);
			}
		}

		const chunksData = allInsertedChunks;

		console.log(`Successfully inserted ${chunksData?.length || 0} chunks`);

		// Return success response with chunk IDs
		const data = {
			success: true,
			message: `Processed chunks for document: ${document_id}`,
			document_id,
			chunks_created: chunksData?.length || 0,
			pages_processed: textByPage.size,
			chunks: chunksData,
		};

		return new Response(JSON.stringify(data), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		});
	} catch (error) {
		console.error("Error processing chunks:", error);

		return new Response(
			JSON.stringify({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "An error occurred",
			}),
			{
				headers: { "Content-Type": "application/json" },
				status: 500,
			}
		);
	}
});

// Parse PDF and extract text with coordinates
async function parsePDFWithCoordinates(
	pdfBytes: Uint8Array
): Promise<TextItem[]> {
	try {
		// Use unpdf - a Deno-compatible PDF parsing library
		// It's designed for serverless/edge environments
		const { getDocumentProxy } = await import("https://esm.sh/unpdf");

		// Load the PDF document
		const pdf = await getDocumentProxy(pdfBytes);
		const numPages = pdf.numPages;

		console.log(`PDF has ${numPages} pages`);

		const textItems: TextItem[] = [];

		// Process each page
		for (let pageNum = 1; pageNum <= numPages; pageNum++) {
			const page = await pdf.getPage(pageNum);
			const viewport = page.getViewport({ scale: 1.0 });
			const textContent = await page.getTextContent();

			// Extract text items with coordinates
			for (const item of textContent.items) {
				if (item.str && item.transform) {
					// Transform matrix: [a, b, c, d, e, f]
					// e = x translation, f = y translation
					const x = item.transform[4];
					const y = item.transform[5];

					// Calculate width and height from transform or use defaults
					const width =
						item.width || Math.abs(item.transform[0]) || 10;
					const height =
						item.height || Math.abs(item.transform[3]) || 10;

					// Convert Y coordinate (PDF origin is bottom-left, we want top-left)
					const pageHeight = viewport.height;
					const flippedY = pageHeight - y;

					textItems.push({
						text: item.str.trim(),
						x: Math.round(x * 100) / 100, // Round to 2 decimals
						y: Math.round(flippedY * 100) / 100,
						width: Math.round(width * 100) / 100,
						height: Math.round(height * 100) / 100,
						pageNumber: pageNum,
					});
				}
			}
		}

		console.log(`Extracted ${textItems.length} text items from PDF`);
		return textItems;
	} catch (error) {
		console.error("Error parsing PDF with unpdf:", error);

		// Fallback: If unpdf fails, try a simpler text extraction approach
		// For now, throw with helpful error message
		throw new Error(
			`PDF parsing failed: ${
				error instanceof Error ? error.message : "Unknown error"
			}. ` + `Make sure the PDF is valid and contains extractable text.`
		);
	}
}

// Create semantic chunks by sentences, ideas, and bullet points
// Goal: Small, granular chunks that users can click on for specific confusion points
async function createSemanticChunks(
	textItems: TextItem[],
	pageNumber: number,
	pageWidth: number,
	pageHeight: number,
	openaiApiKey?: string
): Promise<SemanticChunk[]> {
	const chunks: SemanticChunk[] = [];
	let chunkIndex = 0;

	// First, group text items into lines (items on the same Y coordinate)
	const lines: TextItem[][] = [];
	let currentLine: TextItem[] = [];
	let currentLineY = -1;
	const lineTolerance = 5; // Pixels tolerance for same line

	for (const item of textItems) {
		if (
			currentLine.length === 0 ||
			Math.abs(item.y - currentLineY) > lineTolerance
		) {
			// New line
			if (currentLine.length > 0) {
				lines.push(currentLine);
			}
			currentLine = [item];
			currentLineY = item.y;
		} else {
			// Same line, add to current line
			currentLine.push(item);
		}
	}
	if (currentLine.length > 0) {
		lines.push(currentLine);
	}

	// Now process lines to create chunks
	let currentChunk: {
		texts: TextItem[];
		xMin: number;
		xMax: number;
		yMin: number;
		yMax: number;
	} = {
		texts: [],
		xMin: Infinity,
		xMax: -Infinity,
		yMin: Infinity,
		yMax: -Infinity,
	};

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx];
		const lineText = line
			.map((t) => t.text)
			.join(" ")
			.trim();
		const combinedText = currentChunk.texts
			.map((t) => t.text)
			.join(" ")
			.trim();

		// Detect chunk boundaries:
		// 1. Bullet points (•, -, *, numbers like "1.", "2.", etc.)
		const isBulletPoint =
			/^[•\-\*]\s/.test(lineText) ||
			/^\d+[\.\)]\s/.test(lineText) ||
			/^[a-z][\.\)]\s/i.test(lineText);

		// 2. Sentence endings (period, exclamation, question mark followed by space and capital)
		const endsSentence = /[.!?]\s+[A-Z]/.test(
			combinedText + " " + lineText
		);

		// 3. Large vertical gaps (paragraph breaks)
		const isParagraphBreak =
			lineIdx > 0 &&
			lines[lineIdx - 1].length > 0 &&
			Math.abs(
				line[0].y -
					(lines[lineIdx - 1][lines[lineIdx - 1].length - 1].y +
						lines[lineIdx - 1][lines[lineIdx - 1].length - 1]
							.height)
			) >
				line[0].height * 2;

		// 4. Maximum chunk size (keep chunks small - max 2-3 sentences)
		const newText = combinedText + " " + lineText;
		const exceedsMaxSize = newText.length > 200; // Small chunks for specific confusion points

		// Start a new chunk if we hit a boundary
		const shouldStartNewChunk =
			currentChunk.texts.length > 0 &&
			(isBulletPoint ||
				endsSentence ||
				isParagraphBreak ||
				exceedsMaxSize);

		if (shouldStartNewChunk) {
			// Save current chunk
			if (combinedText.length > 0) {
				chunks.push({
					content: combinedText,
					page_number: pageNumber,
					x_min: currentChunk.xMin,
					x_max: currentChunk.xMax,
					y_min: currentChunk.yMin,
					y_max: currentChunk.yMax,
					chunk_index: chunkIndex++,
				});
			}

			// Start new chunk
			currentChunk = {
				texts: [],
				xMin: Infinity,
				xMax: -Infinity,
				yMin: Infinity,
				yMax: -Infinity,
			};
		}

		// Add line items to current chunk
		for (const item of line) {
			currentChunk.texts.push(item);
			currentChunk.xMin = Math.min(currentChunk.xMin, item.x);
			currentChunk.xMax = Math.max(
				currentChunk.xMax,
				item.x + item.width
			);
			currentChunk.yMin = Math.min(currentChunk.yMin, item.y);
			currentChunk.yMax = Math.max(
				currentChunk.yMax,
				item.y + item.height
			);
		}
	}

	// Add final chunk
	if (currentChunk.texts.length > 0) {
		const finalText = currentChunk.texts
			.map((t) => t.text)
			.join(" ")
			.trim();
		if (finalText.length > 0) {
			chunks.push({
				content: finalText,
				page_number: pageNumber,
				x_min: currentChunk.xMin,
				x_max: currentChunk.xMax,
				y_min: currentChunk.yMin,
				y_max: currentChunk.yMax,
				chunk_index: chunkIndex,
			});
		}
	}

	// Post-process: Split any remaining large chunks by sentences
	const finalChunks: SemanticChunk[] = [];
	for (const chunk of chunks) {
		// If chunk is still too long, split by sentences
		if (chunk.content.length > 200) {
			const sentences = chunk.content.split(/([.!?]\s+)/);
			let sentenceChunk = "";
			let sentenceIndex = 0;

			for (let i = 0; i < sentences.length; i += 2) {
				const sentence = sentences[i] + (sentences[i + 1] || "");
				sentenceChunk += sentence;

				// Create chunk for 1-2 sentences
				if (
					sentenceChunk.length > 100 ||
					/[.!?]\s+$/.test(sentenceChunk)
				) {
					if (sentenceChunk.trim().length > 0) {
						// Estimate coordinates for this sentence chunk
						// (simplified - in production you'd want more precise mapping)
						const chunkRatio =
							sentenceIndex / (sentences.length / 2);
						finalChunks.push({
							content: sentenceChunk.trim(),
							page_number: chunk.page_number,
							x_min: chunk.x_min,
							x_max: chunk.x_max,
							y_min:
								chunk.y_min +
								(chunk.y_max - chunk.y_min) * chunkRatio,
							y_max:
								chunk.y_min +
								(chunk.y_max - chunk.y_min) *
									(chunkRatio + 0.5),
							chunk_index: chunk.chunk_index + sentenceIndex++,
						});
					}
					sentenceChunk = "";
				}
			}

			// Add remaining text
			if (sentenceChunk.trim().length > 0) {
				finalChunks.push({
					...chunk,
					content: sentenceChunk.trim(),
					chunk_index: chunk.chunk_index + sentenceIndex,
				});
			}
		} else {
			finalChunks.push(chunk);
		}
	}

	// Re-index chunks to ensure sequential ordering
	return finalChunks.map((chunk, idx) => ({
		...chunk,
		chunk_index: idx,
	}));
}

// Generate embeddings for chunks using OpenAI
async function generateEmbeddings(
	chunks: SemanticChunk[],
	openaiApiKey: string
): Promise<void> {
	const openaiUrl = "https://api.openai.com/v1/embeddings";
	const model = "text-embedding-3-small"; // or "text-embedding-ada-002"

	// Process in batches to avoid rate limits
	const batchSize = 10;
	for (let i = 0; i < chunks.length; i += batchSize) {
		const batch = chunks.slice(i, i + batchSize);
		const texts = batch.map((chunk) => chunk.content);

		try {
			const response = await fetch(openaiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${openaiApiKey}`,
				},
				body: JSON.stringify({
					input: texts,
					model: model,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`OpenAI API error: ${errorText}`);
				continue; // Skip this batch but continue processing
			}

			const data = await response.json();
			const embeddings = data.data;

			// Assign embeddings to chunks
			for (let j = 0; j < batch.length && j < embeddings.length; j++) {
				batch[j].embedding = embeddings[j].embedding;
			}
		} catch (error) {
			console.error(`Error generating embeddings for batch ${i}:`, error);
			// Continue without embeddings for this batch
		}
	}
}
