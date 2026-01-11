"use client";

import React, { useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { getAiSummaryService } from "@/app/supabase-service/aisummary-service";

interface StudyGuideResponse {
	success: boolean;
	study_guide?: string;
	course_code?: string;
	course_name?: string;
	document_name?: string;
	total_chunks?: number;
	error?: string;
}

export function AiSummary() {
	const searchParams = useSearchParams();
	const documentId = searchParams.get("id");
	const [studyGuide, setStudyGuide] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleGenerate = async () => {
		if (!documentId) {
			setError("Document ID not found");
			return;
		}

		setIsLoading(true);
		setError(null);
		setStudyGuide(null);

		try {
			const service = getAiSummaryService();
			const result = (await service.generateStudyGuide(
				documentId
			)) as StudyGuideResponse;

			if (result.success && result.study_guide) {
				setStudyGuide(result.study_guide);
			} else {
				setError(result.error || "Failed to generate study guide");
			}
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "An error occurred";
			setError(errorMessage);
			console.error("Error generating study guide:", err);
		} finally {
			setIsLoading(false);
		}
	};

	// Format plain text study guide with proper line breaks
	const formatStudyGuide = (text: string) => {
		// Split by lines and process each
		const lines = text.split("\n");
		const formatted: React.ReactElement[] = [];
		let currentParagraph: string[] = [];
		let key = 0;

		const flushParagraph = () => {
			if (currentParagraph.length > 0) {
				const paraText = currentParagraph.join(" ").trim();
				if (paraText) {
					formatted.push(
						<p key={key++} className="mb-3 text-sm leading-relaxed">
							{paraText}
						</p>
					);
				}
				currentParagraph = [];
			}
		};

		for (const line of lines) {
			const trimmed = line.trim();

			// Empty line = paragraph break
			if (!trimmed) {
				flushParagraph();
				continue;
			}

			// Check if line starts with a number (numbered section)
			const numberedMatch = trimmed.match(/^(\d+\.?\s+)(.+)/);
			if (numberedMatch) {
				flushParagraph();
				formatted.push(
					<div key={key++} className="mb-3">
						<span className="font-semibold text-foreground">
							{numberedMatch[1]}
						</span>
						<span className="text-sm text-foreground">
							{numberedMatch[2]}
						</span>
					</div>
				);
				continue;
			}

			// Check if line is indented (sub-item)
			if (line.startsWith(" ") || line.startsWith("\t")) {
				flushParagraph();
				formatted.push(
					<div
						key={key++}
						className="ml-4 mb-2 text-sm text-muted-foreground"
					>
						{trimmed}
					</div>
				);
				continue;
			}

			// Regular line - add to current paragraph
			currentParagraph.push(trimmed);
		}

		flushParagraph();
		return formatted;
	};

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>AI Study Guide</CardTitle>
				<CardDescription>
					Generate a comprehensive study guide for this document
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<Button
						onClick={handleGenerate}
						disabled={isLoading || !documentId}
						className="w-full sm:w-auto"
					>
						{isLoading ? "Generating..." : "Generate Study Guide"}
					</Button>

					{error && (
						<div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
							<p className="text-sm text-destructive">{error}</p>
						</div>
					)}

					{studyGuide && (
						<div className="mt-4 p-4 rounded-md bg-muted/50 border">
							<div className="prose prose-sm max-w-none">
								<div className="text-sm text-foreground whitespace-pre-wrap">
									{formatStudyGuide(studyGuide)}
								</div>
							</div>
						</div>
					)}

					{!studyGuide && !isLoading && !error && (
						<p className="text-sm text-muted-foreground">
							Click the button above to generate an AI-powered
							study guide based on the document content, student
							interactions, and time spent on each page.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
