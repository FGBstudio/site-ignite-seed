import { useMemo, useState } from "react";
import { addDays, addWeeks, format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { toast } from "sonner";
import {
  WEEKLY_CAP,
  buildWeekRange,
  getMondayISO,
  useAllocations,
  useHrOffDays,
  useUpsertAllocation,
  useDeleteAllocation,
  type PmWeeklyAllocation,
  type SaturationCert,
} from "@/hooks/useSaturationMatrix";

/** Blue heatmap by hours (used for the proportional weight bar). */
function cellBg(h: number): string {
  if (h <= 0) return "";
  if (h <= 5) return "bg-primary/25";
  if (h <= 15) return "bg-primary/45";
  if (h <= 30) return "bg-primary/70";
  return "bg-primary";
}

function saturationBg(pct: number): string {
  if (pct <= 0) return "bg-muted text-muted-foreground";
  if (pct < 75) return "bg-warning/25 text-warning-foreground";
  if (pct >= 75) return "bg-success/25 text-success-foreground";
  return "bg-muted text-muted-foreground";
}

const LABEL_COL = 240;
const WEEK_COL = 62;
const ROW_H = 34;

export interface SaturationMatrixProps {
  mode: "edit" | "read";
  users: { id: string; label: string }[];
  certs: SaturationCert[];
  weekCount?: number;
  anchorDate?: Date;
  /** Only used in edit mode — user allowed to write */
  currentUserId?: string;
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
    const groups: { label: string; span: number; start: number }[] = [];
    let last = "";
    weeks.forEach((w, i) => {
      const label = format(parseISO(w), "MMM yyyy");
      if (label === last) {
        groups[groups.length - 1].span += 1;
      } else {
        groups.push({ label, span: 1, start: i });
        last = label;
      }
    });
    return groups;
  }, [weeks]);

  const canEditRow = (userId: string) => mode === "edit" && userId === currentUserId;

  const certLabel = (c: SaturationCert) => {
    const composite = [c.client, c.city, c.name]
      .map((s) => (s ?? "").toString().trim())
      .filter(Boolean)
      .join(" · ")
      .toUpperCase();
    return composite || c.name;
  };

  /** Optimistic validation + persist. */
  const commitCell = async (
    userId: string,
    certId: string,
    week: string,
    raw: string,
    existing: PmWeeklyAllocation | undefined,
  ) => {
    const val = Math.max(0, Math.min(WEEKLY_CAP, Number(raw) || 0));
    const isOff = (offWeek.get(userId) ?? new Set()).has(week);
    const weekLabel = `W${format(parseISO(week), "II")}`;

    if (isOff && val > 0) {
      toast.error(`${weekLabel}: unavailable (HR) — capacity for this week is 0h.`);
      return;
    }

    const currentTotal = userWeekTotal.get(`${userId}|${week}`) ?? 0;
    const existingHours = existing ? Number(existing.planned_hours) : 0;
    const remaining = WEEKLY_CAP - (currentTotal - existingHours);

    if (val > remaining) {
      toast.error(
        `Error: cannot allocate ${val}h. Remaining capacity for ${weekLabel}: ${remaining}h.`,
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
        toast.error(`Rejected by server: ${weekLabel} would exceed the ${WEEKLY_CAP}h weekly cap.`);
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

  // Build flat row plan so grid rows can be addressed explicitly (needed for column overlays).
  type RowPlan =
    | { kind: "pm"; userId: string; label: string; certCount: number; span: number; row: number }
    | { kind: "cert"; userId: string; cert: SaturationCert; row: number };
  const rows: RowPlan[] = [];
  let cursor = 3; // rows 1-2 are the two header rows
  for (const u of users) {
    const userCerts = certsByUser.get(u.id) ?? [];
    const isExpanded = expanded[u.id] ?? true;
    const span = 1 + (isExpanded ? userCerts.length : 0);
    rows.push({
      kind: "pm",
      userId: u.id,
      label: u.label,
      certCount: userCerts.length,
      span,
      row: cursor,
    });
    cursor += 1;
    if (isExpanded) {
      for (const c of userCerts) {
        rows.push({ kind: "cert", userId: u.id, cert: c, row: cursor });
        cursor += 1;
      }
    }
  }

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${LABEL_COL}px repeat(${weeks.length}, minmax(${WEEK_COL}px, 1fr))`,
    gridAutoRows: `${ROW_H}px`,
  };

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
        <div style={gridStyle} className="relative min-w-max text-xs">
          {/* header: corner */}
          <div
            className="sticky left-0 z-30 bg-muted/60 border-r border-b px-3 flex items-end pb-1 font-medium"
            style={{ gridColumn: 1, gridRow: "1 / span 2" }}
          >
            PM / Project
          </div>
          {/* header: months */}
          {monthGroups.map((g) => (
            <div
              key={`m-${g.label}-${g.start}`}
              className="border-l border-b bg-muted/60 px-2 flex items-center justify-center font-semibold"
              style={{ gridColumn: `${g.start + 2} / span ${g.span}`, gridRow: 1 }}
            >
              {g.label}
            </div>
          ))}
          {/* header: weeks */}
          {weeks.map((w, i) => (
            <div
              key={`w-${w}`}
              className="border-l border-b bg-muted/60 flex flex-col items-center justify-center text-[10px] text-muted-foreground leading-tight"
              style={{ gridColumn: i + 2, gridRow: 2 }}
            >
              <span>W{format(parseISO(w), "II")}</span>
              <span className="text-[9px]">{format(parseISO(w), "d MMM")}</span>
            </div>
          ))}

          {rows.map((r) => {
            const offSet = offWeek.get(r.userId) ?? new Set<string>();

            if (r.kind === "pm") {
              const isExpanded = expanded[r.userId] ?? true;
              return (
                <div key={`pm-${r.userId}`} style={{ display: "contents" }}>
                  <div
                    className="sticky left-0 z-20 bg-background border-r border-t px-3 flex items-center font-semibold"
                    style={{ gridColumn: 1, gridRow: r.row }}
                  >
                    <button
                      className="flex items-center gap-1 hover:text-primary"
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [r.userId]: !(s[r.userId] ?? true) }))
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span className="uppercase tracking-wide truncate max-w-[130px]">{r.label}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                        {r.certCount} project{r.certCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </div>
                  {weeks.map((w, i) => {
                    const isOff = offSet.has(w);
                    const total = userWeekTotal.get(`${r.userId}|${w}`) ?? 0;
                    const cap = isOff ? 0 : WEEKLY_CAP;
                    const pct = cap === 0 ? (total > 0 ? 200 : 0) : (total / cap) * 100;
                    return (
                      <div
                        key={`pmc-${r.userId}-${w}`}
                        className={cn(
                          "border-l border-t flex items-center justify-center tabular-nums",
                          isOff ? "bg-muted text-muted-foreground" : saturationBg(pct),
                        )}
                        style={{ gridColumn: i + 2, gridRow: r.row }}
                        title={
                          isOff
                            ? "Unavailable (HR) — capacity 0h"
                            : `${total}h / ${WEEKLY_CAP}h · ${Math.round(pct)}%`
                        }
                      >
                        {isOff ? "OFF" : total > 0 ? `${total}h` : "—"}
                      </div>
                    );
                  })}
                  {/* violet HR blockers spanning the whole PM group */}
                  {weeks.map((w, i) =>
                    offSet.has(w) ? (
                      <div
                        key={`off-${r.userId}-${w}`}
                        className="pointer-events-none border-l"
                        style={{
                          gridColumn: i + 2,
                          gridRow: `${r.row} / span ${r.span}`,
                          position: "relative",
                          zIndex: 10,
                          background: "hsl(270 50% 60% / 0.35)",
                        }}
                        aria-label="Unavailable"
                      />
                    ) : null,
                  )}
                </div>
              );
            }

            const c = r.cert;
            const handoverWeek = c.handover_date ? getMondayISO(parseISO(c.handover_date)) : null;
            const label = certLabel(c);
            return (
              <div key={`cert-${r.userId}-${c.id}`} style={{ display: "contents" }}>
                <div
                  className="sticky left-0 z-20 bg-background border-r border-t px-3 pl-8 flex flex-col justify-center text-muted-foreground"
                  style={{ gridColumn: 1, gridRow: r.row }}
                >
                  <div className="truncate" title={label}>
                    {label}
                  </div>
                  {c.allocated_hours ? (
                    <div className="text-[10px] leading-none">Budget: {c.allocated_hours}h</div>
                  ) : null}
                </div>
                {weeks.map((w, i) => {
                  const key = `${r.userId}|${c.id}|${w}`;
                  const existing = allocIndex.get(key);
                  const off = offSet.has(w);
                  const hours = existing ? Number(existing.planned_hours) : 0;
                  const isDeadline = handoverWeek === w;
                  const draft = drafts[key];
                  const editable = canEditRow(r.userId) && !off;
                  const weight = Math.min(100, (hours / WEEKLY_CAP) * 100);

                  return (
                    <div
                      key={`cc-${key}`}
                      className="relative border-l border-t overflow-hidden"
                      style={{ gridColumn: i + 2, gridRow: r.row }}
                      title={`${label} · W${format(parseISO(w), "II")} · ${hours}h (${Math.round(
                        weight,
                      )}% of week)`}
                    >
                      {/* proportional weight bar: height = hours / 40 */}
                      {hours > 0 && (
                        <div
                          className={cn("absolute bottom-0 left-0 right-0", cellBg(hours))}
                          style={{ height: `${weight}%` }}
                        />
                      )}
                      {isDeadline && (
                        <Diamond
                          className="absolute top-0.5 right-0.5 h-3 w-3 text-destructive fill-destructive z-[5]"
                          aria-label="Deadline"
                        />
                      )}
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          max={WEEKLY_CAP}
                          step={0.5}
                          value={draft ?? (hours > 0 ? String(hours) : "")}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            setDrafts((d) => {
                              const n = { ...d };
                              delete n[key];
                              return n;
                            });
                            if (raw === "" && !existing) return;
                            if (Number(raw || 0) === hours) return;
                            commitCell(r.userId, c.id, w, raw, existing);
                          }}
                          className={cn(
                            "relative z-[4] h-full w-full rounded-none border-0 bg-transparent text-center tabular-nums px-1",
                            hours > 15 ? "text-primary-foreground" : "",
                          )}
                        />
                      ) : (
                        <div
                          className={cn(
                            "relative z-[4] h-full flex items-center justify-center tabular-nums",
                            hours > 15 ? "text-primary-foreground" : "",
                          )}
                        >
                          {hours > 0 ? `${hours}h` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SaturationLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/25 border" /> 1–5h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/45 border" /> 6–15h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary/70 border" /> 16–30h
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-primary border" /> 31–40h
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-sm border"
          style={{ background: "hsl(270 50% 60% / 0.5)" }}
        />{" "}
        Unavailable (HR)
      </span>
      <span className="flex items-center gap-1">
        <Diamond className="h-3 w-3 text-destructive fill-destructive" /> Deadline
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-success/25 border" /> 30–40h saturated
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-warning/25 border" /> &lt;30h under
      </span>
    </div>
  );
}
