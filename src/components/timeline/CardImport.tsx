import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { IntestazioneCard } from "@/components/timeline/IntestazioneCard";
import { abbina, leggiXlsx, type Abbinamento, type RigaFile } from "@/lib/importAttivita";
import { estraiTimelineIntelligente } from "@/lib/importTimelineAI";
import type { AttivitaProgetto } from "@/lib/timelineDerivazione";

/**
 * Card «Importa il cronoprogramma» — SPECIFICA_TIMELINE §4.2 e §8.
 *
 * L'import è **non distruttivo**: aggiorna le date delle attività
 * riconosciute, non tocca le altre, non cancella dipendenze né date forzate.
 *
 * Fra la lettura del file e la scrittura c'è una revisione, e non è
 * burocrazia. L'abbinamento dei nomi è un'ipotesi — «Concept Design (CD)» del
 * file contro «Concept design + review» nostro — e un'ipotesi che scrive date
 * da sola produce l'errore peggiore che questo sistema possa fare: la data
 * giusta sulla riga sbagliata, che nessuno nota per mesi. Qui la proposta si
 * vede, con il punteggio in chiaro, e conferma una persona.
 */

const df = (iso: string | null) => (iso ? format(parseISO(iso), "d LLL yy", { locale: it }) : "—");

type Destino = "aggiorna" | "nuova" | "ignora";

interface RigaRevisione extends Abbinamento {
  indice: number;
  destino: Destino;
}

interface Props {
  attivita: AttivitaProgetto[];
  modificabile: boolean;
  /** Vero solo dove la timeline del sito esiste già: senza, si possono solo creare. */
  onApplica: (
    aggiornamenti: Array<{ attivitaId: string; inizio: string | null; fine: string | null }>,
    nuove: RigaFile[]
  ) => Promise<void>;
}

