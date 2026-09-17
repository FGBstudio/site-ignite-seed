import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutTemplate, Link2, Plus, Trash2 } from "lucide-react";
import { CampoData } from "@/components/cronoprogramma/CampoData";
import { IntestazioneCard } from "@/components/timeline/IntestazioneCard";
import {
  creaCiclo,
  inizioDaDipendenze,
  type AttivitaDerivata,
  type AttivitaProgetto,
} from "@/lib/timelineDerivazione";

/**
 * Card «1 · Project timeline» — SPECIFICA_TIMELINE §4.2.
 *
 * Una riga per attività: nome, dipendenza facoltativa, inizio, fine, e
 * l'avanzamento in sola lettura.
 *
 * La colonna «Avanz.» non si tocca e non è una dimenticanza: l'avanzamento di
 * un'attività di progetto è il tempo trascorso (§6.2). Metterci un campo
 * editabile significherebbe chiedere al PM di dichiarare una cosa che il
 * calendario sa già — e aprire la porta a due numeri che dicono cose diverse
 * sulla stessa riga.
 */

interface Props {
  attivita: AttivitaDerivata[];
  modificabile: boolean;
  /** Evidenzia la riga appena toccata: flash verde ~600ms (§4.2). */
  evidenziata: string | null;
  onData: (id: string, campo: "inizio" | "fine", valore: string | null) => void;
  onDipendenze: (id: string, madri: string[]) => void;
  onProponiInizio: (id: string, inizio: string) => void;
  /** Scrivere a mano: senza, l'unica strada sarebbe caricare un file. */
  onAggiungi?: (nome: string) => Promise<void> | void;
  onRinomina?: (id: string, nome: string) => void;
  onElimina?: (id: string, nome: string) => void;
  /** I modelli di partenza, offerti solo quando non c'è ancora niente. */
  onUsaModello?: () => void;
}

