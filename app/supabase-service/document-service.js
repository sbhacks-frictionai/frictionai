import {createClient} from "@/lib/supabase/client";

export const getDocumentService = () => {
  const supabase = createClient();

  return {
    getALlDocumentByCourseId: async (courseId) => {
      const { data, error } = await supabase.from("documents").select("*").eq("course_id", courseId);
      if (error) throw error;
      return data;
    },
    getDocumentPathById: async (documentId) => {
      const { data, error } = await supabase.from("documents").select("path").eq("id", documentId);
      if (error) throw error;
      return data[0].path;
    }
  };
};

