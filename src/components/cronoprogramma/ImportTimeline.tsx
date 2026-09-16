import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import { type CronoEvento } from "@/types/cronoprogramma";
import {
  applicaAncoraggio,
  type AttivitaCandidata,
  type EsitoEstrazione,
} from "@/lib/importTimeline";
import { estraiTimelineIntelligente, type MotoreEstrazione } from "@/lib/importTimelineAI";
import { CampoData } from "@/components/cronoprogramma/CampoData";
import {
  useAttachCronoprogramma,
  useCreateCronoprogramma,
  useEliminaEvento,
  useImportaEventi,
} from "@/hooks/useCronoprogramma";
import { TimelineVerticale, type VoceTimeline } from "@/components/cronoprogramma/TimelineVerticale";

/**
 * Il wizard di import — v1.3 §3. Tre passi dichiarati in testata, a tutto
 * schermo: Carica → Rivedi ed escludi → Conferma.
 *
 * Le regole del pulsante di conferma sono la parte scritta col sangue del bug
 * precedente: sta in un footer fisso, dice quante righe inserira', e quando e'
 * disattivo accanto c'e' sempre il motivo. Mai un pulsante muto.
 *
 * Il wizard sa anche CREARE la PROJECT TIMELINE (v1.3 §1: «Importa da file» e'
 * una delle due strade di creazione): se il sito non ce l'ha, alla conferma
 * nasce il record condiviso e le righe entrano li'.
 */

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  siteId: string;
  nomeSito: string | null;
  /** NULL = la timeline non esiste ancora: la crea la conferma. */
  cronoprogrammaId: string | null;
  eventi: CronoEvento[];
  tipoProposto: "design_construction" | "construction";
  handoverBaseline: string | null;
  /** Tutte le certificazioni del sito, da agganciare quando la timeline nasce qui. */
  certIds: string[];
  /** Riapre il wizard quando il PM riprende la bozza. */
  onRiprendi?: () => void;
}

type RigaRev = AttivitaCandidata & {
  id: number;
  inclusa: boolean;
  eventoEsistente: CronoEvento | null;
  derivataDaAncoraggio: boolean;
};

