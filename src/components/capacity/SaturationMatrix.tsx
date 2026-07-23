import { Fragment, useMemo, useState } from "react";
import { addDays, addWeeks, format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { toast } from "sonner";
import {
  buildWeekRange,
  getMondayISO,
  useAllocations,
  useHrOffDays,
  useUpsertAllocation,
  useDeleteAllocation,
  type PmWeeklyAllocation,
  type SaturationCert,
} from "@/hooks/useSaturationMatrix";

const WEEKLY_CAP = 40;

/** Blue heatmap by hours. */
function cellBg(h: number): string {
  if (h <= 0) return "";
  if (h <= 5) return "bg-primary/10";
  if (h <= 15) return "bg-primary/30";
  if (h <= 30) return "bg-primary/60 text-primary-foreground";
  return "bg-primary text-primary-foreground";
}

function saturationBg(pct: number): string {
  if (pct <= 0) return "bg-muted text-muted-foreground";
  if (pct < 75) return "bg-warning/25 text-warning-foreground";
  if (pct >= 80 && pct <= 100) return "bg-success/25 text-success-foreground";
  return "bg-muted text-muted-foreground";
}

export interface SaturationMatrixProps {
  mode: "edit" | "read";
  users: { id: string; label: string }[];
  certs: SaturationCert[];
  weekCount?: number;
  anchorDate?: Date;
  /** Only used in edit mode — user allowed to write */
  currentUserId?: string;
}

interface CellKey {
  userId: string;
  certId: string;
  week: string;
}

export function SaturationMatrix({
  mode,
  users,
  certs,
  weekCount = 16,
  anchorDate = new Date(),
  currentUserId,
}: SaturationMatrixProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const effectiveAnchor = useMemo(
    () => addWeeks(anchorDate, weekOffset),
    [anchorDate, weekOffset],
  );
  const weeks = useMemo(
    () => buildWeekRange(effectiveAnchor, weekCount),
    [effectiveAnchor, weekCount],
  );
  const fromWeek = weeks[0];
  const toWeek = weeks[weeks.length - 1];
  const fromDate = fromWeek;
  const toDate = format(addDays(parseISO(toWeek), 6), "yyyy-MM-dd");

  const userIds = users.map((u) => u.id);
  const { data: allocations = [], isLoading: loadingAlloc } = useAllocations(fromWeek, toWeek, userIds);
  const { data: offDays = [] } = useHrOffDays(fromDate, toDate, userIds);
  const upsert = useUpsertAllocation();
  const del = useDeleteAllocation();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const allExpanded = users.every((u) => expanded[u.id] ?? true);
  const toggleAll = () => {
    const next = !allExpanded;
    const map: Record<string, boolean> = {};
    users.forEach((u) => {
      map[u.id] = next;
    });
    setExpanded(map);
  };

  // index allocations by (user|cert|week)
  const allocIndex = useMemo(() => {
    const m = new Map<string, PmWeeklyAllocation>();
    for (const a of allocations) {
      m.set(`${a.user_id}|${a.certification_id}|${a.week_start}`, a);
    }
    return m;
  }, [allocations]);

  // off-week map per user
  const offWeek = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const o of offDays) {
      const monday = getMondayISO(parseISO(o.date));
      if (!m.has(o.user_id)) m.set(o.user_id, new Set());
      m.get(o.user_id)!.add(monday);
    }
    return m;
  }, [offDays]);

  // Total per (user, week)
  const userWeekTotal = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations) {
      const k = `${a.user_id}|${a.week_start}`;
      m.set(k, (m.get(k) ?? 0) + Number(a.planned_hours));
    }
    return m;
  }, [allocations]);

  // certs grouped by user
  const certsByUser = useMemo(() => {
    const m = new Map<string, SaturationCert[]>();
    for (const c of certs) {
      const uid = c.pm_id ?? "";
      if (!uid) continue;
      if (!m.has(uid)) m.set(uid, []);
      m.get(uid)!.push(c);
    }
    return m;
  }, [certs]);

  // month grouping for headers
  const monthGroups = useMemo(() => {
    const groups: { label: string; span: number }[] = [];
    let last = "";
    for (const w of weeks) {
      const label = format(parseISO(w), "MMM yyyy");
      if (label === last) {
        groups[groups.length - 1].span += 1;
      } else {
        groups.push({ label, span: 1 });
        last = label;
      }
    }
    return groups;
  }, [weeks]);

  const canEditRow = (userId: string) => mode === "edit" && userId === currentUserId;

  const commitCell = async (
    userId: string,
    certId: string,
    week: string,
    raw: string,
    existing: PmWeeklyAllocation | undefined,
  ) => {
    const val = Math.max(0, Math.min(40, Number(raw) || 0));
    // client pre-check
    const currentTotal = userWeekTotal.get(`${userId}|${week}`) ?? 0;
    const existingHours = existing ? Number(existing.planned_hours) : 0;
    if (currentTotal - existingHours + val > WEEKLY_CAP) {
      toast.error(
        `Week ${format(parseISO(week), "d MMM")}: would exceed 40h (currently ${currentTotal}h).`,
      );
      return;
    }
    try {
      if (val === 0 && existing) {
        await del.mutateAsync(existing.id);
      } else if (val > 0) {
        await upsert.mutateAsync({
          id: existing?.id,
          user_id: userId,
          certification_id: certId,
          week_start: week,
          planned_hours: val,
        });
      }
    } catch (e: any) {
      if (String(e?.message ?? "").includes("WEEKLY_CAP_EXCEEDED")) {
        toast.error("Rejected: 40h weekly cap reached.");
      } else {
        toast.error(e?.message ?? "Save failed");
      }
    }
  };

  if (loadingAlloc) {
    return <div className="py-6 text-sm text-muted-foreground">Loading matrix…</div>;
  }
  if (users.length === 0) {
    return <div className="py-6 text-sm text-muted-foreground">No PMs to display.</div>;
  }

  const rangeLabel = `${format(parseISO(fromWeek), "d MMM yyyy")} → ${format(
    addDays(parseISO(toWeek), 6),
    "d MMM yyyy",
  )}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setWeekOffset((o) => o - weekCount)}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekOffset((o) => o + weekCount)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">{rangeLabel}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={toggleAll}>
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full border-collapse text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-muted/40 border-r px-3 py-2 text-left w-[220px]"
            >
              PM / Project
            </th>
            {monthGroups.map((g, i) => (
              <th key={i} colSpan={g.span} className="border-l px-2 py-1 text-center font-semibold">
                {g.label}
              </th>
            ))}
          </tr>
          <tr>
            {weeks.map((w) => (
              <th
                key={w}
                className="border-l px-1 py-1 text-center font-normal text-[10px] text-muted-foreground min-w-[52px]"
              >
                W{format(parseISO(w), "II")}
                <div className="text-[9px]">{format(parseISO(w), "d MMM")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const userCerts = certsByUser.get(u.id) ?? [];
            const isExpanded = expanded[u.id] ?? true;
            const offSet = offWeek.get(u.id) ?? new Set();
            return (
              <Fragment key={`u-frag-${u.id}`}>
                <tr className="border-t bg-background">
                  <td className="sticky left-0 z-10 bg-background border-r px-3 py-2 font-semibold">
                    <button
                      className="flex items-center gap-1 hover:text-primary"
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [u.id]: !(s[u.id] ?? true) }))
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span className="uppercase tracking-wide">{u.label}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                        {userCerts.length} project{userCerts.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </td>
                  {weeks.map((w) => {
                    const isOff = offSet.has(w);
                    const total = userWeekTotal.get(`${u.id}|${w}`) ?? 0;
                    const cap = isOff ? 0 : WEEKLY_CAP;
                    const pct = cap === 0 ? (total > 0 ? 200 : 0) : (total / cap) * 100;
                    return (
                      <td
                        key={w}
                        className={cn(
                          "border-l text-center align-middle relative",
                          isOff ? "bg-[hsl(270_50%_60%/0.35)]" : saturationBg(pct),
                        )}
                        title={
                          isOff
                            ? "Unavailable (HR)"
                            : `${total}h / ${WEEKLY_CAP}h · ${Math.round(pct)}%`
                        }
                      >
                        <span className="tabular-nums">{total > 0 ? `${total}h` : "—"}</span>
                      </td>
                    );
                  })}
                </tr>
                {isExpanded &&
                  userCerts.map((c) => {
                    const handoverWeek = c.handover_date
                      ? getMondayISO(parseISO(c.handover_date))
                      : null;
                    return (
                      <tr key={`c-${u.id}-${c.id}`} className="border-t">
                        <td className="sticky left-0 z-10 bg-background border-r px-3 py-1 pl-8 text-muted-foreground">
                          {(() => {
                            const composite = [c.client, c.city, c.name]
                              .map((s) => (s ?? "").toString().trim())
                              .filter(Boolean)
                              .join(" · ")
                              .toUpperCase();
                            const label = composite || c.name;
                            return (
                              <div className="truncate max-w-[240px]" title={label}>
                                {label}
                              </div>
                            );
                          })()}
                          {c.allocated_hours ? (
                            <div className="text-[10px]">Budget: {c.allocated_hours}h</div>
                          ) : null}
                        </td>
                        {weeks.map((w) => {
                          const key = `${u.id}|${c.id}|${w}`;
                          const existing = allocIndex.get(key);
                          const isOff = offSet.has(u.id) ? false : offSet.has(w);
                          const off = offSet.has(w);
                          const hours = existing ? Number(existing.planned_hours) : 0;
                          const isDeadline = handoverWeek === w;
                          const draft = drafts[key];
                          const editable = canEditRow(u.id) && !off;

                          return (
                            <td
                              key={w}
                              className={cn(
                                "border-l text-center relative p-0",
                                off
                                  ? "bg-[hsl(270_50%_60%/0.35)]"
                                  : hours > 0
                                  ? cellBg(hours)
                                  : "",
                              )}
                            >
                              {isDeadline && (
                                <Diamond
                                  className="absolute top-0.5 right-0.5 h-3 w-3 text-destructive fill-destructive"
                                  aria-label="Deadline"
                                />
                              )}
                              {editable ? (
                                <Input
                                  type="number"
                                  min={0}
                                  max={40}
                                  step={0.5}
                                  value={draft ?? (hours > 0 ? String(hours) : "")}
                                  onChange={(e) =>
                                    setDrafts((d) => ({ ...d, [key]: e.target.value }))
                                  }
                                  onBlur={(e) => {
                                    const raw = e.target.value;
                                    setDrafts((d) => {
                                      const n = { ...d };
                                      delete n[key];
                                      return n;
                                    });
                                    if (raw === "" && !existing) return;
                                    if (Number(raw || 0) === hours) return;
                                    commitCell(u.id, c.id, w, raw, existing);
                                  }}
                                  className={cn(
                                    "h-7 w-full rounded-none border-0 text-center tabular-nums bg-transparent px-1",
                                    hours > 15 ? "text-primary-foreground" : "",
                                  )}
                                />
                              ) : (
                                <div className="py-2 tabular-nums">
                                  {hours > 0 ? `${hours}h` : off ? "—" : ""}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

export function SaturationLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/10 border" /> 1–5h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/30 border" /> 6–15h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/60 border" /> 16–30h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary border" /> 31–40h
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-sm border"
          style={{ background: "hsl(270 50% 60% / 0.5)" }}
        />{" "}
        Unavailable
      </span>
      <span className="flex items-center gap-1">
        <Diamond className="h-3 w-3 text-destructive fill-destructive" /> Deadline
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-success/25 border" /> 32–40h saturated
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-warning/25 border" /> &lt;30h under
      </span>
    </div>
  );
}
