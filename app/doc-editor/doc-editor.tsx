"use client";

import { Footer } from "@/components/footer";
import { useSearchParams } from "next/navigation";
import { PdfEditor } from "./pdf-editor";
import { AiSummary } from "./ai-summary";
import { StruggleMap } from "./struggle-map";
import { CommentSection } from "./comment-section";

export function DocEditor() {
  const searchParams = useSearchParams();
  const className = searchParams.get("class") || "Document";

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      {/* Main Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-5 space-y-6">
        {/* Class/Document Title */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold">{className}</h1>
        </div>

        {/* PDF Editor Area */}
        <PdfEditor />

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
