import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link2 } from "lucide-react";
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
}

export function CardProjectTimeline({
  attivita,
  modificabile,
  evidenziata,
  onData,
  onDipendenze,
  onProponiInizio,
}: Props) {
  const datate = attivita.filter((a) => a.inizio).length;
  const indice = new Map<string, AttivitaProgetto>(attivita.map((a) => [a.id, a]));

  return (
    <section className="rounded-xl border bg-card p-5">
      <IntestazioneCard
        numero={1}
        titolo="PROJECT TIMELINE"
        chip="condivisa"
        pill={`${datate} di ${attivita.length} attività`}
        nota="Record unico per sito: compilata una volta, vale per tutti i servizi che vi insistono. L'avanzamento si calcola dal tempo — la dipendenza è facoltativa."
      />

      {attivita.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Nessuna attività. Importa il cronoprogramma qui sopra per popolarla.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Attività</th>
                <th className="px-2 py-1.5 text-left font-medium">Inizio</th>
                <th className="px-2 py-1.5 text-left font-medium">Fine</th>
                <th className="px-2 py-1.5 text-left font-medium">Avanz.</th>
              </tr>
            </thead>
            <tbody>
              {attivita.map((a, i) => (
                <tr
                  key={a.id}
                  className={cn(
                    "border-b align-top last:border-0 transition-colors",
                    evidenziata === a.id && "bg-primary/5"
                  )}
                >
                  <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>

                  <td className="px-2 py-2">
                    <p className="font-medium leading-tight">{a.nome}</p>
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
                      aria={`Inizio di ${a.nome}`}
                      placeholder="aggiungi"
                      attesa
                      className="w-[134px]"
                      onChange={(v) => onData(a.id, "inizio", v)}
                    />
                  </td>

                  <td className="px-2 py-2">
                    <CampoData
                      value={a.fine}
                      disabled={!modificabile}
                      aria={`Fine di ${a.nome}`}
                      placeholder="aggiungi"
                      attesa
                      riferimento={a.inizio}
                      riferimentoNome="l'inizio"
                      className="w-[134px]"
                      onChange={(v) => onData(a.id, "fine", v)}
                    />
                  </td>

                  <td className="px-2 py-2">
                    <Avanzamento a={a} />
                  </td>
                </tr>
              ))}
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
        manca la fine
      </span>
    );
  }

  const colore =
    a.stato === "completata"
      ? "hsl(var(--success))"
      : a.stato === "in corso"
        ? "hsl(var(--primary))"
        : "hsl(var(--muted-foreground))";

  return (
    <span className="block w-[104px]">
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full transition-[width] duration-300"
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
        className="flex items-center gap-1 text-[11px] text-amber-700 hover:underline dark:text-amber-400"
      >
        <Link2 className="h-3 w-3" />
        {nomi.length === 0 ? "dipende da: nessuna" : `dipende da: ${nomi.join(", ")}`}
      </button>

      {aperto && (
        <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto rounded-md border bg-popover p-1.5">
          {tutte.length <= 1 && (
            <p className="px-1 py-1 text-[11px] text-muted-foreground">
              Serve almeno un'altra attività.
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
                  title={ciclo ? "Creerebbe una dipendenza circolare" : undefined}
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
                  {ciclo && <span className="ml-auto shrink-0 text-[10px]">circolare</span>}
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
