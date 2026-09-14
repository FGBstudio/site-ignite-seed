import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Minus, Plus, X } from "lucide-react";
import type { NaturaPasso } from "@/types/cronoprogramma";
import type { Famiglia } from "@/lib/projectTimelineTemplates";

/**
 * La timeline verticale — v1.1 §9, grammatica dal riferimento visivo approvato.
 *
 * Scala temporale reale sull'asse verticale, fasi come barre e milestone come
 * nodi sulla stessa spina, corsie Project e HQ FGB affiancate con i connettori
 * di ereditarieta' (tratteggio grigio) e di calcolo (viola, con +Ngg), linea
 * dell'oggi e linea della scadenza contrattuale con il margine indicato.
 *
 * Due stati: compatta — colonna stretta e sticky accanto al form, nodi e date
 * abbreviate — ed espansa, overlay a schermo intero con zoom e date complete.
 *
 * I colori: le famiglie tengono le tinte del riferimento (design grigio,
 * permitting ambra, certificazione viola), che la v1.1 §12 fissa come
 * semantica; il teal FGB resta il colore delle azioni e dei passi decisi dal
 * PM — e' il marchio che dice "questo lo scrivi tu".
 */

export interface VoceTimeline {
  key: string;
  label: string;
  corsia: "project" | "cert";
  tipo: "fase" | "milestone";
  inizio: string | null;
  /** Solo per le fasi. Una milestone e' un istante. */
  fine?: string | null;
  famiglia?: Famiglia | null;
  natura?: NaturaPasso | "ancora";
  fatta?: boolean;
  daConfermare?: boolean;
  isHandover?: boolean;
  /** Per i calcolati: l'etichetta +Ngg sul connettore. */
  offsetGiorni?: number | null;
  violazione?: { messaggio: string } | null;
  cliccabile?: boolean;
  /** Fonte o nota breve, mostrata sotto la data nell'espansa. */
  nota?: string | null;
}

interface Props {
  voci: VoceTimeline[];
  oggi?: string;
  scadenzaContratto?: string | null;
  focus?: string | null;
  onVoceClick?: (key: string) => void;
  titoloProject?: string;
  titoloCert?: string;
  /** Colonna stretta accanto al form. Il click apre l'overlay espanso. */
  compatta?: boolean;
}

// Le tinte delle famiglie: quelle del riferimento visivo, leggibili su chiaro
// e scuro. Il viola e' la corsia della certificazione, l'ambra il permitting
// e il "da confermare", il grigio il design e l'ereditato.
const FAM: Record<Famiglia, string> = {
  design: "#B4B2A9",
  permitting: "#EAB308",
  construction: "#8A8577",
  terze_parti: "#CBC9BE",
};
const VIOLA = "#6D5AE6";
const VIOLA_CHIARO = "#B7ACF4";
const TEAL = "#009193";
const GRIGIO = "#9C998E";
const AMBRA = "#D97706";
const ROSSO = "#C2453A";

function g(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function TimelineVerticale(props: Props) {
  const [espansa, setEspansa] = useState(false);
  if (props.compatta) {
    return (
      <>
        <button
          type="button"
          onClick={() => setEspansa(true)}
          className="block w-full cursor-zoom-in rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Espandi la timeline"
          title="Espandi: zoom e date complete"
        >
          <Disegno {...props} pxGiorno={0.55} compatta />
        </button>
        {espansa && <Overlay {...props} onClose={() => setEspansa(false)} />}
      </>
    );
  }
  return <Disegno {...props} pxGiorno={1.1} />;
}

/** L'overlay espanso: zoom con bottoni e rotellina, chiusura esplicita. */
function Overlay(props: Props & { onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Timeline espansa"
      onKeyDown={(e) => e.key === "Escape" && props.onClose()}
    >
      <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {props.titoloProject ?? "Project timeline"} × {props.titoloCert ?? "HQ FGB timeline"}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))}
            className="rounded-md border p-1.5 hover:bg-muted"
            aria-label="Riduci"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="rounded-md border p-1.5 hover:bg-muted"
            aria-label="Ingrandisci"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="ml-2 rounded-md border p-1.5 hover:bg-muted"
            aria-label="Chiudi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-auto p-4"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(3, Math.max(0.4, z - Math.sign(e.deltaY) * 0.15)));
        }}
      >
        <div className="mx-auto max-w-4xl">
          <Disegno {...props} pxGiorno={1.4 * zoom} />
          <Legenda />
        </div>
      </div>
    </div>
  );
}

