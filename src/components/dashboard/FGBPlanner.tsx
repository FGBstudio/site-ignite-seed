import { useMemo } from "react";
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
}

export interface GanttRowData {
  id: string;
  label: string;
  subLabel?: string;
  
  launchDate?: string | null;
  
  // Baseline
  planStart: string | null;
  planEnd: string | null;
  
  // Actual
  actualStart: string | null;
  actualEnd: string | null;
  
  progress: number;
  status: "pending" | "in_progress" | "achieved" | "late" | string;
  
  segments?: GanttSegment[]; // Used for Macro View (Projects)
  
  onClickUrl?: string;
  onClick?: () => void;
}

interface FGBPlannerProps {
  data: GanttRowData[];
  dayWidth?: number;
}

export function FGBPlanner({ data, dayWidth = 24 }: FGBPlannerProps) {
  const navigate = useNavigate();

  // 1. Calculate the overall timeline bounds
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
    for (let i = 0; i <= totalDays; i++) {
      arr.push(addDays(minDate, i));
    }
    return arr;
  }, [minDate, totalDays]);

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate);

  const fmt = (d: Date | null) => d ? format(d, "dd/MM/yy") : "—";

  // Check if we are rendering the Macro View (any row has segments)
  const isMacroView = data.some(row => row.segments && row.segments.length > 0);

  return (
    <div className="flex h-full w-full bg-background border rounded-lg overflow-hidden text-sm">
      
      {/* LEFT PANEL (Data Grid) */}
      <div className={cn(
        "flex-shrink-0 border-r bg-muted/10 flex flex-col z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-x-auto custom-scrollbar",
        isMacroView ? "max-w-[40%]" : "max-w-[65%]" // Narrower for Macro view to show more timeline
      )}>
        
        {/* Header */}
        <div className="h-12 border-b flex items-center px-4 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide bg-muted/30 w-max">
          <div className="w-[200px] shrink-0">{isMacroView ? "Progetto / Cliente" : "Attività / Fase"}</div>
          {!isMacroView && <div className="w-[75px] shrink-0">Launch</div>}
          <div className="w-[75px] shrink-0">Start Plan</div>
          <div className="w-[75px] shrink-0">End Fcst</div>
          {!isMacroView && (
            <>
              <div className="w-[75px] shrink-0">End Act</div>
              <div className="w-[60px] shrink-0 text-right">Plan St</div>
              <div className="w-[60px] shrink-0 text-right">Plan Dur</div>
              <div className="w-[60px] shrink-0 text-right">Act St</div>
              <div className="w-[60px] shrink-0 text-right">Act Dur</div>
            </>
          )}
          <div className="w-[60px] shrink-0 text-right">% Comp</div>
        </div>
        
        {/* Rows */}
        <div className="flex-1 overflow-y-hidden w-max">
          {data.map((row) => {
            const pStart = row.planStart ? new Date(row.planStart) : null;
            const pEnd = row.planEnd ? new Date(row.planEnd) : null;
            const aStart = row.actualStart ? new Date(row.actualStart) : null;
            const aEnd = row.actualEnd ? new Date(row.actualEnd) : null;
            const launch = row.launchDate ? new Date(row.launchDate) : pStart;

            const planStartOffset = pStart ? differenceInDays(pStart, minDate) : "—";
            const planDuration = pStart && pEnd ? Math.max(differenceInDays(pEnd, pStart), 1) : "—";
            const actStartOffset = aStart ? differenceInDays(aStart, minDate) : "—";
            const actDuration = aStart && aEnd 
                ? Math.max(differenceInDays(aEnd, aStart), 1) 
                : (aStart && row.progress > 0 ? Math.max(differenceInDays(today, aStart), 1) : "—");

            return (
              <div 
                key={row.id} 
                className={cn(
                  "h-14 border-b flex items-center px-4 hover:bg-muted/50 transition-colors",
                  (row.onClickUrl || row.onClick) && "cursor-pointer",
                  row.id === "summary" && "bg-primary/5 font-semibold"
                )}
                onClick={() => {
                  if (row.onClick) row.onClick();
                  else if (row.onClickUrl) navigate(row.onClickUrl);
                }}
              >
                <div className="w-[200px] shrink-0 pr-2 flex flex-col justify-center">
                  <span className="text-sm truncate text-foreground font-medium">{row.label}</span>
                  {row.subLabel && <span className="text-[10px] text-muted-foreground truncate">{row.subLabel}</span>}
                </div>
                {!isMacroView && <div className="w-[75px] shrink-0 text-xs text-muted-foreground">{fmt(launch)}</div>}
                <div className="w-[75px] shrink-0 text-xs">{fmt(pStart)}</div>
                <div className="w-[75px] shrink-0 text-xs">{fmt(pEnd)}</div>
                {!isMacroView && (
                  <>
                    <div className="w-[75px] shrink-0 text-xs">{fmt(aEnd)}</div>
                    <div className="w-[60px] shrink-0 text-xs text-right font-mono text-muted-foreground">{planStartOffset}</div>
                    <div className="w-[60px] shrink-0 text-xs text-right font-mono">{planDuration}</div>
                    <div className="w-[60px] shrink-0 text-xs text-right font-mono text-muted-foreground">{actStartOffset}</div>
                    <div className="w-[60px] shrink-0 text-xs text-right font-mono">{actDuration}</div>
                  </>
                )}
                <div className="w-[60px] shrink-0 text-xs text-right font-bold text-primary">{Math.round(row.progress)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL (Timeline) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-card">
        
        {/* Timeline Header */}
        <div className="h-12 border-b bg-muted/30 relative" style={{ width: totalDays * dayWidth }}>
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
            {days.map((d, i) => <div key={i} className="h-full border-l flex-shrink-0" style={{ width: dayWidth }} />)}
          </div>

          {/* Today Line */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div className="absolute top-0 bottom-0 border-l-2 border-red-500/50 z-10 pointer-events-none" style={{ left: todayOffset * dayWidth }} />
          )}

          {/* Rows Rendering */}
          {data.map((row) => {
            return (
              <div key={row.id} className={cn("h-14 border-b relative group hover:bg-muted/10 transition-colors", row.id === "summary" && "bg-primary/5")}>
                
                {/* MACRO VIEW: Render individual segments */}
                {row.segments && row.segments.length > 0 ? (
                  row.segments.map((seg, idx) => {
                    if (!seg.start || !seg.end) return null;
                    
                    const segStart = differenceInDays(new Date(seg.start), minDate);
                    const segEnd = differenceInDays(new Date(seg.end), minDate);
                    const segWidth = Math.max(segEnd - segStart, 1);

                    let segBaseClass = "border-2 border-dashed border-gray-400/70 bg-gray-200/40";
                    let segFillClass = "bg-[#009293]";
                    let fillWidth = 0;

                    if (seg.status === "in_progress") {
                      segBaseClass = "border-2 border-dashed border-[#009293]/60 bg-[#009293]/10";
                      fillWidth = segWidth * ((seg.progress || 50) / 100);
                      if (fillWidth < 4) fillWidth = 4;
                    } else if (seg.status === "achieved") {
                      segBaseClass = "bg-[#009293] border-none";
                      fillWidth = segWidth;
                    } else if (seg.status === "late") {
                      segBaseClass = "border-2 border-dashed border-red-400/70 bg-red-100/40";
                      segFillClass = "bg-red-500";
                      fillWidth = segWidth * ((seg.progress || 50) / 100);
                      if (fillWidth < 4) fillWidth = 4;
                    }

                    return (
                       <div key={idx} className="absolute top-3 h-8 group-hover:z-20 transition-all" style={{ left: segStart * dayWidth, width: segWidth * dayWidth }}>
                          {/* Segment Base (Dashed/Empty) */}
                          <div className={cn("absolute inset-0 rounded-md", segBaseClass)} />
                          {/* Segment Fill (Solid) */}
                          {fillWidth > 0 && (
                            <div className={cn("absolute top-0 bottom-0 left-0 rounded-md shadow-sm opacity-95", segFillClass)} style={{ width: fillWidth * dayWidth }} />
                          )}
                       </div>
                    )
                  })
                ) : (
                  /* MICRO VIEW: Render standard single bar */
                  (() => {
                    const pStart = row.planStart ? differenceInDays(new Date(row.planStart), minDate) : null;
                    const pEnd = row.planEnd ? differenceInDays(new Date(row.planEnd), minDate) : null;
                    const planWidth = (pStart !== null && pEnd !== null) ? Math.max((pEnd - pStart), 1) : 0;
                    
                    let aStart = row.actualStart ? differenceInDays(new Date(row.actualStart), minDate) : pStart;
                    let aEnd = row.actualEnd ? differenceInDays(new Date(row.actualEnd), minDate) : null;
                    
                    let actualWidth = 0;
                    
                    if (row.status === 'achieved') {
                      actualWidth = 0; // Handled by base class
                    } else if (row.status === 'in_progress') {
                      if (aStart !== null && planWidth > 0) {
                        actualWidth = planWidth * (row.progress / 100);
                        if (actualWidth < 4) actualWidth = 4;
                      }
                    } else if (row.status === 'late') {
                      if (aStart !== null) {
                        if (aEnd !== null) {
                          actualWidth = Math.max(aEnd - aStart, 1);
                        } else if (planWidth > 0 && row.progress > 0) {
                          actualWidth = planWidth * (row.progress / 100);
                          if (actualWidth < 4) actualWidth = 4;
                        } else {
                          actualWidth = 4;
                        }
                      }
                    }

                    let planBaseClass = "border border-dashed border-gray-400/70 bg-gray-200/40";
                    let actualColor = "bg-[#009293]";

                    if (row.status === "in_progress") {
                      planBaseClass = "border border-dashed border-[#009293]/60 bg-[#009293]/10";
                    } else if (row.status === "achieved") {
                      planBaseClass = "bg-[#009293] border-none";
                      actualColor = "bg-[#009293]";
                    } else if (row.status === "late") {
                      planBaseClass = "border border-dashed border-red-400/70 bg-red-100/40";
                      actualColor = "bg-red-500";
                    }

                    return (
                      <>
                        {pStart !== null && pEnd !== null && (
                          <div className={cn("absolute top-4 h-6 rounded-md", planBaseClass)} style={{ left: pStart * dayWidth, width: planWidth * dayWidth }} />
                        )}
                        {aStart !== null && actualWidth > 0 && (
                          <div className={cn("absolute top-4 h-6 rounded-md shadow-sm z-10 transition-all opacity-95", actualColor)} style={{ left: aStart * dayWidth, width: actualWidth * dayWidth }} />
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
