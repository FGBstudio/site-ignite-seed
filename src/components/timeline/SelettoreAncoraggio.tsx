import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Link2, Unlink } from "lucide-react";
import {
  aggiungiGiorni,
  type AttivitaDerivata,
  type PassoDerivato,
  type PuntoAncora,
} from "@/lib/timelineDerivazione";

/**
 * Agganciare un passo del servizio a un'attività di progetto.
 *
 * È il gesto che rende viva la HQ FGB timeline: «GC closeout, 30 giorni dopo
 * la fine di Handover». Da quel momento il passo smette di essere una data
 * scritta a mano e diventa una conseguenza — se il cantiere slitta, si sposta
 * da solo.
 *
 * Tre scelte in una frase, e vanno lette come una frase: **quale attività**,
 * **quale estremo**, **quanti giorni**. L'estremo è la parte che si dimentica
 * e che cambia tutto: «dopo Construction» su una fase di otto mesi significa
 * due date diverse a seconda che si conti dall'inizio o dalla fine.
 *
 * In fondo c'è la data che ne esce, calcolata mentre si sceglie. Non è una
 * cortesia: è l'unico modo di accorgersi di aver puntato l'attività sbagliata
 * prima di salvare, invece che tre settimane dopo.
 */

const df = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yy") : "—");

interface Props {
  passo: PassoDerivato;
  attivita: AttivitaDerivata[];
  modificabile: boolean;
  tinta: string;
  onCambia: (attivitaId: string | null, punto: PuntoAncora, offsetGiorni: number) => Promise<void> | void;
}

export function SelettoreAncoraggio({ passo, attivita, modificabile, tinta, onCambia }: Props) {
  const [aperto, setAperto] = useState(false);
  const [scelta, setScelta] = useState<string>(passo.ancora?.attivitaId ?? "");
  const [punto, setPunto] = useState<PuntoAncora>(passo.ancora?.punto ?? "end");
  const [offset, setOffset] = useState<number>(passo.ancora?.offsetGiorni ?? 0);
  const [salvando, setSalvando] = useState(false);

  const madre = attivita.find((a) => a.id === (passo.ancora?.attivitaId ?? ""));
  const candidata = attivita.find((a) => a.id === scelta);

  // La data che uscirebbe, calcolata mentre si sceglie.
  const base = candidata ? (punto === "start" ? candidata.inizio : candidata.fine ?? candidata.inizio) : null;
  const risultato = base ? aggiungiGiorni(base, offset) : null;

  const applica = async (id: string | null) => {
    setSalvando(true);
    try {
      await onCambia(id, punto, offset);
      setAperto(false);
    } finally {
      setSalvando(false);
    }
  };

  if (!modificabile) {
    return madre ? (
      <span className="text-[10.5px] text-muted-foreground">
        {passo.ancora!.offsetGiorni >= 0 ? "+" : "−"}
        {Math.abs(passo.ancora!.offsetGiorni)}d from the{" "}
        {passo.ancora!.punto === "start" ? "start" : "end"} of {madre.nome}
      </span>
    ) : null;
  }

  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o);
        if (o) {
          setScelta(passo.ancora?.attivitaId ?? "");
          setPunto(passo.ancora?.punto ?? "end");
          setOffset(passo.ancora?.offsetGiorni ?? 0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Link ${passo.nome} to a project activity`}
          className={cn(
            "mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            madre ? "border-transparent" : "border-dashed text-muted-foreground hover:text-foreground"
          )}
          style={madre ? { background: `${tinta}1a`, color: tinta } : undefined}
        >
          <Link2 className="h-2.5 w-2.5" />
          {madre ? (
            <>
              {passo.ancora!.offsetGiorni >= 0 ? "+" : "−"}
              {Math.abs(passo.ancora!.offsetGiorni)}d · {passo.ancora!.punto === "start" ? "start" : "end"} of{" "}
              {madre.nome.length > 22 ? `${madre.nome.slice(0, 21)}…` : madre.nome}
            </>
          ) : (
            "link to an activity"
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[22rem] p-3">
        <p className="mb-2 text-sm font-medium">Link to the project timeline</p>

        {attivita.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            There are no project activities yet. Add one above — this step can then follow it.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Activity
            </label>
            <select
              value={scelta}
              onChange={(e) => setScelta(e.target.value)}
              className="mb-3 h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <option value="">— choose an activity</option>
              {attivita.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.inizio ? ` · ${df(a.inizio)}` : " · no date"}
                </option>
              ))}
            </select>

            {/* L'estremo. Su una milestone i due coincidono e la scelta non
                serve; su una fase di otto mesi è la differenza fra due date
                lontane otto mesi. */}
            <label className="mb-1 block text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Counting from
            </label>
            <div className="mb-3 flex gap-1.5">
              {(["start", "end"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPunto(p)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                    punto === p ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
                  )}
                >
                  {p === "start" ? "its start" : "its end"}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Offset
            </label>
            <div className="mb-3 flex items-center gap-2">
              <Input
                type="number"
                value={offset}
                onChange={(e) => setOffset(Math.round(Number(e.target.value) || 0))}
                className="h-8 w-24 text-center text-xs"
                aria-label="Days of offset"
              />
              <span className="text-xs text-muted-foreground">
                days {offset < 0 ? "before" : "after"}
              </span>
            </div>

            {/* La conseguenza, non il codice: si legge la frase e si vede la
                data prima di salvarla. */}
            <p className="text-xs">
              {candidata ? (
                <>
                  {offset === 0 ? "On" : `${Math.abs(offset)} days ${offset < 0 ? "before" : "after"}`} the{" "}
                  {punto === "start" ? "start" : "end"} of <b>{candidata.nome}</b> →{" "}
                  <b style={{ color: tinta }}>{risultato ? df(risultato) : "no date yet"}</b>
                </>
              ) : (
                <span className="text-muted-foreground">Choose an activity to see the resulting date.</span>
              )}
            </p>
            {candidata && !base && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                That activity has no date yet: the link is saved anyway, and the date appears as soon
                as it gets one.
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              {passo.ancora ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  disabled={salvando}
                  onClick={() => applica(null)}
                >
                  <Unlink className="mr-1 h-3 w-3" /> Unlink
                </Button>
              ) : (
                <span />
              )}
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAperto(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" disabled={!scelta || salvando} onClick={() => applica(scelta)}>
                  Link
                </Button>
              </span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
