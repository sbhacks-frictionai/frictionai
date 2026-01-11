import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AiSummary() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Summary</CardTitle>
        <CardDescription>AI-generated summary of the document</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This document covers fundamental concepts in data structures and algorithms,
            including arrays, linked lists, trees, and graph traversal methods. Key topics
            include time complexity analysis, space optimization, and common algorithmic patterns.
          </p>
          <p className="text-sm text-muted-foreground">
            The material emphasizes practical applications and problem-solving strategies
            for computer science students.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
