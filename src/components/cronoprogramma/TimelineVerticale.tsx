import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Minus, Plus, X } from "lucide-react";
import type { NaturaPasso } from "@/types/cronoprogramma";
import type { Famiglia } from "@/lib/projectTimelineTemplates";
import { PIETRA, tintaServizio, type TintaServizio } from "@/lib/serviceColors";

/**
 * La timeline verticale — grammatica dal riferimento visivo approvato,
 * colori dal sistema unico per servizio (v1.2 §1), leggibilita' v1.2 §2.
 *
 * Scala temporale reale sull'asse verticale, fasi come barre e milestone come
 * nodi sulla stessa spina, corsie affiancate con i connettori di ereditarieta'
 * (tratteggio grigio) e di calcolo (tinta del servizio, +Ngg), linea dell'oggi
 * e scadenza contrattuale col margine.
 *
 * Tre formati, una componente (v1.3 §4: mai due implementazioni):
 *  - compatta: pannello sticky accanto al form, il click apre l'overlay;
 *  - pannello: la stessa scena inline, per il wizard di import;
 *  - overlay: tutta la viewport, zoom +/−/Adatta, con le corsie di TUTTE le
 *    certificazioni del sito affiancate quando gliele si passa.
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
  /** 0..100: disegna l'arco intorno al nodo e riempie la barra della fase. */
  avanzamento?: number | null;
  daConfermare?: boolean;
  isHandover?: boolean;
  /** Per i calcolati: l'etichetta +Ngg sul connettore. */
  offsetGiorni?: number | null;
  violazione?: { messaggio: string } | null;
  cliccabile?: boolean;
  /** Fonte o nota breve, sotto la data. */
  nota?: string | null;
  /** Esclusa ma non sparita: si disegna smorzata, in traccia (wizard, passo 2). */
  traccia?: boolean;
}

export interface CorsiaCert {
  id: string;
  titolo: string;
  servizio: string | null;
  voci: VoceTimeline[];
}

interface Props {
  voci: VoceTimeline[];
  oggi?: string;
  scadenzaContratto?: string | null;
  focus?: string | null;
  /** Chiavi da accendere oltre al focus: l'evidenziazione bidirezionale (v1.3 §5). */
  evidenziate?: string[];
  onVoceClick?: (key: string) => void;
  titoloProject?: string;
  titoloCert?: string;
  servizio?: string | null;
  /** Le corsie delle altre certificazioni del sito, mostrate nell'overlay. */
  altreCorsie?: CorsiaCert[];
  compatta?: boolean;
  /**
   * Il pannello prende tutta l'altezza che ha e ci distende dentro la scala
   * del tempo, invece di disegnare in alto un quadratino e lasciare vuoto il
   * resto. Serve a vedere le date comporsi mentre si compila: piu' altezza =
   * piu' risoluzione temporale, che e' l'unica cosa che l'asse verticale sa
   * fare.
   */
  riempi?: boolean;
}

// v1.2 §1: la project timeline e' neutra — scala di pietra; l'informazione
// della famiglia la porta l'etichetta (regola 5); l'ambra e' solo avviso.
const FAM: Record<Famiglia, string> = {
  design: PIETRA.design,
  permitting: "#DBD7C8",
  construction: PIETRA.construction,
  terze_parti: "#EDEBE2",
};
const TEAL = "#009193";
const GRIGIO = "#9C998E";
const AMBRA = "#D97706";
const ROSSO = "#C2453A";

const LARGH_CORSIA = 250;

