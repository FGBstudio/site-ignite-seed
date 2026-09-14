import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { NaturaPasso } from "@/types/cronoprogramma";

/**
 * La timeline che si disegna mentre il PM compila.
 *
 * Il movimento e' l'informazione: quando una data cambia, la milestone si
 * sposta invece di riapparire altrove, e il PM vede l'effetto di cio' che ha
 * appena scritto. E' la differenza fra una tabella di date e la comprensione
 * di come sono legate.
 *
 * Tre regole che tengono onesto il disegno:
 *
 *  1. I passi senza data non spariscono: restano in coda, smorzati. Il PM deve
 *     vedere quanto manca, non solo cio' che ha gia' fatto.
 *  2. I vincoli si vedono, non solo si leggono. Un passo che viola una
 *     precedenza si colora e mostra il collegamento all'ancora violata; lo
 *     stesso avviso compare sul campo. Timeline e modulo sono la stessa verita'
 *     in due forme, mai due verita'.
 *  3. Chi non puo' muoversi non finge di poterlo fare: le milestone ereditate e
 *     calcolate non sono cliccabili verso un campo che non esiste.
 */

export interface Segno {
  /** Identifica il segno e, per i passi PM, il campo corrispondente. */
  key: string;
  label: string;
  /** Assente = passo ancora da compilare: va in coda, non sull'asse. */
  date: string | null;
  corsia: "crono" | "cert";
  natura: NaturaPasso | "ancora";
  /** Il vincolo rotto, se c'e'. */
  violazione?: { messaggio: string; ancoraKey: string; giorni: number } | null;
}

interface Props {
  segni: Segno[];
  /** Il passo che ha il fuoco nel modulo: si evidenzia anche qui. */
  focus?: string | null;
  /** Click su un segno: porta il fuoco al campo. Solo per i passi PM. */
  onSegnoClick?: (key: string) => void;
  titoloCrono?: string;
  titoloCert?: string;
  /** Posizione precedente dei segni, per mostrare la traccia in un'anteprima. */
  traccia?: Record<string, string | null>;
}

const COLORE: Record<Segno["natura"], string> = {
  ancora:     "#716E64",
  ereditato:  "#8A8577",
  pm:         "#009193",
  calcolato:  "#5348B8",
  serie:      "#0D7A61",
  auto:       "#98968B",
};

function giorni(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function TimelineViva({
  segni,
  focus,
  onSegnoClick,
  titoloCrono = "Cronoprogramma",
  titoloCert = "Certificazione",
  traccia,
}: Props) {
  const conData = segni.filter((s) => s.date);
  const senzaData = segni.filter((s) => !s.date);

  /**
   * Il dominio dell'asse. Un margine del 6% per lato evita che il primo e
   * l'ultimo segno finiscano incollati al bordo, dove le etichette si
   * taglierebbero.
   */
  const dominio = useMemo(() => {
    if (conData.length === 0) return null;
    const date = conData.map((s) => s.date!).sort();
    const [min, max] = [date[0], date[date.length - 1]];
    const span = Math.max(1, giorni(min, max));
    return { min, max, span, pad: Math.round(span * 0.06) };
  }, [conData]);

  const posizione = (d: string) => {
    if (!dominio) return 50;
    const tot = dominio.span + dominio.pad * 2;
    return ((giorni(dominio.min, d) + dominio.pad) / tot) * 100;
  };

  if (!dominio) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          La timeline compare qui man mano che inserisci le date.
        </p>
      </div>
    );
  }

  const mesi = mesiTra(dominio.min, dominio.max);

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Scala dei mesi */}
      <div className="relative mb-3 h-4">
        {mesi.map((m) => (
          <span
            key={m}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
            style={{ left: `${posizione(m)}%` }}
          >
            {format(parseISO(m), "LLL yy", { locale: it })}
          </span>
        ))}
      </div>

      <Corsia
        titolo={titoloCrono}
        segni={conData.filter((s) => s.corsia === "crono")}
        posizione={posizione}
        focus={focus}
        onSegnoClick={onSegnoClick}
        traccia={traccia}
      />
      <Corsia
        titolo={titoloCert}
        segni={conData.filter((s) => s.corsia === "cert")}
        posizione={posizione}
        focus={focus}
        onSegnoClick={onSegnoClick}
        traccia={traccia}
      />

      {senzaData.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Ancora senza data · {senzaData.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {senzaData.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => s.natura === "pm" && onSegnoClick?.(s.key)}
                className={cn(
                  "rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground",
                  s.natura === "pm" && "cursor-pointer hover:border-primary hover:text-primary",
                  focus === s.key && "border-primary text-primary"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Corsia({
  titolo,
  segni,
  posizione,
  focus,
  onSegnoClick,
  traccia,
}: {
  titolo: string;
  segni: Segno[];
  posizione: (d: string) => number;
  focus?: string | null;
  onSegnoClick?: (key: string) => void;
  traccia?: Record<string, string | null>;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{titolo}</p>
      <div className="relative h-14 rounded-lg bg-muted/30">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />

        {segni.map((s) => {
          const attivo = focus === s.key;
          const cliccabile = s.natura === "pm" || s.natura === "ancora";
          const vecchia = traccia?.[s.key];
          const spostato = vecchia && vecchia !== s.date;

          return (
            <div key={s.key} className="contents">
              {/* La posizione precedente, in traccia smorzata: si vede da dove
                  arriva prima ancora di leggere di quanto si e' mosso. */}
              {spostato && (
                <span
                  className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-muted-foreground/50"
                  style={{ left: `${posizione(vecchia!)}%` }}
                />
              )}

              <button
                type="button"
                disabled={!cliccabile}
                onClick={() => cliccabile && onSegnoClick?.(s.key)}
                title={
                  s.violazione
                    ? `${s.label} — ${s.violazione.messaggio}`
                    : `${s.label} · ${format(parseISO(s.date!), "d LLL yyyy", { locale: it })}`
                }
                className={cn(
                  "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  "motion-safe:transition-[left,transform] motion-safe:duration-200 motion-safe:ease-out",
                  cliccabile ? "cursor-pointer" : "cursor-default",
                  attivo ? "h-4 w-4 ring-2 ring-primary ring-offset-2" : "h-3 w-3",
                  s.violazione && "ring-2 ring-amber-500 ring-offset-1"
                )}
                style={{
                  left: `${posizione(s.date!)}%`,
                  background: s.violazione ? "#B45309" : COLORE[s.natura],
                }}
                aria-label={s.label}
              />

              <span
                className={cn(
                  "pointer-events-none absolute top-[calc(50%+12px)] -translate-x-1/2 whitespace-nowrap text-[10px]",
                  "motion-safe:transition-[left] motion-safe:duration-200 motion-safe:ease-out",
                  attivo ? "font-medium text-foreground" : "text-muted-foreground",
                  s.violazione && "text-amber-700"
                )}
                style={{ left: `${posizione(s.date!)}%` }}
              >
                {s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** I primi di mese compresi nell'intervallo, per la scala. Al massimo dodici. */
function mesiTra(da: string, a: string): string[] {
  const out: string[] = [];
  const d = parseISO(da);
  const fine = parseISO(a);
  const cur = new Date(d.getFullYear(), d.getMonth(), 1);
  while (cur <= fine && out.length < 24) {
    if (cur >= d) out.push(format(cur, "yyyy-MM-dd"));
    cur.setMonth(cur.getMonth() + 1);
  }
  const passo = Math.ceil(out.length / 12) || 1;
  return out.filter((_, i) => i % passo === 0);
}
