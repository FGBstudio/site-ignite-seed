import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserOption {
  id: string;
  display_name: string;
  email: string | null;
}

/** All authenticated users (from profiles). Used for assignee pickers. */
export function useAllUsers() {
  return useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, first_name, last_name, email")
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []).map((p) => {
        const display_name =
          p.full_name ||
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.email ||
          "User";
        return { id: p.id, display_name, email: p.email } as UserOption;
      });
    },
  });
}

export interface CertificationOption {
  id: string;
  name: string;
  client: string | null;
}

/** Certifications visible to the user, for project pickers. */
export function useCertificationOptions() {
  return useQuery({
    queryKey: ["certification-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, client")
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as CertificationOption[];
    },
  });
}
