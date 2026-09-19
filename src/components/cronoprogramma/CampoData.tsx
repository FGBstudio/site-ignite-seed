import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  format,
  isValid,
  parseISO,
  startOfMonth,
} from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";

/**
 * Il campo data del cronoprogramma.
 *
 * Sostituisce `<input type="date">`, che qui era la cosa sbagliata per tre
 * motivi concreti, tutti visibili compilando una timeline vera:
 *
 *  1. una riga vuota diceva «gg/mm/aaaa» — rumore identico ripetuto venti
 *     volte in colonna, in cui l'occhio non distingue piu' cosa manca;
 *  2. si scrive a segmenti: tre campi invisibili separati da slash, dove il
 *     cursore salta da solo e «15/3/27» non si puo' incollare;
 *  3. il calendario nativo e' quello del sistema operativo — altro font,
 *     altra lingua, altra settimana, e nessun modo di dire «+30 giorni
 *     dall'handover», che e' come un PM ragiona davvero.
 *
 * Qui invece: **una riga di testo che accetta come si scrive** (15/3/27,
 * 15-03-2027, 15 mar 27, 20270315, «oggi», «+30» per trenta giorni dopo la
 * data di riferimento), un calendario nostro che si apre dove serve, e le
 * scorciatoie relative all'ancora quando il chiamante ne passa una.
 *
 * Il valore esce sempre come `yyyy-MM-dd` o `null`, come prima: chi lo usa non
 * cambia contratto.
 */

const ISO = "yyyy-MM-dd";
const MESI = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

