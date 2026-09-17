import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { tintaServizio } from "@/lib/serviceColors";
import { distribuisci, quotaPerData } from "@/lib/distribuzioneVerticale";
import {
  etichettaDurata,
  type AttivitaDerivata,
  type PassoDerivato,
} from "@/lib/timelineDerivazione";

/**
 * Il pannello «TIMELINE LIVE» — SPECIFICA_TIMELINE §4.1.
 *
 * Due colonne separate, PROGETTO e CERTIFICAZIONE, e la regola che le governa
 * è controintuitiva e vale la pena scriverla: **non c'è una scala temporale**.
 * Le tappe stanno a distanza fissa l'una dall'altra, ordinate per data, e il
 * tempo lo raccontano le etichette («47 gg», «2 mesi»), non la geometria.
 *
 * Il tentativo precedente in questo repo usava un asse temporale reale, ed è
 * il motivo per cui era illeggibile: in un cronoprogramma vero decine di
 * attività partono lo stesso giorno, quindi finivano tutte allo stesso pixel,
 * mentre i mesi morti fra una fase e l'altra occupavano mezzo schermo di
 * vuoto. Una scala fedele al tempo è infedele all'informazione. Con la
 * spaziatura fissa il problema non si risolve: non esiste.
 *
 * Il prezzo è che le distanze verticali non sono più proporzionali, e va
 * pagato consapevolmente — per questo la durata è scritta su ogni segmento e
 * il marcatore OGGI si posiziona in proporzione *dentro* il segmento che lo
 * contiene, che è l'unico punto in cui la proporzione conta davvero.
 *
 * Il componente è puro: entrano le liste già derivate da
 * `timelineDerivazione.ts`, esce un SVG. Nessuna query, nessun calcolo di
 * business qui dentro.
 */

// ── Geometria (dal prototipo approvato, adattata ai token dell'app) ───────
const W = 560;
const R = 29;           // raggio del badge
const RING = 6;         // spessore dell'anello
const TOP = 58;
const BOT = 26;
const ROW_PROGETTO = 158;  // ha la barra inizio→fine in più, sotto il nome
const ROW_CERT = 126;
const CX_PROGETTO = W * 0.26;
const CX_CERT = W * 0.74;
const LARGH_BARRA = 118;
const ALT_BARRA = 6;

const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

const giorno = (iso: string) => Number(iso.slice(8, 10));
const mese = (iso: string) => MESI[Number(iso.slice(5, 7)) - 1];
const anno2 = (iso: string) => `’${iso.slice(2, 4)}`;

const dataBreve = (iso: string | null) =>
  iso ? `${giorno(iso)} ${MESI[Number(iso.slice(5, 7)) - 1].toLowerCase()} ${iso.slice(2, 4)}` : "—";

/** Due righe al massimo, la seconda con l'ellissi: come il prototipo. */
function aCapo(nome: string, max: number): string[] {
  if (nome.length <= max) return [nome];
  const parole = nome.split(" ");
  let r1 = "";
  let r2 = "";
  for (const p of parole) {
    if (!r2 && `${r1} ${p}`.trim().length <= max) r1 = `${r1} ${p}`.trim();
    else r2 = `${r2} ${p}`.trim();
  }
  if (r2.length > max) r2 = `${r2.slice(0, max - 1)}…`;
  return r2 ? [r1, r2] : [r1];
}

const giorniTra = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000
  );

interface Props {
  attivita: AttivitaDerivata[];
  passi: PassoDerivato[];
  /** Serve alla tinta della colonna certificazione: ogni servizio ha la sua. */
  servizio?: string | null;
  oggiISO?: string;
  /** La chiave della voce appena toccata: fa il micro-pop (§4.1). */
  evidenzia?: string | null;
  onVoceClick?: (tipo: "attivita" | "passo", id: string) => void;
}

