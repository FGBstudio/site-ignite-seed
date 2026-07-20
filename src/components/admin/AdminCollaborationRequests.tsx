import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, MessageSquare, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminCollabRequests,
  useDecideCollabRequest,
  type CollabStatus,
  type CertCollaboration,
} from "@/hooks/useCollaborations";

function name(p?: { full_name: string | null; email: string | null } | null) {
  return p?.full_name || p?.email || "—";
}

const STATUS_BADGE: Record<CollabStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  changes_requested: "bg-primary/10 text-primary border-primary/30",
  revoked: "bg-muted text-muted-foreground border-border",
};

export function AdminCollaborationRequests() {
  const [statusFilter, setStatusFilter] = useState<CollabStatus | "all">("pending");
  const { data: rows = [], isLoading } = useAdminCollabRequests(statusFilter);
  const decide = useDecideCollabRequest();
  const [decision, setDecision] = useState<{
    row: CertCollaboration;
    kind: "approved" | "rejected" | "changes_requested";
  } | null>(null);
  const [note, setNote] = useState("");

  const submit = () => {
    if (!decision) return;
    decide.mutate(
      { id: decision.row.id, decision: decision.kind, admin_note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`Request ${decision.kind.replace("_", " ")}`);
          setDecision(null);
          setNote("");
        },
        onError: (e: any) => toast.error(e.message ?? "Failed"),
      },
    );
  };

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersRound className="w-4 h-4" />
            Collaboration Requests
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingCount} pending
              </Badge>
            )}
          </CardTitle>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="changes_requested">Changes requested</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No requests.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner PM</TableHead>
                  <TableHead>Guest PM</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{name(r.owner)}</TableCell>
                    <TableCell>{name(r.guest)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {r.certifications?.name ?? "—"}
                      {r.certifications?.client && (
                        <span className="text-xs text-muted-foreground block uppercase">
                          {r.certifications.client}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {r.scope}
                        {r.scope === "tasks" ? ` (${r.task_ids.length})` : ""}
                        {r.scope === "phase" ? ` (${r.phase_ids.length})` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.estimated_hours ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground truncate">
                      {r.message ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[r.status]}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(r.created_at), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => {
                              setDecision({ row: r, kind: "approved" });
                              setNote("");
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => {
                              setDecision({ row: r, kind: "changes_requested" });
                              setNote("");
                            }}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => {
                              setDecision({ row: r, kind: "rejected" });
                              setNote("");
                            }}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.kind === "approved" && "Approve collaboration"}
              {decision?.kind === "rejected" && "Reject collaboration"}
              {decision?.kind === "changes_requested" && "Request changes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {decision && (
                <>
                  <strong>{name(decision.row.owner)}</strong> → <strong>{name(decision.row.guest)}</strong> on{" "}
                  <em>{decision.row.certifications?.name ?? "—"}</em>
                </>
              )}
            </p>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                decision?.kind === "approved"
                  ? "Optional note for owner and guest"
                  : "Reason for the decision"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              disabled={decide.isPending || (decision?.kind !== "approved" && !note.trim())}
              onClick={submit}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
