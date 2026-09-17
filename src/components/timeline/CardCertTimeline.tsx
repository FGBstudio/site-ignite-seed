import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link2, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  /** Un passo in più rispetto alla scaletta: capita, e va scritto. */
  onAggiungi?: (nome: string) => Promise<void> | void;
  onRinomina?: (id: string, nome: string) => void;
  onElimina?: (id: string, nome: string) => void;
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
  onAggiungi,
  onRinomina,
  onElimina,
}: Props) {
  const [nuovo, setNuovo] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const aggiungi = async () => {
    const nome = nuovo.trim();
    if (!nome || !onAggiungi) return;
    setInCorso(true);
    try {
      await onAggiungi(nome);
      setNuovo("");
    } finally {
      setInCorso(false);
    }
  };

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
                {/* Spec 9: su mobile cadono # e Natura. La natura resta
                    leggibile dal campo data, tratteggiato quando e' calcolata. */}
                <th className="hidden w-8 px-2 py-1.5 text-left font-medium sm:table-cell">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Passo</th>
                <th className="px-2 py-1.5 text-left font-medium">Data</th>
                <th className="px-2 py-1.5 text-left font-medium">Avanz.</th>
                <th className="hidden px-2 py-1.5 text-left font-medium md:table-cell">Natura</th>
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
                    <td className="hidden px-2 py-2 text-xs text-muted-foreground tabular-nums sm:table-cell">
                      {i + 1}
                    </td>

                    <td className="px-2 py-2">
                      {/* I passi del catalogo non si rinominano — sono la
                          scaletta della certificazione, uguale su tutti i
                          progetti. Quelli aggiunti a mano sì: li ha scritti il
                          PM, e un refuso deve poterlo correggere lui. */}
                      {modificabile && onRinomina && p.ancora === null && p.avanzamento === 0 ? (
                        <input
                          defaultValue={p.nome}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== p.nome) onRinomina(p.id, v);
                            else e.target.value = p.nome;
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          aria-label={`Nome di ${p.nome}`}
                          className="w-full min-w-[150px] rounded border border-transparent bg-transparent px-1 py-0.5 font-medium leading-tight outline-none hover:border-border focus-visible:border-primary focus-visible:bg-background"
                        />
                      ) : (
                        <p className="font-medium leading-tight">{p.nome}</p>
                      )}
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

                    <td className="hidden px-2 py-2 md:table-cell">
                      <span className="flex items-center gap-1.5">
                        <NaturaChip natura={p.natura} tinta={tinta.strong} />
                        {p.natura === "manuale" && modificabile && (
                          <button
                            type="button"
                            onClick={() => onData(p.id, null)}
                            title="Torna alla data calcolata dall'àncora"
                            aria-label={`Ricalcola la data di ${p.nome} dall'àncora`}
                            className="rounded opacity-0 motion-safe:transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary group-hover:opacity-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {/* Si elimina solo ciò che è stato aggiunto a mano:
                            un passo della scaletta non si cancella, si segna
                            «non applicabile». Toglierlo davvero vorrebbe dire
                            che la certificazione non lo prevede più. */}
                        {modificabile && onElimina && p.ancora === null && p.avanzamento === 0 && (
                          <button
                            type="button"
                            onClick={() => onElimina(p.id, p.nome)}
                            aria-label={`Elimina ${p.nome}`}
                            title="Elimina questo passo aggiunto a mano"
                            className="rounded p-0.5 text-muted-foreground opacity-0 motion-safe:transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {modificabile && onAggiungi && (
                <tr>
                  <td className="hidden sm:table-cell" />
                  <td colSpan={4} className="px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <Input
                        value={nuovo}
                        onChange={(e) => setNuovo(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && aggiungi()}
                        placeholder="Aggiungi un passo…"
                        aria-label="Nome del nuovo passo"
                        className="h-8 max-w-xs text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!nuovo.trim() || inCorso}
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

