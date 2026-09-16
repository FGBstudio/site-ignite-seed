import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check } from "lucide-react";

/**
 * L'anello di avanzamento.
 *
 * Il cerchio che si riempie e' la parte che si vede, ma non e' la parte che
 * serve. Una percentuale da sola non dice niente di utile: «40%» e' una buona
 * notizia a meta' fase e un disastro alla vigilia della consegna, e il numero
 * e' identico nei due casi.
 *
 * Per questo l'anello porta **due** informazioni sovrapposte:
 *
 *  · l'arco pieno  = quanto il PM dichiara di aver fatto;
 *  · la tacca sul bordo = dove il calendario dice che dovrebbe essere oggi,
 *    cioe' dove cade l'oggi fra inizio e fine.
 *
 * Se la tacca e' avanti all'arco, quella riga e' in ritardo, e lo si legge
 * senza aprire niente e senza fare conti. E' l'unico motivo per cui vale la
 * pena disegnare un cerchio invece di scrivere «40%».
 *
 * Terza cosa, meno appariscente e altrettanto importante: un anello fermo da
 * due settimane si smorza. Una percentuale vecchia non e' un dato preciso, e'
 * un dato scaduto, e deve sembrarlo.
 */

const R = 13;
const CIRC = 2 * Math.PI * R;

export interface Props {
  pct: number;
  onChange?: (pct: number) => void | Promise<void>;
  /** Milestone = istante: solo 0 o 100, niente cursore, niente 43%. */
  istante?: boolean;
  inizio?: string | null;
  fine?: string | null;
  /** Quando la percentuale e' stata toccata l'ultima volta. */
  aggiornatoIl?: string | null;
  tinta?: string;
  etichetta: string;
  disabled?: boolean;
  /** Solo il disco, senza comandi: per il pannello e le viste di riepilogo. */
  soloLettura?: boolean;
  dimensione?: number;
  className?: string;
}

/** Dove dovrebbe essere oggi, fra inizio e fine. NULL se non si puo' dire. */
export function attesoOggi(inizio?: string | null, fine?: string | null, oggi = new Date()): number | null {
  if (!inizio) return null;
  const a = parseISO(inizio);
  const b = fine ? parseISO(fine) : a;
  const totale = differenceInCalendarDays(b, a);
  const passati = differenceInCalendarDays(oggi, a);
  if (passati < 0) return 0;
  if (totale <= 0) return passati >= 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((passati / totale) * 100)));
}

const GIORNI_STANTIO = 14;

/**
 * Il rollup, pesato sulla durata — la stessa regola di `fn_crono_avanzamento`
 * lato database, qui perche' la pagina ha gia' le righe in mano e chiedere
 * due volte lo stesso numero e' il modo di ritrovarsi con due numeri.
 *
 * La media aritmetica sarebbe sbagliata in modo vistoso: una fase di sei mesi
 * al 10% e una milestone di un giorno al 100% non fanno «55% del progetto».
 */
export function rollup(
  righe: Array<{ avanzamento?: number | null; inizio?: string | null; fine?: string | null }>
): { pct: number; ferme: number } {
  let peso = 0;
  let somma = 0;
  for (const r of righe) {
    const p =
      r.inizio && r.fine ? Math.max(1, differenceInCalendarDays(parseISO(r.fine), parseISO(r.inizio))) : 1;
    peso += p;
    somma += (r.avanzamento ?? 0) * p;
  }
  return { pct: peso ? Math.round(somma / peso) : 0, ferme: 0 };
}

