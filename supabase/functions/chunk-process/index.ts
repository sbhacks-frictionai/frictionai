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

Deno.serve(async (req) => {
	try {
		// Parse the request body
		const payload: ChunkProcessRequest = await req.json();

		console.log("Processing chunks for document:", {
			document_id: payload.document_id,
			file_name: payload.file_name,
			bucket_path: payload.bucket_path,
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
		console.log("supabaseUrl", supabaseUrl);
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

		const ttl = typeof expiresIn === "number" ? expiresIn : 60; // default 60 seconds
		const { data, error } = await supabase.storage
			.from("documents")
			.createSignedUrl(bucket_path, ttl);

		if (error || !data?.signedUrl) {
			return new Response(
				JSON.stringify({
					success: false,
					error: error?.message ?? "Failed to sign URL",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		const signedUrl = data.signedUrl;

		const lambdaUrl = Deno.env.get("LAMBDA_URL") ?? "";
		if (!lambdaUrl) {
			return new Response(
				JSON.stringify({
					success: false,
					error: "Missing LAMBDA_URL env var",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		const sharedSecret = Deno.env.get("LAMBDA_SHARED_SECRET") ?? "";

		const lambdaResp = await fetch(lambdaUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(sharedSecret ? { "x-shared-secret": sharedSecret } : {}),
			},
			body: JSON.stringify({
				document_id, // from your payload
				pdf_url: signedUrl, // pass signed URL to lambda
				file_name, // from your payload
				max_chars: 200, // optional tuning
			}),
		});

		if (!lambdaResp.ok) {
			const errText = await lambdaResp.text();
			return new Response(
				JSON.stringify({
					success: false,
					error: `Lambda error: ${lambdaResp.status} ${lambdaResp.statusText}`,
					details: errText,
				}),
				{ status: 502, headers: { "Content-Type": "application/json" } }
			);
		}

		// Parse returned JSON (should include chunks)
		const lambdaJson = await lambdaResp.json();

		return new Response(JSON.stringify(lambdaJson), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Error processing chunks:", error);
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
});
