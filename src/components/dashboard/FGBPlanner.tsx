import { useMemo } from "react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export interface GanttRowData {
  id: string;
  label: string;
  subLabel?: string;
  
  launchDate?: string | null; // Data di riferimento iniziale
  
  // Baseline (Tratteggio)
  planStart: string | null;   // Inizio previsto
  planEnd: string | null;     // Fine prevista
  
  // Actual (Barra Piena)
  actualStart: string | null; // Inizio effettivo
  actualEnd: string | null;   // Fine effettiva
  
  progress: number; // 0 - 100
  status: "pending" | "in_progress" | "achieved" | "late" | string;
  
  onClickUrl?: string;
  onClick?: () => void;
}

interface FGBPlannerProps {
  data: GanttRowData[];
  dayWidth?: number; // Permette di zoomare
}

export function FGBPlanner({ data, dayWidth = 24 }: FGBPlannerProps) {
  const navigate = useNavigate();

  // 1. Trova il perimetro temporale del grafico
  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = new Date("2099-01-01");
    let max = new Date("2000-01-01");

    data.forEach((row) => {
      const dates = [
        row.launchDate ? new Date(row.launchDate) : null,
        row.planStart ? new Date(row.planStart) : null,
        row.planEnd ? new Date(row.planEnd) : null,
        row.actualStart ? new Date(row.actualStart) : null,
        row.actualEnd ? new Date(row.actualEnd) : null,
      ].filter(Boolean) as Date[];

      dates.forEach((d) => {
        if (d < min) min = d;
        if (d > max) max = d;
      });
    });

    // Se non ci sono date valide, usa oggi
    if (min > max) {
      min = new Date();
      max = addDays(new Date(), 30);
    }

    // Aggiungiamo un po' di "respiro" all'inizio e alla fine (allineando alle settimane)
    const startDate = startOfWeek(addDays(min, -7), { weekStartsOn: 1 });
    const endDate = endOfWeek(addDays(max, 14), { weekStartsOn: 1 });

    return { minDate: startDate, maxDate: endDate, totalDays: differenceInDays(endDate, startDate) };
  }, [data]);

  // Genera l'array dei giorni per l'header
  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= totalDays; i++) {
      arr.push(addDays(minDate, i));
    }
    return arr;
  }, [minDate, totalDays]);

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate);

  // Formattatore rapido per le date nella tabella
  const fmt = (d: Date | null) => d ? format(d, "dd/MM/yy") : "—";

  return (
    <div className="flex h-full w-full bg-background border rounded-lg overflow-hidden text-sm">
      
      {/* PANNELLO SINISTRO (Data Grid Ingegneristica) */}
      <div className="max-w-[65%] flex-shrink-0 border-r bg-muted/10 flex flex-col z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-x-auto custom-scrollbar">
        
        {/* Header Tabella Sinistro */}
        <div className="h-12 border-b flex items-center px-4 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide bg-muted/30 w-max">
          <div className="w-[200px] shrink-0">Attività / Fase</div>
          <div className="w-[75px] shrink-0">Launch</div>
          <div className="w-[75px] shrink-0">Start Plan</div>
          <div className="w-[75px] shrink-0">End Fcst</div>
          <div className="w-[75px] shrink-0">End Act</div>
          <div className="w-[60px] shrink-0 text-right">Plan St</div>
          <div className="w-[60px] shrink-0 text-right">Plan Dur</div>
          <div className="w-[60px] shrink-0 text-right">Act St</div>
          <div className="w-[60px] shrink-0 text-right">Act Dur</div>
          <div className="w-[60px] shrink-0 text-right">% Comp</div>
        </div>
        
        {/* Righe Sinistre */}
        <div className="flex-1 overflow-y-hidden w-max">
          {data.map((row) => {
            const pStart = row.planStart ? new Date(row.planStart) : null;
            const pEnd = row.planEnd ? new Date(row.planEnd) : null;
            const aStart = row.actualStart ? new Date(row.actualStart) : null;
            const aEnd = row.actualEnd ? new Date(row.actualEnd) : null;
            const launch = row.launchDate ? new Date(row.launchDate) : pStart;

            // Calcoli Matematici Specifici
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
                  <span className="text-sm truncate text-foreground">{row.label}</span>
                  {row.subLabel && <span className="text-[10px] text-muted-foreground truncate">{row.subLabel}</span>}
                </div>
                <div className="w-[75px] shrink-0 text-xs text-muted-foreground">{fmt(launch)}</div>
                <div className="w-[75px] shrink-0 text-xs">{fmt(pStart)}</div>
                <div className="w-[75px] shrink-0 text-xs">{fmt(pEnd)}</div>
                <div className="w-[75px] shrink-0 text-xs">{fmt(aEnd)}</div>
                <div className="w-[60px] shrink-0 text-xs text-right font-mono text-muted-foreground">{planStartOffset}</div>
                <div className="w-[60px] shrink-0 text-xs text-right font-mono">{planDuration}</div>
                <div className="w-[60px] shrink-0 text-xs text-right font-mono text-muted-foreground">{actStartOffset}</div>
                <div className="w-[60px] shrink-0 text-xs text-right font-mono">{actDuration}</div>
                <div className="w-[60px] shrink-0 text-xs text-right font-bold text-primary">{Math.round(row.progress)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PANNELLO DESTRO (Timeline Scorrevolmente Orizzontale) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-card">
        
        {/* Header Timeline (Giorni e Mesi) */}
        <div className="h-12 border-b bg-muted/30 relative" style={{ width: totalDays * dayWidth }}>
          <div className="absolute top-0 left-0 h-6 flex items-center text-[10px] font-bold text-muted-foreground uppercase px-2">
            Timeline
          </div>
          <div className="absolute bottom-0 left-0 h-6 flex">
            {days.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div 
                  key={i} 
                  className={cn(
                    "flex-shrink-0 flex items-center justify-center text-[9px] border-l border-border/50",
                    isWeekend ? "bg-muted/50 text-muted-foreground/50" : "text-muted-foreground"
                  )}
                  style={{ width: dayWidth }}
                >
                  {format(d, "eeeee", { locale: it })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Area del Grafico */}
        <div className="relative" style={{ width: totalDays * dayWidth }}>
          
          {/* Sfondo a griglia (colonne dei giorni) */}
          <div className="absolute inset-0 flex pointer-events-none opacity-20">
            {days.map((d, i) => (
              <div key={i} className="h-full border-l flex-shrink-0" style={{ width: dayWidth }} />
            ))}
          </div>

          {/* Linea di OGGI */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div 
              className="absolute top-0 bottom-0 border-l-2 border-red-500/50 z-10 pointer-events-none"
              style={{ left: todayOffset * dayWidth }}
            />
          )}

          {/* Righe Gantt */}
          {data.map((row) => {
            // Calcolo coordinate Plan (Tratteggio)
            const pStart = row.planStart ? differenceInDays(new Date(row.planStart), minDate) : null;
            const pEnd = row.planEnd ? differenceInDays(new Date(row.planEnd), minDate) : null;
            
            // Calcolo coordinate Actual (Barra solida)
            const aStart = row.actualStart ? differenceInDays(new Date(row.actualStart), minDate) : pStart;
            // Se non c'è fine effettiva, spingiamo la barra fino a "oggi" se in corso, oppure alla planEnd se completato
            let aEnd = row.actualEnd ? differenceInDays(new Date(row.actualEnd), minDate) : null;
            if (aStart !== null && aEnd === null && row.progress > 0) {
                aEnd = Math.min(todayOffset, pEnd || todayOffset); // Se in corso, arriva fino a oggi o al massimo al planEnd
            }

            // Colori della barra effettiva in base allo status
            let actualColor = "bg-blue-500"; // in_progress
            if (row.progress >= 100) actualColor = "bg-emerald-500";
            if (row.status === "late" || row.status === "ritardo") actualColor = "bg-red-500";

            return (
              <div key={row.id} className={cn(
                "h-14 border-b relative group hover:bg-muted/10 transition-colors",
                row.id === "summary" && "bg-primary/5" // Sfondo leggero anche per la riga master nella timeline
              )}>
                
                {/* 1. PLAN DURATION (La base tratteggiata) */}
                {pStart !== null && pEnd !== null && (
                  <div 
                    className="absolute top-4 h-6 border-2 border-dashed border-muted-foreground/40 rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.05)_4px,rgba(0,0,0,0.05)_8px)]"
                    style={{ 
                      left: pStart * dayWidth, 
                      width: Math.max((pEnd - pStart) * dayWidth, dayWidth) 
                    }}
                  />
                )}

                {/* 2. ACTUAL DURATION (La barra di avanzamento reale) */}
                {aStart !== null && aEnd !== null && (
                  <div 
                    className={cn("absolute top-4 h-6 rounded shadow-sm z-10 transition-all opacity-90", actualColor)}
                    style={{ 
                      left: aStart * dayWidth, 
                      width: Math.max((aEnd - aStart) * dayWidth, 4) 
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
