// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface StorageEvent {
	bucket_id: string;
	name: string;
	id: string;
	created_at: string;
	updated_at: string;
	last_accessed_at: string;
	metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
	try {
		// Parse the request body
		const payload: StorageEvent = await req.json();

		console.log("Processing PDF upload:", {
			bucket_id: payload.bucket_id,
			file_name: payload.name,
			file_id: payload.id,
		});

		// Extract file information
		const { bucket_id, name, id, metadata } = payload;

		// Verify this is from the documents bucket
		if (bucket_id !== "documents") {
			return new Response(
				JSON.stringify({
					success: false,
					error: "File must be uploaded to 'documents' bucket",
				}),
				{
					headers: { "Content-Type": "application/json" },
					status: 400,
				}
			);
		}

		// Create Supabase client
		// In Supabase edge functions, SUPABASE_URL and SUPABASE_ANON_KEY are automatically available
		// SUPABASE_SERVICE_ROLE_KEY needs to be set as a secret for bypassing RLS
		const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
		const supabaseServiceKey =
			Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
			Deno.env.get("SUPABASE_ANON_KEY") ??
			"";

		if (!supabaseUrl || !supabaseServiceKey) {
			console.error("Missing Supabase environment variables", {
				hasUrl: !!supabaseUrl,
				hasServiceKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
				hasAnonKey: !!Deno.env.get("SUPABASE_ANON_KEY"),
			});
			throw new Error("Missing Supabase environment variables");
		}

		// Create client with service role key to bypass RLS for inserting documents
		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		// Insert document record into the documents table
		const { data: documentData, error: insertError } = await supabase
			.from("documents")
			.insert({
				bucket_path: name, // Full path to the file in storage
				file_name: name.split("/").pop() || name, // Extract filename from path
				course_id: metadata?.course_id || null, // Optional course_id from metadata
				total_clicks: 0, // Initialize with 0 clicks
			})
			.select()
			.single();

		if (insertError) {
			console.error("Error inserting document:", insertError);
			throw insertError;
		}

		console.log("Document created:", documentData);

		// Step 1: Call chunk-process function to process PDF into chunks
		console.log("Calling chunk-process function...");
		const chunkProcessUrl = `${supabaseUrl}/functions/v1/chunk-process`;
		const chunkProcessResponse = await fetch(chunkProcessUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${supabaseServiceKey}`,
			},
			body: JSON.stringify({
				document_id: documentData.id,
				bucket_path: name,
				file_name: name.split("/").pop() || name,
			}),
		});

		if (!chunkProcessResponse.ok) {
			const errorText = await chunkProcessResponse.text();
			console.error("Error calling chunk-process:", errorText);
			throw new Error(`chunk-process failed: ${errorText}`);
		}

		const chunkProcessResult = await chunkProcessResponse.json();
		console.log("Chunk process result:", chunkProcessResult);

		if (!chunkProcessResult.success) {
			throw new Error(
				`chunk-process failed: ${
					chunkProcessResult.error || "Unknown error"
				}`
			);
		}

		// Step 2: Call chunk-summary function to generate summaries for the chunks
		const chunkIds =
			chunkProcessResult.chunks?.map((chunk: any) => chunk.id) || [];

		if (chunkIds.length > 0) {
			console.log("Calling chunk-summary function...");
			const chunkSummaryUrl = `${supabaseUrl}/functions/v1/chunk-summary`;
			const chunkSummaryResponse = await fetch(chunkSummaryUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${supabaseServiceKey}`,
				},
				body: JSON.stringify({
					chunk_ids: chunkIds,
					document_id: documentData.id,
				}),
			});

			if (!chunkSummaryResponse.ok) {
				const errorText = await chunkSummaryResponse.text();
				console.error("Error calling chunk-summary:", errorText);
				// Don't throw - chunk processing succeeded, summary is optional
				console.warn("Chunk summary failed, but chunks were created");
			} else {
				const chunkSummaryResult = await chunkSummaryResponse.json();
				console.log("Chunk summary result:", chunkSummaryResult);
			}
		}

		// Return success response with document info and processing results
		const data = {
			success: true,
			message: `Processing PDF: ${name} from bucket: ${bucket_id}`,
			file_id: id,
			bucket_id,
			file_name: name,
			document_id: documentData.id,
			document: documentData,
			chunk_processing: chunkProcessResult,
			metadata,
		};

		return new Response(JSON.stringify(data), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		});
	} catch (error) {
		console.error("Error processing PDF:", error);

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

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-pdf' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
