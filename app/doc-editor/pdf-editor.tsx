import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function PdfEditor() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>PDF Editor</CardTitle>
        <CardDescription>Upload and view your PDF document here</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-96 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10">
          <p className="text-muted-foreground">PDF Editor Placeholder</p>
        </div>
      </CardContent>
    </Card>
  );
}
