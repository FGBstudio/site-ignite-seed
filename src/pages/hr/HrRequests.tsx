import { useMemo, useState } from "react";
import { nomePersona } from "@/lib/nomePersona";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  RequestType,
  useCreateRequest,
  useDeleteRequest,
  useHrProfiles,
  useHrRequests,
  useUpdateRequestStatus,
} from "@/hooks/useHr";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const TYPE_LABEL: Record<RequestType, string> = {
  holiday: "Holiday",
  permit: "Permit",
  travel: "Travel",
};

export default function HrRequests() {
  const { user, isAdmin } = useAuth();
  const { data: requests = [] } = useHrRequests();
  const { data: profiles = [] } = useHrProfiles();
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const del = useDeleteRequest();

  const mine = useMemo(() => requests.filter((r) => r.user_id === user?.id), [requests, user]);
  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p ? nomePersona(p) : uid.slice(0, 8);
  };

  return (
    <MainLayout title="Leave & Permits" subtitle="Request holidays, permits and travel — managers approve.">
      <Tabs defaultValue="mine" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="mine">My requests</TabsTrigger>
            {isAdmin && <TabsTrigger value="queue">Approval queue ({pending.length})</TabsTrigger>}
          </TabsList>
          <NewRequestDialog />
        </div>

        <TabsContent value="mine" className="space-y-2">
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {mine.map((r) => (
            <Card key={r.id} className="p-4 flex items-center justify-between backdrop-blur-md bg-card/70">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {TYPE_LABEL[r.type]}
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {format(new Date(r.start_date), "dd MMM yyyy")} → {format(new Date(r.end_date), "dd MMM yyyy")}
                  {r.start_time && ` · ${r.start_time}–${r.end_time}`}
                </div>
                {r.reason && <div className="text-xs mt-1">{r.reason}</div>}
                {r.manager_note && (
                  <div className="text-xs mt-1 italic text-muted-foreground">Manager: {r.manager_note}</div>
                )}
              </div>
              {r.status === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="queue" className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
            {pending.map((r) => (
              <ApprovalRow
                key={r.id}
                request={r}
                personName={nameOf(r.user_id)}
                onApprove={(note) =>
                  updateStatus
                    .mutateAsync({ id: r.id, status: "approved", manager_note: note })
                    .then(() => toast({ title: "Approved" }))
                    .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
                }
                onReject={(note) =>
                  updateStatus
                    .mutateAsync({ id: r.id, status: "rejected", manager_note: note })
                    .then(() => toast({ title: "Rejected" }))
                    .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
                }
              />
            ))}
          </TabsContent>
        )}
      </Tabs>
    </MainLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${colorMap[status]}`}>{status}</span>;
}

function NewRequestDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RequestType>("holiday");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const create = useCreateRequest();
  const { toast } = useToast();

  const submit = async () => {
    if (!start || !end) {
      toast({ title: "Pick a date range", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        type,
        start_date: start,
        end_date: end,
        start_time: type === "permit" ? startTime || null : null,
        end_time: type === "permit" ? endTime || null : null,
        reason: reason || null,
      });
      toast({ title: "Request submitted" });
      setOpen(false);
      setStart(""); setEnd(""); setReason(""); setStartTime(""); setEndTime("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="holiday">Holiday</SelectItem>
              <SelectItem value="permit">Permit (hours)</SelectItem>
              <SelectItem value="travel">Travel</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start date</label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End date</label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {type === "permit" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Start time</label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End time</label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalRow({
  request,
  personName,
  onApprove,
  onReject,
}: {
  request: ReturnType<typeof useHrRequests>["data"] extends Array<infer T> | undefined ? T : never;
  personName: string;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Card className="p-4 backdrop-blur-md bg-card/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium">{personName} · {TYPE_LABEL[request.type]}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {format(new Date(request.start_date), "dd MMM yyyy")} → {format(new Date(request.end_date), "dd MMM yyyy")}
            {request.start_time && ` · ${request.start_time}–${request.end_time}`}
          </div>
          {request.reason && <div className="text-xs mt-1">{request.reason}</div>}
        </div>
        <Badge variant="secondary">{request.status}</Badge>
      </div>
      <div className="mt-3 flex gap-2 items-center">
        <Input placeholder="Manager note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" variant="default" onClick={() => onApprove(note)}>
          <Check className="w-4 h-4 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onReject(note)}>
          <X className="w-4 h-4 mr-1" /> Reject
        </Button>
      </div>
    </Card>
  );
}
