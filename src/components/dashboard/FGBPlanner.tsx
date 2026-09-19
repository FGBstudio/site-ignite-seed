import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Info, Rows3, Table2, GanttChartSquare, ZoomIn, ZoomOut, CalendarDays } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PROJECT_STATUS_META, ONLINE_COLOR } from "@/lib/projectStatus";

export interface GanttSegment {
  id: string;
  start: string | null;
  end: string | null;
  status: "pending" | "in_progress" | "achieved" | "late" | "on_hold" | string;
  progress?: number;
  phase?: string;
  title?: string; // Es. "FGB Design guidelines"
  duration?: number; // Giorni totali
}

export interface GanttRowData {
  id: string;
  label: string;
  subLabel?: string;
  /**
   * Cliente e città in campi propri, non impastati in `subLabel`.
   *
   * Servono come colonne separate — ordinabili e leggibili in colonna — come
   * nella vista admin: «Rodeo Drive» da solo non dice se è Los Angeles o Milano,
   * e i nomi dei negozi si ripetono fra città diverse.
   */
  client?: string | null;
  city?: string | null;
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

/** Cosa si guarda: la tabella, il diagramma, o tutti e due affiancati. */
type PlannerView = "split" | "table" | "timeline";

/**
 * Quanto spazio occupa un giorno.
 *
 * Il diagramma era bloccato a 24 pixel al giorno. Con la tabella a sinistra che
 * ne mangiava 830, su uno schermo normale restavano venti giorni visibili: di un
 * progetto lungo un anno se ne vedeva il cinque per cento, e per arrivare in
 * fondo si trascinava la barra per venti schermate. I tre livelli servono a
 * vedere la settimana, il trimestre o l'anno senza cambiare pagina.
 */
const ZOOMS = {
  day:   { dayWidth: 28,  label: "Giorno" },
  week:  { dayWidth: 9,   label: "Settimana" },
  month: { dayWidth: 3.2, label: "Mese" },
} as const;
type ZoomKey = keyof typeof ZOOMS;

const ROW_H = 40;
const BAR_H = 16;
const BAR_TOP = (ROW_H - BAR_H) / 2;

/** Quanto e' larga la colonna di sinistra in ciascuna vista. */
const LEFT_W: Record<PlannerView, number> = {
  // Nel diagramma resta solo il nome: un Gantt senza etichette di riga non si
  // legge, ma le date stanno gia' disegnate nelle barre.
  timeline: 210,
  // Affiancati: cliente, città, progetto, stato, consegna, avanzamento. Con
  // 366px le sei colonne si schiacciavano l'una sull'altra e non si leggeva
  // niente — meglio togliere spazio alle barre, che senza etichette leggibili
  // non dicono comunque di chi sono.
  split: 596,
  // Tabella: tutte le colonne.
  table: 1130,
};

/**
 * I colori delle fasi sono gli stessi del grafico "Status Breakdown" nei report
 * — vengono da src/lib/projectStatus.ts. Prima erano quattro trasparenze dello
 * stesso verde acqua, indistinguibili fra loro; e soprattutto la stessa fase
 * aveva un colore qui e un altro nei report.
 */
const PHASE_COLOR: Record<string, string> = {
  Design: PROJECT_STATUS_META.design_phase.color,
  Construction: PROJECT_STATUS_META.construction_phase.color,
  Certification: PROJECT_STATUS_META.certification_in_progress.color,
};
const COLOR_DONE = PROJECT_STATUS_META.certified.color;
const COLOR_ALARM = PROJECT_STATUS_META.on_hold.color;
const COLOR_NEUTRAL = PROJECT_STATUS_META.quotation_phase.color;

function segmentColor(seg: GanttSegment): string {
  if (seg.status === "on_hold" || seg.status === "late") return COLOR_ALARM;
  if (seg.status === "achieved") return COLOR_DONE;
  return PHASE_COLOR[seg.phase ?? ""] ?? COLOR_NEUTRAL;
}

interface FGBPlannerProps {
  data: GanttRowData[];
  /** Zoom iniziale, in pixel per giorno. Si traduce nel livello piu' vicino. */
  dayWidth?: number;
  defaultView?: PlannerView;
}

export function FGBPlanner({ data, dayWidth, defaultView = "split" }: FGBPlannerProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<PlannerView>(defaultView);
  const [zoom, setZoom] = useState<ZoomKey>(() => {
    if (!dayWidth) return "day";
    // Il valore passato dai chiamanti diventa il livello piu' vicino.
    if (dayWidth <= 5) return "month";
    if (dayWidth <= 15) return "week";
    return "day";
  });

  const px = ZOOMS[zoom].dayWidth;
  const leftW = LEFT_W[view];
  const showTimeline = view !== "table";
  const showFullTable = view === "table";

  /**
   * Nella vista tabella la colonna di sinistra E' la pagina, quindi occupa
   * tutta la larghezza invece di fermarsi alla sua misura e lasciare mezzo
   * schermo vuoto; sotto la larghezza minima si scorre in orizzontale.
   */
  const leftStyle: React.CSSProperties = showTimeline
    ? { width: leftW }
    : { width: "100%", minWidth: LEFT_W.table };

  const { minDate, totalDays } = useMemo(() => {
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
      row.segments?.forEach((seg) => {
        if (seg.start) dates.push(new Date(seg.start));
        if (seg.end) dates.push(new Date(seg.end));
      });
      dates.forEach((d) => {
        if (!isNaN(d.getTime())) {
          if (d < min) min = d;
          if (d > max) max = d;
        }
      });
    });

    // Oggi entra sempre nell'intervallo: senza, su un portafoglio tutto passato
    // o tutto futuro la linea di oggi finiva fuori dal disegno e non si capiva
    // piu' dove si fosse.
    const now = new Date();
    if (now < min) min = now;
    if (now > max) max = now;

    if (min > max) {
      min = new Date();
      max = addDays(new Date(), 30);
    }

    const startDate = startOfWeek(addDays(min, -7), { weekStartsOn: 1 });
    const endDate = endOfWeek(addDays(max, 14), { weekStartsOn: 1 });
    return { minDate: startDate, totalDays: Math.max(differenceInDays(endDate, startDate), 1) };
  }, [data]);

  const days = useMemo(
    () => Array.from({ length: totalDays + 1 }, (_, i) => addDays(minDate, i)),
    [minDate, totalDays],
  );

  /** Le fasce dell'intestazione: giorni raggruppati per mese e per anno. */
  const { monthBands, yearBands, weekTicks } = useMemo(() => {
    const months: Array<{ key: string; label: string; offset: number; span: number }> = [];
    const years: Array<{ key: string; label: string; offset: number; span: number }> = [];
    const weeks: number[] = [];
    days.forEach((d, i) => {
      const mk = format(d, "yyyy-MM");
      const last = months[months.length - 1];
      if (!last || last.key !== mk) months.push({ key: mk, label: format(d, "MMM yyyy"), offset: i, span: 1 });
      else last.span += 1;

      const yk = format(d, "yyyy");
      const lastY = years[years.length - 1];
      if (!lastY || lastY.key !== yk) years.push({ key: yk, label: yk, offset: i, span: 1 });
      else lastY.span += 1;

      if (d.getDay() === 1) weeks.push(i);
    });
    return { monthBands: months, yearBands: years, weekTicks: weeks };
  }, [days]);

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate);
  const timelineW = totalDays * px;

  /** Porta la vista su oggi, lasciandolo a un terzo dello schermo. */
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = leftW + todayOffset * px - (el.clientWidth - leftW) / 3;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [leftW, todayOffset, px]);

  // Al primo disegno e a ogni cambio di zoom la vista si mette su oggi: prima
  // partiva dall'inizio dell'intervallo, che su progetti vecchi di due anni
  // significava aprire il diagramma su un pezzo di calendario vuoto.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = leftW + todayOffset * px - (el.clientWidth - leftW) / 3;
    el.scrollTo({ left: Math.max(0, target), behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, view]);

  const fmt = (d: Date | string | null | undefined) => {
    if (!d) return "—";
    const dateObj = typeof d === "string" ? new Date(d) : d;
    return isNaN(dateObj.getTime()) ? "—" : format(dateObj, "dd/MM/yy");
  };

  // "Online" e' il traguardo dei progetti di monitoraggio, come "Certified" lo
  // e' per le certificazioni: stessa evidenza, verde acqua del marchio invece
  // del verde del certificato.
  const rowTint = (row: GanttRowData) =>
    row.status === "on_hold"
      ? "bg-destructive/10"
      : row.isDeadlineCritical
      ? "bg-destructive/5"
      : row.status === "Certified"
      ? "bg-success/10"
      : row.status === "Online"
      ? "bg-primary/10"
      : row.id === "summary"
      ? "bg-primary/5"
      : "";

  const rowAccent = (row: GanttRowData) =>
    row.status === "on_hold"
      ? COLOR_ALARM
      : row.isDeadlineCritical
      ? COLOR_ALARM
      : row.status === "Certified"
      ? COLOR_DONE
      : row.status === "Online"
      ? ONLINE_COLOR
      : "transparent";

  return (
    /* Un solo TooltipProvider per tutto il piano. Prima ogni barra si portava
       il suo: su un portafoglio da novecento progetti significava creare
       migliaia di provider, e il diagramma arrancava allo scorrimento. */
    <TooltipProvider delayDuration={120}>
    <div className="flex flex-col h-full w-full bg-background border rounded-xl overflow-hidden text-sm shadow-sm">

      {/* ── Barra dei comandi ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b bg-muted/20 shrink-0">

        {/* Lo scambio fra le due viste, piu' l'affiancata. */}
        <div className="inline-flex rounded-lg border bg-background p-0.5" role="group" aria-label="Vista">
          {([
            { key: "table", icon: Table2, label: "Tabella" },
            { key: "split", icon: Rows3, label: "Affiancate" },
            { key: "timeline", icon: GanttChartSquare, label: "Diagramma" },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              title={label}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-colors",
                view === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {showTimeline && (
          <>
            <div className="inline-flex items-center gap-1">
              <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="inline-flex rounded-lg border bg-background p-0.5">
                {(Object.keys(ZOOMS) as ZoomKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setZoom(k)}
                    aria-pressed={zoom === k}
                    className={cn(
                      "px-2.5 h-7 rounded-md text-xs font-medium transition-colors",
                      zoom === k
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {ZOOMS[k].label}
                  </button>
                ))}
              </div>
              <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            <button
              type="button"
              onClick={scrollToToday}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Oggi
            </button>

            {/* La legenda mancava del tutto: i colori c'erano e nessuno sapeva
                cosa volessero dire. */}
            <div className="hidden lg:flex items-center gap-3 ml-auto">
              {[
                ["Design", PHASE_COLOR.Design],
                ["Cantiere", PHASE_COLOR.Construction],
                ["Certificazione", PHASE_COLOR.Certification],
                ["Fatto", COLOR_DONE],
                ["In ritardo / sospeso", COLOR_ALARM],
              ].map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}

        <span className={cn("text-[11px] text-muted-foreground tabular-nums", showTimeline ? "" : "ml-auto")}>
          {data.length} {data.length === 1 ? "riga" : "righe"}
        </span>
      </div>

      {/* ── Il piano ─────────────────────────────────────────────────────────
          Un solo contenitore che scorre nei due sensi, con la colonna di
          sinistra e l'intestazione appiccicate. Prima erano due riquadri
          separati con lo scorrimento verticale sincronizzato a mano, e bastava
          un attimo perche' le righe si disallineassero dalle barre. */}
      <div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar relative">
        <div style={{ width: showTimeline ? leftW + timelineW : "100%", minWidth: showTimeline ? undefined : LEFT_W.table }}>

          {/* Intestazione */}
          <div className="sticky top-0 z-30 flex h-11 bg-background border-b shadow-sm">
            <div
              className="sticky left-0 z-40 flex items-center bg-background border-r shrink-0"
              style={leftStyle}
            >
              <HeaderCells full={showFullTable} view={view} />
            </div>

            {showTimeline && (
              <div className="relative shrink-0" style={{ width: timelineW }}>
                {/* Fascia alta: mesi, oppure anni quando si guarda largo. */}
                <div className="absolute top-0 left-0 h-5 flex">
                  {(zoom === "month" ? yearBands : monthBands).map((b) => (
                    <div
                      key={b.key}
                      className="h-5 flex items-center border-l border-border/60 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground overflow-hidden whitespace-nowrap"
                      style={{ width: b.span * px }}
                    >
                      {b.span * px > 46 ? b.label : ""}
                    </div>
                  ))}
                </div>
                {/* Fascia bassa: i giorni, oppure i mesi quando si guarda largo. */}
                <div className="absolute bottom-0 left-0 h-6 flex">
                  {zoom === "day"
                    ? days.map((d, i) => {
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "shrink-0 flex items-center justify-center text-[10px] border-l border-border/40 tabular-nums",
                              weekend ? "bg-muted/60 text-muted-foreground/60" : "text-muted-foreground",
                              i === todayOffset && "bg-primary/15 text-primary font-bold",
                            )}
                            style={{ width: px }}
                          >
                            {format(d, "d")}
                          </div>
                        );
                      })
                    : monthBands.map((b) => (
                        <div
                          key={b.key}
                          className="shrink-0 flex items-center justify-center text-[10px] border-l border-border/40 text-muted-foreground overflow-hidden whitespace-nowrap"
                          style={{ width: b.span * px }}
                        >
                          {b.span * px > 30 ? format(new Date(b.key + "-02"), "MMM") : ""}
                        </div>
                      ))}
                </div>
              </div>
            )}
          </div>

          {/* Righe */}
          <div className="relative">
            {/* Sfondo del calendario: fine settimana e stacchi di mese. Al
                livello "giorno" una riga per giorno; sopra sarebbe rumore. */}
            {showTimeline && (
              <div className="absolute inset-y-0 pointer-events-none" style={{ left: leftW, width: timelineW }}>
                {zoom === "day" &&
                  days.map((d, i) =>
                    d.getDay() === 0 || d.getDay() === 6 ? (
                      <div key={i} className="absolute inset-y-0 bg-muted/40" style={{ left: i * px, width: px }} />
                    ) : null,
                  )}
                {(zoom === "week" ? weekTicks.map((o) => ({ offset: o })) : monthBands).map((b, i) => (
                  <div key={i} className="absolute inset-y-0 border-l border-border/40" style={{ left: b.offset * px }} />
                ))}
              </div>
            )}

            {data.map((row) => {
              const isClickable = !!(row.onClickUrl || row.onClick);
              const go = () => {
                if (row.onClick) row.onClick();
                else if (row.onClickUrl) navigate(row.onClickUrl);
              };
              return (
                <div
                  key={row.id}
                  className={cn("flex border-b group transition-colors hover:bg-muted/40", rowTint(row))}
                  style={{ height: ROW_H }}
                >
                  {/* Colonna di sinistra, appiccicata */}
                  {/* Lo sfondo pieno serve: la colonna resta ferma mentre le
                      barre le scorrono sotto, e una tinta trasparente le
                      lascerebbe passare attraverso il testo. La tinta della
                      riga si sovrappone come strato separato. */}
                  <div
                    className={cn(
                      "sticky left-0 z-20 flex items-center border-r shrink-0 bg-background relative",
                      isClickable && "cursor-pointer",
                    )}
                    style={{ ...leftStyle, borderLeft: `3px solid ${rowAccent(row)}` }}
                    onClick={isClickable ? go : undefined}
                  >
                    <div className={cn("absolute inset-0 pointer-events-none group-hover:bg-muted/40", rowTint(row))} />
                    <RowCells row={row} full={showFullTable} view={view} fmt={fmt} />
                  </div>

                  {/* Barre */}
                  {showTimeline && (
                    <div className="relative shrink-0" style={{ width: timelineW }}>
                      {row.segments && row.segments.length > 0
                        ? row.segments.map((seg, idx) => (
                            <SegmentBar
                              key={seg.id ?? idx}
                              seg={seg}
                              minDate={minDate}
                              px={px}
                              fmt={fmt}
                            />
                          ))
                        : (() => {
                            const s = row.planStart ? differenceInDays(new Date(row.planStart), minDate) : null;
                            const e = row.planEnd ? differenceInDays(new Date(row.planEnd), minDate) : null;
                            if (s === null || e === null) return null;
                            const w = Math.max(e - s, 1) * px;
                            const color =
                              row.status === "on_hold" ? COLOR_ALARM
                              : row.status === "Certified" ? COLOR_DONE
                              : COLOR_NEUTRAL;
                            return (
                              <div
                                className="absolute rounded-md overflow-hidden"
                                style={{ left: s * px, width: w, top: BAR_TOP, height: BAR_H, background: `${color}33` }}
                              >
                                <div
                                  className="absolute inset-y-0 left-0 rounded-md"
                                  style={{ width: `${Math.min(100, Math.max(0, row.progress))}%`, background: color }}
                                />
                              </div>
                            );
                          })()}

                      {/* Consegna prevista */}
                      {row.plannedHandoverDate && (() => {
                        const o = differenceInDays(new Date(row.plannedHandoverDate), minDate);
                        if (o < 0 || o > totalDays) return null;
                        return (
                          <div
                            className="absolute z-10 pointer-events-none"
                            style={{ left: o * px - 4, top: ROW_H / 2 - 4 }}
                            title={`Consegna prevista: ${fmt(row.plannedHandoverDate)}`}
                          >
                            <div className="h-2 w-2 rotate-45 bg-amber-500 ring-2 ring-background" />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* La linea di oggi, sopra a tutto. Prima era una colonna colorata
                al 30% di opacita' dentro un contenitore al 20%: praticamente
                invisibile. */}
            {showTimeline && todayOffset >= 0 && todayOffset <= totalDays && (
              <div
                className="absolute top-0 bottom-0 z-10 pointer-events-none border-l-2"
                style={{ left: leftW + todayOffset * px, borderColor: COLOR_ALARM }}
              />
            )}

            {data.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Nessun progetto da mostrare con i filtri attivi.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Le celle di sinistra.

   Quali colonne compaiono dipende dalla vista: nel diagramma solo il nome,
   affiancate le quattro che servono a orientarsi, nella tabella tutte. Prima
   c'erano sempre e comunque undici colonne per 830 pixel, ed erano loro a non
   lasciare spazio al diagramma.
   ───────────────────────────────────────────────────────────────────────── */

const COL = "shrink-0 px-2 text-[11px]";

function HeaderCells({ full, view }: { full: boolean; view: PlannerView }) {
  return (
    <div className="flex items-center w-full font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
      {/* Cliente e città accanto al progetto, come nella vista admin: sono le
          tre cose che insieme identificano una commessa. Nel solo diagramma
          restano fuori — lì lo spazio serve alle barre. */}
      {view !== "timeline" && (
        <>
          <div className={cn(COL, "w-[128px]")}>Client</div>
          <div className={cn(COL, "w-[112px]")}>Città</div>
        </>
      )}
      <div className={cn(COL, "flex-1 min-w-0")}>Progetto</div>
      {view !== "timeline" && (
        <>
          <div className={cn(COL, "w-[104px]")}>Stato</div>
          <div className={cn(COL, "w-[74px]")}>Consegna</div>
          <div className={cn(COL, "w-[52px] text-right")}>%</div>
        </>
      )}
      {full && (
        <>
          <div className={cn(COL, "w-[70px] border-l")}>Avvio</div>
          <div className={cn(COL, "w-[70px]")} style={{ color: PHASE_COLOR.Design }}>Des. in.</div>
          <div className={cn(COL, "w-[70px]")} style={{ color: PHASE_COLOR.Design }}>Des. fine</div>
          <div className={cn(COL, "w-[70px]")} style={{ color: PHASE_COLOR.Construction }}>Cant. in.</div>
          <div className={cn(COL, "w-[70px]")} style={{ color: PHASE_COLOR.Construction }}>Cant. prev.</div>
          <div className={cn(COL, "w-[70px]")} style={{ color: PHASE_COLOR.Construction }}>Cant. eff.</div>
          <div className={cn(COL, "w-[54px] text-right")}>gg pian.</div>
          <div className={cn(COL, "w-[54px] text-right")}>gg eff.</div>
        </>
      )}
    </div>
  );
}

function RowCells({
  row,
  full,
  view,
  fmt,
}: {
  row: GanttRowData;
  full: boolean;
  view: PlannerView;
  fmt: (d: Date | string | null | undefined) => string;
}) {
  return (
    <div className="relative z-10 flex items-center w-full">
      {view !== "timeline" && (
        <>
          <div className={cn(COL, "w-[128px] min-w-0")}>
            <span className="block truncate text-[11px] font-semibold uppercase" title={row.client ?? ""}>
              {row.client ?? "—"}
            </span>
          </div>
          <div className={cn(COL, "w-[112px] min-w-0")}>
            <span className="block truncate text-[11px] uppercase text-muted-foreground" title={row.city ?? ""}>
              {row.city ?? "—"}
            </span>
          </div>
        </>
      )}
      <div className={cn(COL, "flex-1 min-w-0 flex flex-col justify-center leading-tight")}>
        <span className="truncate text-xs font-medium text-foreground" title={row.label}>{row.label}</span>
        {/* Nel solo diagramma il sottotitolo resta: è l'unico posto dove si può
            leggere di chi è la riga, perché le colonne non ci sono. */}
        {view === "timeline" && row.subLabel && (
          <span className="truncate text-[10px] text-muted-foreground">{row.subLabel}</span>
        )}
      </div>
      {view !== "timeline" && (
        <>
          <div className={cn(COL, "w-[104px]")}>
            <span
              className="inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                color:
                  row.status === "on_hold" ? COLOR_ALARM
                  : row.status === "Certified" ? COLOR_DONE
                  : row.status === "Online" ? ONLINE_COLOR
                  : undefined,
                borderColor:
                  row.status === "on_hold" ? `${COLOR_ALARM}55`
                  : row.status === "Certified" ? `${COLOR_DONE}55`
                  : row.status === "Online" ? `${ONLINE_COLOR}55`
                  : undefined,
              }}
            >
              {String(row.status).replace(/_/g, " ")}
            </span>
          </div>
          <div className={cn(COL, "w-[74px] tabular-nums text-muted-foreground")}>{fmt(row.plannedHandoverDate)}</div>
          <div className={cn(COL, "w-[52px] text-right tabular-nums font-semibold text-primary")}>
            {Math.round(row.progress)}%
          </div>
        </>
      )}
      {full && (
        <>
          <div className={cn(COL, "w-[70px] tabular-nums text-muted-foreground border-l")}>{fmt(row.launchDate)}</div>
          <div className={cn(COL, "w-[70px] tabular-nums")}>{fmt(row.designStart)}</div>
          <div className={cn(COL, "w-[70px] tabular-nums")}>{fmt(row.designEnd)}</div>
          <div className={cn(COL, "w-[70px] tabular-nums")}>{fmt(row.constrStartPlan)}</div>
          <div className={cn(COL, "w-[70px] tabular-nums")}>{fmt(row.constrEndFcst)}</div>
          <div className={cn(COL, "w-[70px] tabular-nums font-medium")}>{fmt(row.constrEndAct)}</div>
          <div className={cn(COL, "w-[54px] text-right tabular-nums text-muted-foreground")}>{row.planDuration}</div>
          <div className={cn(COL, "w-[54px] text-right tabular-nums font-semibold")}>{row.actDuration}</div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Una barra.

   Le milestone senza durata diventano un rombo invece di una pillola di un
   giorno: a zoom largo un giorno e' meno di quattro pixel e sparivano.
   Il titolo si scrive dentro la barra quando c'e' posto, cosi' il diagramma si
   legge senza passarci sopra col mouse una barra alla volta.
   ───────────────────────────────────────────────────────────────────────── */
function SegmentBar({
  seg,
  minDate,
  px,
  fmt,
}: {
  seg: GanttSegment;
  minDate: Date;
  px: number;
  fmt: (d: Date | string | null | undefined) => string;
}) {
  if (!seg.start || !seg.end) return null;
  const startDay = differenceInDays(new Date(seg.start), minDate);
  const spanDays = differenceInDays(new Date(seg.end), new Date(seg.start));
  const color = segmentColor(seg);
  const isMilestone = spanDays <= 0;
  const width = Math.max(spanDays, 1) * px;
  const fill =
    seg.status === "achieved" ? 100
    : seg.status === "pending" ? 0
    : seg.progress ?? 50;

  /**
   * Il nome dell'attivita' si scrive dentro la barra solo se c'e' spazio vero.
   * Quando compare, la parte non completata si scurisce dal 30% al 60%: cosi'
   * il testo bianco resta leggibile sia sul riempito sia sul vuoto, senza dover
   * indovinare dove finisce l'uno e comincia l'altro.
   */
  const showLabel = width > 96 && !!seg.title;
  const trackAlpha = showLabel ? "99" : "30";

  return (
      <Tooltip>
        <TooltipTrigger asChild>
          {isMilestone ? (
            <div
              className="absolute z-10 cursor-pointer"
              style={{ left: startDay * px - 5, top: ROW_H / 2 - 5 }}
            >
              <div
                className="h-2.5 w-2.5 rotate-45 ring-2 ring-background transition-transform hover:scale-125"
                style={{ background: color }}
              />
            </div>
          ) : (
            <div
              className="absolute rounded-md overflow-hidden cursor-pointer ring-offset-1 transition-all hover:ring-2"
              style={{
                left: startDay * px,
                width,
                top: BAR_TOP,
                height: BAR_H,
                background: `${color}${trackAlpha}`,
                boxShadow: `inset 0 0 0 1px ${color}66`,
              }}
            >
              {fill > 0 && (
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${Math.min(100, fill)}%`, background: color }}
                />
              )}
              {showLabel && (
                <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-white truncate">
                  {seg.title}
                </span>
              )}
            </div>
          )}
        </TooltipTrigger>

        <TooltipContent side="top" align="center" className="w-64 p-0 overflow-hidden shadow-lg border-muted">
          <div className="bg-muted/60 px-3 py-2 border-b flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color }} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide truncate" style={{ color }}>
                {seg.phase || "Milestone"}
              </p>
              <p className="text-sm font-semibold text-foreground truncate" title={seg.title}>
                {seg.title || "Attività"}
              </p>
            </div>
          </div>
          <div className="p-3 space-y-2 bg-background">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Inizio</div>
              <span className="font-medium text-foreground tabular-nums">{fmt(seg.start)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Fine</div>
              <span className="font-medium text-foreground tabular-nums">{fmt(seg.end)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t mt-2 text-xs">
              <span className="text-muted-foreground">Stato</span>
              <span className="font-bold" style={{ color }}>
                {seg.status === "achieved" ? "Completata" : `${Math.round(fill)}%`}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
  );
}
