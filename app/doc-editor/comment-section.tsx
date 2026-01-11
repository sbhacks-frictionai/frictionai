"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCommentService } from "@/app/supabase-service/comment-service";
import { useSearchParams } from "next/navigation";
export interface Comment {
  content: string;
  timestamp: string;
}

export function CommentSection() {
  const searchParams = useSearchParams();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const commentService = getCommentService();

  useEffect(() => {
    const fetchComments = async () => {
      const comments = await getCommentService().getComments(searchParams.get("id") || "");
      console.log(comments);
      setComments(comments);
    };
   
    fetchComments();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentText.trim()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      // TODO: Replace with actual API call to save comment
      // For now, add to local state as a placeholder
      const newComment=  commentText.trim();
      const data = await commentService.createComment(searchParams.get("id") || "", newComment);
      
      setComments([data, ...comments]);
      setCommentText("");
      
      // Here you would call the comment service:
      // const commentService = getCommentService();
      // await commentService.createComment(documentId, commentText);
    } catch (error) {
      console.error("Error submitting comment:", error);
      // You could add error handling/toast notification here
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Comments</CardTitle>
        <CardDescription>Discussion and questions about this document</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Comment Input Form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className={cn(
              "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
            )}
            disabled={isSubmitting}
          />
          <div className="flex justify-end mt-2">
            <Button 
              type="submit" 
              disabled={!commentText.trim() || isSubmitting}
              size="sm"
            >
              {isSubmitting ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </form>

        {/* Comments List */}
        <div className="space-y-4">
          {comments.map((comment, index) => (
            <div key={index} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between mb-2">
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
