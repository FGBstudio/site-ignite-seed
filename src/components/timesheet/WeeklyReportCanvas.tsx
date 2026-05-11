import { useEffect, useMemo, useState } from "react";
import { addWeeks, format, startOfISOWeek, isAfter, isSameDay, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCertifications } from "@/hooks/useMyCertifications";
import { useWeeklyReport, getWeekBounds } from "@/hooks/useWeeklyReport";
import type { WeeklyReportProjectEntry } from "@/types/weekly-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Lock, Save, Unlock, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Target user (admin viewing someone else); defaults to current user */
  targetUserId?: string | null;
  /** Admin viewing in read/write mode regardless of lock */
  adminMode?: boolean;
}

export function WeeklyReportCanvas({ targetUserId, adminMode = false }: Props) {
  const { user, role } = useAuth();
  const isAdmin = role === "ADMIN";
  const userId = targetUserId ?? user?.id ?? null;

  const [anchor, setAnchor] = useState<Date>(startOfISOWeek(new Date()));
  const { weekStart, startDate, endDate } = getWeekBounds(anchor);

  const { data: certs = [] } = useMyCertifications();
  const { report, isLoading, autoContent, save, unlock } = useWeeklyReport(userId, weekStart);

  const [draft, setDraft] = useState<WeeklyReportProjectEntry[]>([]);
  const [dirty, setDirty] = useState(false);

  // Initialize draft when report or autoContent changes
  useEffect(() => {
    if (report?.content && report.content.length > 0) {
      setDraft(report.content);
    } else {
      setDraft(autoContent);
    }
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, weekStart, autoContent.length]);

  const isLocked = report?.status === "locked";
  const canEdit = adminMode || isAdmin || !isLocked;

  const currentWeekStart = useMemo(() => startOfISOWeek(new Date()), []);
  const isFutureWeek = isAfter(startDate, currentWeekStart) && !isSameDay(startDate, currentWeekStart);

  const totalHours = draft.reduce((s, e) => s + Number(e.hours_snapshot || 0), 0);

  const updateSummary = (certId: string, summary: string) => {
    setDraft((prev) => prev.map((e) => (e.certification_id === certId ? { ...e, summary } : e)));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({ content: draft, status: "saved" });
      setDirty(false);
      toast.success("Weekly report saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const handleUnlock = async () => {
    try {
      await unlock.mutateAsync();
      toast.success("Report unlocked — the PM can now edit it");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlock");
    }
  };

  const certName = (id: string) => {
    const c = certs.find((x) => x.id === id);
    return c?.name || c?.client || "Project";
  };

  return (
    <Card className="border-primary/10 backdrop-blur-sm bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Weekly Report</CardTitle>
            <StatusPill status={report?.status ?? "draft"} dirty={dirty} />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setAnchor((d) => addWeeks(d, -1))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setAnchor(currentWeekStart)}
              className="min-w-[180px] text-xs"
            >
              {format(startDate, "d MMM")} – {format(endDate, "d MMM yyyy")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAnchor((d) => addWeeks(d, 1))}
              disabled={isFutureWeek}
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : draft.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No hours logged for this week. Add entries above to populate this report.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {draft.length} project{draft.length === 1 ? "" : "s"} · {totalHours}h total
              </span>
              {isLocked && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Lock className="h-3 w-3" />
                  Locked {report?.locked_at ? `on ${format(parseISO(report.locked_at), "d MMM")}` : ""}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {draft.map((entry) => (
                <div
                  key={entry.certification_id}
                  className={cn(
                    "rounded-xl border bg-background/50 p-3 space-y-2",
                    isLocked && !adminMode && "opacity-90",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">{certName(entry.certification_id)}</div>
                    <Badge variant="secondary" className="text-[11px] tabular-nums">
                      {entry.hours_snapshot}h
                    </Badge>
                  </div>
                  <Textarea
                    value={entry.summary}
                    onChange={(e) => updateSummary(entry.certification_id, e.target.value)}
                    placeholder="What did you accomplish on this project this week?"
                    rows={3}
                    disabled={!canEdit}
                    className="text-sm resize-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {isAdmin && isLocked && (
                <Button variant="outline" size="sm" onClick={handleUnlock} disabled={unlock.isPending}>
                  <Unlock className="h-3.5 w-3.5 mr-1.5" />
                  Unlock
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canEdit || save.isPending || (!dirty && report?.status === "saved")}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {save.isPending ? "Saving…" : "Save report"}
              </Button>
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground pt-2 border-t">
          Reports auto-lock every Sunday at 23:59. Locked reports can only be edited by an admin.
        </p>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status, dirty }: { status: string; dirty: boolean }) {
  if (dirty) return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">Unsaved</Badge>;
  if (status === "locked") return <Badge variant="outline" className="text-[10px] bg-muted">Locked</Badge>;
  if (status === "saved") return <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Saved</Badge>;
  return <Badge variant="outline" className="text-[10px]">Draft</Badge>;
}
