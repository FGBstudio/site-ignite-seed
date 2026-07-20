import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import {
  useCreateCollabRequest,
  useMyCollabRequestsForCert,
  usePMUsers,
  useRevokeCollabRequest,
  type CollabScope,
  type CollabStatus,
} from "@/hooks/useCollaborations";
import { useCertPhases, useCertTasksByProject } from "@/hooks/usePMPortalData";

const STATUS_META: Record<CollabStatus, { label: string; cls: string }> = {
  pending: { label: "Pending Admin", cls: "bg-warning/10 text-warning border-warning/30" },
  approved: { label: "Approved", cls: "bg-success/10 text-success border-success/30" },
  rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  changes_requested: {
    label: "Changes Requested",
    cls: "bg-primary/10 text-primary border-primary/30",
  },
  revoked: { label: "Revoked", cls: "bg-muted text-muted-foreground border-border" },
};

function displayName(p?: { full_name: string | null; email: string | null } | null) {
  return p?.full_name || p?.email || "Unknown";
}

export function CollaboratorsPanel({ certificationId }: { certificationId: string }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: requests = [], isLoading } = useMyCollabRequestsForCert(certificationId);
  const revoke = useRevokeCollabRequest();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Collaborators</h3>
          <p className="text-xs text-muted-foreground">
            Invite another PM to help you on this project. Admin approval is required before access
            is granted.
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Invite Collaborator
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6">Loading…</div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No collaboration requests yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            const meta = STATUS_META[r.status];
            const canRevoke = r.status === "pending" || r.status === "approved";
            return (
              <Card key={r.id}>
                <CardContent className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{displayName(r.guest)}</span>
                      <Badge variant="outline" className={meta.cls}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Scope: {r.scope}
                        {r.scope === "tasks" ? ` · ${r.task_ids.length} task(s)` : ""}
                        {r.scope === "phase" ? ` · ${r.phase_ids.length} phase(s)` : ""}
                      </Badge>
                      {r.estimated_hours != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {r.estimated_hours}h
                        </Badge>
                      )}
                    </div>
                    {r.message && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.message}</p>
                    )}
                    {r.admin_note && (
                      <p className="text-xs mt-1">
                        <span className="text-muted-foreground">Admin note: </span>
                        {r.admin_note}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Sent {format(new Date(r.created_at), "d MMM yyyy HH:mm")}
                    </p>
                  </div>
                  {canRevoke && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        revoke.mutate(r.id, {
                          onSuccess: () => toast.success("Request revoked"),
                          onError: (e: any) => toast.error(e.message ?? "Failed"),
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <InviteCollaboratorDialog
        certificationId={certificationId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}

function InviteCollaboratorDialog({
  certificationId,
  open,
  onOpenChange,
}: {
  certificationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: pms = [] } = usePMUsers();
  const { data: phases = [] } = useCertPhases(certificationId);
  const { data: tasks = [] } = useCertTasksByProject(certificationId);
  const create = useCreateCollabRequest();

  const [guestId, setGuestId] = useState<string>("");
  const [scope, setScope] = useState<CollabScope>("certification");
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [hours, setHours] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const submitDisabled = useMemo(() => {
    if (!guestId) return true;
    if (scope === "phase" && selectedPhases.length === 0) return true;
    if (scope === "tasks" && selectedTasks.length === 0) return true;
    return create.isPending;
  }, [guestId, scope, selectedPhases, selectedTasks, create.isPending]);

  const reset = () => {
    setGuestId("");
    setScope("certification");
    setSelectedPhases([]);
    setSelectedTasks([]);
    setHours("");
    setMessage("");
  };

  const submit = () => {
    create.mutate(
      {
        certification_id: certificationId,
        guest_pm_id: guestId,
        scope,
        phase_ids: scope === "phase" ? selectedPhases : [],
        task_ids: scope === "tasks" ? selectedTasks : [],
        estimated_hours: hours ? Number(hours) : null,
        message: message.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Request sent for admin approval");
          reset();
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e.message ?? "Failed to send request"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Collaborator</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Project Manager</Label>
            <Select value={guestId} onValueChange={setGuestId}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="Select a PM…" />
              </SelectTrigger>
              <SelectContent>
                {pms.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No other PMs found.</div>
                ) : (
                  pms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {displayName(p)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as CollabScope)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="certification">Entire certification</SelectItem>
                <SelectItem value="phase">Specific milestone(s)</SelectItem>
                <SelectItem value="tasks">Specific task(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "phase" && (
            <div>
              <Label className="text-xs">Milestones</Label>
              <div className="max-h-40 overflow-auto border rounded-md p-2 mt-1 space-y-1">
                {phases.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No milestones defined.</div>
                ) : (
                  phases.map((ph: any) => (
                    <label key={ph.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedPhases.includes(ph.id)}
                        onChange={(e) =>
                          setSelectedPhases((s) =>
                            e.target.checked ? [...s, ph.id] : s.filter((x) => x !== ph.id),
                          )
                        }
                      />
                      {ph.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {scope === "tasks" && (
            <div>
              <Label className="text-xs">Tasks</Label>
              <div className="max-h-40 overflow-auto border rounded-md p-2 mt-1 space-y-1">
                {tasks.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No tasks yet.</div>
                ) : (
                  tasks.map((t: any) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(t.id)}
                        onChange={(e) =>
                          setSelectedTasks((s) =>
                            e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id),
                          )
                        }
                      />
                      {t.title}
                    </label>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Tip: assign these tasks to the invited PM (assignee) so they can edit them once
                approved.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estimated hours</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Message / Justification</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why do you need this collaboration?"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitDisabled} onClick={submit}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
