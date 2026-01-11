// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface StudyGuideRequest {
	document_id: string;
	course_id?: string;
	user_id?: string;
	detail_level?: "brief" | "detailed";
	force_regenerate?: boolean;
}

interface StudyGuideResponse {
	success: boolean;
	study_guide?: string;
	generated_at?: string;
	based_on_date?: string;
	hot_zones_count?: number;
	total_interactions?: number;
	top_struggle_pages?: number[];
	was_cached?: boolean;
	error?: string;
}

interface HotZone {
	chunk_id: string;
	page_number: number;
	content: string;
	summary: string | null;
	is_image: boolean;
	interactions: number;
	heat_score: number;
}

// ============= PROMPT TEMPLATE =============

const STUDY_GUIDE_PROMPT_TEMPLATE = `
Role: You are a Study Coach for {{course_code}}: {{course_name}}.

Context: You're analyzing the document "{{document_name}}" based on student interaction data from {{date}}. Students have been clicking on specific areas repeatedly, indicating confusion or difficulty.

📊 Hot Zones Detected (areas students clicked most):
{{hot_zones_list}}

Document Statistics:
- Total interactions tracked: {{total_interactions}}
- Number of difficulty hot zones: {{hot_zones_count}}
- Pages with most confusion: {{top_pages}}

Task: Create a focused study guide for today that helps students master these challenging areas.

Format your response as follows:

📚 STUDY GUIDE: {{document_name}}
{{course_code}}: {{course_name}}
Generated: {{date}}

🔥 PRIORITY TOPICS (Most Clicked Areas)

[For each hot zone, explain:]
- What concept is covered
- Why students might be struggling
- What makes this challenging

📖 STUDY STRATEGIES

[Provide specific, actionable strategies for each difficult section:]
- How to approach this material
- Mental models or frameworks to use
- Connections between concepts

🎯 KEY TAKEAWAYS

[Essential concepts from hot zones:]
- Must-know points for understanding
- Common misconceptions to avoid
- Core principles to master

📝 TONIGHT'S FOCUS

[Concrete study actions:]
- Specific pages/sections to revisit
- Practice problems or exercises
- Related materials to reference
- Estimated time for each task

{{detail_instruction}}

Important: Be encouraging, specific to {{course_code}}, and actionable. Help students feel supported while guiding them toward mastery.
`;

