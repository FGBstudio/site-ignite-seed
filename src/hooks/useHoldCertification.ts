import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Read the on_hold state of a certification.
 * Returns { on_hold, reason } — safe on missing / unauthenticated calls.
 */
export function useIsProjectOnHold(certId: string | null | undefined) {
  return useQuery({
    queryKey: ["cert-on-hold", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("on_hold, on_hold_reason, on_hold_at")
        .eq("id", certId)
        .maybeSingle();
      if (error) throw error;
      return {
        on_hold: !!data?.on_hold,
        reason: (data?.on_hold_reason as string | null) || null,
        at: (data?.on_hold_at as string | null) || null,
      };
    },
  });
}

export function useHoldCertification() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const hold = useMutation({
    mutationFn: async ({ certId, reason }: { certId: string; reason: string }) => {
      const { error } = await (supabase as any).rpc("admin_hold_certification", {
        _cert_id: certId,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Project placed on hold", description: "PMs can no longer edit until released." });
      qc.invalidateQueries({ queryKey: ["cert-on-hold", vars.certId] });
      qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
      qc.invalidateQueries({ queryKey: ["ceo-dashboard"] });
      qc.invalidateQueries({ queryKey: ["project-details", vars.certId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to hold project", description: err?.message || String(err), variant: "destructive" });
    },
  });

  const release = useMutation({
    mutationFn: async ({ certId }: { certId: string }) => {
      const { error } = await (supabase as any).rpc("admin_release_certification", {
        _cert_id: certId,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: "Project released", description: "Work can resume." });
      qc.invalidateQueries({ queryKey: ["cert-on-hold", vars.certId] });
      qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
      qc.invalidateQueries({ queryKey: ["ceo-dashboard"] });
      qc.invalidateQueries({ queryKey: ["project-details", vars.certId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to release project", description: err?.message || String(err), variant: "destructive" });
    },
  });

  return { hold, release };
}
