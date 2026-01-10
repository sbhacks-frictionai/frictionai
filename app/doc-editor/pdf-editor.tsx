"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PdfEditor() {
  const [isLoading, setIsLoading] = useState(false);

  const handleUpload = () => {
    // Placeholder for PDF upload functionality
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // In a real implementation, this would handle the PDF upload
    }, 1000);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>PDF Editor</CardTitle>
        <CardDescription>Upload and view your PDF document here</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10 gap-4">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Loading PDF...</p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">PDF Editor Placeholder</p>
              <Button onClick={handleUpload} variant="outline" size="sm">
                Upload PDF
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
