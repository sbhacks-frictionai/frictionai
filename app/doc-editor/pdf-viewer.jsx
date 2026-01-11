import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { getChunkService } from "@/app/supabase-service/chunk-service";
import { getInteractionService } from "@/app/supabase-service/interaction-service";
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
	const [interactions, setInteractions] = useState([]); // Array of interactions from database
	const containerRef = useRef(null);

	const goToPrevPage = useCallback(() => {
		setPageNumber((prev) => Math.max(1, prev - 1));
	}, []);

	const goToNextPage = useCallback(() => {
		setPageNumber((prev) => Math.min(numPages || 1, prev + 1));
	}, [numPages]);

	// Close dialog bubble when page changes
	useEffect(() => {
		setSelectedHighlight(null);
	}, [pageNumber]);

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

	// Fetch interactions when documentId or pageNumber changes
	useEffect(() => {
		const fetchInteractions = async () => {
			if (!documentId) {
				setInteractions([]);
				return;
			}

			try {
				const interactionService = getInteractionService();
				const fetchedInteractions =
					await interactionService.getInteractionsByPage(
						documentId,
						pageNumber
					);
				setInteractions(fetchedInteractions || []);
			} catch (error) {
				console.error("Error fetching interactions:", error);
				setInteractions([]);
			}
		};

		fetchInteractions();
	}, [documentId, pageNumber]);

	const onDocumentLoadSuccess = ({ numPages }) => {
		setNumPages(numPages);
		setPageNumber(1);
		setAnnotations([]);
	};

	const handlePageClick = (e, pageIndex) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - rect.left) / scale;
		const y = (e.clientY - rect.top) / scale;
		const currentPage = pageIndex + 1;

		// Check if click is within a chunk
		const clickedChunk = getChunkAtPoint(x, y, currentPage);

		if (clickedChunk) {
			// console.log(clickedChunk.id);
			// chunk clicked
			const chunkService = getChunkService();
			chunkService
				.incrementChunkCount(clickedChunk.id, x, y, currentPage)
				.then((data) => {
					console.log(
						"chunk: ",
						clickedChunk.id,
						"\n",
						"count: ",
						data
					);
				});
		}

		// Log click location to console
		console.log("PDF Click Location:", {
			page: currentPage,
			x: x,
			y: y,
			scale: scale,
			clientX: e.clientX,
			clientY: e.clientY,
			relativeX: x,
			relativeY: y,
			withinChunk: clickedChunk !== undefined,
			chunkId: clickedChunk?.id,
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

	const zoomIn = () => {
		setScale((prev) => Math.min(prev + 0.2, 3.0));
	};

	const zoomOut = () => {
		setScale((prev) => Math.max(prev - 0.2, 0.5));
	};

	const getChunksForPage = useCallback(
		(pageNum) => {
			return chunks.filter((chunk) => chunk.page_number === pageNum);
		},
		[chunks]
	);

	const getInteractionsForPage = useCallback(
		(pageNum) => {
			return interactions.filter(
				(interaction) => interaction.page_number === pageNum
			);
		},
		[interactions]
	);

	/**
	 * Cluster nearby interactions and create blobs with density-based coloring
	 * Similar to Twitch's tap map extension
	 */
	const getInteractionBlobs = useCallback(
		(pageNum) => {
			const pageInteractions = getInteractionsForPage(pageNum).filter(
				(i) => i.x_coord != null && i.y_coord != null
			);

			if (pageInteractions.length === 0) return [];

			// Clustering threshold - interactions within this distance are grouped
			const CLUSTER_THRESHOLD = 40; // pixels
			const clusters = [];

			// Improved clustering: assign each point to nearest cluster, then recalculate centers
			// This is more stable than the incremental approach
			for (const interaction of pageInteractions) {
				let nearestCluster = null;
				let minDistance = Infinity;

				// Find nearest cluster
				for (const cluster of clusters) {
					const distance = Math.sqrt(
						Math.pow(interaction.x_coord - cluster.centerX, 2) +
							Math.pow(interaction.y_coord - cluster.centerY, 2)
					);

					if (
						distance < minDistance &&
						distance <= CLUSTER_THRESHOLD
					) {
						minDistance = distance;
						nearestCluster = cluster;
					}
				}

				if (nearestCluster) {
					// Add to nearest cluster
					nearestCluster.interactions.push(interaction);
				} else {
					// Create new cluster
					clusters.push({
						centerX: interaction.x_coord,
						centerY: interaction.y_coord,
						interactions: [interaction],
					});
				}
			}

			// Recalculate cluster centers (centroid of all points in cluster)
			clusters.forEach((cluster) => {
				cluster.centerX =
					cluster.interactions.reduce(
						(sum, i) => sum + i.x_coord,
						0
					) / cluster.interactions.length;
				cluster.centerY =
					cluster.interactions.reduce(
						(sum, i) => sum + i.y_coord,
						0
					) / cluster.interactions.length;
				cluster.count = cluster.interactions.length;
			});

			// Calculate density scores and assign colors
			const maxCount = Math.max(...clusters.map((c) => c.count), 1);
			const minCount = Math.min(...clusters.map((c) => c.count), 1);

			return clusters.map((cluster) => {
				// Normalize density (0 to 1) - use logarithmic scale for better visualization
				const rawDensity = cluster.count / maxCount;
				const density = Math.pow(rawDensity, 0.7); // Slight curve for better visual distribution

				// Interpolate color from green (low) to red (high)
				// Green: rgb(34, 197, 94) - Red: rgb(239, 68, 68)
				const red = Math.round(34 + (239 - 34) * density);
				const green = Math.round(197 - (197 - 68) * density);
				const blue = Math.round(94 - (94 - 68) * density);

				// Blob size scales with count (min 25px, max 80px)
				const minSize = 25;
				const maxSize = 80;
				const blobSize = minSize + (maxSize - minSize) * density;

				// Opacity based on density (more opaque = higher density)
				const opacity = 0.4 + density * 0.4; // 0.4 to 0.8

				return {
					...cluster,
					color: `rgb(${red}, ${green}, ${blue})`,
					size: blobSize,
					opacity,
					density,
				};
			});
		},
		[getInteractionsForPage]
	);

	// Check if a point (x, y) is within a chunk's boundaries
	const isPointInChunk = (x, y, chunk) => {
		return (
			x >= chunk.x_min &&
			x <= chunk.x_max &&
			y >= chunk.y_min &&
			y <= chunk.y_max
		);
	};

	// Find the chunk that contains the given point
	const getChunkAtPoint = (x, y, pageNum) => {
		const pageChunks = getChunksForPage(pageNum);
		return pageChunks.find((chunk) => isPointInChunk(x, y, chunk));
	};

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
				className="flex-1 overflow-auto p-5 flex justify-center items-start relative bg-background"
				ref={containerRef}
			>
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

								{/* Overlay for interaction blobs (tap map visualization) */}
								<div className="absolute top-0 left-0 w-full h-full z-[9] pointer-events-none">
									{getInteractionBlobs(pageNumber).map(
										(blob, index) => {
											const scaledSize =
												blob.size * scale;

											return (
												<div
													key={`blob-${index}-${blob.centerX}-${blob.centerY}`}
													className="absolute rounded-full blur-sm"
													style={{
														left: `${
															blob.centerX * scale
														}px`,
														top: `${
															blob.centerY * scale
														}px`,
														width: `${scaledSize}px`,
														height: `${scaledSize}px`,
														transform:
															"translate(-50%, -50%)",
														backgroundColor:
															blob.color,
														opacity: blob.opacity,
														boxShadow: `0 0 ${
															scaledSize * 0.5
														}px ${blob.color}`,
													}}
													title={`${
														blob.count
													} click${
														blob.count > 1
															? "s"
															: ""
													} at (${blob.centerX.toFixed(
														1
													)}, ${blob.centerY.toFixed(
														1
													)})`}
												/>
											);
										}
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
