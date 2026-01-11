"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function AiSummary() {
	const searchParams = useSearchParams();
	const documentId = searchParams.get("id");
	const [isLoading, setIsLoading] = useState(false);
	const [studyGuide, setStudyGuide] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleGenerateStudyGuide = async () => {
		if (!documentId) {
			setError("Document ID not found");
			return;
		}

		setIsLoading(true);
		setError(null);
		setStudyGuide(null);

		try {
			const supabase = createClient();
			const { data, error: invokeError } =
				await supabase.functions.invoke("getaiguide", {
					body: JSON.stringify({ document_id: documentId }),
					headers: {
						"Content-Type": "application/json",
					},
				});

			if (invokeError) {
				throw invokeError;
			}

			if (data?.success && data?.study_guide) {
				setStudyGuide(data.study_guide);
			} else {
				throw new Error(
					data?.error || "Failed to generate study guide"
				);
			}
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "An error occurred";
			setError(errorMessage);
			console.error("Error calling getaiguide function:", err);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>AI Study Guide</CardTitle>
				<CardDescription>
					Generate a comprehensive study guide based on document
					content and student engagement
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{!studyGuide && !error && (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<p className="text-sm text-muted-foreground mb-4">
								Click the button below to generate an AI-powered
								study guide for this document. The guide will
								prioritize areas with high student engagement
								and time spent.
							</p>
							<Button
								onClick={handleGenerateStudyGuide}
								disabled={isLoading || !documentId}
							>
								{isLoading
									? "Generating..."
									: "Generate Study Guide"}
							</Button>
						</div>
					)}

					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<div className="text-sm text-muted-foreground">
								Generating study guide... This may take a
								moment.
							</div>
						</div>
					)}

					{error && (
						<div className="p-4 rounded-lg border border-destructive bg-destructive/10">
							<p className="text-sm text-destructive font-medium mb-2">
								Error
							</p>
							<p className="text-sm text-destructive/80">
								{error}
							</p>
							<Button
								onClick={handleGenerateStudyGuide}
								disabled={isLoading || !documentId}
								className="mt-4"
								variant="outline"
							>
								Try Again
							</Button>
						</div>
					)}

					{studyGuide && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-lg font-semibold">
									Study Guide
								</h3>
								<Button
									onClick={handleGenerateStudyGuide}
									disabled={isLoading}
									variant="outline"
									size="sm"
								>
									Regenerate
								</Button>
							</div>
							<div className="prose prose-sm max-w-none">
								<div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/50 p-4 rounded-lg border max-h-[600px] overflow-y-auto">
									{studyGuide}
								</div>
							</div>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
