import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Contact, ContactInput, ContactKind } from "@/types/contacts";

const TABLE = "contacts";

export function useContacts(kind?: ContactKind) {
  return useQuery({
    queryKey: ["contacts", kind ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from(TABLE).select("*").order("company_name", { ascending: true });
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      const user = (await supabase.auth.getUser()).data.user;
      const payload = { ...input, created_by: user?.id ?? null };
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<ContactInput>) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
