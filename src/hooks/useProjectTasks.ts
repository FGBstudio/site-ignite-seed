import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProjectTask {
  id: string;
  certification_id: string;
  task_name: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  dependency_id: string | null;
  blocking_payment_id: string | null;
  created_at: string;
}

export function useProjectTasks(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["certification-tasks", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .select("*")
        .eq("certification_id", certificationId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ProjectTask[];
    },
    enabled: !!certificationId,
  });
}

export function useCreateTask(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (task: Partial<ProjectTask>) => {
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .insert({ ...task, certification_id: certificationId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certification-tasks", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["resource-saturation"] });
      toast({ title: "Task creato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateTask(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProjectTask> & { id: string }) => {
      const { error } = await supabase
        .from("project_tasks" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certification-tasks", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["resource-saturation"] });
      toast({ title: "Task aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteTask(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("project_tasks" as any)
        .delete()
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certification-tasks", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["resource-saturation"] });
      toast({ title: "Task eliminato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}