export function TimelineLive({ attivita, passi, servizio, oggiISO, evidenzia, onVoceClick }: Props) {
  const oggi = oggiISO ?? new Date().toISOString().slice(0, 10);
  const tinta = tintaServizio(servizio);

  // Le tappe: ordinate per data, e solo quelle che una data ce l'hanno.
  const P = useMemo(
    () =>
      attivita
        .filter((a) => a.inizio)
        .sort((x, y) => (x.inizio! < y.inizio! ? -1 : x.inizio! > y.inizio! ? 1 : x.ordine - y.ordine)),
    [attivita]
  );
  const C = useMemo(
    () =>
      passi
        .filter((p) => p.dataEffettiva)
        .sort((x, y) =>
          x.dataEffettiva! < y.dataEffettiva! ? -1 : x.dataEffettiva! > y.dataEffettiva! ? 1 : x.ordine - y.ordine
        ),
    [passi]
  );

  if (P.length === 0 && C.length === 0) return <StatoVuoto />;

  // La colonna PROGETTO detta l'asse: passo fisso, niente scala temporale.
  const yP = (i: number) => TOP + R + i * ROW_PROGETTO;
  const dateP = P.map((p) => p.inizio!);
  const quoteP = P.map((_, i) => yP(i));

  // La colonna CERTIFICAZIONE si allinea NEL TEMPO a quella del progetto: ogni
  // passo si posiziona dove cade la sua data fra le tappe del cantiere. Non e'
  // un ritorno alla scala temporale — dentro ciascuna colonna la spaziatura
  // resta fissa, ed e' cio' che impedisce agli ammassamenti di riformarsi. E'
  // la relazione FRA le colonne a diventare temporale, che e' l'unica cosa che
  // serve per rispondere a «mentre succede questo, a che punto e' il cantiere?».
  const quoteC = (() => {
    if (C.length === 0) return [];
    if (dateP.length === 0) return C.map((_, i) => TOP + R + i * ROW_CERT);
    const ideali = C.map((c) => quotaPerData(c.dataEffettiva!, dateP, quoteP) ?? TOP + R);
    return distribuisci(ideali, ROW_CERT, TOP + R, TOP + R + (C.length - 1) * ROW_CERT + 400);
  })();
  const yC = (i: number) => quoteC[i] ?? TOP + R;

  const HP = P.length ? yP(P.length - 1) + 92 : 0;
  const HC = C.length ? Math.max(...quoteC) + 66 : 0;
  const H = Math.max(HP, HC, 380) + BOT;

  // Il colore della colonna progetto viene dal tema, non da un esadecimale
  // fisso: PIETRA e' tarata sul fondo avorio e in dark mode sparirebbe.
  const INCHIOSTRO = "hsl(var(--foreground))";
  const ANELLO = "hsl(var(--muted))";
  const SOTTILE = "hsl(var(--border))";
  const AMBRA = "hsl(var(--warning))";
  const CORSO = "hsl(var(--primary))";
  const FATTA = "hsl(var(--success))";

  const coloreAttivita = (a: AttivitaDerivata) =>
    a.stato === "completed" ? FATTA : a.stato === "in progress" ? CORSO : INCHIOSTRO;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto block h-auto max-w-full"
      role="img"
      aria-label={`Live timeline: ${P.length} project activities and ${C.length} service steps`}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .tl-pop { animation: tl-pop 420ms cubic-bezier(.2,.9,.3,1.2); transform-box: fill-box; transform-origin: center; }
          @keyframes tl-pop { from { opacity: 0; transform: scale(.72) } to { opacity: 1; transform: scale(1) } }
        }
      `}</style>

      {/* La hairline centrale: le due colonne sono sempre distinte (§11). */}
      <line x1={W / 2} x2={W / 2} y1={26} y2={H - 12} stroke={SOTTILE} strokeWidth={1} />

      <Testata cx={CX_PROGETTO} testo="PROJECT" colore={INCHIOSTRO} />
      <Testata cx={CX_CERT} testo="CERTIFICATION" colore={tinta.strong} />

      {/* ── Ancore: dal badge dell'attività a quello del passo ──────────────
          Sotto i badge e a bassa opacità: dicono «questa data viene da lì»
          senza contendere la lettura al contenuto. */}
      {C.map((c, ci) => {
        if (!c.ancora) return null;
        const pi = P.findIndex((p) => p.id === c.ancora!.attivitaId);
        if (pi < 0) return null;
        const y1 = yP(pi);
        const y2 = yC(ci);
        return (
          <path
            key={`anc-${c.id}`}
            d={`M ${CX_PROGETTO + R + 4} ${y1} C ${CX_PROGETTO + 110} ${y1}, ${CX_CERT - 110} ${y2}, ${CX_CERT - R - 4} ${y2}`}
            fill="none"
            stroke={tinta.strong}
            strokeWidth={1.2}
            strokeDasharray="3 5"
            opacity={0.45}
          />
        );
      })}

      {/* ── Dipendenze: archetti sul lato esterno della colonna progetto ── */}
      {P.map((p, i) =>
        (p.dipendeDa ?? []).map((madreId) => {
          const di = P.findIndex((o) => o.id === madreId);
          if (di < 0) return null;
          const y1 = yP(di);
          const y2 = yP(i);
          return (
            <path
              key={`dip-${p.id}-${madreId}`}
              d={`M ${CX_PROGETTO - R - 4} ${y1} C ${CX_PROGETTO - R - 40} ${y1}, ${CX_PROGETTO - R - 40} ${y2}, ${CX_PROGETTO - R - 4} ${y2}`}
              fill="none"
              stroke={AMBRA}
              strokeWidth={1.2}
              strokeDasharray="3 5"
              opacity={0.55}
            />
          );
        })
      )}

      {/* ── Le spine ───────────────────────────────────────────────────── */}
      {/* Il tratto fra due anelli porta l'avanzamento dell'attivita' da cui
          parte: e' la stessa informazione della barra che stava sotto il nome,
          messa dove ha un significato geometrico invece che decorativo. */}
      <Spina
        date={dateP}
        cx={CX_PROGETTO}
        y={yP}
        oggi={oggi}
        colore={ANELLO}
        ambra={AMBRA}
        riempimenti={P.map((a) => ({ pct: a.avanzamento ?? 0, colore: coloreAttivita(a) }))}
      />
      <Spina
        date={C.map((c) => c.dataEffettiva!)}
        cx={CX_CERT}
        y={yC}
        oggi={oggi}
        colore={ANELLO}
        ambra={AMBRA}
        durate
        riempimenti={C.map((c) => ({ pct: c.avanzamento, colore: tinta.strong }))}
      />

      {P.length === 0 && <InAttesa cx={CX_PROGETTO} />}
      {C.length === 0 && <InAttesa cx={CX_CERT} />}

      {/* ── Colonna PROGETTO: badge + nome + barra inizio→fine ─────────── */}
      {P.map((a, i) => {
        const y = yP(i);
        const colore = coloreAttivita(a);
        const pct = a.avanzamento ?? 0;
        const righe = aCapo(a.nome, 24);
        const yNome = y + R + 15;
        const yTesto = yNome + righe.length * 13.5 + 9;

        return (
          <g
            key={a.id}
            className={cn(evidenzia === a.id && "tl-pop", onVoceClick && "cursor-pointer")}
            onClick={() => onVoceClick?.("attivita", a.id)}
          >
            <title>{`${a.nome} · ${dataBreve(a.inizio)}${a.fine ? ` → ${dataBreve(a.fine)}` : ""}`}</title>

            <Badge cx={CX_PROGETTO} cy={y} colore={colore} pct={pct} iso={a.inizio!} anello={ANELLO} />

            {righe.map((r, k) => (
              <text
                key={k}
                x={CX_PROGETTO}
                y={yNome + k * 13.5}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="hsl(var(--foreground))"
              >
                {r}
              </text>
            ))}

            <text x={CX_PROGETTO} y={yTesto} textAnchor="middle" fontSize={11}>
              <tspan fontWeight={600} fill={a.avanzamento === null ? AMBRA : colore}>
                {a.avanzamento === null ? "end date missing" : `${pct}%`}
              </tspan>
              {a.fine && (
                <tspan fill="hsl(var(--muted-foreground))">{`  ·  until ${dataBreve(a.fine)}`}</tspan>
              )}
            </text>
          </g>
        );
      })}

      {/* ── Colonna CERTIFICAZIONE: badge + nome + % manuale ───────────── */}
      {C.map((c, i) => {
        const y = yC(i);
        const righe = aCapo(c.nome, 24);
        const yNome = y + R + 15;

        return (
          <g
            key={c.id}
            className={cn(evidenzia === c.id && "tl-pop", onVoceClick && "cursor-pointer")}
            onClick={() => onVoceClick?.("passo", c.id)}
          >
            <title>{`${c.nome} · ${dataBreve(c.dataEffettiva)} · ${c.natura}`}</title>
            <Badge
              cx={CX_CERT}
              cy={y}
              colore={tinta.strong}
              pct={c.avanzamento}
              iso={c.dataEffettiva!}
              anello={ANELLO}
            />

            {righe.map((r, k) => (
              <text
                key={k}
                x={CX_CERT}
                y={yNome + k * 13.5}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="hsl(var(--foreground))"
              >
                {r}
              </text>
            ))}

            <text x={CX_CERT} y={yNome + righe.length * 13.5 + 2} textAnchor="middle" fontSize={11}>
              <tspan
                fontWeight={600}
                fill={c.avanzamento > 0 ? tinta.strong : "hsl(var(--muted-foreground))"}
              >
                {`${c.avanzamento}%`}
              </tspan>
              <tspan fill="hsl(var(--muted-foreground))">{`  ·  ${c.natura}`}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Pezzi ─────────────────────────────────────────────────────────────────

function Testata({ cx, testo, colore }: { cx: number; testo: string; colore: string }) {
  return (
    <>
      <text
        x={cx}
        y={21}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={700}
        letterSpacing="0.12em"
        fill={colore}
      >
        {testo}
      </text>
      <line x1={cx - 50} x2={cx + 50} y1={30} y2={30} stroke={colore} strokeWidth={3} strokeLinecap="round" opacity={0.25} />
    </>
  );
}

/**
 * La spina fra due tappe, con la durata e — se ci cade dentro — il marcatore
 * OGGI posizionato in proporzione.
 *
 * È l'unico punto in cui la proporzione temporale conta: dentro il segmento.
 * Fra un segmento e l'altro no, e il numero scritto accanto è lì proprio per
 * dire quanto vale davvero quel tratto.
 */
function Spina({
  date,
  cx,
  y,
  oggi,
  colore,
  ambra,
  durate,
  riempimenti,
}: {
  date: string[];
  cx: number;
  y: (i: number) => number;
  oggi: string;
  colore: string;
  ambra: string;
  durate?: boolean;
  /** Per ogni tappa: quanto del tratto che la segue e' gia' fatto. */
  riempimenti?: Array<{ pct: number; colore: string }>;
}) {
  if (date.length < 2) return null;

  return (
    <>
      {date.slice(0, -1).map((d, i) => {
        const y1 = y(i) + R + 3;
        const y2 = y(i + 1) - R - 3;
        const succ = date[i + 1];
        const gg = giorniTra(d, succ);
        const contieneOggi = oggi > d && oggi <= succ;
        const frazione = contieneOggi && gg > 0 ? giorniTra(d, oggi) / gg : 0;
        const yOggi = y1 + (y2 - y1) * frazione;

        const pieno = riempimenti?.[i];
        const quota = Math.max(0, Math.min(100, pieno?.pct ?? 0));

        return (
          <g key={`${cx}-${i}`}>
            <line x1={cx} x2={cx} y1={y1} y2={y2} stroke={colore} strokeWidth={7} strokeLinecap="round" />
            {quota > 0 && (
              <line
                x1={cx}
                x2={cx}
                y1={y1}
                y2={y1 + (y2 - y1) * (quota / 100)}
                stroke={pieno!.colore}
                strokeWidth={7}
                strokeLinecap="round"
              />
            )}
            {durate && gg > 0 && (
              <text x={cx + 12} y={(y1 + y2) / 2 + 3.5} fontSize={10} fill="hsl(var(--muted-foreground))">
                {etichettaDurata(gg)}
              </text>
            )}
            {contieneOggi && (
              <>
                <line x1={cx - 13} x2={cx + 13} y1={yOggi} y2={yOggi} stroke={ambra} strokeWidth={2} strokeLinecap="round" />
                <text x={cx - 18} y={yOggi + 3.5} textAnchor="end" fontSize={9} fontWeight={700} letterSpacing="0.08em" fill={ambra}>
                  TODAY
                </text>
              </>
            )}
          </g>
        );
      })}
    </>
  );
}

/** Anello grigio + arco della percentuale + disco con la data. */
function Badge({
  cx,
  cy,
  colore,
  pct,
  iso,
  anello,
}: {
  cx: number;
  cy: number;
  colore: string;
  pct: number;
  iso: string;
  anello: string;
}) {
  const circonferenza = 2 * Math.PI * R;
  const quota = Math.max(0, Math.min(100, pct));

  return (
    <>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={anello} strokeWidth={RING} />
      {quota > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={colore}
          strokeWidth={RING}
          strokeDasharray={`${(circonferenza * quota) / 100} ${circonferenza}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <circle cx={cx} cy={cy} r={R - RING + 1} fill="hsl(var(--card))" stroke={colore} strokeWidth={1} strokeOpacity={0.22} />
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize={11} fontWeight={700} fill="hsl(var(--foreground))">
        {`${giorno(iso)} ${mese(iso)}`}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
        {anno2(iso)}
      </text>
    </>
  );
}

