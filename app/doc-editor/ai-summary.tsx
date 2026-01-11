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
	const [copied, setCopied] = useState(false);

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

	const handleCopy = async () => {
		if (!studyGuide) return;

		try {
			await navigator.clipboard.writeText(studyGuide);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
		} catch (err) {
			console.error("Failed to copy:", err);
			// Fallback for older browsers
			const textArea = document.createElement("textarea");
			textArea.value = studyGuide;
			textArea.style.position = "fixed";
			textArea.style.opacity = "0";
			document.body.appendChild(textArea);
			textArea.select();
			try {
				document.execCommand("copy");
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			} catch (fallbackErr) {
				console.error("Fallback copy failed:", fallbackErr);
			}
			document.body.removeChild(textArea);
		}
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
						<div className="mt-4 space-y-2">
							<div className="flex justify-end">
								<Button
									onClick={handleCopy}
									variant="outline"
									size="sm"
									className="gap-2"
								>
									{copied ? (
										<>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path d="M20 6L9 17l-5-5" />
											</svg>
											Copied!
										</>
									) : (
										<>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<rect
													width="14"
													height="14"
													x="8"
													y="8"
													rx="2"
													ry="2"
												/>
												<path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />
											</svg>
											Copy
										</>
									)}
								</Button>
							</div>
							<div className="p-4 rounded-md bg-muted/50 border">
								<div className="prose prose-sm max-w-none">
									<div className="text-sm text-foreground whitespace-pre-wrap">
										{formatStudyGuide(studyGuide)}
									</div>
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
