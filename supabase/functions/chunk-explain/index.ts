// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ChunkExplainRequest {
	chunk_id: string;
	user_id?: string;
	context_radius?: number;
	detail_level?: "brief" | "detailed" | "comprehensive";
}

interface CourseInfo {
	id: string;
	department: string;
	course_number: string;
	title: string;
}

interface ChunkExplainResponse {
	success: boolean;
	explanation?: string;
	chunk_type?: "text" | "image";
	is_image?: boolean;
	related_chunks?: string[];
	page_number?: number;
	course_context?: string;
	was_cached?: boolean;
	times_viewed?: number;
	error?: string;
}

// ============= PROMPT TEMPLATES =============

const SYSTEM_PROMPT_TEMPLATE = `
Role: You are a Teaching Assistant for {{course_code}}: {{course_name}}.

Context: You are analyzing course materials (lecture slides, textbooks, readings) to help students understand specific content they've selected.

Your Goal: Provide clear, accurate explanations that help students deeply understand the material in the context of {{course_code}}.

Guidelines:
1. Use terminology and concepts appropriate for {{course_code}}
2. Break down complex ideas into understandable components
3. Define technical terms and jargon in context
4. Connect the selected content to the surrounding material
5. Provide relevant examples or analogies when helpful
6. Focus on what matters for understanding this specific course
7. Be encouraging and supportive of student learning

Accuracy Rules:
- Only explain what is actually present in the content
- Do not introduce information not relevant to {{course_name}}
- If the content references course-specific concepts, explain them in that context
- Use the surrounding context to show how ideas connect
- If something is unclear, acknowledge it rather than speculate
`;

const USER_PROMPT_TEMPLATE = `
Course: {{course_code}} - {{course_name}}
Document: {{document_name}}
Page: {{page_number}}

Below is content from the course materials. The student clicked on the SELECTED CHUNK (marked with >>>) for more explanation. Use the surrounding context to understand how it fits into the broader material.

{{full_context}}

Task: {{detail_instruction}}

Focus on:
1. What are the key concepts in the selected chunk?
2. How does this relate to the surrounding material?
3. What terminology or ideas might need clarification?
4. What should the student pay attention to for understanding this topic?

Provide your explanation in a clear, educational tone appropriate for this course level.
`;

const IMAGE_PROMPT_TEMPLATE = `
Course: {{course_code}} - {{course_name}}
Document: {{document_name}}
Page: {{page_number}}

The student clicked on an IMAGE/DIAGRAM in the lecture materials for more explanation. Below is the visual content description along with surrounding context.

{{full_context}}

Task: {{detail_instruction}}

Focus on:
1. What does this visual represent in the context of {{course_code}}?
2. What are the key elements or components shown?
3. How does this visual aid understanding of the course concepts?
4. What connections exist between this visual and the surrounding text?
5. What should students pay special attention to in this diagram/image?

Provide your explanation in a clear, educational tone. Start with "🖼️ Image Analysis" or "📊 Diagram Explanation" to indicate this is visual content.
`;

// Detail level instructions
const DETAIL_INSTRUCTIONS = {
	brief: "Provide a concise 2-3 sentence explanation focusing on the main concept.",
	detailed:
		"Provide a thorough explanation (1-2 paragraphs) that breaks down key concepts, clarifies terminology, and shows how this relates to the surrounding content.",
	comprehensive:
		"Provide an in-depth educational explanation covering key concepts, background context, relevant examples, connections to related ideas, and practical applications or implications.",
};

// ============= UTILITIES =============

function fillTemplate(
	template: string,
	variables: Record<string, string>
): string {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		result = result.replaceAll(placeholder, value || "");
	}
	return result;
}

// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
	try {
		const payload: ChunkExplainRequest = await req.json();
		const {
			chunk_id,
			user_id,
			context_radius = 2,
			detail_level = "detailed",
		} = payload;

		if (!chunk_id) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "chunk_id is required",
				}),
				{ headers: { "Content-Type": "application/json" }, status: 400 }
			);
		}

		console.log("Generating explanation for chunk:", chunk_id);

		// Initialize Supabase client
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

		// Fetch chunk with course info (single joined query)
		const { data: targetChunk, error: chunkError } = await supabase
			.from("chunks")
			.select(
				`
				id,
				document_id,
				page_number,
				content,
				summary,
				is_image,
				chunk_index,
				interactions,
				documents!inner(
					id,
					file_name,
					courses!inner(
						id,
						department,
						course_number,
						title
					)
				)
			`
			)
			.eq("id", chunk_id)
			.single();

		if (chunkError || !targetChunk) {
			console.error("Error fetching chunk:", chunkError);
			throw new Error(`Chunk not found: ${chunk_id}`);
		}

		// Extract course information
		const courseInfo: CourseInfo = {
			id: targetChunk.documents.courses.id,
			department: targetChunk.documents.courses.department || "",
			course_number: targetChunk.documents.courses.course_number || "",
			title: targetChunk.documents.courses.title || "",
		};

		const courseCode =
			`${courseInfo.department} ${courseInfo.course_number}`.trim() ||
			"Course";
		const documentName = targetChunk.documents.file_name || "document";

		// Detect chunk type
		const isImage = targetChunk.is_image === true;
		const chunkType: "text" | "image" = isImage ? "image" : "text";
		const chunkContent = isImage
			? targetChunk.summary || "[Image with no description available]"
			: targetChunk.content || "";

		console.log(
			`Explaining ${chunkType} chunk for: ${courseCode} - ${courseInfo.title}`
		);

		// Check cache first
		const { data: cachedExplanation } = await supabase
			.from("chunk_explanations")
			.select("id, explanation, times_viewed")
			.eq("chunk_id", chunk_id)
			.eq("detail_level", detail_level)
			.eq("version", 1)
			.single();

		if (cachedExplanation) {
			console.log(`Cache hit for chunk ${chunk_id} (${detail_level})`);

			// Update access stats
			await supabase
				.from("chunk_explanations")
				.update({
					times_viewed: cachedExplanation.times_viewed + 1,
					last_accessed_at: new Date().toISOString(),
				})
				.eq("id", cachedExplanation.id);

			// Track the interaction using atomic increment function
			if (user_id) {
				await supabase.rpc("increment_chunk_interaction", {
					p_chunk_id: chunk_id,
					p_user_id: user_id,
					p_page_number: targetChunk.page_number,
				});
			}

			// Get related chunks for response
			const { data: contextChunks } = await supabase
				.from("chunks")
				.select("id, page_number")
				.eq("document_id", targetChunk.document_id)
				.eq("page_number", targetChunk.page_number)
				.order("chunk_index", { ascending: true });

			return new Response(
				JSON.stringify({
					success: true,
					explanation: cachedExplanation.explanation,
					chunk_type: chunkType,
					is_image: isImage,
					chunk_content: chunkContent,
					related_chunks:
						contextChunks
							?.map((c) => c.id)
							.filter((id) => id !== chunk_id) || [],
					page_number: targetChunk.page_number,
					course_context: `${courseCode}: ${courseInfo.title}`,
					was_cached: true,
					times_viewed: cachedExplanation.times_viewed + 1,
				} as ChunkExplainResponse),
				{ headers: { "Content-Type": "application/json" }, status: 200 }
			);
		}

		console.log(
			`Cache miss for chunk ${chunk_id} (${detail_level}) - generating new explanation`
		);

		// Fetch surrounding chunks for context
		const { data: contextChunks } = await supabase
			.from("chunks")
			.select("id, content, summary, is_image, chunk_index, page_number")
			.eq("document_id", targetChunk.document_id)
			.gte("page_number", Math.max(1, targetChunk.page_number - 1))
			.lte("page_number", targetChunk.page_number + 1)
			.order("page_number", { ascending: true })
			.order("chunk_index", { ascending: true });

		// Filter to context radius
		const targetIndex = targetChunk.chunk_index || 0;
		const relevantChunks =
			contextChunks?.filter((chunk) => {
				if (chunk.page_number !== targetChunk.page_number) return true;
				const chunkIdx = chunk.chunk_index || 0;
				return Math.abs(chunkIdx - targetIndex) <= context_radius;
			}) || [];

		// Build full context string
		const fullContext = relevantChunks
			.map((chunk) => {
				const isTarget = chunk.id === chunk_id;
				const isChunkImage = chunk.is_image === true;
				const chunkContentText = isChunkImage
					? chunk.summary || "[Image with no description]"
					: chunk.content || "";

				if (isTarget) {
					const marker = isImage ? "IMAGE/DIAGRAM" : "TEXT";
					return `>>> SELECTED ${marker} (Page ${chunk.page_number}) >>>\n${chunkContentText}\n<<< END SELECTED ${marker} <<<`;
				}

				const contextLabel = isChunkImage
					? "Context - Image"
					: "Context";
				return `${contextLabel} (Page ${chunk.page_number}):\n${chunkContentText}`;
			})
			.join("\n\n---\n\n");

		// Generate explanation using Gemini
		const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

		if (!geminiApiKey) {
			// Fallback without AI
			const fallbackPrefix = isImage
				? "Image content:\n\n"
				: "Selected content:\n\n";
			return new Response(
				JSON.stringify({
					success: true,
					explanation: `${fallbackPrefix}${chunkContent}\n\nFrom: ${documentName} (Page ${targetChunk.page_number})\nCourse: ${courseCode} - ${courseInfo.title}`,
					chunk_type: chunkType,
					is_image: isImage,
					related_chunks: relevantChunks
						.map((c) => c.id)
						.filter((id) => id !== chunk_id),
					page_number: targetChunk.page_number,
					course_context: `${courseCode}: ${courseInfo.title}`,
				}),
				{ headers: { "Content-Type": "application/json" }, status: 200 }
			);
		}

		const explanation = await generateExplanation(
			courseCode,
			courseInfo.title,
			documentName,
			targetChunk.page_number,
			fullContext,
			detail_level,
			chunkType,
			geminiApiKey
		);

		// Store explanation in cache for future use
		const { data: storedExplanation, error: cacheError } = await supabase
			.from("chunk_explanations")
			.insert({
				chunk_id,
				detail_level,
				explanation,
				course_code: courseCode,
				course_name: courseInfo.title,
				document_name: documentName,
				times_viewed: 1,
				version: 1,
			})
			.select("id")
			.single();

		if (cacheError) {
			console.error("Error caching explanation:", cacheError);
			// Continue anyway - not critical
		} else {
			console.log(`Cached new explanation: ${storedExplanation?.id}`);
		}

		// Track the interaction using atomic increment function
		if (user_id) {
			await supabase.rpc("increment_chunk_interaction", {
				p_chunk_id: chunk_id,
				p_user_id: user_id,
				p_page_number: targetChunk.page_number,
			});
		}

		// Return the explanation
		return new Response(
			JSON.stringify({
				success: true,
				explanation,
				chunk_type: chunkType,
				is_image: isImage,
				chunk_content: chunkContent,
				related_chunks: relevantChunks
					.map((c) => c.id)
					.filter((id) => id !== chunk_id),
				page_number: targetChunk.page_number,
				course_context: `${courseCode}: ${courseInfo.title}`,
				was_cached: false,
				times_viewed: 1,
			} as ChunkExplainResponse),
			{ headers: { "Content-Type": "application/json" }, status: 200 }
		);
	} catch (error) {
		console.error("Error generating explanation:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "An error occurred",
			} as ChunkExplainResponse),
			{ headers: { "Content-Type": "application/json" }, status: 500 }
		);
	}
});

