// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ChunkSummaryRequest {
	chunk_ids: string[]; // Array of chunk IDs to summarize
	document_id: string;
}

Deno.serve(async (req) => {
	try {
		// Parse the request body
		const payload: ChunkSummaryRequest = await req.json();

		console.log("Generating summaries for chunks:", {
			document_id: payload.document_id,
			chunk_count: payload.chunk_ids?.length || 0,
		});

		const { chunk_ids, document_id } = payload;

		if (!chunk_ids || chunk_ids.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "chunk_ids array is required",
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

		// Fetch chunks that need summaries
		const { data: chunks, error: fetchError } = await supabase
			.from("chunks")
			.select("id, content, summary")
			.in("id", chunk_ids)
			.is("summary", null); // Only get chunks without summaries

		if (fetchError) {
			console.error("Error fetching chunks:", fetchError);
			throw fetchError;
		}

		if (!chunks || chunks.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No chunks need summarization",
					chunks_processed: 0,
				}),
				{
					headers: { "Content-Type": "application/json" },
					status: 200,
				}
			);
		}

		// TODO: Implement summarization logic here
		// Example steps:
		// 1. For each chunk, generate a summary using AI/LLM
		// 2. Update the chunk record with the summary
		// 3. You might use OpenAI, Anthropic, or another summarization service

		// Placeholder: Create sample summaries
		// In production, replace this with actual AI summarization
		const updatePromises = chunks.map((chunk) => {
			const summary = `Summary of: ${chunk.content?.substring(0, 50)}...`;
			return supabase
				.from("chunks")
				.update({ summary })
				.eq("id", chunk.id)
				.select();
		});

		const results = await Promise.all(updatePromises);
		const errors = results.filter((r) => r.error);

		if (errors.length > 0) {
			console.error("Errors updating chunks:", errors);
			throw new Error(`Failed to update ${errors.length} chunks`);
		}

		const updatedCount = results.filter((r) => !r.error && r.data).length;

		console.log(`Generated summaries for ${updatedCount} chunks`);

		// Return success response
		const data = {
			success: true,
			message: `Generated summaries for ${updatedCount} chunks`,
			document_id,
			chunks_processed: updatedCount,
			total_chunks: chunks.length,
		};

		return new Response(JSON.stringify(data), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		});
	} catch (error) {
		console.error("Error generating summaries:", error);

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
