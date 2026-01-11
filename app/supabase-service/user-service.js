import {createClient} from "@/lib/supabase/client";

export const getUserService = () => {
  const supabase = createClient();

  return {
   getUserById: async (userId) => {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    return data[0];
   },
   getUserNameById: async (userId) => {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    return data[0].email.split("@")[0];
   },
  };
};