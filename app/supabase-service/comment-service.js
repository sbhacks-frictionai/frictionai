import {createClient} from "@/lib/supabase/client";

export const getCommentService = () => {
  const supabase = createClient();

  return {
    getComments: async (documentId) => {
      const { data, error } = await supabase.from("comments").select("*").eq("document_id", documentId);
      if (error) throw error;
      return data;
    },
  };
};