export function CardImport({ attivita, modificabile, onApplica }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);
  const [stato, setStato] = useState("");
  const [nomeFile, setNomeFile] = useState("");
  const [righe, setRighe] = useState<RigaRevisione[] | null>(null);
  const [diario, setDiario] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const azzera = () => {
    setRighe(null);
    setDiario(null);
    setErrore(null);
    setNomeFile("");
  };

  const carica = async (file: File) => {
    setInCorso(true);
    setErrore(null);
    setNomeFile(file.name);
    try {
      const est = file.name.split(".").pop()?.toLowerCase() ?? "";
      let lette: RigaFile[];
      let nota: string | null = null;

      if (est === "xlsx" || est === "xls") {
        // Il foglio si legge qui: il formato è semplice e un modello
        // aggiungerebbe solo incertezza (§8).
        setStato("Leggo il foglio…");
        lette = await leggiXlsx(file);
      } else {
        setStato("Analizzo il documento…");
        const esito = await estraiTimelineIntelligente(file, setStato);
        lette = esito.attivita.map((a) => ({ nome: a.nome, inizio: a.inizio, fine: a.fine }));
        nota = esito.diario;
      }

      if (lette.length === 0) {
        setErrore(
          est === "xlsx" || est === "xls"
            ? `Nessuna attività riconosciuta in «${file.name}» — formato atteso: Attività | Inizio | Fine`
            : `Non sono riuscito a leggere attività da «${file.name}».`
        );
        setRighe(null);
        return;
      }

      const proposte = abbina(lette, attivita);
      setRighe(
        proposte.map((p, i) => ({
          ...p,
          indice: i,
          // Chi ha un'attività a cui appoggiarsi la aggiorna; gli altri
          // entrano come nuove righe, perché su una timeline vuota «solo
          // aggiornare» vorrebbe dire non fare niente.
          destino: p.attivitaId ? "aggiorna" : "nuova",
        }))
      );
      setDiario(nota);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riesco a leggere questo file.");
      setRighe(null);
    } finally {
      setInCorso(false);
      setStato("");
    }
  };

  const conferma = async () => {
    if (!righe) return;
    setSalvando(true);
    setErrore(null);
    try {
      await onApplica(
        righe
          .filter((r) => r.destino === "aggiorna" && r.attivitaId)
          .map((r) => ({ attivitaId: r.attivitaId!, inizio: r.riga.inizio, fine: r.riga.fine })),
        righe.filter((r) => r.destino === "nuova").map((r) => r.riga)
      );
      azzera();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Salvataggio non riuscito.");
    } finally {
      setSalvando(false);
    }
  };

  const conta = (d: Destino) => righe?.filter((r) => r.destino === d).length ?? 0;
  const daScrivere = conta("aggiorna") + conta("nuova");

  return (
    <section className="rounded-xl border bg-card p-5">
      <IntestazioneCard
        titolo="IMPORTA IL CRONOPROGRAMMA"
        chip="facoltativo"
        nota="Se hai il gantt del cantiere, caricalo: attività e date entrano da lì. Aggiorna solo le righe che riconosci — dipendenze e date forzate restano come sono."
      />

      {!righe && (
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            !modificabile && "opacity-50"
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!modificabile) return;
            const f = e.dataTransfer.files?.[0];
            if (f) carica(f);
          }}
        >
          {inCorso ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium">{stato || "Lettura in corso…"}</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Se il gantt mostra solo barre senza date scritte, le date si leggono dalla
                posizione delle barre contro la scala dei mesi.
              </p>
            </>
          ) : (
            <>
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">Trascina qui il file</p>
              <p className="text-xs text-muted-foreground">
                XLSX (<span className="tabular-nums">Attività | Inizio | Fine</span>) · PDF · immagine
              </p>
              <Button variant="outline" size="sm" disabled={!modificabile} onClick={() => fileRef.current?.click()}>
                Scegli il file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) carica(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}

      {errore && !righe && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errore}
        </p>
      )}

      {/* ── La revisione ───────────────────────────────────────────────── */}
      {righe && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              <b>{righe.length}</b> righe lette da «{nomeFile}» ·{" "}
              <span className="text-muted-foreground">
                {conta("aggiorna")} aggiornano, {conta("nuova")} nuove, {conta("ignora")} ignorate
              </span>
            </p>
            <button
              type="button"
              onClick={azzera}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              scarta e ricomincia
            </button>
          </div>

          {diario && <p className="text-[11px] text-muted-foreground">{diario}</p>}

          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Riga del file</th>
                  <th className="px-2 py-1.5 text-left font-medium">Date</th>
                  <th className="px-2 py-1.5 text-left font-medium">Cosa ne faccio</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.indice} className={cn("border-b last:border-0", r.destino === "ignora" && "opacity-45")}>
                    <td className="px-2 py-1.5">
                      <p className={cn("font-medium", r.destino === "ignora" && "line-through")}>{r.riga.nome}</p>
                      {r.attivitaNome && (
                        <p className="text-[10.5px] text-muted-foreground">
                          somiglia a «{r.attivitaNome}»{" "}
                          <span className="tabular-nums">({Math.round(r.punteggio * 100)}%)</span>
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                      {df(r.riga.inizio)}
                      {r.riga.fine && ` → ${df(r.riga.fine)}`}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={r.destino}
                        onChange={(e) =>
                          setRighe((rs) =>
                            rs!.map((x) =>
                              x.indice === r.indice ? { ...x, destino: e.target.value as Destino } : x
                            )
                          )
                        }
                        className="h-7 rounded-md border bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-label={`Cosa fare con ${r.riga.nome}`}
                      >
                        {r.attivitaId && <option value="aggiorna">aggiorna «{r.attivitaNome}»</option>}
                        <option value="nuova">crea come nuova attività</option>
                        <option value="ignora">ignora</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errore && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errore}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {daScrivere === 0
                ? "Nessuna riga selezionata: non c'è niente da scrivere."
                : "Le date già presenti sulle righe non toccate restano dove sono."}
            </span>
            <Button size="sm" disabled={daScrivere === 0 || salvando} onClick={conferma}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Applica · {daScrivere} righe
            </Button>
          </div>
        </div>
      )}

    </section>
  );
}
