import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { getChunkService } from "@/app/supabase-service/chunk-service";
import { useSearchParams } from "next/navigation";

// Set up PDF.js worker - use unpkg CDN which has all versions
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * @param {Object} props
 * @param {Blob|null} [props.file] - PDF blob to display
 * @param {string|null} [props.id] - Document ID to fetch chunks for
 */
const PdfViewer = ({ file: fileProp = null } = {}) => {
	const searchParams = useSearchParams();
	const documentId = searchParams.get("id");
	const [file, setFile] = useState(fileProp || null);
	const [numPages, setNumPages] = useState(null);
	const [pageNumber, setPageNumber] = useState(1);
	const [scale, setScale] = useState(1.0);
	const [annotations, setAnnotations] = useState([]);
	const [mode, setMode] = useState("view"); // 'view', 'text', 'highlight'
	const [isDrawing, setIsDrawing] = useState(false);
	const [startPos, setStartPos] = useState(null);
	const [currentHighlight, setCurrentHighlight] = useState(null);
	const [selectedHighlight, setSelectedHighlight] = useState(null); // { id, x, y, width, height, page }
	const [chunks, setChunks] = useState([]); // Array of chunks from database
	const containerRef = useRef(null);
	const pageViewStartTime = useRef(null);
	const pageViewTimes = useRef({}); // Store time spent on each page
	const [currentPageViewTime, setCurrentPageViewTime] = useState(0); // Time on current page in seconds

	const goToPrevPage = useCallback(() => {
		setPageNumber((prev) => Math.max(1, prev - 1));
	}, []);

	const goToNextPage = useCallback(() => {
		setPageNumber((prev) => Math.min(numPages || 1, prev + 1));
	}, [numPages]);

	// Track time spent on each page and update display
	useEffect(() => {
		if (!file || !numPages) return;

		// Record end time for previous page if it exists
		if (pageViewStartTime.current !== null) {
			const previousPage = pageNumber;
			const endTime = Date.now();
			const duration = endTime - pageViewStartTime.current;

			// Add to accumulated time for this page
			if (!pageViewTimes.current[previousPage]) {
				pageViewTimes.current[previousPage] = 0;
			}
			pageViewTimes.current[previousPage] += duration;

			//   console.log(`Page ${previousPage} view time: ${(duration / 1000).toFixed(2)} seconds`);
			//   console.log(`Total time on page ${previousPage}: ${(pageViewTimes.current[previousPage] / 1000).toFixed(2)} seconds`);
		}

		// Start tracking time for current page
		pageViewStartTime.current = Date.now();
		setCurrentPageViewTime(0); // Reset display time
		// Close dialog bubble when page changes
		setSelectedHighlight(null);

		// console.log(`Started viewing page ${pageNumber}`);

		// Update displayed time every second
		const interval = setInterval(() => {
			if (pageViewStartTime.current !== null) {
				const elapsed = (Date.now() - pageViewStartTime.current) / 1000;
				setCurrentPageViewTime(elapsed);
			}
		}, 100); // Update every 100ms for smoother display

		// Cleanup: record time when component unmounts or file changes
		return () => {
			clearInterval(interval);
			if (pageViewStartTime.current !== null) {
				const endTime = Date.now();
				const duration = endTime - pageViewStartTime.current;
				const currentPage = pageNumber;

				if (!pageViewTimes.current[currentPage]) {
					pageViewTimes.current[currentPage] = 0;
				}
				pageViewTimes.current[currentPage] += duration;

				// console.log(`Final time on page ${currentPage}: ${(pageViewTimes.current[currentPage] / 1000).toFixed(2)} seconds`);
			}
		};
	}, [pageNumber, file, numPages]);

	// Log summary when file changes or component unmounts
	//   useEffect(() => {
	//     return () => {
	//       if (Object.keys(pageViewTimes.current).length > 0) {
	//         console.log('=== Page View Time Summary ===');
	//         Object.entries(pageViewTimes.current).forEach(([page, totalTime]) => {
	//           console.log(`Page ${page}: ${(totalTime / 1000).toFixed(2)} seconds`);
	//         });
	//         console.log('==============================');
	//       }
	//     };
	//   }, [file]);

	// Keyboard navigation for page flipping
	useEffect(() => {
		const handleKeyPress = (e) => {
			if (!file) return;

			// Close dialog bubble on Escape key (works in any mode)
			if (e.key === "Escape") {
				setSelectedHighlight(null);
				return;
			}

			// Page navigation only works in view mode
			if (mode !== "view") return;

			if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
				e.preventDefault();
				goToPrevPage();
			} else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
				e.preventDefault();
				goToNextPage();
			}
		};

		window.addEventListener("keydown", handleKeyPress);
		return () => window.removeEventListener("keydown", handleKeyPress);
	}, [file, mode, goToPrevPage, goToNextPage]);

	// Update file when prop changes
	useEffect(() => {
		if (fileProp) {
			setFile(fileProp);
			setAnnotations([]);
			setPageNumber(1);
		}
	}, [fileProp]);

	// Fetch chunks when documentId changes
	useEffect(() => {
		const fetchChunks = async () => {
			if (!documentId) {
				console.log("No documentId provided");
				setChunks([]);
				return;
			}

			try {
				const chunkService = getChunkService();
				const fetchedChunks = await chunkService.getChunksByDocumentId(
					documentId
				);
				setChunks(fetchedChunks || []);
			} catch (error) {
				console.error("Error fetching chunks:", error);
				setChunks([]);
			}
		};

		fetchChunks();
	}, [documentId]);

	const onDocumentLoadSuccess = ({ numPages }) => {
		setNumPages(numPages);
		setPageNumber(1);
		setAnnotations([]);
	};

	const handlePageClick = (e, pageIndex) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - rect.left) / scale;
		const y = (e.clientY - rect.top) / scale;

		// Log click location to console
		console.log("PDF Click Location:", {
			page: pageIndex + 1,
			x: x,
			y: y,
			scale: scale,
			clientX: e.clientX,
			clientY: e.clientY,
			relativeX: x,
			relativeY: y,
		});

		if (mode === "view") return;

		if (mode === "text") {
			const text = prompt("Enter text annotation:");
			if (text) {
				const newAnnotation = {
					id: Date.now(),
					type: "text",
					page: pageIndex + 1,
					x: x,
					y: y,
					text: text,
				};
				setAnnotations([...annotations, newAnnotation]);
			}
		}
	};

	const handleMouseDown = (e, pageIndex) => {
		if (mode === "highlight") {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = (e.clientX - rect.left) / scale;
			const y = (e.clientY - rect.top) / scale;
			setIsDrawing(true);
			setStartPos({ x, y, page: pageIndex + 1 });
			setCurrentHighlight({ x, y, width: 0, height: 0 });
		}
	};

	const handleMouseMove = (e, pageIndex) => {
		if (
			mode === "highlight" &&
			isDrawing &&
			startPos &&
			startPos.page === pageIndex + 1
		) {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = (e.clientX - rect.left) / scale;
			const y = (e.clientY - rect.top) / scale;

			setCurrentHighlight({
				x: Math.min(startPos.x, x),
				y: Math.min(startPos.y, y),
				width: Math.abs(x - startPos.x),
				height: Math.abs(y - startPos.y),
			});
		}
	};

	const handleMouseUp = (e, pageIndex) => {
		if (
			mode === "highlight" &&
			isDrawing &&
			startPos &&
			startPos.page === pageIndex + 1
		) {
			const rect = e.currentTarget.getBoundingClientRect();
			const x = (e.clientX - rect.left) / scale;
			const y = (e.clientY - rect.top) / scale;

			const width = Math.abs(x - startPos.x);
			const height = Math.abs(y - startPos.y);

			if (width > 5 && height > 5) {
				const newAnnotation = {
					id: Date.now(),
					type: "highlight",
					page: pageIndex + 1,
					x: Math.min(startPos.x, x),
					y: Math.min(startPos.y, y),
					width: width,
					height: height,
				};
				setAnnotations([...annotations, newAnnotation]);
			}

			setIsDrawing(false);
			setStartPos(null);
			setCurrentHighlight(null);
		}
	};

	const deleteAnnotation = (id) => {
		setAnnotations(annotations.filter((ann) => ann.id !== id));
	};

	const zoomIn = () => {
		setScale((prev) => Math.min(prev + 0.2, 3.0));
	};

	const zoomOut = () => {
		setScale((prev) => Math.max(prev - 0.2, 0.5));
	};

	const getAnnotationsForPage = (pageNum) => {
		return annotations.filter((ann) => ann.page === pageNum);
	};

	const getChunksForPage = useCallback(
		(pageNum) => {
			return chunks.filter((chunk) => chunk.page_number === pageNum);
		},
		[chunks]
	);

	// Log chunks whenever page changes
	useEffect(() => {
		const pageChunks = chunks.filter(
			(chunk) => chunk.page_number === pageNumber
		);
		console.log(`Page ${pageNumber} chunks:`, pageChunks);
		console.log(`Total chunks on page ${pageNumber}:`, pageChunks.length);
	}, [pageNumber, chunks]);

	return (
		<div className="flex flex-col min-h-screen h-[130vh] w-full bg-muted">
			<div className="flex items-center gap-4 p-4 bg-background border-b border-border flex-wrap shadow-sm">
				{file && (
					<>
						<div className="flex gap-2">
							<Button
								variant={
									mode === "view" ? "default" : "outline"
								}
								size="sm"
								onClick={() => setMode("view")}
							>
								View
							</Button>
							<Button
								variant={
									mode === "highlight" ? "default" : "outline"
								}
								size="sm"
								onClick={() => {
									setMode("highlight");
									setIsDrawing(false);
								}}
							>
								Highlight
							</Button>
						</div>

						<div className="navigation-controls flex items-center gap-3">
							<Button
								variant="outline"
								onClick={goToPrevPage}
								disabled={pageNumber <= 1}
								title="Previous page (←)"
							>
								← Previous
							</Button>
							<span className="text-sm font-medium min-w-[120px] text-center">
								Page {pageNumber} of {numPages}
							</span>
							<Button
								variant="outline"
								onClick={goToNextPage}
								disabled={pageNumber >= numPages}
								title="Next page (→)"
							>
								Next →
							</Button>
						</div>

						<div className="zoom-controls flex items-center gap-2 ml-auto">
							<Button
								variant="outline"
								size="icon"
								onClick={zoomOut}
								title="Zoom out"
							>
								−
							</Button>
							<span className="text-sm font-medium min-w-[50px] text-center">
								{Math.round(scale * 100)}%
							</span>
							<Button
								variant="outline"
								size="icon"
								onClick={zoomIn}
								title="Zoom in"
							>
								+
							</Button>
						</div>
					</>
				)}
			</div>

			<div
				className="flex-1 overflow-auto p-5 flex justify-center items-start relative bg-white"
				ref={containerRef}
			>
				{file && (
					<div className="absolute top-5 right-5 bg-black/70 text-white p-2.5 px-4 rounded-lg text-sm font-medium z-[1000] shadow-lg pointer-events-none">
						Page {pageNumber}: {currentPageViewTime.toFixed(1)}s
					</div>
				)}

				{!file && (
					<div className="flex justify-center items-center h-full text-lg text-muted-foreground">
						<p>Loading PDF...</p>
					</div>
				)}

				{file && (
					<div className="flex flex-col items-center gap-5">
						<Document
							file={file}
							onLoadSuccess={onDocumentLoadSuccess}
							loading={
								<div className="p-5 text-center text-base">
									Loading PDF...
								</div>
							}
							error={
								<div className="p-5 text-center text-base text-destructive">
									Error loading PDF
								</div>
							}
						>
							<div
								className="relative shadow-lg bg-background border border-border"
								onClick={(e) => {
									// Close dialog bubble if clicking outside of it
									if (
										selectedHighlight &&
										e.target === e.currentTarget
									) {
										setSelectedHighlight(null);
									}
									handlePageClick(e, pageNumber - 1);
								}}
								onMouseDown={(e) =>
									handleMouseDown(e, pageNumber - 1)
								}
								onMouseMove={(e) =>
									handleMouseMove(e, pageNumber - 1)
								}
								onMouseUp={(e) =>
									handleMouseUp(e, pageNumber - 1)
								}
							>
								<Page
									pageNumber={pageNumber}
									scale={scale}
									renderTextLayer={false}
									renderAnnotationLayer={false}
								/>

								{/* Overlay for chunks */}
								<div className="absolute top-0 left-0 w-full h-full z-[8] pointer-events-none">
									{getChunksForPage(pageNumber).map(
										(chunk) => {
											const chunkWidth =
												chunk.x_max - chunk.x_min;
											const chunkHeight =
												chunk.y_max - chunk.y_min;

											return (
												<div
													key={chunk.id}
													className="absolute border border-blue-500 bg-transparent"
													style={{
														left: `${
															chunk.x_min * scale
														}px`,
														top: `${
															chunk.y_min * scale
														}px`,
														width: `${
															chunkWidth * scale
														}px`,
														height: `${
															chunkHeight * scale
														}px`,
													}}
												/>
											);
										}
									)}
								</div>

								{/* Overlay for annotations */}
								<div
									className="absolute top-0 left-0 w-full h-full z-10"
									style={{
										pointerEvents:
											mode === "view" ? "auto" : "auto",
										cursor:
											mode === "text"
												? "crosshair"
												: mode === "highlight"
												? "crosshair"
												: "pointer",
									}}
								>
									{getAnnotationsForPage(pageNumber).map(
										(annotation) => {
											if (annotation.type === "text") {
												return (
													<div
														key={annotation.id}
														className="absolute cursor-pointer z-[11]"
														style={{
															left: `${
																annotation.x *
																scale
															}px`,
															top: `${
																annotation.y *
																scale
															}px`,
															transform: `scale(${scale})`,
															transformOrigin:
																"top left",
														}}
														onClick={(e) => {
															e.stopPropagation();
															if (
																confirm(
																	"Delete this annotation?"
																)
															) {
																deleteAnnotation(
																	annotation.id
																);
															}
														}}
													>
														<div className="bg-yellow-200 dark:bg-yellow-600 p-1 px-2 rounded border border-yellow-400 dark:border-yellow-500 text-xs max-w-[200px] break-words shadow-md transition-transform hover:scale-105 z-[12]">
															{annotation.text}
														</div>
													</div>
												);
											} else if (
												annotation.type === "highlight"
											) {
												return (
													<div
														key={annotation.id}
														className="absolute bg-yellow-200/30 dark:bg-yellow-600/30 border-2 border-yellow-400 dark:border-yellow-500 cursor-pointer z-[11] transition-colors hover:bg-yellow-200/50 dark:hover:bg-yellow-600/50 hover:z-[12]"
														style={{
															left: `${
																annotation.x *
																scale
															}px`,
															top: `${
																annotation.y *
																scale
															}px`,
															width: `${
																annotation.width *
																scale
															}px`,
															height: `${
																annotation.height *
																scale
															}px`,
															transform: `scale(${scale})`,
															transformOrigin:
																"top left",
														}}
														onClick={(e) => {
															e.stopPropagation();
															if (
																mode === "view"
															) {
																// Show dialog bubble next to the highlight
																setSelectedHighlight(
																	{
																		id: annotation.id,
																		x:
																			annotation.x +
																			annotation.width,
																		y: annotation.y,
																		width: annotation.width,
																		height: annotation.height,
																		page: annotation.page,
																	}
																);
															} else {
																// In other modes, show delete confirmation
																if (
																	confirm(
																		"Delete this highlight?"
																	)
																) {
																	deleteAnnotation(
																		annotation.id
																	);
																}
															}
														}}
													/>
												);
											}
											return null;
										}
									)}

									{/* Current highlight being drawn */}
									{currentHighlight &&
										mode === "highlight" &&
										isDrawing && (
											<div
												className="absolute bg-yellow-200/40 dark:bg-yellow-600/40 border-2 border-dashed border-yellow-400 dark:border-yellow-500 pointer-events-none"
												style={{
													left: `${
														currentHighlight.x *
														scale
													}px`,
													top: `${
														currentHighlight.y *
														scale
													}px`,
													width: `${
														currentHighlight.width *
														scale
													}px`,
													height: `${
														currentHighlight.height *
														scale
													}px`,
													transform: `scale(${scale})`,
													transformOrigin: "top left",
												}}
											/>
										)}

									{/* Dialog bubble for selected highlight */}
									{selectedHighlight &&
										selectedHighlight.page ===
											pageNumber && (
											<div
												className="absolute z-[20] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 min-w-[200px] max-w-[300px]"
												style={{
													left: `${
														selectedHighlight.x *
															scale +
														10
													}px`,
													top: `${
														selectedHighlight.y *
														scale
													}px`,
													transform: `scale(${scale})`,
													transformOrigin: "top left",
												}}
												onClick={(e) =>
													e.stopPropagation()
												}
											>
												<div className="flex items-start justify-between gap-2">
													<div className="flex-1">
														<p className="text-sm font-medium text-gray-900 dark:text-gray-100">
															Highlight Options
														</p>
													</div>
													<button
														onClick={() =>
															setSelectedHighlight(
																null
															)
														}
														className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none ml-2"
														aria-label="Close"
													>
														×
													</button>
												</div>
											</div>
										)}
								</div>
							</div>
						</Document>
					</div>
				)}
			</div>
		</div>
	);
};

export default PdfViewer;
