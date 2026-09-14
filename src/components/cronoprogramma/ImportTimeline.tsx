import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { ANCORA_NOME, type CronoAncora, type CronoEvento } from "@/types/cronoprogramma";
import {
  applicaAncoraggio,
  estraiTimeline,
  type AttivitaCandidata,
  type EsitoEstrazione,
} from "@/lib/importTimeline";
import { useImportaEventi } from "@/hooks/useCronoprogramma";

/**
 * L'import della PROJECT TIMELINE — v1.1 §5.
 *
 * Il flusso e' upload → estrazione → revisione → conferma, e la revisione non
 * si salta: nulla entra nella timeline senza che il PM abbia corretto date e
 * nomi, eliminato le attivita' superflue e confermato il mapping delle ancore.
 * L'estrazione e' un acceleratore, non una fonte di verita'.
 */

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  cronoprogrammaId: string;
  eventi: CronoEvento[];
}

type RigaRevisione = AttivitaCandidata & {
  id: number;
  inclusa: boolean;
  /** L'evento esistente che questa riga aggiornerebbe. */
  eventoEsistente: CronoEvento | null;
  derivataDaAncoraggio: boolean;
};

export function ImportTimeline({ aperto, onChiudi, cronoprogrammaId, eventi }: Props) {
  const { toast } = useToast();
  const importa = useImportaEventi();
  const fileRef = useRef<HTMLInputElement>(null);

  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoEstrazione | null>(null);
  const [righe, setRighe] = useState<RigaRevisione[]>([]);
  const [nomeFile, setNomeFile] = useState("");
  const [ancoraggio, setAncoraggio] = useState("");
  const [selezione, setSelezione] = useState<Set<number>>(new Set());

  const perAncora = useMemo(() => {
    const m = new Map<string, CronoEvento>();
    for (const e of eventi) if (e.ancora) m.set(e.ancora, e);
    return m;
  }, [eventi]);

  const accoppia = (a: AttivitaCandidata): CronoEvento | null => {
    if (a.ancora_proposta && perAncora.has(a.ancora_proposta)) return perAncora.get(a.ancora_proposta)!;
    const stesso = eventi.find((e) => e.nome.trim().toLowerCase() === a.nome.trim().toLowerCase());
    return stesso ?? null;
  };

  const carica = async (file: File) => {
    setInCorso(true);
    setNomeFile(file.name);
    try {
      const e = await estraiTimeline(file);
      setEsito(e);
      if (e.ancoraggioSuggerito) setAncoraggio(e.ancoraggioSuggerito);
      setRighe(
        e.attivita.map((a, i) => ({
          ...a,
          id: i,
          inclusa: true,
          eventoEsistente: accoppia(a),
          derivataDaAncoraggio: false,
        }))
      );
    } catch (err: any) {
      toast({ variant: "destructive", title: "Estrazione fallita", description: err.message });
      setEsito({ attivita: [], richiedeAncoraggio: false, ancoraggioSuggerito: null, diario: "Estrazione fallita: prosegui a mano." });
    } finally {
      setInCorso(false);
    }
  };

  const calcolaDaAncoraggio = () => {
    if (!ancoraggio) return;
    const calcolate = applicaAncoraggio(righe, ancoraggio);
    setRighe(
      righe.map((r, i) => ({
        ...r,
        inizio: calcolate[i].inizio,
        fine: calcolate[i].fine,
        derivataDaAncoraggio: r.durata_mesi !== null,
      }))
    );
  };

  const eliminaSelezionate = () => {
    setRighe((rs) => rs.filter((r) => !selezione.has(r.id)));
    setSelezione(new Set());
  };

  const aggiorna = (id: number, campi: Partial<RigaRevisione>) =>
    setRighe((rs) => rs.map((r) => (r.id === id ? { ...r, ...campi } : r)));

  const daImportare = righe.filter((r) => r.inclusa);
  const maxOrdine = Math.max(0, ...eventi.map((e) => e.ordine));

  const conferma = async () => {
    try {
      const { aggiornate, nuove } = await importa.mutateAsync({
        cronoprogramma_id: cronoprogrammaId,
        fonte: `${nomeFile} · import ${format(new Date(), "d LLL yyyy", { locale: it })}`,
        righe: daImportare.map((r) => ({
          evento_id: r.eventoEsistente?.id ?? null,
          nome: r.nome,
          ancora: r.eventoEsistente ? null : r.ancora_proposta,
          inizio: r.inizio,
          fine: r.fine,
        })),
        ordineDa: maxOrdine,
      });
      toast({
        title: "Import completato",
        description: `${aggiornate} righe aggiornate, ${nuove} nuove. Le date pre-cantiere non sono state toccate.`,
      });
      azzera();
      onChiudi();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import fallito", description: err.message });
    }
  };

  const azzera = () => {
    setEsito(null);
    setRighe([]);
    setNomeFile("");
    setAncoraggio("");
    setSelezione(new Set());
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v) { azzera(); onChiudi(); } }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa la timeline da un file</DialogTitle>
          <DialogDescription>
            PDF, immagine o xlsx. Il sistema propone; niente entra nella PROJECT TIMELINE senza la
            tua revisione. L'integrazione e' per evento: un re-import non azzera le righe esistenti.
          </DialogDescription>
        </DialogHeader>

        {!esito ? (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) carica(f);
            }}
          >
            {inCorso ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Estrazione in corso — per le immagini l'OCR puo' richiedere qualche secondo…
                </p>
              </>
            ) : (
              <>
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm">Trascina qui il cronoprogramma, o</p>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Scegli il file
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  xlsx si legge direttamente · PDF con testo si analizza · immagini e scansioni passano dall'OCR (ita+eng)
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) carica(f);
                  }}
                />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{esito.diario}</p>

            {esito.richiedeAncoraggio && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
                <span className="text-amber-900 dark:text-amber-200">
                  Il file parla per durate, non per date: da quale giorno parte la prima fase?
                </span>
                <Input
                  type="date"
                  value={ancoraggio}
                  onChange={(e) => setAncoraggio(e.target.value)}
                  className="h-7 w-[150px] text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={calcolaDaAncoraggio} disabled={!ancoraggio}>
                  Calcola le date
                </Button>
                {esito.ancoraggioSuggerito && (
                  <span className="text-amber-800/70 dark:text-amber-300/70">
                    (il file suggerisce {format(parseISO(esito.ancoraggioSuggerito), "d LLL yyyy", { locale: it })})
                  </span>
                )}
              </div>
            )}

            {righe.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Deseleziona cio' che non serve alla certificazione, correggi nomi e date,
                    controlla le ancore proposte.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={selezione.size === 0}
                    onClick={eliminaSelezionate}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Elimina selezionate ({selezione.size})
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-2" />
                        <th className="px-2 py-2 text-left font-medium">Attivita'</th>
                        <th className="px-2 py-2 text-left font-medium">Inizio</th>
                        <th className="px-2 py-2 text-left font-medium">Fine</th>
                        <th className="px-2 py-2 text-left font-medium">Ancora FGB</th>
                        <th className="px-2 py-2 text-left font-medium">Destino</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r) => (
                        <tr key={r.id} className={cn("border-b last:border-0", !r.inclusa && "opacity-40")}>
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={selezione.has(r.id)}
                              onChange={(e) => {
                                const s = new Set(selezione);
                                e.target.checked ? s.add(r.id) : s.delete(r.id);
                                setSelezione(s);
                              }}
                              aria-label={`Seleziona ${r.nome}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={r.nome}
                              onChange={(e) => aggiorna(r.id, { nome: e.target.value })}
                              className="h-7 min-w-[220px] text-xs"
                            />
                            {r.durata_mesi !== null && (
                              <span className="text-[10px] text-muted-foreground">
                                {r.durata_mesi} mesi{r.derivataDaAncoraggio ? " · date derivate dall'ancoraggio" : ""}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="date"
                              value={r.inizio ?? ""}
                              onChange={(e) => aggiorna(r.id, { inizio: e.target.value || null, derivataDaAncoraggio: false })}
                              className="h-7 w-[135px] text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="date"
                              value={r.fine ?? ""}
                              onChange={(e) => aggiorna(r.id, { fine: e.target.value || null, derivataDaAncoraggio: false })}
                              className="h-7 w-[135px] text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={r.ancora_proposta ?? ""}
                              onChange={(e) => {
                                const a = (e.target.value || null) as CronoAncora | null;
                                aggiorna(r.id, {
                                  ancora_proposta: a,
                                  eventoEsistente: a && perAncora.has(a) ? perAncora.get(a)! : null,
                                });
                              }}
                              className="h-7 rounded-md border bg-background px-1.5 text-xs"
                            >
                              <option value="">—</option>
                              {Object.entries(ANCORA_NOME).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            {r.eventoEsistente ? (
                              <Badge variant="outline" className="text-[10px]">
                                aggiorna «{r.eventoEsistente.nome}»
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">nuova riga</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={azzera}>
                Riparti da un altro file
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {daImportare.length} righe entreranno · fonte «{nomeFile}»
                </span>
                <Button
                  size="sm"
                  disabled={daImportare.length === 0 || importa.isPending || daImportare.some((r) => r.durata_mesi !== null && !r.inizio)}
                  onClick={conferma}
                >
                  {importa.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Conferma e integra
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
