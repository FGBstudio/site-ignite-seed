import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface AuditEntry {
  id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  project_name?: string;
  user_name?: string;
}

export function AuditTrail() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*, projects(name), profiles:user_id(full_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        setLogs(
          data.map((d: any) => ({
            id: d.id,
            changed_field: d.changed_field,
            old_value: d.old_value,
            new_value: d.new_value,
            created_at: d.created_at,
            project_name: d.projects?.name,
            user_name: d.profiles?.full_name,
          }))
        );
      }
      setLoading(false);
    };

    fetchLogs();

    // Realtime subscription
    const channel = supabase
      .channel("audit_logs_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fieldLabels: Record<string, string> = {
    handover_date: "Handover Date",
    status: "Stato Progetto",
    allocation_requested: "Nuova Allocazione",
    allocation_status: "Stato Allocazione",
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      {logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Nessuna attività registrata.</div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{log.user_name || "Utente"}</span>{" "}
                ha modificato{" "}
                <Badge variant="outline" className="mx-1 text-xs">{fieldLabels[log.changed_field] || log.changed_field}</Badge>{" "}
                {log.project_name && (
                  <>su <span className="font-medium">{log.project_name}</span></>
                )}
              </p>
              {log.old_value && log.new_value && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <span className="line-through">{log.old_value}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{log.new_value}</span>
                </p>
              )}
              {!log.old_value && log.new_value && (
                <p className="text-xs text-muted-foreground mt-1">{log.new_value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(log.created_at), "dd MMM yyyy HH:mm", { locale: it })}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
