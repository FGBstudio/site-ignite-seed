import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useUpdateMilestone(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      milestoneId,
      updates,
    }: {
      milestoneId: string;
      updates: { score?: number; status?: string; evidence_url?: string; notes?: string };
    }) => {
      const { error } = await supabase
        .from("certification_milestones")
        .update(updates as any)
        .eq("id", milestoneId);
      if (error) throw error;

      // Recalculate total score for certification
      if (certificationId && updates.score !== undefined) {
        const { data: milestones } = await supabase
          .from("certification_milestones")
          .select("score")
          .eq("certification_id", certificationId);

        const totalScore = (milestones || []).reduce((sum, m) => sum + Number(m.score), 0);

        const { error: certError } = await supabase
          .from("certifications")
          .update({ score: totalScore })
          .eq("id", certificationId);
        if (certError) throw certError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["certification"] });
      toast({ title: "Milestone aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

export function useUploadEvidence() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ file, milestoneId }: { file: File; milestoneId: string }) => {
      const ext = file.name.split(".").pop();
      const path = `milestones/${milestoneId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("evidence").getPublicUrl(path);
      return urlData.publicUrl;
    },
    onError: (err: any) => {
      toast({ title: "Errore upload", description: err.message, variant: "destructive" });
    },
  });
}