// ============= GEMINI API CALL =============

async function generateExplanation(
	courseCode: string,
	courseName: string,
	documentName: string,
	pageNumber: number,
	fullContext: string,
	detailLevel: string,
	chunkType: "text" | "image",
	apiKey: string
): Promise<string> {
	const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

	// Fill templates
	const systemPrompt = fillTemplate(SYSTEM_PROMPT_TEMPLATE, {
		course_code: courseCode,
		course_name: courseName,
	});

	// Choose appropriate user prompt template based on chunk type
	const userPromptTemplate =
		chunkType === "image" ? IMAGE_PROMPT_TEMPLATE : USER_PROMPT_TEMPLATE;

	const userPrompt = fillTemplate(userPromptTemplate, {
		course_code: courseCode,
		course_name: courseName,
		document_name: documentName,
		page_number: pageNumber.toString(),
		full_context: fullContext,
		detail_instruction:
			DETAIL_INSTRUCTIONS[
				detailLevel as keyof typeof DETAIL_INSTRUCTIONS
			] || DETAIL_INSTRUCTIONS.detailed,
	});

	const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

	console.log(`Calling Gemini for ${courseCode} (${chunkType} chunk)`);

	try {
		const response = await fetch(geminiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [{ text: fullPrompt }],
					},
				],
				generationConfig: {
					temperature: 0.7,
					topK: 40,
					topP: 0.95,
					maxOutputTokens:
						detailLevel === "comprehensive" ? 1536 : 1024,
				},
				safetySettings: [
					{
						category: "HARM_CATEGORY_HARASSMENT",
						threshold: "BLOCK_MEDIUM_AND_ABOVE",
					},
					{
						category: "HARM_CATEGORY_HATE_SPEECH",
						threshold: "BLOCK_MEDIUM_AND_ABOVE",
					},
					{
						category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
						threshold: "BLOCK_MEDIUM_AND_ABOVE",
					},
					{
						category: "HARM_CATEGORY_DANGEROUS_CONTENT",
						threshold: "BLOCK_MEDIUM_AND_ABOVE",
					},
				],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Gemini API error:", errorText);
			throw new Error(`Gemini API request failed: ${response.status}`);
		}

		const result = await response.json();
		const explanation = result.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!explanation) {
			throw new Error("No explanation generated by Gemini");
		}

		return explanation;
	} catch (error) {
		console.error("Error calling Gemini API:", error);
		throw new Error(
			`Failed to generate explanation: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
}
