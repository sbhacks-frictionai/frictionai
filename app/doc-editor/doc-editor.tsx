"use client";

import { Footer } from "@/components/footer";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PdfViewer from "./pdf-viewer";
import { AiSummary } from "./ai-summary";
import { StruggleMap } from "./struggle-map";
import { CommentSection } from "./comment-section";
import { getDocumentService } from "@/app/supabase-service/document-service";

export function DocEditor() {
  const searchParams = useSearchParams();
  const className = searchParams.get("file_name") || "Document";
  const documentService = getDocumentService();
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  
  useEffect(() => {
    const fetchPdfBlob = async () => {
      const documentId = searchParams.get("id");
      if (documentId) {
        try {
          const blob = await documentService.getFileBlob(documentId);
          setPdfBlob(blob);
        } catch (error) {
          console.error("Error fetching PDF blob:", error);
        }
      }
    };
    fetchPdfBlob();
  }, [searchParams]);

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      {/* Main Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-5 space-y-6">
        {/* Class/Document Title */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold">{className}</h1>
        </div>

        {/* PDF Editor Area */}
        <PdfViewer file={pdfBlob} />

        {/* AI Summary Area */}
        <AiSummary />

        {/* Struggle Map Area */}
        <StruggleMap />

        {/* Comment Section */}
        <CommentSection />
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
