import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface Comment {
  author: string;
  content: string;
  timestamp: string;
}

export function CommentSection() {
  const placeholderComments: Comment[] = [
    {
      author: "Student A",
      content: "This section on time complexity was really helpful! The examples clarified a lot.",
      timestamp: "2 hours ago",
    },
    {
      author: "Student B",
      content: "Can someone explain the difference between BFS and DFS in simpler terms?",
      timestamp: "5 hours ago",
    },
    {
      author: "Student C",
      content: "The recursion examples are great, but I'm still struggling with the base case. Any tips?",
      timestamp: "1 day ago",
    },
    {
      author: "Student D",
      content: "Thanks for the explanation on hash tables! Much clearer now.",
      timestamp: "2 days ago",
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>Discussion and questions about this document</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {placeholderComments.map((comment, index) => (
            <div key={index} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-sm">{comment.author}</p>
                <p className="text-xs text-muted-foreground">{comment.timestamp}</p>
              </div>
              <p className="text-sm text-muted-foreground">{comment.content}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
