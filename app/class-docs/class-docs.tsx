"use client";

import { Footer } from "@/components/footer";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDocumentService } from "@/app/supabase-service/document-service";

interface Document {
  id: string;
  course_id: string;
  bucket_path: string;
  file_name: string;
  total_clicks: number;
  topic: string;
}

export function ClassDocs() {
  const searchParams = useSearchParams();
  const className = searchParams.get("class") || "Class";
  const courseId = searchParams.get("course_id") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [topic, setTopic] = useState("");
  const [documentList, setDocumentList] = useState<Document[]>([]);
  const documentService = getDocumentService();
  // Helper function to remove file extension
  const removeFileExtension = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || fileName[0] == '.') return fileName;
    return fileName.substring(0, lastDotIndex);
  };

  // Group documents by topic and filter out placeholder entries
  const groupedDocuments = documentList
    .reduce((acc, doc) => {
      const topic = doc.topic || "General";
      if (!acc[topic]) {
        acc[topic] = [];
      }
      acc[topic].push(doc);
      return acc;
    }, {} as Record<string, Document[]>);

  const topics = Object.keys(groupedDocuments);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check if file is PDF
      if (file.type !== "application/pdf") {
        alert("Please upload a PDF file");
        return;
      }
      // Store the file and show the form
      setSelectedFile(file);
      setFileName(file.name.replace(".pdf", "")); // Pre-fill with file name without extension
      setShowForm(true);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile || !fileName.trim() || !topic.trim()) {
      alert("Please fill in all fields");
      return;
    }

    // Close the form
    setShowForm(false);
    
    // Handle file upload
    setUploading(true);
    
    documentService.createDocument(fileName.trim(),selectedFile, courseId, topic.trim()).then((docData)=> {
      setUploading(false);
      window.location.reload();
    });
    
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedFile(null);
    setFileName("");
    setTopic("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
      if (!courseId) {
        return;
      }

      const fetchDocuments = async () => {
        const documents = await getDocumentService().getAllDocumentByCourseId(courseId);
        console.log(documents);
        setDocumentList(documents);
      };
      fetchDocuments();
    }, [courseId]);

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      {/* Upload Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border border-border shadow-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-2xl font-semibold">Upload PDF</h2>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fileName">File Name</Label>
                <Input
                  id="fileName"
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Enter file name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter topic (e.g., Topic 1: Intro to C++)"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFormCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploading}
                  className="flex-1"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-5 space-y-6">
        {/* Class Title */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold">{className}</h1>
        </div>

        {/* Search Bar and Upload Button */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <input
            type="text"
            placeholder="Search course documents…"
            className="w-full max-w-lg px-5 py-3 rounded-lg border border-border bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring
                       text-base"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={handleUploadClick}
            disabled={uploading}
            className="whitespace-nowrap"
          >
            {uploading ? "Uploading..." : "📄 Upload PDF"}
          </Button>
        </div>

        {/* Topics & Documents */}
        <div className="space-y-8">
          {topics.length > 0 ? (
            topics.map((topic) => (
              <section key={topic}>
                <h2 className="text-2xl font-semibold mb-4 text-foreground">
                  {topic}
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  {groupedDocuments[topic].map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/doc-editor?id=${encodeURIComponent(doc.id)}&file_name=${encodeURIComponent(doc.file_name)}`}
                      className="bg-card rounded-lg border border-border shadow-sm transition-transform flex items-center gap-4
                                 p-4 cursor-pointer hover:-translate-y-1 hover:shadow-md"
                    >
                      <div className="p-2 bg-muted rounded-lg flex items-center justify-center">
                        <span
                          className="text-xl"
                          role="img"
                          aria-label="document"
                        >
                          📄
                        </span>
                      </div>
                      <span className="font-medium text-sm text-foreground">
                        {removeFileExtension(doc.file_name)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No documents found. Upload a PDF to get started!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
