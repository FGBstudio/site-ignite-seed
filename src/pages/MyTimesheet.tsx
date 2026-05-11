import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMyTimeEntries, useCreateTimeEntry, useDeleteTimeEntry } from "@/hooks/useTimeEntries";
import { useMyCertifications, useCertMilestoneOptions } from "@/hooks/useMyCertifications";
import { useCertBurn, useMilestoneBurn } from "@/hooks/useHoursBudget";
import { getBudgetStatus } from "@/types/time-tracking";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  isToday,
} from "date-fns";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmtDb = (d: Date) => format(d, "yyyy-MM-dd");

export default function MyTimesheet() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  const { data: entries = [], isLoading } = useMyTimeEntries(fmtDb(weekStart), fmtDb(weekEnd));

  const dayEntries = useMemo(
    () => entries.filter((e) => isSameDay(parseISO(e.entry_date), selectedDate)),
    [entries, selectedDate],
  );

  const totalsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      map[e.entry_date] = (map[e.entry_date] ?? 0) + Number(e.hours);
    }
    return map;
  }, [entries]);

  const dayTotal = totalsByDay[fmtDb(selectedDate)] ?? 0;

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <MainLayout>
      <TooltipProvider>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <header className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">My Timesheet</h1>
                <p className="text-sm text-muted-foreground">Log hours per certification — frictionless, no blocks.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={isToday(selectedDate) ? "default" : "outline"}
                onClick={() => setSelectedDate(new Date())}
                className="min-w-[110px]"
              >
                {isToday(selectedDate) ? "Today" : format(selectedDate, "EEE d MMM")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Week strip */}
          <div className="rounded-2xl border bg-card/50 backdrop-blur-sm p-2 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = fmtDb(d);
              const total = totalsByDay[key] ?? 0;
              const selected = isSameDay(d, selectedDate);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 rounded-xl text-center transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {format(d, "EEE")}
                  </span>
                  <span className="text-base font-semibold">{format(d, "d")}</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      total > 0
                        ? selected
                          ? "opacity-90"
                          : "text-primary"
                        : "opacity-40",
                    )}
                  >
                    {total > 0 ? `${total}h` : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Day header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              {format(selectedDate, "EEEE, d MMMM yyyy")}
            </h2>
            <Badge variant="secondary" className="text-sm">
              {dayTotal}h logged
            </Badge>
          </div>

          {/* Entries */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
            ) : dayEntries.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No entries for this day yet. Add your first below.
                </CardContent>
              </Card>
            ) : (
              dayEntries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))
            )}
          </div>

          {/* Quick add */}
          <QuickAddBar selectedDate={selectedDate} />
        </div>
      </TooltipProvider>
    </MainLayout>
  );
}

