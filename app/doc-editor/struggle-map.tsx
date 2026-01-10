import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface StruggleTerm {
  term: string;
  summary: string;
  difficulty: "hard" | "medium" | "easy";
}

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case "hard":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    case "medium":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
    case "easy":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export function StruggleMap() {
  const struggleTerms: StruggleTerm[] = [
    {
      term: "Time Complexity",
      summary: "Time complexity measures how the runtime of an algorithm increases with input size. O(n) means linear time, O(log n) is logarithmic.",
      difficulty: "hard",
    },
    {
      term: "Binary Search Tree",
      summary: "A tree data structure where each node has at most two children, with left child values less than parent and right child values greater.",
      difficulty: "hard",
    },
    {
      term: "Hash Table",
      summary: "A data structure that maps keys to values using a hash function for efficient lookup, insertion, and deletion operations.",
      difficulty: "medium",
    },
    {
      term: "Recursion",
      summary: "A programming technique where a function calls itself to solve smaller instances of the same problem.",
      difficulty: "medium",
    },
    {
      term: "Graph Traversal",
      summary: "Methods to visit all nodes in a graph, including depth-first search (DFS) and breadth-first search (BFS).",
      difficulty: "medium",
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Struggle Map</CardTitle>
        <CardDescription>Terms from the PDF that may be challenging</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {struggleTerms.map((term, index) => (
            <Card key={index} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{term.term}</CardTitle>
                  <Badge
                    variant="outline"
                    className={getDifficultyColor(term.difficulty)}
                  >
                    {term.difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{term.summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