/** Il numero dell'anno a due cifre: 27 e' il 2027, non il 1927. */
function anno(n: number): number {
  if (n >= 1000) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

/**
 * Legge quello che una persona scrive davvero.
 *
 * Non normalizza mentre si digita — chi scrive «1» sta per scrivere «15», e
 * un campo che reagisce a meta' parola e' esattamente il difetto del controllo
 * nativo. Si interpreta quando il testo e' finito.
 */
export function leggiData(testo: string, riferimento?: string | null): string | null {
  const t = testo.trim().toLowerCase();
  if (!t) return null;

  if (t === "oggi") return format(new Date(), ISO);
  if (t === "domani") return format(addDays(new Date(), 1), ISO);
  if (t === "ieri") return format(addDays(new Date(), -1), ISO);

  // «+30» / «-15»: relativo al riferimento se c'e', altrimenti a oggi.
  const rel = t.match(/^([+-])\s*(\d{1,4})\s*(g|gg|giorni)?$/);
  if (rel) {
    const base = riferimento ? parseISO(riferimento) : new Date();
    if (!isValid(base)) return null;
    return format(addDays(base, Number(rel[2]) * (rel[1] === "-" ? -1 : 1)), ISO);
  }

  // yyyy-mm-dd, yyyy/mm/dd
  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return giorno(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // 20270315
  const compatto = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compatto) return giorno(Number(compatto[1]), Number(compatto[2]), Number(compatto[3]));

  // 15/3/27, 15-03-2027, 15.3.27
  const eu = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (eu) return giorno(anno(Number(eu[3])), Number(eu[2]), Number(eu[1]));

  // 15 mar 27, 15 marzo 2027, 15mar27
  const testuale = t.match(/^(\d{1,2})\s*([a-zàè]{3,10})\.?\s*(\d{2,4})?$/);
  if (testuale) {
    const m = MESI.findIndex((x) => testuale[2].startsWith(x));
    if (m >= 0) {
      const a = testuale[3] ? anno(Number(testuale[3])) : new Date().getFullYear();
      return giorno(a, m + 1, Number(testuale[1]));
    }
  }

  // 15/3 — l'anno lo prende dal riferimento, o da oggi.
  const senzaAnno = t.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (senzaAnno) {
    const base = riferimento ? parseISO(riferimento) : new Date();
    const a = isValid(base) ? base.getFullYear() : new Date().getFullYear();
    return giorno(a, Number(senzaAnno[2]), Number(senzaAnno[1]));
  }

  return null;
}

/** Costruisce la data solo se esiste davvero: il 31 di febbraio non passa. */
function giorno(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(a, m - 1, d, 12);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return format(dt, ISO);
}

const mostra = (iso: string | null) =>
  iso && isValid(parseISO(iso)) ? format(parseISO(iso), "d LLL yy", { locale: it }) : "";

interface Props {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  /** Etichetta per chi non vede la colonna: «Inizio di Construction start». */
  aria: string;
  /** Il testo mostrato quando e' vuoto. Niente «gg/mm/aaaa». */
  placeholder?: string;
  /** Base per «+30» e per il mese su cui apre il calendario. */
  riferimento?: string | null;
  /** Nome della base, per la scorciatoia: «+30 da Handover». */
  riferimentoNome?: string | null;
  /** Tinta del servizio, per il giorno selezionato. */
  tinta?: string;
  /** Segnala la riga come «da compilare» senza urlare. */
  attesa?: boolean;
  /** Il pannello accende la voce corrispondente mentre si compila. */
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}

export const CampoData = forwardRef<HTMLInputElement, Props>(function CampoData(
  {
    value,
    onChange,
    disabled,
    aria,
    placeholder = "—",
    riferimento,
    riferimentoNome,
    tinta = "hsl(var(--primary))",
    attesa,
    onFocus,
    onBlur,
    className,
  },
  ref
) {
  const valore = value || null;
  const [testo, setTesto] = useState(mostra(valore));
  const [aperto, setAperto] = useState(false);
  const [fuoco, setFuoco] = useState(false);
  const interno = useRef<HTMLInputElement>(null);

  // Il campo segue il valore quando cambia da fuori (ricalcolo, cascata,
  // import), ma non mentre lo si sta scrivendo: sovrascrivere sotto le dita e'
  // il difetto peggiore di un campo data.
  useEffect(() => {
    if (!fuoco) setTesto(mostra(valore));
  }, [valore, fuoco]);

  const parsata = useMemo(() => leggiData(testo, riferimento), [testo, riferimento]);
  const illeggibile = testo.trim().length > 0 && parsata === null;

  const conferma = () => {
    if (!testo.trim()) {
      if (valore) onChange(null);
      return;
    }
    if (parsata && parsata !== valore) onChange(parsata);
    setTesto(mostra(parsata ?? valore));
  };

  const meseIniziale = valore
    ? parseISO(valore)
    : riferimento && isValid(parseISO(riferimento))
      ? parseISO(riferimento)
      : new Date();

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <div
        className={cn(
          "group relative flex h-8 items-center rounded-md border bg-background transition-colors",
          fuoco && "ring-2 ring-primary/40",
          illeggibile && "border-amber-400",
          attesa && !valore && !fuoco && "border-dashed",
          disabled && "opacity-60",
          className
        )}
      >
        <input
          ref={(n) => {
            interno.current = n;
            if (typeof ref === "function") ref(n);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = n;
          }}
          value={testo}
          disabled={disabled}
          aria-label={aria}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          inputMode="numeric"
          onFocus={(e) => {
            setFuoco(true);
            e.currentTarget.select();
            onFocus?.();
          }}
          onBlur={() => {
            setFuoco(false);
            conferma();
            onBlur?.();
          }}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              conferma();
              interno.current?.blur();
            } else if (e.key === "Escape") {
              setTesto(mostra(valore));
              interno.current?.blur();
            } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && parsata) {
              // Un giorno alla volta con le frecce, una settimana con shift:
              // e' come si aggiusta una data che e' quasi giusta.
              e.preventDefault();
              const passo = (e.shiftKey ? 7 : 1) * (e.key === "ArrowUp" ? 1 : -1);
              const n = format(addDays(parseISO(parsata), passo), ISO);
              setTesto(mostra(n));
              onChange(n);
            }
          }}
          className={cn(
            "h-full w-full min-w-0 rounded-md bg-transparent px-2 text-xs tabular-nums outline-none",
            "placeholder:text-muted-foreground/60",
            !valore && !fuoco && "text-muted-foreground"
          )}
        />

        {valore && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setTesto("");
              onChange(null);
            }}
            aria-label={`Cancella ${aria}`}
            className="hidden shrink-0 px-1 text-muted-foreground hover:text-destructive group-hover:block"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            tabIndex={-1}
            aria-label={`Apri il calendario per ${aria}`}
            className="shrink-0 rounded-r-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={it}
          weekStartsOn={1}
          // Sempre sei righe, anche quando il mese ne riempirebbe cinque.
          // Senza, il riquadro cambia altezza passando da luglio ad agosto e le
          // scorciatoie qui sotto si spostano sotto il dito di chi sta per
          // premerle: si finisce per cliccare «+30gg» volendo cambiare mese.
          fixedWeeks
          defaultMonth={startOfMonth(meseIniziale)}
          selected={valore ? parseISO(valore) : undefined}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, ISO));
            setTesto(mostra(format(d, ISO)));
            setAperto(false);
          }}
          modifiersStyles={{ selected: { backgroundColor: tinta, color: "#fff" } }}
          className="p-2.5"
        />

        <div className="flex flex-wrap items-center gap-1 border-t p-2">
          {riferimento && (
            <>
              {[0, 15, 30, 60, 90].map((n) => (
                <Scorciatoia
                  key={n}
                  testo={n === 0 ? "il giorno" : `+${n}gg`}
                  titolo={
                    riferimentoNome
                      ? `${n === 0 ? "Stesso giorno di" : `${n} giorni dopo`} ${riferimentoNome} · ${mostra(
                          format(addDays(parseISO(riferimento), n), ISO)
                        )}`
                      : undefined
                  }
                  onClick={() => {
                    const d = format(addDays(parseISO(riferimento), n), ISO);
                    onChange(d);
                    setTesto(mostra(d));
                    setAperto(false);
                  }}
                />
              ))}
              <span className="w-full px-0.5 pt-0.5 text-[10px] text-muted-foreground">
                da {riferimentoNome ?? "riferimento"} · {mostra(riferimento)}
              </span>
            </>
          )}
          {!riferimento && (
            <>
              <Scorciatoia
                testo="Oggi"
                onClick={() => {
                  const d = format(new Date(), ISO);
                  onChange(d);
                  setTesto(mostra(d));
                  setAperto(false);
                }}
              />
              <Scorciatoia
                testo="Fra un mese"
                onClick={() => {
                  const d = format(addMonths(new Date(), 1), ISO);
                  onChange(d);
                  setTesto(mostra(d));
                  setAperto(false);
                }}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

function Scorciatoia({ testo, titolo, onClick }: { testo: string; titolo?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {testo}
    </button>
  );
}
