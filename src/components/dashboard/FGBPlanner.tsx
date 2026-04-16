import { useMemo, useState, useRef } from "react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export interface GanttSegment {
  id: string;
  start: string | null;
  end: string | null;
  status: "pending" | "in_progress" | "achieved" | "late" | string;
  progress?: number;
  phase?: string; // Nuova prop per il mapping colore della fase
}

export interface GanttRowData {
  id: string;
  label: string;
  subLabel?: string;
  currentActivity?: string;
  launchDate?: string | null;
  // --- COLONNE FASI LEED ---
  designStart: string | null;
  designEnd: string | null;
  constrStartPlan: string | null;
  constrEndFcst: string | null;
  constrEndAct: string | null;
  planDuration: number | string;
  actDuration: number | string;
  // -------------------------
  planStart: string | null; // Nascosto, serve solo per bounds
  planEnd: string | null;   // Nascosto, serve solo per bounds
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  status: "pending" | "in_progress" | "achieved" | "late" | "Certified" | string;
  segments?: GanttSegment[];
  onClickUrl?: string;
  onClick?: () => void;
  plannedHandoverDate?: string | null;
  isDeadlineCritical?: boolean;
}

interface FGBPlannerProps {
  data: GanttRowData[];
  dayWidth?: number;
}

export function FGBPlanner({ data, dayWidth = 24 }: FGBPlannerProps) {
  const navigate = useNavigate();
  const [highlightOffset, setHighlightOffset] = useState<number | null>(null);

  // Scroll Synchronization Refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const handleLeftScroll = () => {
    if (leftScrollRef.current && rightScrollRef.current) {
      if (rightScrollRef.current.scrollTop !== leftScrollRef.current.scrollTop) {
        rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
      }
    }
  };

  const handleRightScroll = () => {
    if (leftScrollRef.current && rightScrollRef.current) {
      if (leftScrollRef.current.scrollTop !== rightScrollRef.current.scrollTop) {
        leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
      }
    }
  };

  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = new Date("2099-01-01");
    let max = new Date("2000-01-01");

    data.forEach((row) => {
      const dates: Date[] = [];
      if (row.launchDate) dates.push(new Date(row.launchDate));
      if (row.planStart) dates.push(new Date(row.planStart));
      if (row.planEnd) dates.push(new Date(row.planEnd));
      if (row.actualStart) dates.push(new Date(row.actualStart));
      if (row.actualEnd) dates.push(new Date(row.actualEnd));
      if (row.plannedHandoverDate) dates.push(new Date(row.plannedHandoverDate));
      if (row.segments) {
        row.segments.forEach(seg => {
          if (seg.start) dates.push(new Date(seg.start));
          if (seg.end) dates.push(new Date(seg.end));
        });
      }
      dates.forEach((d) => {
        if (!isNaN(d.getTime())) {
          if (d < min) min = d;
          if (d > max) max = d;
        }
      });
    });

    if (min > max) {
      min = new Date();
      max = addDays(new Date(), 30);
    }

    const startDate = startOfWeek(addDays(min, -7), { weekStartsOn: 1 });
    const endDate = endOfWeek(addDays(max, 14), { weekStartsOn: 1 });
    return { minDate: startDate, maxDate: endDate, totalDays: Math.max(differenceInDays(endDate, startDate), 1) };
  }, [data]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= totalDays; i++) arr.push(addDays(minDate, i));
    return arr;
  }, [minDate, totalDays]);

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate);
  const activeOffset = highlightOffset !== null ? highlightOffset : todayOffset;
  const highlightDate = addDays(minDate, activeOffset);

  const fmt = (d: Date | null) => d ? format(d, "dd/MM/yy") : "—";

  return (
    <div className="flex flex-col h-full w-full bg-background border rounded-lg overflow-hidden text-sm">
      
      {/* BARRA CONTROLLI (Period Highlight) */}
      <div className="h-10 border-b flex items-center justify-between px-4 bg-muted/20 shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Period Highlight
        </span>
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-foreground">
            {format(highlightDate, "dd MMM yyyy", { locale: it })}
          </span>
          <input 
            type="range" 
            min={0} 
            max={totalDays} 
            value={activeOffset} 
            onChange={(e) => setHighlightOffset(Number(e.target.value))}
            className="w-48 accent-[#009293] cursor-ew-resize"
          />
          {highlightOffset !== null && highlightOffset !== todayOffset && (
            <button 
              className="h-6 text-[10px] px-2 border rounded border-border hover:bg-muted transition-colors" 
              onClick={() => setHighlightOffset(null)}
            >
              Reset Oggi
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL (Data Grid) */}
        <div 
          ref={leftScrollRef}
          onScroll={handleLeftScroll}
          className="flex-shrink-0 border-r bg-muted/10 relative z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-auto custom-scrollbar max-w-[65%]"
        >
          {/* Header Aggiornato */}
          <div className="sticky top-0 z-30 h-12 border-b flex items-center px-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide bg-background w-max shadow-sm">
            <div className="w-[160px] shrink-0">Progetto / Fase</div>
            <div className="w-[100px] shrink-0 border-l border-border/50 pl-2">Status</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2">Launch</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2 text-[#009293]">Des. Start</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2 text-[#009293]">Des. End</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2 text-warning">Con. Start</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2 text-warning">Con. Fcst</div>
            <div className="w-[70px] shrink-0 border-l border-border/50 pl-2 text-warning">Con. Act</div>
            <div className="w-[50px] shrink-0 border-l border-border/50 pl-1 text-right pr-1">Plan D.</div>
            <div className="w-[50px] shrink-0 border-l border-border/50 pl-1 text-right pr-1">Act D.</div>
            <div className="w-[50px] shrink-0 border-l border-border/50 pl-1 text-right pr-1">% Comp</div>
          </div>
          
          <div className="w-max">
            {data.map((row) => {
              const isClickable = !!(row.onClickUrl || row.onClick);

                return (
                  <div 
                    key={row.id} 
                    className={cn(
                      "h-14 border-b flex items-center px-3 hover:bg-muted/50 transition-colors",
                      isClickable && "cursor-pointer",
                      row.id === "summary" && "bg-primary/5 font-semibold",
                      row.status === "on_hold" && "bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500",
                      row.isDeadlineCritical && row.status !== "on_hold" && "bg-red-50 dark:bg-red-950/20 border-l-4 border-l-red-400",
                      // Colora intera riga se Certificato
                      row.status === "Certified" && "bg-green-50/80 dark:bg-[#009293]/10 border-l-4 border-l-[#009293]"
                    )}
                    onClick={() => {
                      if (row.onClick) row.onClick();
                      else if (row.onClickUrl) navigate(row.onClickUrl);
                    }}
                  >
                  <div className="w-[160px] shrink-0 pr-2 flex flex-col justify-center">
                    <span className="text-xs truncate text-foreground font-medium">{row.label}</span>
                    {row.subLabel && <span className="text-[10px] text-muted-foreground truncate">{row.subLabel}</span>}
                  </div>
                  <div className="w-[100px] shrink-0 pl-2 flex items-center">
                    <span className="truncate text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[#009293]/30 text-[#009293] bg-[#009293]/5">
                      {row.status}
                    </span>
                  </div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px] text-muted-foreground">{fmt(row.launchDate ? new Date(row.launchDate) : null)}</div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px]">{fmt(row.designStart ? new Date(row.designStart) : null)}</div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px]">{fmt(row.designEnd ? new Date(row.designEnd) : null)}</div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px]">{fmt(row.constrStartPlan ? new Date(row.constrStartPlan) : null)}</div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px]">{fmt(row.constrEndFcst ? new Date(row.constrEndFcst) : null)}</div>
                  <div className="w-[70px] shrink-0 pl-2 text-[10px] font-medium">{fmt(row.constrEndAct ? new Date(row.constrEndAct) : null)}</div>
                  <div className="w-[50px] shrink-0 pl-1 text-[10px] text-right pr-1 font-mono text-muted-foreground">{row.planDuration}</div>
                  <div className="w-[50px] shrink-0 pl-1 text-[10px] text-right pr-1 font-mono font-bold">{row.actDuration}</div>
                  <div className="w-[50px] shrink-0 pl-1 text-[10px] text-right pr-1 font-bold text-[#009293]">{Math.round(row.progress)}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL (Timeline) */}
        <div 
          ref={rightScrollRef}
          onScroll={handleRightScroll}
          className="flex-1 overflow-auto relative custom-scrollbar bg-card"
        >
          {/* Timeline Header */}
          <div className="sticky top-0 z-30 h-12 border-b bg-background" style={{ width: totalDays * dayWidth }}>
            <div className="absolute top-0 left-0 h-6 flex items-center text-[10px] font-bold text-muted-foreground uppercase px-2">Timeline</div>
            <div className="absolute bottom-0 left-0 h-6 flex">
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} className={cn("flex-shrink-0 flex items-center justify-center text-[9px] border-l border-border/50", isWeekend ? "bg-muted/50 text-muted-foreground/50" : "text-muted-foreground")} style={{ width: dayWidth }}>
                    {format(d, "eeeee", { locale: it })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Grid */}
          <div className="relative" style={{ width: totalDays * dayWidth }}>
            <div className="absolute inset-0 flex pointer-events-none opacity-20">
              {days.map((_, i) => <div key={i} className="h-full border-l flex-shrink-0" style={{ width: dayWidth }} />)}
            </div>

            {activeOffset >= 0 && activeOffset <= totalDays && (
              <div 
                className="absolute top-0 bottom-0 border-l-2 border-red-500/80 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.5)] transition-all duration-75" 
                style={{ left: activeOffset * dayWidth }} 
              />
            )}

            {data.map((row) => (
              <div 
                key={row.id} 
                className={cn(
                  "h-14 border-b relative group hover:bg-muted/10 transition-colors", 
                  row.id === "summary" && "bg-primary/5", 
                  row.status === "on_hold" && "bg-red-50/50 dark:bg-red-950/20", 
                  row.isDeadlineCritical && row.status !== "on_hold" && "bg-red-50/30 dark:bg-red-950/10",
                  // Colora intera riga timeline se Certificato
                  row.status === "Certified" && "bg-green-50/50 dark:bg-[#009293]/5"
                )}
              >
                {row.segments && row.segments.length > 0 ? (
                  row.segments.map((seg, idx) => {
                    if (!seg.start || !seg.end) return null;
                    const segStartDay = differenceInDays(new Date(seg.start), minDate);
                    const segDurationDays = Math.max(differenceInDays(new Date(seg.end), new Date(seg.start)), 1);

                    // --- LOGICA COLORI FGB PER FASE ---
                    let phaseOpacityBase = "bg-[#009293]/20 border-[#009293]/40";
                    let phaseOpacityFill = "bg-[#009293]";

                    if (seg.phase === "Design") {
                      phaseOpacityBase = "bg-[#009293]/10 border-[#009293]/20";
                      phaseOpacityFill = "bg-[#009293]/30"; // Leggero
                    } else if (seg.phase === "Construction") {
                      phaseOpacityBase = "bg-[#009293]/20 border-[#009293]/40";
                      phaseOpacityFill = "bg-[#009293]/70"; // Medio
                    } else if (seg.phase === "Certification") {
                      phaseOpacityBase = "bg-[#009293]/30 border-[#009293]/60";
                      phaseOpacityFill = "bg-[#009293]"; // Scuro
                    }

                    let baseClass = `border-2 border-dashed ${phaseOpacityBase}`;
                    let fillClass = phaseOpacityFill;
                    let fillPercent = seg.progress ?? 0;

                    if (seg.status === "on_hold") {
                      baseClass = "border-2 border-solid border-red-500 bg-red-100/60";
                      fillClass = "bg-red-500";
                      fillPercent = seg.progress ?? 50;
                    } else if (seg.status === "in_progress") {
                      // Mantiene la sfumatura ma col dashed standard
                      fillPercent = seg.progress ?? 50;
                    } else if (seg.status === "achieved") {
                      baseClass = `${phaseOpacityFill} border-none`;
                      fillPercent = 100;
                    } else if (seg.status === "late") {
                      baseClass = "border-2 border-dashed border-red-400/70 bg-red-100/40";
                      fillClass = "bg-red-500";
                      fillPercent = seg.progress ?? 50;
                    }

                    const fillWidthPx = (fillPercent / 100) * segDurationDays * dayWidth;

                    return (
                      <div key={idx} className="absolute top-3 h-8 group-hover:z-20" style={{ left: segStartDay * dayWidth, width: segDurationDays * dayWidth }}>
                        <div className={cn("absolute inset-0 rounded-md", baseClass)} />
                        {fillPercent > 0 && fillPercent < 100 && (
                          <div className={cn("absolute top-0 bottom-0 left-0 rounded-md shadow-sm opacity-95", fillClass)} style={{ width: Math.max(fillWidthPx, 4) }} />
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Fallback: Se non ci sono segmenti, usa planStart/planEnd invisibili
                  (() => {
                    const pStartDay = row.planStart ? differenceInDays(new Date(row.planStart), minDate) : null;
                    const pEndDay = row.planEnd ? differenceInDays(new Date(row.planEnd), minDate) : null;
                    const planDays = (pStartDay !== null && pEndDay !== null) ? Math.max(pEndDay - pStartDay, 1) : 0;
                    
                    let baseClass = "border-2 border-dashed border-gray-400/70 bg-gray-200/40";
                    let fillClass = "bg-[#009293]";
                    let fillPercent = 0;

                    if (row.status === "on_hold") {
                      baseClass = "border-2 border-solid border-red-500 bg-red-100/60";
                      fillClass = "bg-red-500";
                      fillPercent = row.progress > 0 ? row.progress : 30;
                    } else if (row.status === "Certified") {
                      baseClass = "bg-[#009293] border-none";
                      fillPercent = 100;
                    }

                    const fillWidthPx = (fillPercent / 100) * planDays * dayWidth;

                    return (
                      <>
                        {pStartDay !== null && planDays > 0 && (
                          <div className={cn("absolute top-4 h-6 rounded-md", baseClass)} style={{ left: pStartDay * dayWidth, width: planDays * dayWidth }} />
                        )}
                        {pStartDay !== null && fillPercent > 0 && fillPercent < 100 && (
                          <div className={cn("absolute top-4 h-6 rounded-md shadow-sm z-10 opacity-95", fillClass)} style={{ left: pStartDay * dayWidth, width: Math.max(fillWidthPx, 4) }} />
                        )}
                      </>
                    );
                  })()
                )}

                {/* Planned Handover Marker — vertical dashed line for construction projects */}
                {row.plannedHandoverDate && (() => {
                  const markerDay = differenceInDays(new Date(row.plannedHandoverDate), minDate);
                  if (markerDay < 0 || markerDay > totalDays) return null;
                  return (
                    <div
                      className="absolute top-1 bottom-1 border-l-2 border-dashed border-amber-500/70 z-20 pointer-events-none"
                      style={{ left: markerDay * dayWidth }}
                      title={`Planned Handover: ${row.plannedHandoverDate}`}
                    >
                      <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-amber-500" />
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
