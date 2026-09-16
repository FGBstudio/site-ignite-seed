import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link2, RotateCcw } from "lucide-react";
import { CampoData } from "@/components/cronoprogramma/CampoData";
import { IntestazioneCard } from "@/components/timeline/IntestazioneCard";
import { tintaServizio } from "@/lib/serviceColors";
import type { AttivitaDerivata, PassoDerivato } from "@/lib/timelineDerivazione";

/**
 * Card «2 · HQ FGB timeline» — SPECIFICA_TIMELINE §4.2.
 *
 * Qui il modello è l'opposto della card sopra, e la differenza è tutta nel
 * chi decide:
 *
 *  · la DATA la decide il sistema (àncora alla project timeline), e il PM la
 *    scavalca solo se serve — allora diventa «manuale» e smette di seguire il
 *    cantiere finché non preme ↺;
 *  · l'AVANZAMENTO lo decide solo il PM (§6.7). Parte da zero e nessun
 *    calcolo lo tocca, perché un passo di certificazione non ha una durata su
 *    cui misurare il tempo trascorso: è un istante.
 *
 * Il banner nero lo dice a parole, una volta, invece di lasciarlo dedurre.
 */

interface Props {
  passi: PassoDerivato[];
  attivita: AttivitaDerivata[];
  servizio: string | null;
  nomeServizio: string | null;
  modificabile: boolean;
  evidenziato: string | null;
  onData: (id: string, data: string | null) => void;
  onAvanzamento: (id: string, pct: number) => void;
}

export function CardCertTimeline({
  passi,
  attivita,
  servizio,
  nomeServizio,
  modificabile,
  evidenziato,
  onData,
  onAvanzamento,
}: Props) {
  const tinta = tintaServizio(servizio);
  const datati = passi.filter((p) => p.dataEffettiva).length;
  const perId = new Map(attivita.map((a) => [a.id, a]));

  return (
    <section className="rounded-xl border bg-card p-5">
      <IntestazioneCard
        numero={2}
        titolo="HQ FGB TIMELINE"
        chip={nomeServizio ?? undefined}
        pill={`${datati} di ${passi.length} passi`}
        nota="Milestone del servizio: una data ciascuna, la durata corre fino al passo successivo. La data è ancorata alla project timeline — tocca la catena per vedere il collegamento."
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-foreground px-3 py-2.5 text-[11px] leading-relaxed text-background">
        <span>
          L'avanzamento parte da zero e si aggiorna <b>manualmente</b>: ogni venerdì la dashboard ti
          inviterà ad aggiornare le percentuali delle attività in corso.
        </span>
      </div>

      {passi.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          La scaletta del servizio non è ancora stata generata.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Passo</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
                <th className="px-2 py-1.5 text-left font-medium">Avanz.</th>
                <th className="px-2 py-1.5 text-left font-medium">Natura</th>
              </tr>
            </thead>
            <tbody>
              {passi.map((p, i) => {
                const madre = p.ancora ? perId.get(p.ancora.attivitaId) : null;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "group border-b align-top last:border-0 transition-colors",
                      evidenziato === p.id && "bg-primary/5"
                    )}
                  >
                    <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>

                    <td className="px-2 py-2">
                      <p className="font-medium leading-tight">{p.nome}</p>
                      {p.ancora && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: tinta.bg, color: tinta.strong }}
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            {p.ancora.offsetGiorni >= 0 ? "+" : "−"}
                            {Math.abs(p.ancora.offsetGiorni)}gg
                          </span>
                          <span className="text-[10.5px] text-amber-700 dark:text-amber-400">
                            {p.ancora.punto === "start" ? "inizio" : "fine"} di:{" "}
                            {madre?.nome ?? "attività rimossa"}
                          </span>
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      {/* Tratteggiato quando la data è calcolata, pieno quando
                          è stata forzata: si vede da lontano chi comanda. */}
                      <CampoData
                        value={p.dataEffettiva}
                        disabled={!modificabile}
                        aria={`Data di ${p.nome}`}
                        placeholder={p.natura === "in attesa" ? "in attesa" : "aggiungi"}
                        tinta={tinta.strong}
                        className={cn(
                          "w-[134px]",
                          p.natura === "calcolata" && "border-dashed text-muted-foreground"
                        )}
                        onChange={(v) => onData(p.id, v)}
                      />
                    </td>

                    <td className="px-2 py-2">
                      <Percentuale
                        valore={p.avanzamento}
                        tinta={tinta.strong}
                        etichetta={p.nome}
                        disabled={!modificabile}
                        onChange={(v) => onAvanzamento(p.id, v)}
                      />
                    </td>

                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        <NaturaChip natura={p.natura} tinta={tinta.strong} />
                        {p.natura === "manuale" && modificabile && (
                          <button
                            type="button"
                            onClick={() => onData(p.id, null)}
                            title="Torna alla data calcolata dall'àncora"
                            aria-label={`Ricalcola la data di ${p.nome} dall'àncora`}
                            className="opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * La percentuale: passi da 5, bloccata fra 0 e 100.
 *
 * Il passo da 5 non è pigrizia — è il riconoscimento che nessuno sa dire se
 * un'attività è al 62% o al 65%. Offrire la precisione al punto singolo
 * inviterebbe a fingerla.
 */
function Percentuale({
  valore,
  tinta,
  etichetta,
  disabled,
  onChange,
}: {
  valore: number;
  tinta: string;
  etichetta: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        value={valore}
        disabled={disabled}
        aria-label={`Percentuale di avanzamento di ${etichetta}`}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100, Math.round(n))));
        }}
        className="h-8 w-[62px] rounded-md border bg-background px-2 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
        style={{ color: valore > 0 ? tinta : undefined }}
      />
      <span className="text-[11px] text-muted-foreground">%</span>
    </span>
  );
}

function NaturaChip({ natura, tinta }: { natura: PassoDerivato["natura"]; tinta: string }) {
  if (natura === "calcolata") {
    return (
      <Badge
        variant="outline"
        className="text-[10px]"
        style={{ borderColor: tinta, color: tinta }}
        title="La data viene dall'àncora sulla project timeline"
      >
        calcolata
      </Badge>
    );
  }
  if (natura === "manuale") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500 text-[10px] text-amber-700 dark:text-amber-400"
        title="Data scritta a mano: non segue più l'àncora finché non premi ↺"
      >
        manuale
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] text-muted-foreground"
      title="L'attività di riferimento non ha ancora una data"
    >
      in attesa
    </Badge>
  );
}