function g(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function TimelineVerticale(props: Props) {
  const [espansa, setEspansa] = useState(false);
  const box = useRiquadro(props.riempi === true);

  if (props.compatta) {
    return (
      <>
        <button
          ref={box.ref}
          type="button"
          onClick={() => setEspansa(true)}
          className={cn(
            "block w-full cursor-zoom-in rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
            props.riempi && "min-h-0 flex-1 overflow-hidden"
          )}
          aria-label="Espandi la timeline a tutta la finestra"
          title="Espandi: zoom, date complete, tutte le corsie del sito"
        >
          <Disegno {...props} pxGiorno={1.0} pannello adattaA={props.riempi ? box.misura : undefined} />
        </button>
        {espansa && <Overlay {...props} onClose={() => setEspansa(false)} />}
      </>
    );
  }
  return <Disegno {...props} pxGiorno={1.1} />;
}

/** Misura il riquadro disponibile. Serve solo quando si chiede di riempirlo. */
function useRiquadro(attivo: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [misura, setMisura] = useState<{ larghezzaPx: number; altezzaPx: number } | undefined>();

  useEffect(() => {
    if (!attivo || !ref.current) return;
    const n = ref.current;
    const ro = new ResizeObserver(() => {
      setMisura((m) => {
        const nuovo = { larghezzaPx: n.clientWidth, altezzaPx: n.clientHeight };
        // Senza soglia il grafico rimbalza: cambia pxGiorno, cambia l'altezza
        // del contenuto, rimisura, cambia pxGiorno. Due pixel bastano.
        if (m && Math.abs(m.larghezzaPx - nuovo.larghezzaPx) < 2 && Math.abs(m.altezzaPx - nuovo.altezzaPx) < 2) return m;
        return nuovo;
      });
    });
    ro.observe(n);
    return () => ro.disconnect();
  }, [attivo]);

  return { ref, misura };
}

/** L'overlay: tutta la viewport, zoom +/−/Adatta, chiusura esplicita (v1.3 §4). */
function Overlay(props: Props & { onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<HTMLDivElement>(null);

  const spanGiorni = useMemo(() => {
    const date = [...props.voci, ...(props.altreCorsie ?? []).flatMap((c) => c.voci)]
      .flatMap((v) => [v.inizio, v.fine])
      .filter(Boolean) as string[];
    if (date.length < 2) return 365;
    date.sort();
    return Math.max(60, g(date[0], date[date.length - 1]));
  }, [props.voci, props.altreCorsie]);

  const adatta = () => {
    const h = (areaRef.current?.clientHeight ?? 700) - 90;
    setZoom(Math.min(3, Math.max(0.25, h / (spanGiorni * 1.4))));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Timeline espansa"
      onKeyDown={(e) => e.key === "Escape" && props.onClose()}
    >
      <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {props.titoloProject ?? "Project timeline"} × {props.titoloCert ?? "HQ FGB timeline"}
          {(props.altreCorsie?.length ?? 0) > 0 && ` + ${props.altreCorsie!.length} corsie del sito`}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Riduci">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Ingrandisci">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={adatta} className="rounded-md border px-2 py-1.5 text-xs hover:bg-muted">
            Adatta
          </button>
          <button type="button" onClick={props.onClose} className="ml-2 rounded-md border p-1.5 hover:bg-muted" aria-label="Chiudi">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={areaRef}
        className="flex-1 overflow-auto p-4"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setZoom((z) => Math.min(3, Math.max(0.25, z - Math.sign(e.deltaY) * 0.15)));
        }}
      >
        <div className="mx-auto" style={{ maxWidth: 940 + (props.altreCorsie?.length ?? 0) * LARGH_CORSIA }}>
          <Disegno {...props} pxGiorno={1.4 * zoom} multiCorsie />
          <Legenda servizio={props.servizio ?? props.titoloCert} />
        </div>
      </div>
    </div>
  );
}