export function CardProjectTimeline({
  attivita,
  modificabile,
  evidenziata,
  onData,
  onDipendenze,
  onProponiInizio,
  onAggiungi,
  onRinomina,
  onElimina,
  onUsaModello,
}: Props) {
  const [nuova, setNuova] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const datate = attivita.filter((a) => a.inizio).length;
  const indice = new Map<string, AttivitaProgetto>(attivita.map((a) => [a.id, a]));

  const aggiungi = async () => {
    const nome = nuova.trim();
    if (!nome || !onAggiungi) return;
    setInCorso(true);
    try {
      await onAggiungi(nome);
      setNuova("");
    } finally {
      setInCorso(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <IntestazioneCard
        numero={1}
        titolo="PROJECT TIMELINE"
        chip="shared"
        pill={`${datate} of ${attivita.length} activities`}
        nota="One record per site: fill it in once and it serves every service on that site. Progress comes from elapsed time — dependencies are optional."
      />

      {attivita.length === 0 ? (
        /* Tre strade, e nessuna obbligata. Prima qui c'era solo «importa il
           cronoprogramma»: chi il gantt non ce l'ha ancora restava fermo. */
        <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
          <p className="text-xs text-muted-foreground">
            This timeline is empty. Upload the gantt above, start from a template, or
            type the first activity.
          </p>
          {modificabile && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {onUsaModello && (
                <Button size="sm" variant="outline" onClick={onUsaModello}>
                  <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" /> Start from a template
                </Button>
              )}
              {onAggiungi && (
                <span className="flex items-center gap-1.5">
                  <Input
                    value={nuova}
                    onChange={(e) => setNuova(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && aggiungi()}
                    placeholder="Activity name…"
                    aria-label="Name of the new activity"
                    className="h-8 w-52 text-xs"
                  />
                  <Button size="sm" disabled={!nuova.trim() || inCorso} onClick={aggiungi}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add
                  </Button>
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {/* Le colonne secondarie si tolgono sul telefono (spec 9):
                    il numero di riga non serve a compilare. */}
                <th className="hidden w-8 px-2 py-1.5 text-left font-medium sm:table-cell">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Activity</th>
                <th className="px-2 py-1.5 text-left font-medium">Start</th>
                <th className="px-2 py-1.5 text-left font-medium">End</th>
                <th className="px-2 py-1.5 text-left font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {attivita.map((a, i) => (
                <tr
                  key={a.id}
                  className={cn(
                    "group border-b align-top last:border-0 transition-colors",
                    evidenziata === a.id && "bg-primary/5"
                  )}
                >
                  <td className="hidden px-2 py-2 text-xs text-muted-foreground tabular-nums sm:table-cell">
                    {i + 1}
                  </td>

                  <td className="px-2 py-2">
                    {/* Il nome si corregge sul posto. Un'attività importata da
                        un gantt arriva quasi sempre con un nome da sistemare —
                        troncato, in un'altra lingua, con un codice WBS
                        davanti — e mandare il PM altrove per una parola è il
                        modo di non fargliela correggere mai. */}
                    {modificabile && onRinomina ? (
                      <input
                        defaultValue={a.nome}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== a.nome) onRinomina(a.id, v);
                          else e.target.value = a.nome;
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label={`Name of ${a.nome}`}
                        className="w-full min-w-[150px] rounded border border-transparent bg-transparent px-1 py-0.5 font-medium leading-tight outline-none hover:border-border focus-visible:border-primary focus-visible:bg-background"
                      />
                    ) : (
                      <p className="font-medium leading-tight">{a.nome}</p>
                    )}
                    <SelettoreDipendenze
                      attivita={a}
                      tutte={attivita}
                      modificabile={modificabile}
                      onCambia={(madri) => {
                        onDipendenze(a.id, madri);
                        // Se l'inizio è vuoto, la dipendenza lo propone
                        // (§4.2). Proporre, non imporre: resta modificabile.
                        if (!a.inizio) {
                          const proposto = inizioDaDipendenze(madri, indice);
                          if (proposto) onProponiInizio(a.id, proposto);
                        }
                      }}
                    />
                  </td>

                  <td className="px-2 py-2">
                    <CampoData
                      value={a.inizio}
                      disabled={!modificabile}
                      aria={`Start of ${a.nome}`}
                      placeholder="add"
                      attesa
                      className="w-[134px]"
                      onChange={(v) => onData(a.id, "inizio", v)}
                    />
                  </td>

                  <td className="px-2 py-2">
                    <CampoData
                      value={a.fine}
                      disabled={!modificabile}
                      aria={`End of ${a.nome}`}
                      placeholder="add"
                      attesa
                      riferimento={a.inizio}
                      riferimentoNome="the start"
                      className="w-[134px]"
                      onChange={(v) => onData(a.id, "fine", v)}
                    />
                  </td>

                  <td className="px-2 py-2">
                    <Avanzamento a={a} />
                  </td>

                  <td className="w-8 px-1 py-2 text-right">
                    {modificabile && onElimina && (
                      <button
                        type="button"
                        onClick={() => onElimina(a.id, a.nome)}
                        aria-label={`Delete ${a.nome}`}
                        title="Delete this activity"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Aggiungere resta possibile anche a tabella piena: un gantt
                  copre quasi mai tutto, e la voce che manca la si scrive qui
                  invece di ricaricare il file. */}
              {modificabile && onAggiungi && (
                <tr>
                  <td />
                  <td colSpan={4} className="px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <Input
                        value={nuova}
                        onChange={(e) => setNuova(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && aggiungi()}
                        placeholder="Add an activity…"
                        aria-label="Name of the new activity"
                        className="h-8 max-w-xs text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!nuova.trim() || inCorso}
                        onClick={aggiungi}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * L'avanzamento in sola lettura: barra + percentuale + stato a parole.
 *
 * Lo stato è scritto e non solo colorato, perché l'informazione che passa dal
 * colore deve passare anche dal testo (§9, accessibilità).
 */
function Avanzamento({ a }: { a: AttivitaDerivata }) {
  if (a.avanzamento === null) {
    return (
      <span className="text-[11px] text-amber-700 dark:text-amber-400">
        end date missing
      </span>
    );
  }

  const colore =
    a.stato === "completed"
      ? "hsl(var(--success))"
      : a.stato === "in progress"
        ? "hsl(var(--primary))"
        : "hsl(var(--muted-foreground))";

  return (
    <span className="block w-[104px]">
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${a.avanzamento}%`, background: colore }}
        />
      </span>
      <span className="mt-1 block text-[11px] tabular-nums" style={{ color: colore }}>
        {a.avanzamento}% <span className="text-muted-foreground">· {a.stato}</span>
      </span>
    </span>
  );
}

/**
 * «dipende da»: un link ambra che apre l'elenco, non un campo pesante.
 *
 * Le attività che creerebbero un ciclo non si possono scegliere — sono
 * spente con il motivo scritto. Il database le rifiuterebbe comunque con
 * un'eccezione: meglio non farle scegliere che far esplodere il salvataggio.
 */
function SelettoreDipendenze({
  attivita,
  tutte,
  modificabile,
  onCambia,
}: {
  attivita: AttivitaDerivata;
  tutte: AttivitaDerivata[];
  modificabile: boolean;
  onCambia: (madri: string[]) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const madri = attivita.dipendeDa ?? [];
  const nomi = madri
    .map((id) => tutte.find((a) => a.id === id)?.nome)
    .filter(Boolean) as string[];

  if (!modificabile) {
    return nomi.length > 0 ? (
      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Link2 className="h-3 w-3" /> dipende da: {nomi.join(", ")}
      </span>
    ) : null;
  }

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        className="flex items-center gap-1 rounded text-[11px] text-amber-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-amber-400"
      >
        <Link2 className="h-3 w-3" />
        {nomi.length === 0 ? "depends on: none" : `depends on: ${nomi.join(", ")}`}
      </button>

      {aperto && (
        <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto rounded-md border bg-popover p-1.5">
          {tutte.length <= 1 && (
            <p className="px-1 py-1 text-[11px] text-muted-foreground">
              At least one other activity is needed.
            </p>
          )}
          {tutte
            .filter((o) => o.id !== attivita.id)
            .map((o) => {
              const scelta = madri.includes(o.id);
              const ciclo = !scelta && creaCiclo(attivita.id, o.id, tutte);
              return (
                <label
                  key={o.id}
                  title={ciclo ? "This would create a circular dependency" : undefined}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted",
                    ciclo && "cursor-not-allowed opacity-40 hover:bg-transparent"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={scelta}
                    disabled={ciclo}
                    onChange={(e) =>
                      onCambia(
                        e.target.checked ? [...madri, o.id] : madri.filter((m) => m !== o.id)
                      )
                    }
                  />
                  <span className="min-w-0 truncate">{o.nome}</span>
                  {ciclo && <span className="ml-auto shrink-0 text-[10px]">circular</span>}
                </label>
              );
            })}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setAperto(false)}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { Avanzamento as AvanzamentoAttivita };