export function ImportTimeline({
  aperto,
  onChiudi,
  siteId,
  nomeSito,
  cronoprogrammaId,
  eventi,
  tipoProposto,
  handoverBaseline,
  certIds,
  onRiprendi,
}: Props) {
  const { toast } = useToast();
  const importa = useImportaEventi();
  const creaCrono = useCreateCronoprogramma();
  const aggancia = useAttachCronoprogramma();
  const eliminaEvento = useEliminaEvento();
  const fileRef = useRef<HTMLInputElement>(null);

  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<EsitoEstrazione | null>(null);
  const [righe, setRighe] = useState<RigaRev[]>([]);
  const [nomeFile, setNomeFile] = useState("");
  const [ancoraggio, setAncoraggio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [stato, setStato] = useState("");
  const [motore, setMotore] = useState<MotoreEstrazione | null>(null);
  const [dedotte, setDedotte] = useState(0);
  const [sortOrfane, setSortOrfane] = useState<"tieni" | "elimina">("tieni");

  // ── La bozza: la X chiude senza perdere niente (§0.2, V6) ──────────────
  //
  // Vive nella sessione del browser e non nel database: e' lavoro non ancora
  // deciso, e scriverlo sul record condiviso lo farebbe vedere ai colleghi
  // come se fosse confermato.
  const chiaveBozza = `fgb.import.${siteId}`;
  const bozzaEsistente = useMemo(() => {
    if (aperto) return null;
    try {
      const raw = sessionStorage.getItem(chiaveBozza);
      return raw ? (JSON.parse(raw) as { passo: number; nomeFile: string; righe: RigaRev[] }) : null;
    } catch {
      return null;
    }
  }, [aperto, chiaveBozza]);

  const salvaBozza = () => {
    if (passo === 1 || righe.length === 0) {
      sessionStorage.removeItem(chiaveBozza);
      return;
    }
    try {
      sessionStorage.setItem(
        chiaveBozza,
        JSON.stringify({ passo, nomeFile, righe, diario: esito?.diario ?? "" })
      );
      toast({ title: "Bozza salvata", description: `Riprendi l'import dal passo ${passo} quando vuoi.` });
    } catch {
      /* quota piena: la bozza si perde, ma l'import si rifà — non si blocca nulla */
    }
  };

  const riprendiBozza = () => {
    try {
      const raw = sessionStorage.getItem(chiaveBozza);
      if (!raw) return;
      const b = JSON.parse(raw);
      setRighe(b.righe ?? []);
      setNomeFile(b.nomeFile ?? "");
      setEsito({ attivita: [], richiedeAncoraggio: false, ancoraggioSuggerito: null, diario: b.diario ?? "" });
      setPasso((b.passo === 3 ? 3 : 2) as 2 | 3);
    } catch {
      /* bozza illeggibile: si riparte dal passo 1 */
    }
  };

  const perAncora = useMemo(() => {
    const m = new Map<string, CronoEvento>();
    for (const e of eventi) if (e.ancora) m.set(e.ancora, e);
    return m;
  }, [eventi]);

  const accoppia = (a: AttivitaCandidata): CronoEvento | null => {
    if (a.ancora_proposta && perAncora.has(a.ancora_proposta)) return perAncora.get(a.ancora_proposta)!;
    return eventi.find((e) => e.nome.trim().toLowerCase() === a.nome.trim().toLowerCase()) ?? null;
  };

  const azzera = () => {
    setPasso(1);
    setEsito(null);
    setRighe([]);
    setNomeFile("");
    setAncoraggio("");
    setErrore(null);
    setMotore(null);
    setDedotte(0);
  };

  const carica = async (file: File) => {
    setInCorso(true);
    setStato("Preparo il file…");
    setNomeFile(file.name);
    setErrore(null);
    try {
      const e = await estraiTimelineIntelligente(file, setStato);
      setMotore(e.motore);
      setDedotte(e.dedotte);
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
      // Con le date gia' in mano si va dritti al passo 2; con le durate si
      // resta qui a chiedere l'ancoraggio (v1.1 §5.2).
      if (!e.richiedeAncoraggio && e.attivita.length > 0) setPasso(2);
    } catch (err: any) {
      setEsito({ attivita: [], richiedeAncoraggio: false, ancoraggioSuggerito: null, diario: `Estrazione fallita: ${err.message}` });
    } finally {
      setInCorso(false);
      setStato("");
    }
  };

  const calcolaEContinua = () => {
    if (!ancoraggio) return;
    const calcolate = applicaAncoraggio(righe, ancoraggio);
    setRighe(righe.map((r, i) => ({ ...r, inizio: calcolate[i].inizio, fine: calcolate[i].fine, derivataDaAncoraggio: r.durata_mesi !== null })));
    setPasso(2);
  };

  const aggiorna = (id: number, campi: Partial<RigaRev>) =>
    setRighe((rs) => rs.map((r) => (r.id === id ? { ...r, ...campi } : r)));

  const incluse = righe.filter((r) => r.inclusa);
  const escluse = righe.length - incluse.length;

  /**
   * Le righe gia' presenti che l'import non tocca.
   *
   * Sono il residuo della timeline precedente: l'ossatura precaricata, o un
   * import piu' vecchio. Quelle con un ruolo non entrano nell'elenco — hanno
   * passi di certificazione agganciati, e cancellarle romperebbe dei calcoli
   * senza dirlo.
   */
  const orfane = useMemo(() => {
    const toccati = new Set(incluse.map((r) => r.eventoEsistente?.id).filter(Boolean));
    return eventi.filter((e) => !toccati.has(e.id) && !e.ancora);
  }, [eventi, incluse]);

  /**
   * L'handover non si chiede: c'e' gia'.
   *
   * Arriva dalla Quotation, e' la data contrattuale della certificazione, ed e'
   * quella che il cliente ha firmato. Chiedere al PM «quale riga del file e'
   * l'handover?» quando quella data e' gia' nel sistema e gia' disegnata nella
   * timeline e' una domanda che si risponde da sola — e la risposta sbagliata
   * (una riga qualunque che assomiglia a una fine lavori) sposta una data
   * contrattuale, che e' il tipo di errore che non si vuole rendere possibile.
   *
   * Qui lo si dice e basta, mostrandolo nella timeline accanto. Se il gantt
   * racconta un'altra fine lavori, quello e' uno slittamento da discutere col
   * cliente, non un campo da compilare in un wizard di import.
   */
  const eventoHandover = perAncora.get("handover") ?? null;
  const dataHandover =
    eventoHandover?.data_effettiva ?? eventoHandover?.data_pianificata ?? handoverBaseline ?? null;

  const motivoBlocco = incluse.length === 0 ? "nessuna riga inclusa" : null;

  // ── L'anteprima viva del passo 2 ────────────────────────────────────────
  const vociAnteprima: VoceTimeline[] = useMemo(() => {
    const out: VoceTimeline[] = eventi.map((e) => ({
      key: `evt:${e.id}`,
      label: e.nome,
      corsia: "project" as const,
      tipo: e.data_fine ? ("fase" as const) : ("milestone" as const),
      inizio: e.data_effettiva ?? e.data_pianificata,
      fine: e.data_fine,
      famiglia: e.famiglia,
      natura: "ancora" as const,
      isHandover: e.ancora === "handover",
    }));
    for (const r of righe) {
      if (r.eventoEsistente && r.inclusa) continue; // aggiornera' la riga gia' disegnata
      out.push({
        key: `imp:${r.id}`,
        label: r.nome,
        corsia: "project",
        tipo: r.fine && r.fine !== r.inizio ? "fase" : "milestone",
        inizio: r.inizio,
        fine: r.fine,
        natura: "ancora",
        isHandover: r.ancora_proposta === "handover",
        traccia: !r.inclusa,
      });
    }
    // L'handover c'e' sempre nel disegno, anche quando non e' ancora una riga
    // della timeline: e' il modo di dire «questo e' gia' considerato» senza
    // scriverlo in una nota che nessuno legge.
    if (!eventoHandover && dataHandover) {
      out.push({
        key: "hb",
        label: "Handover (fine cantiere)",
        corsia: "project",
        tipo: "milestone",
        inizio: dataHandover,
        natura: "ancora",
        isHandover: true,
        nota: "dalla Quotation · già impostato",
      });
    }
    return out;
  }, [righe, eventi, eventoHandover, dataHandover]);

  // ── La conferma: nessun fallimento silenzioso ───────────────────────────
  const conferma = async () => {
    setSalvando(true);
    setErrore(null);
    try {
      let cronoId = cronoprogrammaId;
      let ordineDa = Math.max(0, ...eventi.map((e) => e.ordine));

      if (!cronoId) {
        // La timeline nasce sempre con l'handover: e' la data contrattuale,
        // c'e' gia', e senza di lei le scalette non hanno da cosa calcolarsi.
        const template = dataHandover
          ? [{ nome: "Handover (fine cantiere)", fase: false, famiglia: null, ancora: "handover" }]
          : [];
        const k = await creaCrono.mutateAsync({
          site_id: siteId,
          nome: nomeSito,
          tipo: tipoProposto,
          handoverContrattuale: handoverBaseline,
          righeTemplate: template,
        });
        cronoId = k.id;
        ordineDa = template.length;
        if (certIds.length) {
          await aggancia.mutateAsync({ cronoprogramma_id: cronoId, certification_ids: certIds });
        }
      }

      const { aggiornate, nuove } = await importa.mutateAsync({
        cronoprogramma_id: cronoId!,
        fonte: `${nomeFile} · import ${format(new Date(), "d LLL yyyy", { locale: it })}`,
        righe: incluse.map((r) => ({
          evento_id: r.eventoEsistente?.id ?? null,
          nome: r.nome,
          ancora: r.eventoEsistente ? null : r.ancora_proposta,
          inizio: r.inizio,
          fine: r.fine && r.fine !== r.inizio ? r.fine : null,
        })),
        ordineDa,
      });

      // La pulizia arriva DOPO l'inserimento, mai prima: se l'import fallisce
      // a meta', il PM si ritrova senza le righe vecchie e senza le nuove.
      let eliminate = 0;
      if (sortOrfane === "elimina" && orfane.length > 0) {
        for (const e of orfane) {
          await eliminaEvento.mutateAsync(e.id);
          eliminate++;
        }
      }

      toast({
        title: `${aggiornate + nuove} righe inserite`,
        description: [
          `${nuove} nuove, ${aggiornate} aggiornate.`,
          eliminate > 0 ? `${eliminate} righe vecchie eliminate.` : null,
          "Le date gia' presenti non sono state toccate.",
        ]
          .filter(Boolean)
          .join(" "),
      });
      sessionStorage.removeItem(chiaveBozza);
      azzera();
      onChiudi();
    } catch (err: any) {
      setErrore(err.message ?? "Salvataggio fallito");
    } finally {
      setSalvando(false);
    }
  };

  // Chiuso, ma con una bozza in attesa: il v2 §0.2 vuole che si possa
  // riprendere da dove si era lasciato, e che lo si veda.
  if (!aperto) {
    if (!bozzaEsistente) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-950/30">
        <span className="text-amber-900 dark:text-amber-200">
          Hai un import in sospeso su questo sito · {bozzaEsistente.nomeFile}
        </span>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              riprendiBozza();
              onRiprendi?.();
            }}
          >
            Riprendi import (passo {bozzaEsistente.passo})
          </Button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(chiaveBozza);
              onRiprendi?.();
            }}
            className="text-amber-800/70 underline hover:text-amber-900 dark:text-amber-300/70"
          >
            scarta
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Importa la timeline">
      {/* ── Testata: i tre passi dichiarati ── */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-4">
          {([1, 2, 3] as const).map((n) => (
            <span key={n} className={cn("flex items-center gap-1.5 text-xs", passo === n ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10.5px]", passo >= n ? "bg-foreground text-background" : "border")}>{n}</span>
              {n === 1 ? "Carica" : n === 2 ? "Rivedi ed escludi" : "Conferma"}
            </span>
          ))}
        </div>
        <button type="button" onClick={() => { salvaBozza(); azzera(); onChiudi(); }} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Chiudi salvando la bozza">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Corpo ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {passo === 1 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <div
              className="flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-14 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) carica(f);
              }}
            >
              {inCorso ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                  <p className="text-sm font-medium">{stato || "Estrazione in corso…"}</p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Se il gantt mostra solo barre senza date scritte, le date si leggono dalla
                    posizione delle barre contro la scala dei mesi. Ci vogliono alcuni secondi.
                  </p>
                </>
              ) : (
                <>
                  <FileUp className="h-7 w-7 text-muted-foreground" />
                  <p className="text-base font-medium">Trascina qui il cronoprogramma</p>
                  <p className="text-xs text-muted-foreground">PDF · immagine (png/jpg) · xlsx</p>
                  <Button variant="outline" onClick={() => fileRef.current?.click()}>Scegli il file</Button>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    Leggo attivita' <b>e date</b>, anche quando le date stanno solo nelle barre. Tu
                    scegli quali righe tenere: e' un acceleratore, non un esame.
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

            {esito && (
              <div className="w-full max-w-2xl space-y-3">
                <p className="text-center text-xs text-muted-foreground">{esito.diario}</p>

                {/* Da dove vengono queste righe. Non e' un dettaglio tecnico:
                    una data dedotta dalla posizione di una barra merita un
                    controllo che una data letta nel testo non merita. */}
                {motore && righe.length > 0 && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="mr-1.5 text-[10px]">
                      {motore === "ai" ? "lettura AI" : "lettore locale"}
                    </Badge>
                    {dedotte > 0 && (
                      <span className="text-amber-700">
                        {dedotte} righe con date dedotte dalle barre — controllale al passo 2.
                      </span>
                    )}
                  </p>
                )}
                {esito.richiedeAncoraggio && righe.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
                    <span className="text-amber-900 dark:text-amber-200">Il file parla per durate: da quale giorno parte la prima fase?</span>
                    <CampoData
                      value={ancoraggio}
                      aria="Data di partenza della prima fase"
                      placeholder="scegli la data"
                      className="w-[150px] bg-background"
                      onChange={(v) => setAncoraggio(v ?? "")}
                    />
                    {esito.ancoraggioSuggerito && (
                      <span className="text-amber-800/70 dark:text-amber-300/70">
                        (il file suggerisce {format(parseISO(esito.ancoraggioSuggerito), "d LLL yyyy", { locale: it })})
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {passo === 2 && (
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[45%_55%]">
            {/* ── Sinistra: la tabella ── */}
            <div className="min-h-0 overflow-y-auto border-r p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  Togli la spunta alle attivita' che non servono alla certificazione: spariscono dalla timeline a destra.
                </p>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">
                  {incluse.length} incluse · {escluse} escluse
                </span>
                <button className="underline text-muted-foreground hover:text-foreground" onClick={() => setRighe((rs) => rs.map((r) => ({ ...r, inclusa: false })))}>
                  Escludi tutte
                </button>
                <button className="underline text-muted-foreground hover:text-foreground" onClick={() => setRighe((rs) => rs.map((r) => ({ ...r, inclusa: true })))}>
                  Includi tutte
                </button>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-7 px-1 py-1.5" />
                    <th className="px-1 py-1.5 text-left font-medium">Attivita'</th>
                    <th className="px-1 py-1.5 text-left font-medium">Inizio</th>
                    <th className="px-1 py-1.5 text-left font-medium">Fine</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r) => (
                    <tr
                      key={r.id}
                      className={cn("cursor-pointer border-b last:border-0 transition-opacity", !r.inclusa && "opacity-45")}
                      onClick={() => aggiorna(r.id, { inclusa: !r.inclusa })}
                    >
                      <td className="px-1 py-1.5">
                        <input type="checkbox" checked={r.inclusa} onChange={(e) => aggiorna(r.id, { inclusa: e.target.checked })} onClick={(e) => e.stopPropagation()} aria-label={`Includi ${r.nome}`} />
                      </td>
                      <td className="px-1 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input value={r.nome} onChange={(e) => aggiorna(r.id, { nome: e.target.value })} className={cn("h-8 min-w-[170px] text-xs", !r.inclusa && "line-through")} />
                        {r.eventoEsistente && (
                          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                            aggiorna «{r.eventoEsistente.nome}»{" "}
                            <button
                              type="button"
                              onClick={() => aggiorna(r.id, { eventoEsistente: null })}
                              className="underline hover:text-foreground"
                            >
                              stacca
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <CampoData
                          value={r.inizio}
                          aria={`Inizio di ${r.nome}`}
                          placeholder="manca"
                          className="w-[134px]"
                          onChange={(v) => aggiorna(r.id, { inizio: v, derivataDaAncoraggio: false })}
                        />
                      </td>
                      <td className="px-1 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <CampoData
                          value={r.fine}
                          aria={`Fine di ${r.nome}`}
                          placeholder="solo fasi"
                          riferimento={r.inizio}
                          riferimentoNome="l'inizio"
                          className="w-[134px]"
                          onChange={(v) => aggiorna(r.id, { fine: v, derivataDaAncoraggio: false })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Destra: la timeline che si aggiorna in tempo reale ── */}
            <div className="min-h-0 overflow-y-auto bg-muted/20 p-4">
              <TimelineVerticale voci={vociAnteprima} titoloProject="Project timeline" titoloCert="—" servizio={null} />
            </div>
          </div>
        )}

        {passo === 3 && (
          <div className="mx-auto max-w-xl space-y-4 p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Riepilogo</h2>
            <ul className="space-y-1.5 text-sm">
              <li>
                <b className="tabular-nums">{incluse.length}</b> righe entreranno
                {escluse > 0 && <span className="text-muted-foreground"> · {escluse} escluse da te</span>}
              </li>
              {dataHandover && (
                <li className="text-muted-foreground">
                  Handover già impostato al{" "}
                  <b className="tabular-nums text-foreground">
                    {format(parseISO(dataHandover), "d LLL yy", { locale: it })}
                  </b>{" "}
                  dalla Quotation: l'import non lo tocca.
                </li>
              )}
              {!cronoprogrammaId && (
                <li className="text-muted-foreground">
                  La PROJECT TIMELINE del sito non esiste ancora: la conferma la crea (tipo {tipoProposto === "construction" ? "CONSTRUCTION" : "DESIGN+CONSTRUCTION"}) e vi aggancia le certificazioni del sito.
                </li>
              )}
              <li className="text-muted-foreground">Fonte per ogni riga: «{nomeFile}».</li>
            </ul>

            {/* ── Le righe che c'erano prima ──────────────────────────────
                Importare il gantt vero significa quasi sempre che quello che
                c'era prima non vale piu'. Finche' non si poteva dirlo, le
                righe vecchie restavano sotto quelle nuove e la timeline
                mostrava due cantieri sovrapposti. Adesso e' una domanda, e la
                risposta di default e' quella prudente. */}
            {orfane.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  Nella timeline ci sono {orfane.length} righe che questo file non nomina.
                </p>
                <p className="mt-1 max-w-[60ch] text-[11px] text-amber-800/80 dark:text-amber-300/70">
                  {orfane.slice(0, 4).map((e) => e.nome).join(" · ")}
                  {orfane.length > 4 && ` · +${orfane.length - 4}`}
                </p>
                <div className="mt-2 space-y-1">
                  {(
                    [
                      ["tieni", "Tienile: convivono con quelle importate"],
                      ["elimina", `Eliminale: il file è la timeline vera adesso`],
                    ] as const
                  ).map(([v, testo]) => (
                    <label key={v} className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                      <input
                        type="radio"
                        name="orfane"
                        checked={sortOrfane === v}
                        onChange={() => setSortOrfane(v)}
                      />
                      {testo}
                    </label>
                  ))}
                </div>
                {sortOrfane === "elimina" && (
                  <p className="mt-1.5 text-[11px] text-amber-800/80 dark:text-amber-300/70">
                    Le righe con un ruolo restano comunque: sono agganciate a passi di certificazione.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer fisso: il pulsante parla, e se e' spento dice perche' ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3 text-xs">
          {errore ? (
            <span className="flex items-center gap-1.5 text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" /> {errore} — correggi o riprova.
            </span>
          ) : passo >= 2 && motivoBlocco ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5" /> {motivoBlocco}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {passo === 1 ? "Nulla entra nella PROJECT TIMELINE senza la tua revisione." : `${incluse.length} incluse · ${escluse} escluse`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {passo > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setPasso((p) => (p === 3 ? 2 : 1))}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Indietro
            </Button>
          )}
          {passo === 1 && (
            <Button size="sm" disabled={righe.length === 0 || (esito?.richiedeAncoraggio && !ancoraggio)} onClick={() => (esito?.richiedeAncoraggio ? calcolaEContinua() : setPasso(2))}>
              {esito?.richiedeAncoraggio ? "Calcola le date e continua" : "Continua"}
            </Button>
          )}
          {passo === 2 && (
            <Button size="sm" disabled={!!motivoBlocco} onClick={() => setPasso(3)}>
              Continua · {incluse.length} righe
            </Button>
          )}
          {passo === 3 && (
            <Button size="sm" disabled={!!motivoBlocco || salvando} onClick={conferma}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {errore ? "Riprova" : `Conferma e inserisci ${incluse.length} righe`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