function Disegno({
  servizio,
  voci,
  oggi,
  scadenzaContratto,
  focus,
  evidenziate,
  onVoceClick,
  titoloProject = "Project timeline",
  titoloCert = "HQ FGB timeline",
  altreCorsie,
  pxGiorno,
  pannello = false,
  multiCorsie = false,
  adattaA,
}: Props & {
  pxGiorno: number;
  pannello?: boolean;
  multiCorsie?: boolean;
  adattaA?: { larghezzaPx: number; altezzaPx: number };
}) {
  const oggiISO = oggi ?? format(new Date(), "yyyy-MM-dd");

  // Le corsie: la propria sempre; le altre del sito solo nell'overlay.
  const corsie: CorsiaCert[] = useMemo(() => {
    const mia: CorsiaCert = {
      id: "mia",
      titolo: titoloCert,
      servizio: servizio ?? titoloCert,
      voci: voci.filter((v) => v.corsia === "cert"),
    };
    return multiCorsie && altreCorsie?.length ? [mia, ...altreCorsie] : [mia];
  }, [voci, altreCorsie, multiCorsie, servizio, titoloCert]);

  const vociProject = voci.filter((v) => v.corsia === "project");
  const tutte = [...vociProject, ...corsie.flatMap((c) => c.voci)];
  const conData = tutte.filter((v) => v.inizio);
  const senzaData = voci.filter((v) => !v.inizio && !v.traccia);

  const dominio = useMemo(() => {
    if (conData.length === 0) return null;
    const date = conData
      .flatMap((v) => [v.inizio!, v.fine ?? v.inizio!])
      .concat(scadenzaContratto ? [scadenzaContratto] : [])
      .concat([oggiISO])
      .sort();
    const min = date[0];
    const max = date[date.length - 1];
    const span = Math.max(30, g(min, max));
    return { min, max, span, pad: Math.round(span * 0.05) };
  }, [conData, scadenzaContratto, oggiISO]);

  if (!dominio) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">La timeline compare qui man mano che inserisci le date.</p>
      </div>
    );
  }

  const xProject = 330;
  const xCorsia = (i: number) => 570 + i * LARGH_CORSIA;
  const W = xCorsia(corsie.length - 1) + 330;

  // Il disegno e' un viewBox scalato alla larghezza: sullo schermo un'unita'
  // vale (larghezzaRiquadro / W) pixel. Per far tornare l'altezza reale a
  // quella del riquadro si risolve per pxGiorno, e si tiene un tetto perche'
  // con due sole date ravvicinate il fattore esploderebbe.
  const giorni = dominio.span + dominio.pad * 2;
  const CHROME = 22; // bordo + padding del riquadro, su entrambi i lati
  const pxG = adattaA && adattaA.larghezzaPx > CHROME && adattaA.altezzaPx > CHROME
    ? Math.min(8, Math.max(0.3,
        (((adattaA.altezzaPx - CHROME) * W) / (adattaA.larghezzaPx - CHROME) - 78) / giorni))
    : pxGiorno;

  const H = Math.round(giorni * pxG);
  const y = (d: string) => Math.round((g(dominio.min, d) + dominio.pad) * pxG) + 26;
  const yOggi = y(oggiISO);
  const mesi = mesiTra(dominio.min, dominio.max, 14);
  const handover = conData.find((v) => v.isHandover && v.corsia === "project");
  const acceso = (k: string) => focus === k || (evidenziate?.includes(k) ?? false);

  return (
    <div className={cn("rounded-xl border bg-card", pannello ? "p-2.5" : "p-4")}>
      <svg
        viewBox={`0 0 ${W} ${H + 52}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Timeline: ${titoloProject} e ${corsie.map((c) => c.titolo).join(", ")}`}
      >
        {/* Titoli delle corsie. */}
        <text x={xProject} y={14} textAnchor="middle" fontSize={12} fontWeight={600} fill={PIETRA.inchiostro}>
          {titoloProject}
        </text>
        {corsie.map((c, i) => (
          <text key={c.id} x={xCorsia(i)} y={14} textAnchor="middle" fontSize={12} fontWeight={600} fill={tintaServizio(c.servizio).strong}>
            {c.titolo.length > 30 ? `${c.titolo.slice(0, 29)}…` : c.titolo}
          </text>
        ))}

        {/* La scala dei mesi. */}
        {mesi.map((m) => (
          <g key={m}>
            <line x1={78} y1={y(m)} x2={W - 8} y2={y(m)} stroke="hsl(var(--border))" strokeWidth={0.6} />
            <text x={70} y={y(m) + 3.5} textAnchor="end" fontSize={10.5} fill="hsl(var(--muted-foreground))">
              {format(parseISO(m), "LLL yy", { locale: it })}
            </text>
          </g>
        ))}

        {/* Le spine. */}
        <line x1={xProject} y1={20} x2={xProject} y2={H + 30} stroke="hsl(var(--border))" strokeWidth={1.5} />
        {corsie.map((c, i) => (
          <line key={c.id} x1={xCorsia(i)} y1={20} x2={xCorsia(i)} y2={H + 30} stroke={tintaServizio(c.servizio).mid} strokeWidth={1.5} opacity={0.55} />
        ))}

        {/* Connettori, sotto i nodi. */}
        {corsie.map((c, i) => {
          const xc = xCorsia(i);
          const tinta = tintaServizio(c.servizio);
          return (
            <g key={`conn-${c.id}`}>
              {c.voci
                .filter((v) => v.inizio && v.natura === "ereditato")
                .map((v) => (
                  <path
                    key={`e-${v.key}`}
                    d={`M ${xProject + 8} ${y(v.inizio!)} C ${xProject + 90} ${y(v.inizio!)}, ${xc - 90} ${y(v.inizio!)}, ${xc - 8} ${y(v.inizio!)}`}
                    stroke={GRIGIO}
                    strokeWidth={acceso(v.key) ? 2 : 1.1}
                    strokeDasharray="4 3"
                    fill="none"
                    opacity={acceso(v.key) ? 1 : 0.8}
                  />
                ))}
              {handover &&
                c.voci
                  .filter((v) => v.inizio && v.natura === "calcolato" && v.offsetGiorni != null)
                  .map((v) => (
                    <path
                      key={`k-${v.key}`}
                      d={`M ${xProject + 9} ${y(handover.inizio!) + 3} C ${xProject + 120} ${(y(handover.inizio!) + y(v.inizio!)) / 2}, ${xc - 120} ${y(v.inizio!)}, ${xc - 8} ${y(v.inizio!)}`}
                      stroke={tinta.strong}
                      strokeWidth={acceso(v.key) ? 2.2 : 1.2}
                      fill="none"
                      opacity={acceso(v.key) ? 1 : 0.6}
                    />
                  ))}
            </g>
          );
        })}

        {/* Corsia project: fasi come barre, ancore come nodi. */}
        {vociProject
          .filter((v) => v.inizio)
          .map((v) => {
            const y1 = y(v.inizio!);
            const attivo = acceso(v.key);
            if (v.tipo === "fase" && v.fine) {
              const y2 = Math.max(y1 + 8, y(v.fine));
              return (
                <g key={v.key} opacity={v.traccia ? 0.35 : 1} className="motion-safe:transition-opacity motion-safe:duration-200">
                  <rect
                    x={xProject - 8}
                    y={y1}
                    width={16}
                    height={y2 - y1}
                    rx={8}
                    fill={v.famiglia ? FAM[v.famiglia] : FAM.construction}
                    stroke={attivo ? TEAL : "none"}
                    strokeWidth={attivo ? 2 : 0}
                    strokeDasharray={v.traccia ? "4 3" : undefined}
                  />
                  {/* La barra si riempie dall'alto per la quota dichiarata:
                      su una fase la percentuale ha un posto naturale dove
                      stare, ed e' lungo la durata stessa. */}
                  {!!v.avanzamento && v.avanzamento > 0 && (
                    <rect
                      x={xProject - 8}
                      y={y1}
                      width={16}
                      height={Math.max(2, ((y2 - y1) * Math.min(100, v.avanzamento)) / 100)}
                      rx={8}
                      fill={PIETRA.inchiostro}
                      opacity={0.55}
                    />
                  )}
                  <Etichetta
                    x={xProject - 22}
                    y={(y1 + y2) / 2}
                    lato="sx"
                    testo={v.label}
                    data={`${fmt(v.inizio!)} → ${fmt(v.fine)}${v.avanzamento ? ` · ${v.avanzamento}%` : ""}`}
                    attivo={attivo}
                    traccia={v.traccia}
                  />
                </g>
              );
            }
            return (
              <g key={v.key} opacity={v.traccia ? 0.35 : 1} className={cn(onVoceClick && v.cliccabile && "cursor-pointer")} onClick={() => v.cliccabile && onVoceClick?.(v.key)}>
                {v.isHandover ? (
                  <>
                    <circle cx={xProject} cy={y1} r={9} fill={PIETRA.inchiostro} />
                    <circle cx={xProject} cy={y1} r={13.5} fill="none" stroke={PIETRA.inchiostro} strokeWidth={1.2} opacity={0.4} />
                  </>
                ) : (
                  <circle
                    cx={xProject}
                    cy={y1}
                    r={7}
                    fill={v.fatta ? PIETRA.inchiostro : "hsl(var(--card))"}
                    stroke={v.daConfermare ? AMBRA : PIETRA.inchiostro}
                    strokeWidth={2}
                    strokeDasharray={v.daConfermare || v.traccia ? "3 2" : undefined}
                  />
                )}
                {!v.isHandover && (
                  <ArcoAvanzamento x={xProject} y={y1} r={11} pct={v.avanzamento ?? 0} colore={PIETRA.inchiostro} />
                )}
                {attivo && <circle cx={xProject} cy={y1} r={12} fill="none" stroke={TEAL} strokeWidth={1.5} opacity={0.6} />}
                <Etichetta
                  x={xProject - 22}
                  y={y1}
                  lato="sx"
                  testo={v.label}
                  data={`${fmt(v.inizio!)}${v.nota ? ` · ${v.nota}` : ""}`}
                  attivo={attivo}
                  forte={v.isHandover}
                  ambra={v.daConfermare}
                  traccia={v.traccia}
                />
              </g>
            );
          })}

        {/* Le corsie delle certificazioni: la semantica dei nodi dalla legenda. */}
        {corsie.map((c, i) => {
          const xc = xCorsia(i);
          const tinta = tintaServizio(c.servizio);
          const maxLabel = corsie.length > 1 && i < corsie.length - 1 ? 20 : 30;
          return (
            <g key={c.id}>
              {c.voci
                .filter((v) => v.inizio)
                .map((v) => {
                  const y1 = y(v.inizio!);
                  const attivo = acceso(v.key);
                  const viol = !!v.violazione;
                  return (
                    <g key={v.key} opacity={v.traccia ? 0.3 : 1} className={cn(onVoceClick && v.cliccabile && "cursor-pointer")} onClick={() => v.cliccabile && onVoceClick?.(v.key)}>
                      <NodoCert v={v} x={xc} y={y1} tinta={tinta} viol={viol} />
                      {attivo && <circle cx={xc} cy={y1} r={11} fill="none" stroke={TEAL} strokeWidth={1.5} opacity={0.6} />}
                      <Etichetta
                        x={xc + 18}
                        y={y1}
                        lato="dx"
                        testo={v.label}
                        maxChars={maxLabel}
                        data={`${fmt(v.inizio!)}${v.offsetGiorni != null ? ` · +${v.offsetGiorni}gg da handover` : v.nota ? ` · ${v.nota}` : ""}`}
                        attivo={attivo}
                        forte={v.isHandover || v.natura === "pm"}
                        colore={v.natura === "calcolato" || v.isHandover ? tinta.strong : undefined}
                        ambra={viol}
                        traccia={v.traccia}
                      />
                    </g>
                  );
                })}
            </g>
          );
        })}

        {/* La linea dell'oggi. */}
        <line x1={78} y1={yOggi} x2={W - 8} y2={yOggi} stroke={ROSSO} strokeWidth={1} strokeDasharray="5 4" />
        <rect x={W - 118} y={yOggi - 9} width={110} height={18} rx={9} fill={ROSSO} fillOpacity={0.1} />
        <text x={W - 63} y={yOggi + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={500} fill={ROSSO}>
          oggi · {fmtBreve(oggiISO)}
        </text>

        {/* La scadenza contrattuale, con il margine. */}
        {scadenzaContratto && (
          <>
            <line x1={78} y1={y(scadenzaContratto)} x2={W - 8} y2={y(scadenzaContratto)} stroke={ROSSO} strokeWidth={1.2} strokeDasharray="2 3" />
            <text x={W - 8} y={y(scadenzaContratto) + 14} textAnchor="end" fontSize={10.5} fontWeight={500} fill={ROSSO}>
              scadenza contratto · {fmt(scadenzaContratto)}
              {margine(tutte, scadenzaContratto)}
            </text>
          </>
        )}
      </svg>

      {senzaData.length > 0 && !pannello && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
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

/**
 * L'arco di avanzamento intorno a un nodo.
 *
 * E' lo stesso gesto dell'anello nella tabella, in miniatura: qui non si
 * clicca e non si legge il numero, si vede solo quanta circonferenza e' piena.
 * Non compare a 0 (sarebbe un cerchio in piu' che non dice niente) ne' a 100
 * (li' e' il nodo stesso a essere pieno).
 */
function ArcoAvanzamento({ x, y, r, pct, colore }: { x: number; y: number; r: number; pct: number; colore: string }) {
  if (!pct || pct <= 0 || pct >= 100) return null;
  const circ = 2 * Math.PI * r;
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill="none"
      stroke={colore}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeDasharray={circ}
      strokeDashoffset={circ * (1 - pct / 100)}
      transform={`rotate(-90 ${x} ${y})`}
      opacity={0.9}
    />
  );
}

function NodoCert({ v, x, y, tinta, viol }: { v: VoceTimeline; x: number; y: number; tinta: TintaServizio; viol: boolean }) {
  const arco = <ArcoAvanzamento x={x} y={y} r={11} pct={v.avanzamento ?? 0} colore={viol ? AMBRA : tinta.strong} />;
  if (v.fatta) {
    return (
      <>
        <circle cx={x} cy={y} r={7} fill={viol ? AMBRA : tinta.strong} />
        <path d={`M ${x - 3.2} ${y} l 2.2 2.4 l 4 -4.6`} stroke="#FFF" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (v.natura === "ereditato")
    return (
      <>
        <circle cx={x} cy={y} r={5.5} fill="hsl(var(--muted))" stroke={GRIGIO} strokeWidth={1.6} />
        {arco}
      </>
    );
  if (v.natura === "calcolato" || v.natura === "serie")
    return (
      <>
        <circle cx={x} cy={y} r={6.5} fill={tinta.bg} stroke={viol ? AMBRA : tinta.strong} strokeWidth={1.6} strokeDasharray="3 2" />
        {arco}
      </>
    );
  if (v.isHandover)
    return (
      <>
        <circle cx={x} cy={y} r={9} fill={tinta.strong} />
        <circle cx={x} cy={y} r={13.5} fill="none" stroke={tinta.strong} strokeWidth={1.2} opacity={0.4} />
      </>
    );
  // Del PM: bianco con anello teal — questo lo scrivi tu.
  return (
    <>
      <circle cx={x} cy={y} r={7} fill="hsl(var(--card))" stroke={viol ? AMBRA : TEAL} strokeWidth={2} />
      {arco}
    </>
  );
}

function Etichetta({
  x,
  y,
  lato,
  testo,
  data,
  attivo,
  forte,
  colore,
  ambra,
  traccia,
  maxChars = 30,
}: {
  x: number;
  y: number;
  lato: "sx" | "dx";
  testo: string;
  data: string | null;
  attivo?: boolean;
  forte?: boolean;
  colore?: string;
  ambra?: boolean;
  traccia?: boolean;
  maxChars?: number;
}) {
  const anchor = lato === "sx" ? "end" : "start";
  const t = testo.length > maxChars ? `${testo.slice(0, maxChars - 1)}…` : testo;
  return (
    <>
      {/* v1.2 §2: mai sotto le soglie; l'ellissi solo col testo completo nel tooltip. */}
      <title>{`${testo}${data ? ` · ${data}` : ""}`}</title>
      <text
        x={x}
        y={data ? y - 1.5 : y + 3.5}
        textAnchor={anchor}
        fontSize={12}
        fontWeight={forte || attivo ? 600 : 500}
        fill={attivo ? TEAL : "hsl(var(--foreground))"}
        textDecoration={traccia ? "line-through" : undefined}
        opacity={traccia ? 0.7 : 1}
      >
        {t}
      </text>
      {data && (
        <text x={x} y={y + 11} textAnchor={anchor} fontSize={10.5} fill={ambra ? AMBRA : colore ?? "hsl(var(--muted-foreground))"}>
          {data}
        </text>
      )}
    </>
  );
}

export function Legenda({ servizio }: { servizio?: string | null }) {
  const tinta = tintaServizio(servizio);
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
      {voce({ background: tinta.strong, borderColor: tinta.strong }, "milestone fatta")}
      {voce({ background: "transparent", borderColor: TEAL, borderWidth: 2 }, "del PM")}
      {voce({ background: tinta.bg, borderColor: tinta.strong, borderStyle: "dashed" }, "calcolata da handover")}
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
    .filter((v) => v.corsia === "cert" && v.inizio && !v.traccia)
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