function EntryRow({ entry }: { entry: { id: string; certification_id: string; milestone_id: string | null; hours: number; description: string | null; is_overbudget: boolean; overbudget_note: string | null } }) {
  const { data: certs = [] } = useMyCertifications();
  const { data: milestones = [] } = useCertMilestoneOptions(entry.certification_id);
  const del = useDeleteTimeEntry();

  const cert = certs.find((c) => c.id === entry.certification_id);
  const milestone = milestones.find((m) => m.id === entry.milestone_id);

  return (
    <Card className="group">
      <CardContent className="py-3 px-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
          {Number(entry.hours)}h
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {cert?.name || cert?.client || "—"}
            </span>
            {milestone && (
              <Badge variant="outline" className="text-[10px]">
                {milestone.requirement}
              </Badge>
            )}
            {entry.is_overbudget && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Over budget
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{entry.overbudget_note || "No reason provided"}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {entry.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => {
            if (confirm("Delete this entry?")) del.mutate(entry.id);
          }}
          aria-label="Delete entry"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </CardContent>
    </Card>
  );
}

function QuickAddBar({ selectedDate }: { selectedDate: Date }) {
  const { data: certs = [] } = useMyCertifications();
  const [certId, setCertId] = useState<string>("");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [description, setDescription] = useState("");
  const [overbudgetNote, setOverbudgetNote] = useState("");

  const { data: milestones = [] } = useCertMilestoneOptions(certId || null);
  const { data: certBurn } = useCertBurn(certId || null);
  const { data: msBurns = [] } = useMilestoneBurn(certId || null);

  const create = useCreateTimeEntry();

  const hoursNum = Number(hours) || 0;

  // Current allocations / consumption
  const certAllocated = certBurn?.allocated_hours ?? 0;
  const certConsumed = Number(certBurn?.consumed_hours ?? 0);
  const certProjected = certConsumed + hoursNum;
  const certStatus = getBudgetStatus(certProjected, certAllocated);

  const msBurn = msBurns.find((m) => m.milestone_id === milestoneId);
  const msAllocated = msBurn?.allocated_hours ?? 0;
  const msConsumed = Number(msBurn?.consumed_hours ?? 0);
  const msProjected = msConsumed + hoursNum;
  const msStatus = milestoneId ? getBudgetStatus(msProjected, msAllocated) : "none";

  const isOverbudget = certStatus === "red" || msStatus === "red";
  const needsNote = isOverbudget && hoursNum > 0;

  const canSubmit = !!certId && hoursNum > 0 && (!needsNote || overbudgetNote.trim().length > 0);

  const reset = () => {
    setMilestoneId("");
    setHours("");
    setDescription("");
    setOverbudgetNote("");
  };

  const handleAdd = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        certification_id: certId,
        milestone_id: milestoneId || null,
        entry_date: fmtDb(selectedDate),
        hours: hoursNum,
        description: description || null,
        overbudget_note: needsNote ? overbudgetNote : null,
        is_overbudget: isOverbudget,
      });
      toast.success(`Logged ${hoursNum}h`, {
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to log entry");
    }
  };

  return (
    <Card className="sticky bottom-4 border-2 border-primary/20 shadow-lg backdrop-blur-md bg-card/95">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Quick add for {format(selectedDate, "EEE d MMM")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 md:col-span-5">
            <Select value={certId} onValueChange={(v) => { setCertId(v); setMilestoneId(""); }}>
              <SelectTrigger><SelectValue placeholder="Certification…" /></SelectTrigger>
              <SelectContent>
                {certs.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No certifications assigned to you.</div>
                )}
                {certs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.client} {c.cert_type ? `· ${c.cert_type}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-8 md:col-span-4">
            <Select
              value={milestoneId || "__none"}
              onValueChange={(v) => setMilestoneId(v === "__none" ? "" : v)}
              disabled={!certId}
            >
              <SelectTrigger><SelectValue placeholder="Milestone (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No milestone</SelectItem>
                {milestones.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.requirement}{m.allocated_hours ? ` · ${m.allocated_hours}h` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3 md:col-span-2">
            <Input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              placeholder="Hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="col-span-1 md:col-span-1">
            <Button onClick={handleAdd} disabled={!canSubmit || create.isPending} className="w-full" aria-label="Add">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Input
          placeholder="What did you work on? (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) handleAdd(); }}
        />

        {/* Budget progress */}
        {certId && certAllocated > 0 && (
          <BudgetProgress
            label="Certification budget"
            consumed={certConsumed}
            projected={certProjected}
            allocated={certAllocated}
            status={certStatus}
          />
        )}
        {certId && milestoneId && msAllocated > 0 && (
          <BudgetProgress
            label={`Milestone budget · ${msBurn?.requirement ?? ""}`}
            consumed={msConsumed}
            projected={msProjected}
            allocated={msAllocated}
            status={msStatus}
          />
        )}

        {needsNote && (
          <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              Over budget — please add a reason
            </div>
            <Textarea
              placeholder="Why are you exceeding the assigned budget?"
              value={overbudgetNote}
              onChange={(e) => setOverbudgetNote(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetProgress({
  label,
  consumed,
  projected,
  allocated,
  status,
}: {
  label: string;
  consumed: number;
  projected: number;
  allocated: number;
  status: "green" | "yellow" | "red" | "none";
}) {
  const pct = Math.min((projected / allocated) * 100, 150);
  const barColor =
    status === "red"
      ? "bg-destructive"
      : status === "yellow"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className={cn(
          "font-medium tabular-nums",
          status === "red" && "text-destructive",
          status === "yellow" && "text-amber-600",
        )}>
          {consumed}h{projected !== consumed ? ` → ${projected}h` : ""} / {allocated}h
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {pct > 100 && (
          <div
            className="absolute top-0 h-full bg-destructive/60"
            style={{ left: "100%", width: `${Math.min(pct - 100, 50)}%`, transform: "translateX(-100%)" }}
          />
        )}
      </div>
    </div>
  );
}