function Disegno({
  voci,
  oggi,
  scadenzaContratto,
  focus,
  onVoceClick,
  titoloProject = "Project timeline",
  titoloCert = "HQ FGB timeline",
  pxGiorno,
  compatta = false,
}: Props & { pxGiorno: number; compatta?: boolean }) {
  const conData = voci.filter((v) => v.inizio);
  const senzaData = voci.filter((v) => !v.inizio);
  const oggiISO = oggi ?? format(new Date(), "yyyy-MM-dd");

  const dominio = useMemo(() => {
    if (conData.length === 0) return null;
    const tutte = conData
      .flatMap((v) => [v.inizio!, v.fine ?? v.inizio!])
      .concat(scadenzaContratto ? [scadenzaContratto] : [])
      .concat([oggiISO])
      .sort();
    const min = tutte[0];
    const max = tutte[tutte.length - 1];
    const span = Math.max(30, g(min, max));
    return { min, max, span, pad: Math.round(span * 0.05) };
  }, [conData, scadenzaContratto, oggiISO]);

  if (!dominio) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          La timeline compare qui man mano che inserisci le date.
        </p>
      </div>
    );
  }

  const H = Math.round((dominio.span + dominio.pad * 2) * pxGiorno);
  const W = compatta ? 190 : 900;
  const xProject = compatta ? 60 : 330;
  const xCert = compatta ? 130 : 570;
  const y = (d: string) => Math.round((g(dominio.min, d) + dominio.pad) * pxGiorno) + 26;

  const mesi = mesiTra(dominio.min, dominio.max, compatta ? 6 : 14);
  const handover = conData.find((v) => v.isHandover && v.corsia === "project");
  const yOggi = y(oggiISO);

  return (
    <div className={cn("rounded-xl border bg-card", compatta ? "p-2" : "p-4")}>
      {!compatta && (
        <div className="mb-1 flex justify-between px-2 text-xs font-semibold">
          <span className="text-muted-foreground" style={{ marginLeft: xProject - 120 }}>
            {titoloProject}
          </span>
          <span style={{ color: VIOLA, marginRight: W - xCert - 220 }}>{titoloCert}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H + 52}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Timeline: ${titoloProject} e ${titoloCert}`}
      >
        {/* La scala dei mesi: righe orizzontali, come nel riferimento. */}
        {mesi.map((m) => (
          <g key={m}>
            <line
              x1={compatta ? 26 : 78}
              y1={y(m)}
              x2={W - 8}
              y2={y(m)}
              stroke="hsl(var(--border))"
              strokeWidth={0.6}
            />
            <text
              x={compatta ? 24 : 70}
              y={y(m) + 3.5}
              textAnchor="end"
              fontSize={compatta ? 8 : 11}
              fill="hsl(var(--muted-foreground))"
            >
              {format(parseISO(m), compatta ? "LLL" : "LLL yy", { locale: it })}
            </text>
          </g>
        ))}

        {/* Le due spine. */}
        <line x1={xProject} y1={16} x2={xProject} y2={H + 30} stroke="hsl(var(--border))" strokeWidth={1.5} />
        <line x1={xCert} y1={16} x2={xCert} y2={H + 30} stroke={VIOLA_CHIARO} strokeWidth={1.5} opacity={0.7} />

        {/* Connettori: prima dei nodi, cosi' restano sotto. */}
        {!compatta &&
          conData
            .filter((v) => v.corsia === "cert" && v.natura === "ereditato")
            .map((v) => (
              <path
                key={`c-${v.key}`}
                d={`M ${xProject + 8} ${y(v.inizio!)} C ${xProject + 90} ${y(v.inizio!)}, ${xCert - 90} ${y(v.inizio!)}, ${xCert - 8} ${y(v.inizio!)}`}
                stroke={GRIGIO}
                strokeWidth={1.1}
                strokeDasharray="4 3"
                fill="none"
              />
            ))}
        {!compatta &&
          handover &&
          conData
            .filter((v) => v.corsia === "cert" && v.natura === "calcolato" && v.offsetGiorni != null)
            .map((v) => (
              <g key={`k-${v.key}`}>
                <path
                  d={`M ${xProject + 9} ${y(handover.inizio!) + 3} C ${xProject + 120} ${(y(handover.inizio!) + y(v.inizio!)) / 2}, ${xCert - 120} ${y(v.inizio!)}, ${xCert - 8} ${y(v.inizio!)}`}
                  stroke={VIOLA}
                  strokeWidth={1.2}
                  fill="none"
                  opacity={0.75}
                />
              </g>
            ))}

        {/* Corsia project: fasi come barre, milestone come nodi. */}
        {conData
          .filter((v) => v.corsia === "project")
          .map((v) => {
            const y1 = y(v.inizio!);
            const attivo = focus === v.key;
            if (v.tipo === "fase" && v.fine) {
              const y2 = Math.max(y1 + 8, y(v.fine));
              const colore = v.famiglia ? FAM[v.famiglia] : FAM.construction;
              return (
                <g key={v.key} className="motion-safe:transition-all motion-safe:duration-200">
                  <rect
                    x={xProject - 8}
                    y={y1}
                    width={16}
                    height={y2 - y1}
                    rx={8}
                    fill={colore}
                    opacity={v.famiglia === "permitting" ? 0.85 : 1}
                    stroke={attivo ? TEAL : "none"}
                    strokeWidth={attivo ? 2 : 0}
                  />
                  <Etichetta
                    x={xProject - (compatta ? 12 : 22)}
                    y={(y1 + y2) / 2}
                    lato="sx"
                    testo={v.label}
                    data={compatta ? null : `${fmt(v.inizio!)} → ${fmt(v.fine)}`}
                    compatta={compatta}
                    attivo={attivo}
                  />
                </g>
              );
            }
            // Milestone di project: ancora.
            const daConf = v.daConfermare;
            return (
              <g
                key={v.key}
                className={cn(onVoceClick && v.cliccabile && "cursor-pointer")}
                onClick={() => v.cliccabile && onVoceClick?.(v.key)}
              >
                {v.isHandover ? (
                  <>
                    <circle cx={xProject} cy={y1} r={compatta ? 6 : 9} fill="#5F5E5A" />
                    <circle cx={xProject} cy={y1} r={compatta ? 9.5 : 13.5} fill="none" stroke="#5F5E5A" strokeWidth={1.2} opacity={0.4} />
                  </>
                ) : (
                  <circle
                    cx={xProject}
                    cy={y1}
                    r={compatta ? 4.5 : 7}
                    fill={v.fatta ? "#5F5E5A" : "hsl(var(--card))"}
                    stroke={daConf ? AMBRA : "#5F5E5A"}
                    strokeWidth={2}
                    strokeDasharray={daConf ? "3 2" : undefined}
                  />
                )}
                <Etichetta
                  x={xProject - (compatta ? 10 : 22)}
                  y={y1}
                  lato="sx"
                  testo={v.label}
                  data={compatta ? fmtBreve(v.inizio!) : `${fmt(v.inizio!)}${v.nota ? ` · ${v.nota}` : ""}`}
                  compatta={compatta}
                  attivo={focus === v.key}
                  forte={v.isHandover}
                  ambra={daConf}
                />
              </g>
            );
          })}

        {/* Corsia certificazione: la semantica dei nodi dalla legenda. */}
        {conData
          .filter((v) => v.corsia === "cert")
          .map((v) => {
            const y1 = y(v.inizio!);
            const attivo = focus === v.key;
            const viol = !!v.violazione;
            let nodo: React.ReactNode;
            if (v.fatta) {
              nodo = (
                <>
                  <circle cx={xCert} cy={y1} r={compatta ? 5 : 7} fill={viol ? AMBRA : VIOLA} />
                  <path
                    d={`M ${xCert - 3.2} ${y1} l 2.2 2.4 l 4 -4.6`}
                    stroke="#FFF"
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                  />
                </>
              );
            } else if (v.natura === "ereditato") {
              nodo = (
                <circle cx={xCert} cy={y1} r={compatta ? 4 : 5.5} fill="hsl(var(--muted))" stroke={GRIGIO} strokeWidth={1.6} />
              );
            } else if (v.natura === "calcolato" || v.natura === "serie") {
              nodo = (
                <circle
                  cx={xCert}
                  cy={y1}
                  r={compatta ? 4.5 : 6.5}
                  fill={VIOLA_CHIARO}
                  fillOpacity={0.35}
                  stroke={viol ? AMBRA : VIOLA}
                  strokeWidth={1.6}
                  strokeDasharray="3 2"
                />
              );
            } else if (v.isHandover) {
              nodo = (
                <>
                  <circle cx={xCert} cy={y1} r={compatta ? 6 : 9} fill={VIOLA} />
                  <circle cx={xCert} cy={y1} r={compatta ? 9.5 : 13.5} fill="none" stroke={VIOLA} strokeWidth={1.2} opacity={0.4} />
                </>
              );
            } else {
              // Del PM: bianco con anello teal — questo lo scrivi tu.
              nodo = (
                <circle
                  cx={xCert}
                  cy={y1}
                  r={compatta ? 4.5 : 7}
                  fill="hsl(var(--card))"
                  stroke={viol ? AMBRA : TEAL}
                  strokeWidth={2}
                />
              );
            }
            return (
              <g
                key={v.key}
                className={cn(onVoceClick && v.cliccabile && "cursor-pointer")}
                onClick={() => v.cliccabile && onVoceClick?.(v.key)}
              >
                {nodo}
                {attivo && (
                  <circle cx={xCert} cy={y1} r={compatta ? 8 : 11} fill="none" stroke={TEAL} strokeWidth={1.5} opacity={0.6} />
                )}
                <Etichetta
                  x={xCert + (compatta ? 9 : 18)}
                  y={y1}
                  lato="dx"
                  testo={v.label}
                  data={
                    compatta
                      ? v.natura === "pm" || v.isHandover
                        ? fmtBreve(v.inizio!)
                        : null
                      : `${fmt(v.inizio!)}${
                          v.offsetGiorni != null ? ` · +${v.offsetGiorni}gg da handover` : v.nota ? ` · ${v.nota}` : ""
                        }`
                  }
                  compatta={compatta}
                  attivo={attivo}
                  forte={v.isHandover || v.natura === "pm"}
                  viola={v.natura === "calcolato" || v.isHandover}
                  ambra={viol}
                />
              </g>
            );
          })}

        {/* La linea dell'oggi. */}
        <line x1={compatta ? 26 : 78} y1={yOggi} x2={W - 8} y2={yOggi} stroke={ROSSO} strokeWidth={1} strokeDasharray="5 4" />
        {!compatta && (
          <>
            <rect x={W - 118} y={yOggi - 9} width={110} height={18} rx={9} fill={ROSSO} fillOpacity={0.1} />
            <text x={W - 63} y={yOggi + 3.5} textAnchor="middle" fontSize={11} fontWeight={500} fill={ROSSO}>
              oggi · {fmtBreve(oggiISO)}
            </text>
          </>
        )}

        {/* La scadenza contrattuale, con il margine. */}
        {scadenzaContratto && (
          <>
            <line
              x1={compatta ? 26 : 78}
              y1={y(scadenzaContratto)}
              x2={W - 8}
              y2={y(scadenzaContratto)}
              stroke={ROSSO}
              strokeWidth={1.2}
              strokeDasharray="2 3"
            />
            {!compatta && (
              <text x={W - 8} y={y(scadenzaContratto) + 14} textAnchor="end" fontSize={11} fontWeight={500} fill={ROSSO}>
                scadenza contratto · {fmt(scadenzaContratto)}
                {margine(conData, scadenzaContratto)}
              </text>
            )}
          </>
        )}
      </svg>

      {senzaData.length > 0 && !compatta && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Ancora senza data · {senzaData.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {senzaData.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => v.cliccabile && onVoceClick?.(v.key)}
                className={cn(
                  "rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground",
                  v.cliccabile && "cursor-pointer hover:border-primary hover:text-primary",
                  focus === v.key && "border-primary text-primary"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Etichetta({
  x,
  y,
  lato,
  testo,
  data,
  compatta,
  attivo,
  forte,
  viola,
  ambra,
}: {
  x: number;
  y: number;
  lato: "sx" | "dx";
  testo: string;
  data: string | null;
  compatta: boolean;
  attivo?: boolean;
  forte?: boolean;
  ambra?: boolean;
  viola?: boolean;
}) {
  const anchor = lato === "sx" ? "end" : "start";
  const max = compatta ? 14 : 30;
  const t = testo.length > max ? `${testo.slice(0, max - 1)}…` : testo;
  return (
    <>
      <text
        x={x}
        y={data ? y - 1.5 : y + 3.5}
        textAnchor={anchor}
        fontSize={compatta ? 8.5 : 12.5}
        fontWeight={forte || attivo ? 600 : 500}
        fill={attivo ? TEAL : "hsl(var(--foreground))"}
      >
        {t}
      </text>
      {data && (
        <text
          x={x}
          y={y + (compatta ? 8.5 : 11)}
          textAnchor={anchor}
          fontSize={compatta ? 7.5 : 10.5}
          fill={ambra ? AMBRA : viola ? VIOLA : "hsl(var(--muted-foreground))"}
        >
          {data}
        </text>
      )}
    </>
  );
}

export function Legenda() {
  const voce = (colore: React.CSSProperties, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-full border" style={colore} /> {label}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
      {voce({ background: FAM.design, borderColor: FAM.design }, "fase design")}
      {voce({ background: FAM.permitting, borderColor: FAM.permitting }, "fase permitting")}
      {voce({ background: FAM.construction, borderColor: FAM.construction }, "fase construction")}
      {voce({ background: VIOLA, borderColor: VIOLA }, "milestone fatta")}
      {voce({ background: "transparent", borderColor: TEAL, borderWidth: 2 }, "del PM")}
      {voce({ background: "#B7ACF4", borderColor: VIOLA, borderStyle: "dashed" }, "calcolata da handover")}
      {voce({ background: "transparent", borderColor: GRIGIO }, "ereditata")}
      {voce({ background: "transparent", borderColor: AMBRA, borderStyle: "dashed" }, "da confermare")}
    </div>
  );
}

function fmt(d: string) {
  return format(parseISO(d), "d LLL yy", { locale: it });
}
function fmtBreve(d: string) {
  return format(parseISO(d), "d/M", { locale: it });
}

function margine(voci: VoceTimeline[], scadenza: string): string {
  const ultime = voci
    .filter((v) => v.corsia === "cert" && v.inizio)
    .map((v) => v.inizio!)
    .sort();
  if (ultime.length === 0) return "";
  const m = g(ultime[ultime.length - 1], scadenza);
  return m >= 0 ? ` · margine +${m} gg` : ` · sforata di ${-m} gg`;
}

function mesiTra(da: string, a: string, maxTacche: number): string[] {
  const out: string[] = [];
  const inizio = parseISO(da);
  const fine = parseISO(a);
  const cur = new Date(inizio.getFullYear(), inizio.getMonth(), 1);
  while (cur <= fine && out.length < 60) {
    if (cur >= inizio) out.push(format(cur, "yyyy-MM-dd"));
    cur.setMonth(cur.getMonth() + 1);
  }
  const passo = Math.ceil(out.length / maxTacche) || 1;
  return out.filter((_, i) => i % passo === 0);
}