function InAttesa({ cx }: { cx: number }) {
  return (
    <text x={cx} y={TOP + 44} textAnchor="middle" fontSize={12} fontStyle="italic" fill="hsl(var(--muted-foreground))">
      waiting for dates…
    </text>
  );
}

function StatoVuoto() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-8 text-center">
      <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden="true" className="text-muted-foreground/40">
        <circle cx={22} cy={20} r={9} fill="none" stroke="currentColor" strokeWidth={3} />
        <circle cx={50} cy={52} r={9} fill="none" stroke="currentColor" strokeWidth={3} />
        <line x1={22} y1={31} x2={22} y2={58} stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 7" />
        <line x1={50} y1={14} x2={50} y2={41} stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 7" />
      </svg>
      <p className="text-sm font-medium">Timelines start here</p>
      <p className="max-w-[32ch] text-xs text-muted-foreground">
        Inserisci una data — o importa il cronoprogramma — e le due colonne cominciano a
        comporsi.
      </p>
    </div>
  );
}

/**
 * La riga meta sotto la testata: intervallo, durata, quante attività sono in
 * corso adesso. È l'unica sintesi numerica del pannello.
 */
export function MetaTimeline({
  attivita,
  passi,
}: {
  attivita: AttivitaDerivata[];
  passi: PassoDerivato[];
}) {
  const date = [
    ...attivita.flatMap((a) => [a.inizio, a.fine]),
    ...passi.map((p) => p.dataEffettiva),
  ].filter((d): d is string => !!d);

  if (date.length === 0) return null;
  date.sort();

  const min = date[0];
  const max = date[date.length - 1];
  const mesi = Math.max(1, Math.round(giorniTra(min, max) / 30.4));
  const inCorso = attivita.filter((a) => a.stato === "in progress").length;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">
        {dataBreve(min)} → {dataBreve(max)}
      </span>
      <span>·</span>
      <span>~{mesi} months</span>
      {inCorso > 0 && (
        <>
          <span>·</span>
          <span>
            {inCorso} in progress
          </span>
        </>
      )}
    </p>
  );
}
