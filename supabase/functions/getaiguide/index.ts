// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface GetAIGuideRequest {
	document_id: string;
}

interface GetAIGuideResponse {
	success: boolean;
	prompt?: string;
	course_code?: string;
	course_name?: string;
	document_name?: string;
	total_chunks?: number;
	error?: string;
}

Deno.serve(async (req) => {
	try {
		// Parse request body
		const { document_id }: GetAIGuideRequest = await req.json();

		if (!document_id) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "document_id is required",
				}),
				{ headers: { "Content-Type": "application/json" }, status: 400 }
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
				{ headers: { "Content-Type": "application/json" }, status: 404 }
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
				{ headers: { "Content-Type": "application/json" }, status: 500 }
			);
		}

		if (!chunks || chunks.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "No chunks found for this document",
				}),
				{ headers: { "Content-Type": "application/json" }, status: 404 }
			);
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
				.map((chunk) => chunk.content)
				.join("\n\n");

			if (pageContent.trim()) {
				contentSections.push(`--- Page ${pageNum} ---\n${pageContent}`);
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
The following is the complete text content extracted from the course document, organized by page:

${fullContent}

TASK:
Create a comprehensive study guide for this ${courseCode} course material. The study guide should:

1. **Key Concepts & Topics**: Identify and list the main topics and concepts covered in the material
2. **Important Definitions**: Extract and define key terms, formulas, theorems, or concepts
3. **Main Points Summary**: Provide a structured summary of the most important points from each major section
4. **Study Questions**: Generate thoughtful study questions that test understanding of the material
5. **Connections**: Highlight how different concepts relate to each other
6. **Practice Recommendations**: Suggest what students should focus on for effective studying

FORMATTING GUIDELINES:
- Use clear headings and subheadings
- Organize content logically by topic
- Use bullet points and numbered lists where appropriate
- Include examples when relevant
- Make it easy to scan and review
- Focus on what's most important for understanding and retention

STYLE:
- Write in a clear, educational tone appropriate for ${courseCode}
- Use terminology consistent with the course material
- Be concise but comprehensive
- Prioritize clarity and usefulness for students studying this material

Generate the study guide now:`;

		return new Response(
			JSON.stringify({
				success: true,
				prompt,
				course_code: courseCode,
				course_name: courseName,
				document_name: documentName,
				total_chunks: chunks.length,
			} as GetAIGuideResponse),
			{ headers: { "Content-Type": "application/json" } }
		);
	} catch (error) {
		console.error("Error in getaiguide function:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			} as GetAIGuideResponse),
			{
				headers: { "Content-Type": "application/json" },
				status: 500,
			}
		);
	}
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/getaiguide' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"document_id":"your-document-uuid-here"}'

*/
