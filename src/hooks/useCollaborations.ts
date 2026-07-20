import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CollabScope = "certification" | "phase" | "tasks";
export type CollabStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "revoked";

export interface CertCollaboration {
  id: string;
  certification_id: string;
  owner_pm_id: string;
  guest_pm_id: string;
  scope: CollabScope;
  phase_ids: string[];
  task_ids: string[];
  estimated_hours: number | null;
  message: string | null;
  status: CollabStatus;
  admin_id: string | null;
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined (optional)
  certifications?: { id: string; name: string | null; client: string | null } | null;
  owner?: { id: string; full_name: string | null; email: string | null } | null;
  guest?: { id: string; full_name: string | null; email: string | null } | null;
}

const SELECT_COLLAB_JOIN = `
  *,
  certifications!cert_collaborations_certification_id_fkey(id, name, client),
  owner:profiles!cert_collaborations_owner_pm_id_fkey(id, full_name, email),
  guest:profiles!cert_collaborations_guest_pm_id_fkey(id, full_name, email)
`;

async function fetchCollabsRaw(filter: (q: any) => any) {
  // Try join first, fall back to plain if FK aliases fail
  let q = (supabase as any).from("cert_collaborations").select("*");
  q = filter(q);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CertCollaboration[];
}

async function hydrate(rows: CertCollaboration[]): Promise<CertCollaboration[]> {
  if (rows.length === 0) return rows;
  const certIds = [...new Set(rows.map((r) => r.certification_id))];
  const userIds = [...new Set(rows.flatMap((r) => [r.owner_pm_id, r.guest_pm_id]))];
  const [{ data: certs }, { data: profiles }] = await Promise.all([
    (supabase as any).from("certifications").select("id, name, client").in("id", certIds),
    (supabase as any).from("profiles").select("id, full_name, email").in("id", userIds),
  ]);
  const certMap = new Map((certs ?? []).map((c: any) => [c.id, c]));
  const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    certifications: certMap.get(r.certification_id) ?? null,
    owner: profMap.get(r.owner_pm_id) ?? null,
    guest: profMap.get(r.guest_pm_id) ?? null,
  }));
}

// ─── Owner ───
export function useMyCollabRequestsForCert(certId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["collab-owner", certId, user?.id],
    enabled: !!certId && !!user?.id,
    queryFn: async () => {
      const rows = await fetchCollabsRaw((q) =>
        q.eq("certification_id", certId).eq("owner_pm_id", user!.id),
      );
      return hydrate(rows);
    },
  });
}

// ─── Guest ───
export function useCollabsIAmGuestOf() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["collab-guest", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const rows = await fetchCollabsRaw((q) => q.eq("guest_pm_id", user!.id));
      return hydrate(rows);
    },
  });
}

// ─── Admin ───
export function useAdminCollabRequests(status?: CollabStatus | "all") {
  return useQuery({
    queryKey: ["collab-admin", status ?? "all"],
    queryFn: async () => {
      const rows = await fetchCollabsRaw((q) =>
        !status || status === "all" ? q : q.eq("status", status),
      );
      return hydrate(rows);
    },
  });
}

// ─── PM directory (for the invite picker) ───
export function usePMUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pm-users"],
    queryFn: async () => {
      const { data: roles, error } = await (supabase as any)
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "PM");
      if (error) throw error;
      const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))].filter(
        (id: string) => id !== user?.id,
      );
      if (ids.length === 0) return [] as { id: string; full_name: string | null; email: string | null }[];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profiles ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });
}

// ─── Mutations ───
export function useCreateCollabRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      certification_id: string;
      guest_pm_id: string;
      scope: CollabScope;
      phase_ids?: string[];
      task_ids?: string[];
      estimated_hours?: number | null;
      message?: string | null;
    }) => {
      const { error, data } = await (supabase as any)
        .from("cert_collaborations")
        .insert({
          certification_id: input.certification_id,
          owner_pm_id: user!.id,
          guest_pm_id: input.guest_pm_id,
          scope: input.scope,
          phase_ids: input.phase_ids ?? [],
          task_ids: input.task_ids ?? [],
          estimated_hours: input.estimated_hours ?? null,
          message: input.message ?? null,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collab-owner"] });
      qc.invalidateQueries({ queryKey: ["collab-admin"] });
    },
  });
}

export function useDecideCollabRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "approved" | "rejected" | "changes_requested";
      admin_note?: string | null;
    }) => {
      const { error, data } = await (supabase as any)
        .from("cert_collaborations")
        .update({
          status: input.decision,
          admin_id: user!.id,
          admin_note: input.admin_note ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collab-admin"] });
      qc.invalidateQueries({ queryKey: ["collab-owner"] });
      qc.invalidateQueries({ queryKey: ["collab-guest"] });
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    },
  });
}

export function useRevokeCollabRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("cert_collaborations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collab-owner"] });
      qc.invalidateQueries({ queryKey: ["collab-admin"] });
      qc.invalidateQueries({ queryKey: ["collab-guest"] });
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    },
  });
}
