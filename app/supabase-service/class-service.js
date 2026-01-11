import {createClient} from "@/lib/supabase/client";

export const getClassService = () => {
  const supabase = createClient();

  return {
    getClasses: async () => {
      const { data, error } = await supabase.from("courses").select("*");
      if (error) throw error;
      return data;
    },
  };
};