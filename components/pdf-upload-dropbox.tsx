"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UploadFile {
	file: File;
	status: "pending" | "uploading" | "success" | "error";
	progress?: number;
	error?: string;
	path?: string;
}

export function PdfUploadDropbox() {
	const [files, setFiles] = useState<UploadFile[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
		if (!selectedFiles || selectedFiles.length === 0) return;

		const newFiles: UploadFile[] = Array.from(selectedFiles).map(
			(file) => ({
				file,
				status: "pending" as const,
			})
		);

		setFiles((prev) => [...prev, ...newFiles]);

		// Upload each file
		newFiles.forEach((uploadFile) => {
			uploadFileToStorage(uploadFile.file);
		});
	}, []);

	const uploadFileToStorage = async (file: File) => {
		const fileId = `${Date.now()}-${file.name}`;
		const filePath = `${fileId}`;

		// Update file status to uploading
		setFiles((prev) =>
			prev.map((f) =>
				f.file === file ? { ...f, status: "uploading", progress: 0 } : f
			)
		);

		try {
			const supabase = createClient();

			// Upload file to storage
			const { data, error } = await supabase.storage
				.from("documents")
				.upload(filePath, file, {
					cacheControl: "3600",
					upsert: false,
				});

			if (error) {
				throw error;
			}

			// Update file status to success
			setFiles((prev) =>
				prev.map((f) =>
					f.file === file
						? {
								...f,
								status: "success",
								progress: 100,
								path: data.path,
						  }
						: f
				)
			);

			console.log("File uploaded successfully:", data.path);
		} catch (error) {
			console.error("Error uploading file:", error);
			setFiles((prev) =>
				prev.map((f) =>
					f.file === file
						? {
								...f,
								status: "error",
								error:
									error instanceof Error
										? error.message
										: "Failed to upload file",
						  }
						: f
				)
			);
		}
	};

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);

			const droppedFiles = e.dataTransfer.files;
			handleFileSelect(droppedFiles);
		},
		[handleFileSelect]
	);

	const handleFileInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			handleFileSelect(e.target.files);
		},
		[handleFileSelect]
	);

	const removeFile = (file: File) => {
		setFiles((prev) => prev.filter((f) => f.file !== file));
	};

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return (
			Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
		);
	};

	return (
		<div className="flex flex-col gap-4 w-full max-w-2xl">
			<div
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={cn(
					"border-2 border-dashed rounded-lg p-8 text-center transition-colors",
					isDragging
						? "border-primary bg-primary/5"
						: "border-muted-foreground/25 hover:border-muted-foreground/50"
				)}
			>
				<Upload
					className={cn(
						"mx-auto h-12 w-12 mb-4 transition-colors",
						isDragging ? "text-primary" : "text-muted-foreground"
					)}
				/>
				<p className="text-sm font-medium mb-2">
					Drag and drop your PDF files here, or{" "}
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="text-primary hover:underline"
					>
						browse
					</button>
				</p>
				<p className="text-xs text-muted-foreground">
					PDF files only (max 50MB)
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf,application/pdf"
					multiple
					onChange={handleFileInputChange}
					className="hidden"
				/>
			</div>

			{files.length > 0 && (
				<div className="space-y-2">
					<h3 className="text-sm font-medium">Uploaded Files</h3>
					<div className="space-y-2">
						{files.map((uploadFile, index) => (
							<div
								key={`${uploadFile.file.name}-${index}`}
								className="flex items-center gap-3 p-3 rounded-lg border bg-card"
							>
								<FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium truncate">
										{uploadFile.file.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatFileSize(uploadFile.file.size)}
									</p>
									{uploadFile.status === "uploading" && (
										<div className="mt-2 w-full bg-muted rounded-full h-1.5">
											<div
												className="bg-primary h-1.5 rounded-full transition-all duration-300"
												style={{
													width: `${
														uploadFile.progress || 0
													}%`,
												}}
											/>
										</div>
									)}
									{uploadFile.status === "error" &&
										uploadFile.error && (
											<p className="text-xs text-destructive mt-1">
												{uploadFile.error}
											</p>
										)}
									{uploadFile.status === "success" && (
										<p className="text-xs text-green-600 dark:text-green-400 mt-1">
											Uploaded successfully
										</p>
									)}
								</div>
								<div className="flex items-center gap-2 flex-shrink-0">
									{uploadFile.status === "success" && (
										<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
									)}
									{uploadFile.status === "error" && (
										<AlertCircle className="h-5 w-5 text-destructive" />
									)}
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											removeFile(uploadFile.file)
										}
										className="h-8 w-8 p-0"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
