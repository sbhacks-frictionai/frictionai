"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function ProcessPdfButton() {
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleClick = async () => {
		setIsLoading(true);
		setError(null);
		setResult(null);

		try {
			const supabase = createClient();
			const { data, error: invokeError } =
				await supabase.functions.invoke("process-pdf", {
					body: JSON.stringify({ name: "Supabase" }),
					headers: {
						"Content-Type": "application/json",
					},
				});

			if (invokeError) {
				throw invokeError;
			}

			setResult(JSON.stringify(data, null, 2));
			console.log("Function response:", data);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "An error occurred";
			setError(errorMessage);
			console.error("Error calling function:", err);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<Button onClick={handleClick} disabled={isLoading}>
				{isLoading ? "Processing..." : "Call Process PDF Function"}
			</Button>
			{result && (
				<pre className="text-xs font-mono p-3 rounded border bg-muted max-h-32 overflow-auto">
					{result}
				</pre>
			)}
			{error && (
				<div className="text-sm text-destructive p-3 rounded border border-destructive">
					Error: {error}
				</div>
			)}
		</div>
	);
}