const DETAIL_INSTRUCTIONS = {
	brief: "Keep the guide concise (1-2 pages). Focus on the top 3 most challenging areas only.",
	detailed:
		"Provide a comprehensive guide (2-3 pages). Cover all hot zones with detailed strategies, examples, and connections between topics.",
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

function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
	try {
		const payload: StudyGuideRequest = await req.json();
		const {
			document_id,
			user_id,
			detail_level = "detailed",
			force_regenerate = false,
		} = payload;

		if (!document_id) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "document_id is required",
				}),
				{ headers: { "Content-Type": "application/json" }, status: 400 }
			);
		}

		console.log("Generating study guide for document:", document_id);

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

		// Fetch document with course info
		const { data: document, error: docError } = await supabase
			.from("documents")
			.select(
				`
				id,
				file_name,
				total_clicks,
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
			console.error("Error fetching document:", docError);
			throw new Error(`Document not found: ${document_id}`);
		}

		const courseCode =
			`${document.courses.department} ${document.courses.course_number}`.trim() ||
			"Course";
		const courseName = document.courses.title || "Course Materials";
		const documentName = document.file_name || "Document";

		console.log(
			`Study guide for: ${courseCode} - ${courseName} (${documentName})`
		);

		// Check for cached study guide from today (unless force regenerate)
		if (!force_regenerate) {
			const { data: cachedGuide } = await supabase
				.from("chunk_explanations")
				.select("id, explanation, times_viewed, created_at")
				.eq("detail_level", "daily_study_guide")
				.eq("document_name", documentName)
				.eq("course_code", courseCode)
				.gte("created_at", new Date().toISOString().split("T")[0]) // Today
				.order("created_at", { ascending: false })
				.limit(1)
				.single();

			if (cachedGuide) {
				console.log("Returning cached study guide from today");

				// Update times_viewed
				await supabase
					.from("chunk_explanations")
					.update({
						times_viewed: cachedGuide.times_viewed + 1,
						last_accessed_at: new Date().toISOString(),
					})
					.eq("id", cachedGuide.id);

				return new Response(
					JSON.stringify({
						success: true,
						study_guide: cachedGuide.explanation,
						generated_at: cachedGuide.created_at,
						based_on_date: new Date().toISOString().split("T")[0],
						was_cached: true,
					} as StudyGuideResponse),
					{ headers: { "Content-Type": "application/json" }, status: 200 }
				);
			}
		}

		console.log("Generating new study guide...");

		// Get heatmap data using the existing function
		const { data: heatmapData, error: heatmapError } = await supabase.rpc(
			"get_document_heatmap",
			{ p_document_id: document_id }
		);

		if (heatmapError) {
			console.error("Error fetching heatmap:", heatmapError);
			throw new Error("Failed to fetch heatmap data");
		}

		if (!heatmapData || heatmapData.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					study_guide:
						"No student interaction data available yet. Study guide will be generated once students start engaging with this document.",
					generated_at: new Date().toISOString(),
					hot_zones_count: 0,
					total_interactions: 0,
					was_cached: false,
				} as StudyGuideResponse),
				{ headers: { "Content-Type": "application/json" }, status: 200 }
			);
		}

		// Filter to hot zones (heat_score >= 0.8 OR top 5 by interactions)
		const hotZones: HotZone[] = heatmapData
			.filter((chunk: any) => chunk.is_hot_zone === true)
			.map((chunk: any) => ({
				chunk_id: chunk.chunk_id,
				page_number: chunk.page_number,
				content: chunk.content || "",
				summary: chunk.summary || null,
				is_image: chunk.is_image || false,
				interactions: chunk.interactions,
				heat_score: chunk.heat_score,
			}));

		// If no hot zones, take top 5 by interactions
		if (hotZones.length === 0) {
			const topChunks = [...heatmapData]
				.sort((a: any, b: any) => b.interactions - a.interactions)
				.slice(0, 5);
			hotZones.push(
				...topChunks.map((chunk: any) => ({
					chunk_id: chunk.chunk_id,
					page_number: chunk.page_number,
					content: chunk.content || "",
					summary: chunk.summary || null,
					is_image: chunk.is_image || false,
					interactions: chunk.interactions,
					heat_score: chunk.heat_score,
				}))
			);
		}

		// Calculate statistics
		const totalInteractions = heatmapData.reduce(
			(sum: number, chunk: any) => sum + (chunk.interactions || 0),
			0
		);
		const topPages = [
			...new Set(hotZones.map((hz) => hz.page_number)),
		].sort((a, b) => a - b);

		// Build hot zones list for prompt
		const hotZonesList = hotZones
			.map((hz, index) => {
				const contentType = hz.is_image ? "IMAGE/DIAGRAM" : "TEXT";
				const content = hz.is_image
					? hz.summary || "[Image description not available]"
					: hz.content;
				const truncatedContent =
					content.length > 200
						? content.substring(0, 200) + "..."
						: content;

				return `
${index + 1}. Page ${hz.page_number} (${contentType}) - ${hz.interactions} clicks (Heat: ${hz.heat_score})
   Content: ${truncatedContent}
`;
			})
			.join("\n");

		// Generate study guide using Gemini
		const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

		if (!geminiApiKey) {
			// Fallback without AI
			const fallbackGuide = `
📚 STUDY GUIDE: ${documentName}
${courseCode}: ${courseName}
Generated: ${formatDate(new Date())}

Based on ${totalInteractions} student interactions, here are the areas needing focus:

🔥 PRIORITY TOPICS:
${hotZonesList}

📝 RECOMMENDATION:
Focus on pages ${topPages.join(", ")}. These sections have the most student engagement, indicating either high importance or difficulty.

For detailed explanations, click on specific chunks in the document viewer.
`;

			return new Response(
				JSON.stringify({
					success: true,
					study_guide: fallbackGuide,
					generated_at: new Date().toISOString(),
					based_on_date: new Date().toISOString().split("T")[0],
					hot_zones_count: hotZones.length,
					total_interactions: totalInteractions,
					top_struggle_pages: topPages,
					was_cached: false,
				} as StudyGuideResponse),
				{ headers: { "Content-Type": "application/json" }, status: 200 }
			);
		}

		// Generate with AI
		const studyGuide = await generateStudyGuideWithAI(
			courseCode,
			courseName,
			documentName,
			hotZonesList,
			totalInteractions,
			hotZones.length,
			topPages,
			detail_level,
			geminiApiKey
		);

		// Store in chunk_explanations table
		const { data: storedGuide, error: storeError } = await supabase
			.from("chunk_explanations")
			.insert({
				chunk_id: null, // Document-level guide
				document_id: document_id, // Reference to document
				detail_level: "daily_study_guide",
				explanation: studyGuide,
				course_code: courseCode,
				course_name: courseName,
				document_name: documentName,
				page_number: null,
				times_viewed: 1,
				version: 1,
			})
			.select("id, created_at")
			.single();

		if (storeError) {
			console.error("Error storing study guide:", storeError);
			// Continue anyway - not critical
		} else {
			console.log(`Cached new study guide: ${storedGuide?.id}`);
		}

		// Return the study guide
		return new Response(
			JSON.stringify({
				success: true,
				study_guide: studyGuide,
				generated_at: storedGuide?.created_at || new Date().toISOString(),
				based_on_date: new Date().toISOString().split("T")[0],
				hot_zones_count: hotZones.length,
				total_interactions: totalInteractions,
				top_struggle_pages: topPages,
				was_cached: false,
			} as StudyGuideResponse),
			{ headers: { "Content-Type": "application/json" }, status: 200 }
		);
	} catch (error) {
		console.error("Error generating study guide:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error:
					error instanceof Error
						? error.message
						: "An error occurred",
			} as StudyGuideResponse),
			{ headers: { "Content-Type": "application/json" }, status: 500 }
		);
	}
});

// ============= GEMINI API CALL =============

async function generateStudyGuideWithAI(
	courseCode: string,
	courseName: string,
	documentName: string,
	hotZonesList: string,
	totalInteractions: number,
	hotZonesCount: number,
	topPages: number[],
	detailLevel: string,
	apiKey: string
): Promise<string> {
	const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

	const prompt = fillTemplate(STUDY_GUIDE_PROMPT_TEMPLATE, {
		course_code: courseCode,
		course_name: courseName,
		document_name: documentName,
		hot_zones_list: hotZonesList,
		total_interactions: totalInteractions.toString(),
		hot_zones_count: hotZonesCount.toString(),
		top_pages: topPages.join(", "),
		date: formatDate(new Date()),
		detail_instruction:
			DETAIL_INSTRUCTIONS[
				detailLevel as keyof typeof DETAIL_INSTRUCTIONS
			] || DETAIL_INSTRUCTIONS.detailed,
	});

	console.log(`Calling Gemini for study guide generation...`);

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
					maxOutputTokens: detailLevel === "detailed" ? 2048 : 1024,
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