export function AnelloAvanzamento({
  pct,
  onChange,
  istante,
  inizio,
  fine,
  aggiornatoIl,
  tinta = "hsl(var(--primary))",
  etichetta,
  disabled,
  soloLettura,
  dimensione = 32,
  className,
}: Props) {
  const [aperto, setAperto] = useState(false);
  const valore = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const atteso = attesoOggi(inizio, fine);

  const stantio =
    valore > 0 &&
    valore < 100 &&
    !!aggiornatoIl &&
    differenceInCalendarDays(new Date(), parseISO(aggiornatoIl)) >= GIORNI_STANTIO;

  const ritardo = atteso !== null && valore < 100 && atteso - valore >= 15;

  const disco = (
    <Disco
      valore={valore}
      atteso={atteso}
      tinta={ritardo ? "#C2453A" : tinta}
      stantio={stantio}
      dimensione={dimensione}
    />
  );

  const descrizione = [
    `${etichetta}: ${valore}%`,
    atteso !== null ? `atteso ${atteso}%` : null,
    stantio ? "non aggiornato da due settimane" : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (soloLettura || !onChange || disabled) {
    return (
      <span className={cn("inline-flex", className)} title={descrizione} aria-label={descrizione} role="img">
        {disco}
      </span>
    );
  }

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex rounded-full transition-transform hover:scale-110", className)}
          aria-label={`Aggiorna l'avanzamento — ${descrizione}`}
          title={descrizione}
          onClick={(e) => {
            // Su una milestone non c'e' niente da regolare: il gesto e' uno
            // solo, e un pannello che chiede «quanto?» sarebbe una domanda
            // senza risposta.
            if (istante) {
              e.preventDefault();
              onChange(valore >= 100 ? 0 : 100);
            }
          }}
        >
          {disco}
        </button>
      </PopoverTrigger>

      {!istante && (
        <PopoverContent align="start" className="w-72 p-3">
          <Regolatore
            valore={valore}
            atteso={atteso}
            tinta={tinta}
            etichetta={etichetta}
            aggiornatoIl={aggiornatoIl}
            stantio={stantio}
            onApplica={async (v) => {
              await onChange(v);
              setAperto(false);
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

function Disco({
  valore,
  atteso,
  tinta,
  stantio,
  dimensione,
}: {
  valore: number;
  atteso: number | null;
  tinta: string;
  stantio: boolean;
  dimensione: number;
}) {
  const s = dimensione;
  const c = 16;
  // L'arco parte dalle 12 e gira in senso orario: e' la convenzione che tutti
  // leggono senza pensarci.
  const offset = CIRC * (1 - valore / 100);
  const angolo = atteso === null ? null : (atteso / 100) * 2 * Math.PI - Math.PI / 2;

  return (
    <svg width={s} height={s} viewBox="0 0 32 32" className={cn("block", stantio && "opacity-55")}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="currentColor" strokeWidth={3} className="text-muted" />
      {valore > 0 && (
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="none"
          stroke={tinta}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dashoffset 260ms ease" }}
        />
      )}

      {/* La tacca dell'atteso: dove il calendario dice che si dovrebbe essere. */}
      {angolo !== null && valore < 100 && (
        <line
          x1={c + Math.cos(angolo) * (R - 4)}
          y1={c + Math.sin(angolo) * (R - 4)}
          x2={c + Math.cos(angolo) * (R + 4)}
          y2={c + Math.sin(angolo) * (R + 4)}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="text-foreground/55"
        />
      )}

      {valore >= 100 ? (
        <Check x={c - 5} y={c - 5} width={10} height={10} stroke={tinta} strokeWidth={3} />
      ) : (
        <text
          x={c}
          y={c + 3.2}
          textAnchor="middle"
          fontSize={valore >= 10 ? 9.5 : 10}
          className="fill-muted-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {valore}
        </text>
      )}
    </svg>
  );
}

/** Il pannello: passi da 10 col cursore, e i due numeri messi a confronto. */
function Regolatore({
  valore,
  atteso,
  tinta,
  etichetta,
  aggiornatoIl,
  stantio,
  onApplica,
}: {
  valore: number;
  atteso: number | null;
  tinta: string;
  etichetta: string;
  aggiornatoIl?: string | null;
  stantio: boolean;
  onApplica: (v: number) => void | Promise<void>;
}) {
  const [v, setV] = useState(valore);
  const cursore = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cursore.current?.focus();
  }, []);

  const scarto = atteso === null ? null : v - atteso;

  return (
    <>
      <p className="mb-0.5 truncate text-sm font-medium">{etichetta}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {aggiornatoIl
          ? `ultimo aggiornamento ${format(parseISO(aggiornatoIl), "d LLL yy", { locale: it })}`
          : "mai aggiornato"}
        {stantio && " · scaduto"}
      </p>

      <div className="flex items-center gap-3">
        <AnelloAvanzamento pct={v} etichetta={etichetta} tinta={tinta} soloLettura dimensione={44} />
        <input
          ref={cursore}
          type="range"
          min={0}
          max={100}
          step={5}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          aria-label={`Percentuale di ${etichetta}`}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-current"
          style={{ accentColor: tinta }}
        />
        <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: tinta }}>
          {v}%
        </span>
      </div>

      {/* Il confronto e' la ragione del componente: il numero da solo non basta. */}
      {atteso !== null && (
        <p className={cn("mt-2.5 text-xs", scarto !== null && scarto < -10 ? "text-amber-700" : "text-muted-foreground")}>
          Il calendario dice <b>{atteso}%</b>
          {scarto === null || Math.abs(scarto) <= 5
            ? " — sei in linea."
            : scarto > 0
              ? ` — sei avanti di ${scarto} punti.`
              : ` — sei indietro di ${-scarto} punti.`}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1">
        {[0, 25, 50, 75, 100].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setV(n)}
            className={cn(
              "flex-1 rounded border py-1 text-[11px] hover:bg-muted",
              v === n && "border-transparent bg-muted font-semibold"
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => onApplica(v)}
          disabled={v === valore}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-background disabled:opacity-40"
          style={{ background: tinta }}
        >
          {v >= 100 ? "Segna completata" : "Aggiorna"}
        </button>
      </div>
    </>
  );
}
