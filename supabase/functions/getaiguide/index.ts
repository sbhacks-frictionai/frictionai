// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_CONTINUATIONS = 5; // safety guard

// Helper function to format time in seconds to a readable format
function formatTime(seconds: number): string {
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	} else if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.round(seconds % 60);
		return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
	} else {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	}
}

interface GetAIGuideRequest {
	document_id: string;
}

interface GetAIGuideResponse {
	success: boolean;
	study_guide?: string;
	course_code?: string;
	course_name?: string;
	document_name?: string;
	total_chunks?: number;
	error?: string;
}

// CORS headers helper
const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		// Parse request body
		const { document_id }: GetAIGuideRequest = await req.json();

		if (!document_id) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "document_id is required",
				}),
				{
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
					status: 400,
				}
			);
		}

		console.log("Generating study guide prompt for document:", document_id);

		// Initialize Supabase client
		const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
		const supabaseServiceKey = Deno.env.get("WORKER_SECRET_KEY") ?? "";

		if (!supabaseUrl || !supabaseServiceKey) {
			throw new Error("Missing Supabase environment variables");
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		// Fetch document with course info
		const { data: document, error: docError } = await supabase
			.from("documents")
			.select(
				`
				id,
				file_name,
				course_id,
				courses!inner(
					id,
					department,
					course_number,
					title
				)
			`
			)
			.eq("id", document_id)
			.single();

		if (docError || !document) {
			return new Response(
				JSON.stringify({
					success: false,
					error: `Document not found: ${
						docError?.message || "Unknown error"
					}`,
				}),
				{
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
					status: 404,
				}
			);
		}

		const course = document.courses as {
			id: string;
			department: string;
			course_number: string;
			title: string;
		};

		// Fetch all chunks for this document, ordered by page and chunk index
		const { data: chunks, error: chunksError } = await supabase
			.from("chunks")
			.select("*")
			.eq("document_id", document_id)
			.order("page_number", { ascending: true })
			.order("chunk_index", { ascending: true });

		if (chunksError) {
			return new Response(
				JSON.stringify({
					success: false,
					error: `Error fetching chunks: ${chunksError.message}`,
				}),
				{
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
					status: 500,
				}
			);
		}

		if (!chunks || chunks.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "No chunks found for this document",
				}),
				{
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
					status: 404,
				}
			);
		}

		// Fetch page times for this document
		const { data: pageTimes, error: pageTimesError } = await supabase
			.from("page_times")
			.select("page, time_spent")
			.eq("document_id", document_id);

		if (pageTimesError) {
			console.warn("Error fetching page times:", pageTimesError);
			// Continue without page times - not critical
		}

		// Organize page times by page number
		const timeByPage: Record<number, number> = {};
		if (pageTimes) {
			for (const pt of pageTimes) {
				if (pt.page !== null && pt.time_spent !== null) {
					timeByPage[pt.page] = pt.time_spent;
				}
			}
		}

		// Organize chunks by page
		const chunksByPage: Record<number, typeof chunks> = {};
		for (const chunk of chunks) {
			const page = chunk.page_number || 0;
			if (!chunksByPage[page]) {
				chunksByPage[page] = [];
			}
			chunksByPage[page].push(chunk);
		}

		// Build content sections organized by page
		const contentSections: string[] = [];
		for (const pageNum of Object.keys(chunksByPage)
			.map(Number)
			.sort((a, b) => a - b)) {
			const pageChunks = chunksByPage[pageNum];
			const pageContent = pageChunks
				.filter((chunk) => !chunk.is_image && chunk.content)
				.map((chunk) => {
					const clicks = chunk.interactions || 0;
					const clickInfo =
						clicks > 0
							? ` [${clicks} click${clicks !== 1 ? "s" : ""}]`
							: "";
					return `${chunk.content}${clickInfo}`;
				})
				.join("\n\n");

			if (pageContent.trim()) {
				const timeSpent = timeByPage[pageNum];
				const timeInfo = timeSpent
					? ` (${formatTime(timeSpent)} spent)`
					: "";
				contentSections.push(
					`--- Page ${pageNum}${timeInfo} ---\n${pageContent}`
				);
			}
		}

		const fullContent = contentSections.join("\n\n");

		// Build the study guide prompt
		const courseCode = `${course.department} ${course.course_number}`;
		const courseName = course.title;
		const documentName = document.file_name || "Document";

		const prompt = `You are an expert educational content creator specializing in creating comprehensive study guides for academic courses.

COURSE INFORMATION:
- Course Code: ${courseCode}
- Course Name: ${courseName}
- Document: ${documentName}
- Total Pages: ${Object.keys(chunksByPage).length}
- Total Content Chunks: ${chunks.length}

DOCUMENT CONTENT:
The following is the complete text content extracted from the course document, organized by page. Each chunk is followed by [X clicks] indicating how many times students clicked on that content (higher click counts suggest areas of confusion or importance that students found challenging). Each page header shows the total time students spent on that page (higher time indicates more engagement or difficulty):

${fullContent}

TASK:
Create a comprehensive study guide for this ${courseCode} course material. Pay special attention to content with high click counts, as these indicate areas where students struggled or found particularly important. The study guide should:

1. Identify and list the main topics and concepts covered in the material, prioritizing those with higher click counts
2. Extract and define key terms, formulas, theorems, or concepts, with extra emphasis on frequently clicked content
3. Provide a structured summary of the most important points from each major section, highlighting areas that received the most student attention
4. Generate thoughtful study questions that test understanding of the material, especially focusing on concepts that students clicked on most
5. Highlight how different concepts relate to each other, particularly for high-engagement areas

IMPORTANT GUIDELINES:
- Allocate more explanation to areas with high click counts
- Allocate less explanation to areas with low click counts
- Allocate more explanation to pages with higher time spent

FORMATTING GUIDELINES:
- Use clear headings and subheadings
- Organize content logically by topic
- Use bullet points and numbered lists where appropriate
- Include examples when relevant
- Make it easy to scan and review
- Focus on what's most important for understanding and retention
- Do not introduce the study guide's purpose or the fact that it was generated by an AI.
- Only include information as specified in the task.

STYLE:
- Write in a clear, educational tone appropriate for ${courseCode}
- Use terminology consistent with the course material
- Be comprehensive
- Prioritize clarity and usefulness for students studying this material

OUTPUT CONSTRAINTS:
- Use plain text only. No markdown, no html, no code, no code blocks, no code snippets, no code examples.
- Limit the study guide to at most 8 major sections.
- Each section should be concise and focused.
- Do not use *, -, #, or bullet formatting.
- Use numbered sections and indented paragraphs instead.
- The entire response must fit within a single output.
- If the content cannot fit within the output limit, stop at a clean section boundary and write "CONTINUE" on the final line.

Generate the study guide now:`;

		// Generate study guide using Gemini
		const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

		if (!geminiApiKey) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "GEMINI_API_KEY not configured",
				} as GetAIGuideResponse),
				{
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
					status: 500,
				}
			);
		}

		// Call Gemini API to generate the study guide
		const studyGuide = await generateStudyGuideWithContinuation(
			prompt,
			geminiApiKey
		);

		return new Response(
			JSON.stringify({
				success: true,
				study_guide: studyGuide,
				course_code: courseCode,
				course_name: courseName,
				document_name: documentName,
				total_chunks: chunks.length,
			} as GetAIGuideResponse),
			{
				headers: {
					...corsHeaders,
					"Content-Type": "application/json",
				},
			}
		);
	} catch (error) {
		console.error("Error in getaiguide function:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			} as GetAIGuideResponse),
			{
				headers: {
					...corsHeaders,
					"Content-Type": "application/json",
				},
				status: 500,
			}
		);
	}
});

