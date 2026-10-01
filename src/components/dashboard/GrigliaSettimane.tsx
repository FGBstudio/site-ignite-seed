import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  useAggiornaAppunto,
  useCreaAppunto,
  useEliminaAppunto,
  type Appunto,
} from "@/hooks/useAppunti";
import { etichettaSettimana, giornoDellaSettimana, type Settimana } from "@/lib/settimane";
import { ALTEZZA_APPUNTO, ALTEZZA_GANTT } from "@/lib/appuntiSettimana";

/**
 * La griglia delle settimane, sopra il diagramma.
 *
 * Ogni casella è l'incrocio fra un progetto e una settimana, e si clicca per
 * scriverci dentro quello che va fatto in quella settimana — come si fa su un
 * calendario condiviso. Gli appunti sono gli stessi che il calendario della
 * dashboard già crea: cambia solo che qui non si ricompila progetto e data, li
 * dice la casella su cui si è cliccato.
 *
 * La barra del Gantt resta dov'era, sopra; gli appunti si impilano sotto, dentro
 * la fascia dello stesso progetto. Il progetto cresce in altezza quando ha
 * qualcosa da ricordare, e si schiaccia quando non ce l'ha più.
 */

export function GrigliaSettimane({
  certificationId,
  settimane,
  px,
  appunti,
  larghezza,
  modificabile,
}: {
  certificationId: string;
  settimane: Settimana[];
  /** Pixel per giorno: la settimana è sette volte tanto. */
  px: number;
  appunti: Appunto[];
  larghezza: number;
  /**
   * Se questa riga si può annotare.
   *
   * La riga di riepilogo e i progetti di cui non si è responsabili restano in
   * sola lettura: un cursore che invita a cliccare su qualcosa che poi il
   * database rifiuta è peggio di un cursore fermo.
   */
  modificabile: boolean;
}) {
  const { toast } = useToast();
  const crea = useCreaAppunto();
  const aggiorna = useAggiornaAppunto();
  const elimina = useEliminaAppunto();

  /** La settimana su cui si sta scrivendo. */
  const [apertaSu, setApertaSu] = useState<string | null>(null);
  const [testo, setTesto] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (apertaSu) campo.current?.focus();
  }, [apertaSu]);

  const perSettimana = new Map<string, Appunto[]>();
  for (const a of appunti) {
    if (!perSettimana.has(a.settimana)) perSettimana.set(a.settimana, []);
    perSettimana.get(a.settimana)!.push(a);
  }

  const larghezzaSettimana = px * 7;

  const salva = async (s: Settimana) => {
    const t = testo.trim();
    if (!t) {
      setApertaSu(null);
      return;
    }
    try {
      await crea.mutateAsync({
        certification_id: certificationId,
        testo: t,
        due_date: giornoDellaSettimana(s),
      });
      // Resta aperta: scrivere due cose di fila sulla stessa settimana è il
      // gesto normale, e richiudere obbligherebbe a cliccare di nuovo.
      setTesto("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Appunto non salvato", description: e.message });
    }
  };

  return (
    <div className="absolute inset-0" style={{ width: larghezza }}>
      {settimane.map((s) => {
        const dentro = perSettimana.get(s.chiave) ?? [];
        const aperta = apertaSu === s.chiave;
        return (
          <div
            key={s.chiave}
            className="absolute top-0 bottom-0"
            style={{ left: s.offset * px, width: larghezzaSettimana }}
          >
            {/* ── La casella ────────────────────────────────────────────────
                Occupa solo la fascia sotto il Gantt: cliccare sulla barra deve
                continuare ad aprire il progetto, non a scrivere un appunto. */}
            {modificabile && (
              <button
                type="button"
                onClick={() => {
                  setApertaSu(aperta ? null : s.chiave);
                  setTesto("");
                }}
                title={`${etichettaSettimana(s)} · ${s.inizio} → ${s.fine}`}
                aria-label={`Scrivi un appunto nella settimana ${s.numero}`}
                className={cn(
                  "absolute left-0 right-0 flex items-start justify-center pt-0.5 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100",
                  aperta && "opacity-100",
                )}
                style={{ top: ALTEZZA_GANTT - 14, height: 14 }}
              >
                <Plus className="h-3 w-3 text-primary" />
              </button>
            )}

            {/* ── Gli appunti, impilati sotto la barra ─────────────────────── */}
            <div className="absolute left-0 right-0" style={{ top: ALTEZZA_GANTT }}>
              {dentro.map((a, i) => (
                <div
                  key={a.id}
                  className={cn(
                    "group/app mx-0.5 flex items-center gap-1 overflow-hidden rounded-[3px] border px-1",
                    a.stato === "done"
                      ? "border-success/40 bg-success/10 text-muted-foreground line-through"
                      : "border-primary/30 bg-primary/10",
                  )}
                  style={{ height: ALTEZZA_APPUNTO - 2, marginTop: i === 0 ? 0 : 2 }}
                  title={a.testo}
                >
                  <span className="min-w-0 flex-1 truncate text-[10.5px] leading-none">
                    {a.testo}
                  </span>
                  {modificabile && (
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/app:opacity-100">
                      <button
                        type="button"
                        onClick={() =>
                          aggiorna.mutate({ id: a.id, stato: a.stato === "done" ? "todo" : "done" })
                        }
                        aria-label={a.stato === "done" ? "Riapri" : "Segna fatto"}
                        title={a.stato === "done" ? "Riapri" : "Segna fatto"}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => elimina.mutate(a.id)}
                        aria-label="Togli l'appunto"
                        title="Togli l'appunto"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              ))}

              {/* ── Il campo di scrittura ──────────────────────────────────── */}
              {aperta && (
                <input
                  ref={campo}
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salva(s);
                    if (e.key === "Escape") {
                      setApertaSu(null);
                      setTesto("");
                    }
                  }}
                  onBlur={() => salva(s)}
                  placeholder={`W${s.numero}…`}
                  className="mx-0.5 w-[calc(100%-4px)] rounded-[3px] border border-primary bg-background px-1 text-[10.5px] outline-none"
                  style={{ height: ALTEZZA_APPUNTO - 2, marginTop: dentro.length ? 2 : 0 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
