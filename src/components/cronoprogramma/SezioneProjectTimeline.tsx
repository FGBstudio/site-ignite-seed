import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { FileUp, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { FONTI_SUGGERITE, type CronoEvento, type Cronoprogramma } from "@/types/cronoprogramma";
import {
  PROJECT_TIPO_LABEL,
  TEMPLATE_BY_KEY,
  proponiTipo,
  type ProjectTipo,
  type TemplateKey,
} from "@/lib/projectTimelineTemplates";
import {
  useAggiungiEvento,
  useAttachCronoprogramma,
  useCreateCronoprogramma,
  useEliminaEvento,
  useUpsertEvento,
} from "@/hooks/useCronoprogramma";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * Sezione ① PROJECT TIMELINE — flusso v2 §2.
 *
 * Tre stati, e nessun altro:
 *
 *  · **non ancora creata** → la tabella e' gia' popolata con l'ossatura del
 *    template del tipo (V1: mai un elenco generico, mai un form vuoto), date
 *    vuote tranne l'handover dalla Quotation, con la fascia che dichiara cosa
 *    sta succedendo e «Importa da file» accanto. L'ossatura vive in locale:
 *    diventa il record condiviso del sito **al primo salvataggio**, cioe' alla
 *    prima data inserita o riga modificata (§2.1).
 *
 *  · **creata, collassata** → riepilogo compatto. E' cio' che vede chiunque
 *    apra un'altra certificazione dello stesso sito (§0.3).
 *
 *  · **creata, aperta** → la tabella, con autosave per riga e undo (§0.2).
 */

export interface RigaOssatura {
  id: string;
  nome: string;
  fase: boolean;
  famiglia: string | null;
  ancora: string | null;
  inizio: string | null;
  fine: string | null;
  fonte: string | null;
}

export function ossaturaDaTemplate(key: TemplateKey, handoverBaseline: string | null): RigaOssatura[] {
  return TEMPLATE_BY_KEY[key].righe.map((r, i) => ({
    id: `oss${i}`,
    nome: r.nome,
    fase: r.fase,
    famiglia: r.famiglia,
    ancora: r.ancora,
    inizio: r.ancora === "handover" ? handoverBaseline : null,
    fine: null,
    fonte: r.ancora === "handover" && handoverBaseline ? "Quotation" : null,
  }));
}

export function templateDelTipo(tipo: ProjectTipo, certType: string | null, certRating: string | null): TemplateKey {
  if (tipo === "construction") return "construction";
  return proponiTipo(certType, certRating).template ?? "bdc";
}

interface Props {
  cert: any;
  siteId: string;
  tipoEffettivo: ProjectTipo;
  crono: Cronoprogramma | undefined;
  cronoInCaricamento: boolean;
  eventi: CronoEvento[];
  altreCertIds: string[];
  modificabile: boolean;
  aperta: boolean;
  setAperta: (v: boolean) => void;
  onImporta: () => void;
  /** L'ossatura locale: la pagina la tiene per poterla passare al wizard. */
  ossatura: RigaOssatura[];
  setOssatura: (r: RigaOssatura[]) => void;
  /** Selezione di una riga: accende i passi che vi pendono (§3.2). */
  selezionatoId: string | null;
  evidenziatoId: string | null;
  onSeleziona: (e: CronoEvento) => void;
  /** Il cambio data di una riga gia' salvata passa dall'anteprima cascata. */
  onCascata: (e: CronoEvento, nuovaData: string, fonte: string) => void;
  renderCascata: (e: CronoEvento) => React.ReactNode;
  cascataPer: string | null;
}

export function SezioneProjectTimeline(props: Props) {
  const {
    cert, siteId, tipoEffettivo, crono, cronoInCaricamento, eventi, altreCertIds,
    modificabile, aperta, setAperta, onImporta, ossatura, setOssatura,
    selezionatoId, evidenziatoId, onSeleziona, onCascata, renderCascata, cascataPer,
  } = props;

  const { toast } = useToast();
  const creaCrono = useCreateCronoprogramma();
  const aggancia = useAttachCronoprogramma();
  const salvaEvento = useUpsertEvento();
  const aggiungiEvento = useAggiungiEvento();
  const eliminaEvento = useEliminaEvento();
  const [creando, setCreando] = useState(false);

  const handoverBaseline: string | null = cert.baseline_handover_date ?? cert.handover_date ?? null;

  if (tipoEffettivo === "existing") {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
        Progetto <b className="text-foreground">EXISTING</b>: non esiste una project timeline di
        cantiere. Si parte direttamente dalla timeline del servizio, qui sotto.
      </div>
    );
  }

  if (cronoInCaricamento) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
        Carico la project timeline del sito…
      </div>
    );
  }

  // ── Stato «creata, collassata»: il riepilogo (§0.3, §2.5) ───────────────
  if (crono && !aperta) {
    const date = eventi.map((e) => e.data_effettiva ?? e.data_pianificata).filter(Boolean).sort() as string[];
    const handover = eventi.find((e) => e.ancora === "handover");
    const ultimo = eventi.map((e) => e.aggiornata_il).filter(Boolean).sort().pop();
    const datati = eventi.filter((e) => e.data_pianificata || e.data_effettiva).length;
    const voce = (k: string, v: React.ReactNode) => (
      <div>
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</p>
        <p className="text-sm font-medium tabular-nums">{v}</p>
      </div>
    );
    return (
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {voce("Tipo", PROJECT_TIPO_LABEL[(crono.tipo ?? "design_construction") as ProjectTipo])}
          {voce("Eventi", `${eventi.length} · ${datati} datati`)}
          {voce("Prima data", date.length ? df(date[0]) : "—")}
          {voce("Handover", df(handover?.data_effettiva ?? handover?.data_pianificata))}
          {voce("Aggiornata", ultimo ? format(parseISO(ultimo), "d LLL yy, HH:mm", { locale: it }) : "—")}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAperta(true)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Apri / Modifica
        </Button>
      </div>
    );
  }

  // ── Stato «non ancora creata»: l'ossatura precaricata (§2.1) ────────────
  if (!crono) {
    /** Il primo salvataggio: l'ossatura diventa il record condiviso del sito. */
    const materializza = async (righe: RigaOssatura[]) => {
      setCreando(true);
      try {
        const k = await creaCrono.mutateAsync({
          site_id: siteId,
          nome: cert.sito?.name ?? null,
          tipo: tipoEffettivo === "construction" ? "construction" : "design_construction",
          handoverContrattuale: handoverBaseline,
          righeTemplate: righe.map((r) => ({
            nome: r.nome,
            fase: r.fase,
            famiglia: r.famiglia,
            ancora: r.ancora,
            data_pianificata: r.inizio,
            data_fine: r.fine,
            fonte: r.fonte,
          })),
        });
        await aggancia.mutateAsync({
          cronoprogramma_id: k.id,
          certification_ids: altreCertIds.length ? altreCertIds : [cert.id],
        });
        toast({
          title: "Project timeline creata",
          description: "Da ora e' il record condiviso del sito: la vedono tutte le certificazioni.",
        });
        setAperta(true);
      } catch (e: any) {
        toast({ variant: "destructive", title: "Salvataggio fallito", description: e.message });
      } finally {
        setCreando(false);
      }
    };

    const scrivi = (id: string, campi: Partial<RigaOssatura>) => {
      const righe = ossatura.map((r) => (r.id === id ? { ...r, ...campi } : r));
      setOssatura(righe);
      // §2.1: l'ossatura diventa record al primo salvataggio, cioe' alla
      // prima data inserita o riga modificata. Da li' in poi si lavora sul
      // condiviso, e nulla puo' piu' andare perso (V6).
      if (campi.inizio || campi.fine || campi.nome) void materializza(righe);
    };

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-3.5 py-2.5">
          <p className="max-w-[62ch] text-xs text-muted-foreground">
            Ossatura <b className="text-foreground">{PROJECT_TIPO_LABEL[tipoEffettivo]}</b> precaricata
            dai cronoprogrammi reali — compila le date, aggiungi o elimina righe, oppure{" "}
            <b className="text-foreground">importa il cronoprogramma da file</b> per sostituirla.
          </p>
          <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={!modificabile} onClick={onImporta}>
            <FileUp className="mr-1.5 h-3.5 w-3.5" /> Importa da file
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <Testata />
            <tbody>
              {ossatura.map((r) => (
                <tr key={r.id} className="h-10 border-b last:border-0">
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5">
                      {r.nome}
                      {r.ancora && <span className="text-[10px] text-muted-foreground" title="Ancora FGB">●</span>}
                    </span>
                    {r.famiglia && (
                      <span className="mt-0.5 block text-[10px] capitalize text-muted-foreground">
                        {r.famiglia.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      value={r.inizio ?? ""}
                      disabled={!modificabile || creando}
                      onChange={(e) => scrivi(r.id, { inizio: e.target.value || null })}
                      className="h-8 w-[132px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      value={r.fine ?? ""}
                      disabled={!modificabile || creando}
                      title="Solo per le fasi: una milestone e' un istante"
                      onChange={(e) => scrivi(r.id, { fine: e.target.value || null })}
                      className="h-8 w-[132px] text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <span className="text-[11px] text-muted-foreground">{r.fonte ?? "—"}</span>
                  </td>
                  <td className="px-2 py-1">
                    <Stato stato={r.inizio ? "inserita" : "da_confermare"} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      disabled={!modificabile || r.ancora === "handover"}
                      onClick={() => {
                        const righe = ossatura.filter((x) => x.id !== r.id);
                        setOssatura(righe);
                        void materializza(righe);
                      }}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                      aria-label={`Elimina ${r.nome}`}
                      title={r.ancora === "handover" ? "L'handover non si elimina: e' la baseline contrattuale" : "Elimina riga"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={!modificabile || creando}
            onClick={() => {
              const righe = [
                ...ossatura,
                { id: `oss${Date.now()}`, nome: "Nuova attività", fase: false, famiglia: null, ancora: null, inizio: null, fine: null, fonte: null },
              ];
              setOssatura(righe);
              void materializza(righe);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi riga
          </Button>
          <Button size="sm" className="h-8 text-xs" disabled={!modificabile || creando} onClick={() => materializza(ossatura)}>
            Salva project timeline
          </Button>
          <span className="self-center text-[11px] text-muted-foreground">
            {creando ? "Salvo…" : "Il primo salvataggio la rende condivisa con tutto il sito."}
          </span>
        </div>
      </div>
    );
  }

  // ── Stato «creata, aperta»: autosave per riga con undo (§0.2) ───────────
  const salvaCampo = async (e: CronoEvento, campi: any, descrizione: string) => {
    const prima = {
      data_pianificata: e.data_pianificata,
      data_fine: e.data_fine,
      fonte: e.fonte,
      nome: e.nome,
    };
    try {
      await salvaEvento.mutateAsync({ id: e.id, ...campi });
      toast({
        title: "Salvato",
        description: descrizione,
        action: (
          <ToastAction
            altText="Annulla"
            onClick={() => salvaEvento.mutate({ id: e.id, ...prima } as any)}
          >
            Annulla
          </ToastAction>
        ),
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Salvataggio fallito", description: err.message });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!modificabile} onClick={onImporta}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" /> Importa da file
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <Testata />
          <tbody>
            {eventi.map((e) => {
              const libera = e.ancora === null;
              const acceso = evidenziatoId === e.id || selezionatoId === e.id;
              const dataCorrente = e.data_effettiva ?? e.data_pianificata;
              return (
                <Fragment key={e.id}>
                  <tr className={cn("h-10 border-b last:border-0 transition-colors", acceso && "bg-primary/5")}>
                    <td className="px-2 py-1">
                      {libera && modificabile ? (
                        <Input
                          defaultValue={e.nome}
                          onBlur={(ev) =>
                            ev.target.value !== e.nome && salvaCampo(e, { nome: ev.target.value }, `«${ev.target.value}»`)
                          }
                          className="h-8 min-w-[170px] text-xs"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSeleziona(e)}
                          className={cn(
                            "flex items-center gap-1.5 text-left hover:text-primary",
                            selezionatoId === e.id && "font-semibold text-primary"
                          )}
                          title="Seleziona: accende i passi della certificazione che pendono da qui"
                        >
                          {e.nome}
                          {e.ancora && <span className="text-[10px] text-muted-foreground" title="Ancora FGB">●</span>}
                        </button>
                      )}
                      {e.famiglia && (
                        <span className="mt-0.5 block text-[10px] capitalize text-muted-foreground">
                          {e.famiglia.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        defaultValue={e.data_pianificata ?? ""}
                        disabled={!modificabile}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          if (!v || v === e.data_pianificata) return;
                          // Una riga gia' datata che muove qualcosa passa
                          // dall'anteprima: mai uno spostamento silenzioso.
                          if (dataCorrente) onCascata(e, v, e.fonte ?? "");
                          else salvaCampo(e, { data_pianificata: v, stato: "inserita" }, `${e.nome} · ${df(v)}`);
                        }}
                        className="h-8 w-[132px] text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        defaultValue={e.data_fine ?? ""}
                        disabled={!modificabile}
                        title="Solo per le fasi: una milestone e' un istante"
                        onChange={(ev) =>
                          salvaCampo(e, { data_fine: ev.target.value || null }, `${e.nome} · fine ${df(ev.target.value)}`)
                        }
                        className="h-8 w-[132px] text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Fonte
                        fonte={e.fonte ?? ""}
                        modificabile={modificabile}
                        onSalva={(f) => salvaCampo(e, { fonte: f || null }, `fonte di ${e.nome}`)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Stato stato={e.stato} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      {libera && modificabile && (
                        <button
                          type="button"
                          onClick={async () => {
                            await eliminaEvento.mutateAsync(e.id);
                            toast({ title: "Riga eliminata", description: `«${e.nome}»` });
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Elimina ${e.nome}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {cascataPer === e.id && (
                    <tr>
                      <td colSpan={6} className="px-2 pb-3">
                        {renderCascata(e)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!modificabile}
          onClick={async () => {
            const ordine = Math.max(0, ...eventi.map((x) => x.ordine)) + 1;
            await aggiungiEvento.mutateAsync({ cronoprogramma_id: crono.id, nome: "Nuova attività", ordine });
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi riga
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={() => setAperta(false)}>
          Salva e chiudi
        </Button>
        <span className="self-center text-[11px] text-muted-foreground">
          Ogni modifica e' gia' salvata e condivisa col sito.
        </span>
      </div>

      <datalist id="fonti-crono">
        {FONTI_SUGGERITE.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </div>
  );
}

function Testata() {
  return (
    <thead>
      <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <th className="px-2 py-1.5 text-left font-medium">Fase / milestone</th>
        <th className="px-2 py-1.5 text-left font-medium">Inizio</th>
        <th className="px-2 py-1.5 text-left font-medium">Fine</th>
        <th className="w-8 px-1 py-1.5 text-left font-medium" title="Fonte">F.</th>
        <th className="px-2 py-1.5 text-left font-medium">Stato</th>
        <th />
      </tr>
    </thead>
  );
}

function Stato({ stato }: { stato: string }) {
  const meta =
    stato === "confermata"
      ? { c: "#3F7A1F", l: "confermata" }
      : stato === "da_confermare"
      ? { c: "#D97706", l: "da confermare" }
      : { c: "#3F7A1F", l: "inserita" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.c }} />
      {meta.l}
    </span>
  );
}

/** La fonte come icona col tooltip, editabile al click e facoltativa (§2.4). */
function Fonte({
  fonte,
  modificabile,
  onSalva,
}: {
  fonte: string;
  modificabile: boolean;
  onSalva: (f: string) => void;
}) {
  const [bozza, setBozza] = useState(fonte);
  return (
    <Popover onOpenChange={(o) => o && setBozza(fonte)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!modificabile}
          className={cn("rounded p-1 hover:bg-muted", fonte ? "text-foreground" : "text-muted-foreground/50")}
          title={fonte || "fonte non indicata · clicca per aggiungerla"}
          aria-label={fonte ? `Fonte: ${fonte}` : "Aggiungi la fonte"}
        >
          <NotebookPen className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Fonte · facoltativa</p>
        <Input list="fonti-crono" value={bozza} onChange={(e) => setBozza(e.target.value)} placeholder="es. gantt rev. 8 del GC" className="h-8 text-xs" />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSalva(bozza)}>
            Salva
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
