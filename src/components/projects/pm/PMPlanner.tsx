import { Fragment, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCertHoursBurn } from "@/hooks/useHoursBudget";
import {
  useCalendarSlots,
  useCreateSlot,
  useDeleteSlot,
  useUpdateMilestoneBudget,
  useCreateChangeRequest,
} from "@/hooks/useCapacityPlanner";
import { Trash2 } from "lucide-react";

const SLOT_KINDS = [
  { value: "project", label: "Project", cls: "bg-primary/15 text-primary border-primary/40" },
  { value: "admin", label: "Admin", cls: "bg-muted text-foreground border-border" },
  { value: "pto", label: "PTO", cls: "bg-success/15 text-success border-success/40" },
  { value: "sick", label: "Sick", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  { value: "training", label: "Training", cls: "bg-warning/15 text-warning border-warning/40" },
] as const;

type Kind = (typeof SLOT_KINDS)[number]["value"];

function useMyCerts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-certs-simple", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, allocated_hours")
        .eq("pm_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useMilestones(certId: string | null) {
  return useQuery({
    queryKey: ["certification-milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("id, requirement, allocated_hours, order_index, status")
        .eq("certification_id", certId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function PMPlanner() {
  const [selectedCert, setSelectedCert] = useState<string | null>(null);
  const { data: certs = [] } = useMyCerts();

  return (
    <div className="space-y-6">
      <ContractOverview onSelect={setSelectedCert} selected={selectedCert} />
      {selectedCert && <MilestoneMapping certId={selectedCert} certs={certs as any} />}
      <WeeklyScheduler certs={certs as any} selectedCert={selectedCert} />
    </div>
  );
}

function ContractOverview({
  onSelect,
  selected,
}: {
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const { data: rows = [], isLoading } = useCertHoursBurn();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1 · Contract Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No projects assigned.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Consumed</TableHead>
                <TableHead className="w-[200px]">Progress</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const pct = r.pct_used ?? 0;
                return (
                  <TableRow
                    key={r.certification_id}
                    className={selected === r.certification_id ? "bg-muted/50" : ""}
                  >
                    <TableCell className="font-medium">{r.certification_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.allocated_hours) > 0 ? `${r.allocated_hours}h` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.consumed_hours)}h</TableCell>
                    <TableCell>
                      <Progress value={Math.min(pct, 100)} className="h-2" />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={selected === r.certification_id ? "default" : "outline"}
                        onClick={() => onSelect(r.certification_id)}
                      >
                        {selected === r.certification_id ? "Selected" : "Plan"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MilestoneMapping({
  certId,
  certs,
}: {
  certId: string;
  certs: { id: string; name: string; allocated_hours: number | null }[];
}) {
  const { data: milestones = [] } = useMilestones(certId);
  const update = useUpdateMilestoneBudget();
  const cert = certs.find((c) => c.id === certId);
  const contract = Number(cert?.allocated_hours ?? 0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const totalPlanned = useMemo(() => {
    return milestones.reduce((sum, m: any) => {
      const v = drafts[m.id] ?? String(m.allocated_hours ?? 0);
      return sum + (Number(v) || 0);
    }, 0);
  }, [milestones, drafts]);

  const overBudget = contract > 0 && totalPlanned > contract;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">2 · Milestone Mapping</CardTitle>
        <div className="text-sm">
          Allocated:{" "}
          <span className={overBudget ? "text-destructive font-semibold" : "text-foreground font-semibold"}>
            {totalPlanned}h / {contract}h
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No milestones on this project.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Milestone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Allocated hours</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m: any) => {
                const current = drafts[m.id] ?? String(m.allocated_hours ?? "");
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.requirement}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {m.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={current}
                        onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                        className="h-8 w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={overBudget}
                        onClick={() =>
                          update.mutate(
                            { id: m.id, allocated_hours: Number(current) || null },
                            {
                              onSuccess: () => {
                                toast.success("Budget saved");
                                setDrafts((d) => {
                                  const n = { ...d };
                                  delete n[m.id];
                                  return n;
                                });
                              },
                              onError: (e: any) => toast.error(e.message ?? "Failed"),
                            },
                          )
                        }
                      >
                        Save
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {overBudget && (
          <p className="mt-3 text-xs text-destructive">
            Total planned hours exceed the contract budget. Reduce allocations or file a change request.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const HOURS = Array.from({ length: 22 }, (_, i) => 8 + i * 0.5); // 08:00 – 19:00 by 30min

function WeeklyScheduler({
  certs,
  selectedCert,
}: {
  certs: { id: string; name: string }[];
  selectedCert: string | null;
}) {
  const { user } = useAuth();
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();
  const { data: slots = [] } = useCalendarSlots(from, to, user?.id);
  const createSlot = useCreateSlot();
  const deleteSlot = useDeleteSlot();

  const [kind, setKind] = useState<Kind>("project");
  const [certForSlot, setCertForSlot] = useState<string | null>(selectedCert);
  const [changeReq, setChangeReq] = useState<{ certId: string; delta: number } | null>(null);

  const slotMap = useMemo(() => {
    const m = new Map<string, typeof slots[number]>();
    for (const s of slots) {
      const dt = new Date(s.slot_start);
      const key = `${format(dt, "yyyy-MM-dd")}_${dt.getHours() + dt.getMinutes() / 60}`;
      m.set(key, s);
    }
    return m;
  }, [slots]);

  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const handleCellClick = (day: Date, hour: number) => {
    const key = `${format(day, "yyyy-MM-dd")}_${hour}`;
    const existing = slotMap.get(key);
    if (existing) {
      deleteSlot.mutate(existing.id);
      return;
    }
    if (kind === "project" && !certForSlot) {
      toast.error("Pick a project first");
      return;
    }
    const dt = new Date(day);
    dt.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    createSlot.mutate({
      certification_id: kind === "project" ? certForSlot : null,
      milestone_id: null,
      slot_start: dt.toISOString(),
      duration_minutes: 30,
      kind,
      note: null,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          3 · Weekly Scheduler · {format(weekStart, "d MMM yyyy")}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kind === "project" && (
            <Select value={certForSlot ?? ""} onValueChange={setCertForSlot}>
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder="Project…" />
              </SelectTrigger>
              <SelectContent>
                {certs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">
          Click a cell to add a 30-min slot. Click again to remove it.
        </p>
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `60px repeat(5, 1fr)` }}>
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="text-center text-xs font-semibold py-1 border-b">
                {format(d, "EEE d")}
              </div>
            ))}
            {HOURS.map((h) => (
              <Fragment key={`row-${h}`}>
                <div key={`lbl-${h}`} className="text-[10px] text-muted-foreground pr-2 text-right pt-1">
                  {`${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`}
                </div>
                {days.map((d) => {
                  const key = `${format(d, "yyyy-MM-dd")}_${h}`;
                  const slot = slotMap.get(key);
                  const kindMeta = slot ? SLOT_KINDS.find((k) => k.value === slot.kind) : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCellClick(d, h)}
                      className={`h-6 border border-border/50 text-[10px] truncate transition-colors ${
                        slot ? kindMeta?.cls ?? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      {slot ? kindMeta?.label : ""}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {SLOT_KINDS.map((k) => (
              <Badge key={k.value} variant="outline" className={k.cls}>
                {k.label}
              </Badge>
            ))}
          </div>
          {selectedCert && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setChangeReq({ certId: selectedCert, delta: 0 })}
            >
              Request budget change
            </Button>
          )}
        </div>
      </CardContent>
      <ChangeRequestDialog request={changeReq} onClose={() => setChangeReq(null)} />
    </Card>
  );
}

function ChangeRequestDialog({
  request,
  onClose,
}: {
  request: { certId: string; delta: number } | null;
  onClose: () => void;
}) {
  const create = useCreateChangeRequest();
  const [delta, setDelta] = useState("0");
  const [reason, setReason] = useState("");

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget change request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Additional hours</label>
            <Input type="number" step={0.5} value={delta} onChange={(e) => setDelta(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Reason</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!reason.trim() || !request}
            onClick={() =>
              request &&
              create.mutate(
                { certification_id: request.certId, delta_hours: Number(delta), reason },
                {
                  onSuccess: () => {
                    toast.success("Change request submitted");
                    setDelta("0");
                    setReason("");
                    onClose();
                  },
                  onError: (e: any) => toast.error(e.message ?? "Failed"),
                },
              )
            }
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
