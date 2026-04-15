import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, AlertTriangle, Shield, MessageSquare } from "lucide-react";

interface ProjectCanvasProps {
  certificationId: string;
}

const ENTRY_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  meeting_minutes: { label: "Meeting Minutes", color: "bg-primary/10 text-primary border-primary/20", icon: FileText },
  admin_support_request: { label: "Support Request", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  admin_note: { label: "Admin Note", color: "bg-warning/10 text-warning border-warning/20", icon: Shield },
  general: { label: "Note", color: "bg-muted text-muted-foreground border-border", icon: MessageSquare },
};

export function ProjectCanvas({ certificationId }: ProjectCanvasProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState("meeting_minutes");
  const [content, setContent] = useState("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["canvas-entries", certificationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_canvas_entries")
        .select("*")
        .eq("certification_id", certificationId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Fetch author profiles separately
      const authorIds = [...new Set((data || []).map((e: any) => e.author_id))];
      if (authorIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, email")
        .in("id", authorIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return (data || []).map((e: any) => ({
        ...e,
        author: profileMap.get(e.author_id) || null,
      }));
    },
    enabled: !!certificationId,
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      if (!user?.id || !content.trim()) throw new Error("Missing data");
      const { error } = await (supabase as any)
        .from("project_canvas_entries")
        .insert({
          certification_id: certificationId,
          author_id: user.id,
          entry_type: entryType,
          content: content.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canvas-entries", certificationId] });
      setContent("");
      setShowForm(false);
      toast.success("Entry added to canvas");
    },
    onError: () => toast.error("Failed to add entry"),
  });

  const getAuthorName = (author: any) => {
    if (!author) return "Unknown";
    return author.display_name || author.full_name || author.email || "Unknown";
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg">Project Canvas</CardTitle>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Entry
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <Card className="border-dashed border-2 border-primary/30">
            <CardContent className="pt-4 space-y-3">
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting_minutes">Meeting Minutes</SelectItem>
                  <SelectItem value="general">General Note</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Paste meeting minutes or add a note..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setContent(""); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => createEntry.mutate()} disabled={!content.trim() || createEntry.isPending}>
                  {createEntry.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading canvas...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No entries yet. Click "Add Entry" to start the project journal.
          </div>
        ) : (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            {entries.map((entry: any) => {
              const config = ENTRY_TYPE_CONFIG[entry.entry_type] || ENTRY_TYPE_CONFIG.general;
              const authorName = getAuthorName(entry.author);
              const date = new Date(entry.created_at);
              const Icon = config.icon;

              const actionVerb = entry.entry_type === "admin_support_request"
                ? "has requested admin support"
                : entry.entry_type === "admin_note"
                  ? "has added an admin note"
                  : "has updated the canvas";

              return (
                <div key={entry.id} className="relative pl-12 pb-6">
                  {/* Timeline dot */}
                  <div className="absolute left-[14px] top-1 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-background" />

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-muted">
                          {getInitials(authorName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        <span className="font-semibold text-foreground">{authorName}</span>
                        <span className="text-muted-foreground"> {actionVerb} on {format(date, "dd/MM/yyyy")} at {format(date, "HH:mm")}</span>
                      </span>
                    </div>

                    <Badge variant="outline" className={`text-[11px] gap-1 ${config.color}`}>
                      <Icon className="h-3 w-3" /> {config.label}
                    </Badge>

                    <div className="mt-2 text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border">
                      {entry.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
