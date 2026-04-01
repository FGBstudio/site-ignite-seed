import { useMemo } from "react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export interface GanttRowData {
  id: string;
  label: string;
  subLabel?: string;
  
  // Baseline (Tratteggio)
  planStart: string | null;
  planEnd: string | null;
  
  // Actual (Barra Piena)
  actualStart: string | null;
  actualEnd: string | null;
  
  progress: number; // 0 - 100
  status: "pending" | "in_progress" | "achieved" | "late" | string;
  
  onClickUrl?: string;
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

  return (
    <div className="flex h-full w-full bg-background border rounded-lg overflow-hidden text-sm">
      
      {/* PANNELLO SINISTRO (Dati Tabellari) */}
      <div className="w-[350px] flex-shrink-0 border-r bg-muted/10 flex flex-col z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
        {/* Header Sinistro */}
        <div className="h-12 border-b flex items-center px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wide bg-muted/30">
          <div className="flex-1">Attività / Fase</div>
          <div className="w-16 text-right">Prog.</div>
        </div>
        
        {/* Righe Sinistre */}
        <div className="flex-1 overflow-y-hidden">
          {data.map((row) => (
            <div 
              key={row.id} 
              className={cn(
                "h-14 border-b flex flex-col justify-center px-4 hover:bg-muted/50 transition-colors",
                row.onClickUrl && "cursor-pointer"
              )}
              onClick={() => row.onClickUrl && navigate(row.onClickUrl)}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground truncate pr-2">{row.label}</span>
                <span className="text-xs font-mono text-muted-foreground">{Math.round(row.progress)}%</span>
              </div>
              {row.subLabel && <span className="text-[10px] text-muted-foreground truncate">{row.subLabel}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* PANNELLO DESTRO (Timeline Scorrevolmente Orizzontale) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar">
        
        {/* Header Timeline (Giorni e Mesi) */}
        <div className="h-12 border-b bg-muted/30 relative" style={{ width: totalDays * dayWidth }}>
          {/* Riga Mesi (opzionale, semplificata) */}
          <div className="absolute top-0 left-0 h-6 flex items-center text-[10px] font-bold text-muted-foreground uppercase px-2">
            Timeline
          </div>
          {/* Riga Giorni (L, M, M, G, V, S, D) */}
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
              <div key={row.id} className="h-14 border-b relative group hover:bg-muted/10 transition-colors">
                
                {/* 1. PLAN DURATION (La base tratteggiata) */}
                {pStart !== null && pEnd !== null && (
                  <div 
                    className="absolute top-4 h-6 border-2 border-dashed border-muted-foreground/40 rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.05)_4px,rgba(0,0,0,0.05)_8px)]"
                    style={{ 
                      left: pStart * dayWidth, 
                      width: Math.max((pEnd - pStart) * dayWidth, dayWidth) // Minimo 1 giorno di larghezza
                    }}
                  />
                )}

                {/* 2. ACTUAL DURATION (La barra di avanzamento reale) */}
                {aStart !== null && aEnd !== null && (
                  <div 
                    className={cn("absolute top-4 h-6 rounded shadow-sm z-10 transition-all", actualColor)}
                    style={{ 
                      left: aStart * dayWidth, 
                      width: Math.max((aEnd - aStart) * dayWidth, 4) // Minimo spessore visivo
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
