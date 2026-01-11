import {createClient} from "@/lib/supabase/client";
import {getUserService} from "@/app/supabase-service/user-service";

export const getCommentService = () => {
  const supabase = createClient();
  return {
    getComments: async (documentId) => {
      const { data, error } = await supabase.from("comment").select("*").eq("document_id", documentId);
      if (error) throw error;
      return data;
    },
    createComment: async (documentId, content) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User must be authenticated to post comments");
      
      const { data, error } = await supabase
        .from("comment")
        .insert({
          document_id: documentId,
          content: content,
          author: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
  };
};