// ============= GEMINI API CALL =============

async function generateStudyGuideWithGemini(
	prompt: string,
	apiKey: string
): Promise<string> {
	const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

	console.log("Calling Gemini API to generate study guide...");

	try {
		const response = await fetch(geminiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [{ text: prompt }],
					},
				],
				generationConfig: {
					temperature: 0.7,
					topK: 40,
					topP: 0.95,
					maxOutputTokens: 4096, // Longer output for comprehensive study guides
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
		const studyGuide = result.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!studyGuide) {
			throw new Error("No study guide generated by Gemini");
		}

		return studyGuide;
	} catch (error) {
		console.error("Error calling Gemini API:", error);
		throw new Error(
			`Failed to generate study guide: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
	}
}

async function generateStudyGuideWithContinuation(
	initialPrompt: string,
	apiKey: string
): Promise<string> {
	let fullText = "";
	let prompt = initialPrompt;

	for (let i = 0; i < MAX_CONTINUATIONS; i++) {
		const chunk = await generateStudyGuideWithGemini(prompt, apiKey);

		if (!chunk || !chunk.trim()) {
			break;
		}

		fullText += (fullText ? "\n\n" : "") + chunk.trim();

		// Check for continuation signal
		if (!chunk.trim().endsWith("CONTINUE")) {
			return fullText;
		}

		// Prepare continuation prompt
		const tail = fullText.slice(-1500); // give model context, not everything

		prompt = `
Continue exactly where you left off.
Do NOT repeat any earlier content.
Resume at the next heading or bullet.
Do NOT reintroduce the study guide.
Do NOT summarize.
When finished, end with DONE.
If you need more space, end with CONTINUE.

Last generated text:
"""
${tail}
"""
`.trim();
	}

	throw new Error("Study guide generation exceeded continuation limit");
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/getaiguide' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"document_id":"your-document-uuid-here"}'

*/
