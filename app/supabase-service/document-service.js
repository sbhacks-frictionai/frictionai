import {createClient} from "@/lib/supabase/client";

export const getDocumentService = () => {
  const supabase = createClient();

  const uploadDocument = async (filename, file) => {
    const { data, error } = await supabase
      .storage
      .from('documents')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false
      });
      if (error) throw error;
      return data;
  };

  const getFilePathById= async (documentId) => {
    const { data, error } = await supabase.from("documents").select("bucket_path").eq("id", documentId);
    if (error) throw error;
    return data[0].bucket_path;
  }

  return {
    getAllDocumentByCourseId: async (courseId) => {
      const { data, error } = await supabase.from("documents").select("*").eq("course_id", courseId);
      if (error) throw error;
      return data;
    },
    getDocumentPathById: async (documentId) => {
      const { data, error } = await supabase.from("documents").select("path").eq("id", documentId);
      if (error) throw error;
      return data[0].path;
    },
    uploadDocument,
    createDocument: async (filename, file, courseId, topic) => {
      if (!filename || !file || !courseId || !topic) return null;
      const data = await uploadDocument(filename, file);
      const path = data.path;
      const { docData, error} = await supabase.from("documents").insert(
        {
          course_id: courseId,
          bucket_path: path,
          file_name: filename,
          topic: topic == "" ? "General" : topic
        })
        .select()
        .single();
      if (error) throw error;
      return docData;
    },
    getFilePathById,
    getFileBlob: async (documentId) => {
      const filePath = await getFilePathById(documentId);
      const { data, error } = await supabase.storage.from('documents').download(filePath);
      if (error) throw error;
      return data; // Return just the blob without triggering download
    },
    


  };
};

