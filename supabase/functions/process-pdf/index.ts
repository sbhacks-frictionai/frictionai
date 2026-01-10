// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

		// TODO: Add your PDF processing logic here
		// Example: Download the file, process it, extract text, store chunks in database, etc.

		// For now, return a success response
		const data = {
			success: true,
			message: `Processing PDF: ${name} from bucket: ${bucket_id}`,
			file_id: id,
			bucket_id,
			file_name: name,
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
