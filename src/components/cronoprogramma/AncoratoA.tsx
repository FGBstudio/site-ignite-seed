import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Link2, Unlink } from "lucide-react";
import { naturaPasso, type CronoEvento, type TimelineMilestone } from "@/types/cronoprogramma";
import { useAncoraRiga, useCambiaAncoraggio, type VincoloRisolto } from "@/hooks/useCronoprogramma";
import { SelettoreAncora, type GruppoBersagli } from "@/components/cronoprogramma/SelettoreAncora";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/** La data di una riga di progetto: la fine se è una fase, l'inizio se no. */
export function dataRiga(e: CronoEvento): string | null {
  return e.data_effettiva ?? e.data_fine ?? e.data_pianificata ?? null;
}

// ══ Project timeline: una riga si aggancia a una precedente ════════════════

/**
 * La colonna «Ancorato a» della project timeline.
 *
 * Un cronoprogramma vero e' fatto di dipendenze: le finiture partono quando
 * finiscono gli impianti. I bersagli sono le **righe precedenti della stessa
 * timeline** — non un vocabolario di ancore canoniche, e non righe di
 * un'ossatura che il PM ha gia' sostituito importando il gantt del GC.
 */
export function AncoraRiga({
  evento,
  eventi,
  modificabile,
  onAnteprima,
}: {
  evento: CronoEvento;
  eventi: CronoEvento[];
  modificabile: boolean;
  onAnteprima?: (id: string | null) => void;
}) {
  const { toast } = useToast();
  const ancora = useAncoraRiga();

  // Solo le righe che vengono prima: e' il modello mentale di un
  // cronoprogramma, e rende improbabile l'anello che il database rifiuterebbe.
  const precedenti = useMemo(
    () => eventi.filter((e) => e.id !== evento.id && e.ordine < evento.ordine),
    [eventi, evento]
  );
  const gruppi: GruppoBersagli[] = [
    {
      titolo: "Righe precedenti di questa timeline",
      opzioni: precedenti.map((e) => ({ id: e.id, nome: e.nome, data: dataRiga(e) })),
    },
  ];

  const bersaglio = eventi.find((e) => e.id === evento.ancora_evento_id);

  const applica = async (id: string | null, offset: number) => {
    try {
      await ancora.mutateAsync({
        evento_id: evento.id,
        cronoprogramma_id: evento.cronoprogramma_id,
        ancora_evento_id: id,
        offset_giorni: offset,
      });
      toast({
        title: id ? "Collegata" : "Sganciata",
        description: id
          ? "Si sposterà insieme alla riga da cui dipende."
          : "Da ora la data la decidi tu.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    }
  };

  if (!modificabile) {
    return bersaglio ? (
      <span className="text-[11px] text-muted-foreground">
        ← {bersaglio.nome} + {evento.offset_giorni ?? 0}gg
      </span>
    ) : (
      <span className="text-[11px] text-muted-foreground">—</span>
    );
  }

  if (precedenti.length === 0) {
    return <span className="text-[11px] text-muted-foreground" title="È la prima riga: non ha niente prima di sé">—</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <SelettoreAncora
        titolo={evento.nome}
        gruppi={gruppi}
        sceltaCorrente={evento.ancora_evento_id}
        offsetCorrente={evento.offset_giorni ?? 0}
        onAnteprima={onAnteprima}
        inCorso={ancora.isPending}
        onApplica={(id, off) => applica(id, off)}
        trigger={
          bersaglio ? (
            <button
              type="button"
              className="inline-flex max-w-[190px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
              title={`${bersaglio.nome} + ${evento.offset_giorni ?? 0} giorni — clicca per cambiare`}
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{bersaglio.nome}</span>
              <span className="tabular-nums">+{evento.offset_giorni ?? 0}gg ▾</span>
            </button>
          ) : (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              — dipende da ▾
            </button>
          )
        }
      />
      {bersaglio && (
        <button
          type="button"
          onClick={() => applica(null, 0)}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          title="Sgancia: la data resta ma non si muoverà più da sola"
        >
          <Unlink className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ══ Certificazione: righe di progetto E passi precedenti ═══════════════════

interface Props {
  m: TimelineMilestone;
  /** Tutti i passi della stessa scaletta, per l'ancoraggio interno. */
  passi: TimelineMilestone[];
  eventi: CronoEvento[];
  vincolo: VincoloRisolto | undefined;
  modificabile: boolean;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
  tinta: string;
  onAnteprimaAncora: (id: string | null) => void;
  onConseguenza: (milestoneId: string, testo: string) => void;
}

/**
 * La colonna «Ancorato a» della timeline di certificazione.
 *
 * Due nature di bersaglio, e la distinzione conta: un passo agganciato a una
 * riga di progetto si muove col cantiere; uno agganciato a un passo
 * precedente della scaletta si muove con la certificazione. Il selettore li
 * tiene in due gruppi proprio per questo.
 */
export function AncoratoA({
  m,
  passi,
  eventi,
  vincolo,
  modificabile,
  certId,
  cronoId,
  certNome,
  tinta,
  onAnteprimaAncora,
  onConseguenza,
}: Props) {
  const { toast } = useToast();
  const cambia = useCambiaAncoraggio();
  const nat = naturaPasso(m);

  if (nat === "ereditato") {
    const riga = eventi.find((e) =>
      m.derived_from === "handover" ? e.ancora === "handover" : e.ancora === "construction_start"
    );
    return (
      <span className="text-[11px] text-muted-foreground">
        ← {riga?.nome ?? (m.derived_from === "handover" ? "Handover" : "Construction start")} · project timeline
      </span>
    );
  }
  if (nat === "auto") return <span className="text-[11px] text-muted-foreground">da spedizione</span>;
  if (nat === "serie")
    return (
      <span className="text-[11px] text-muted-foreground">
        mensile · da Construction start a Handover
      </span>
    );

  // I bersagli: le righe di progetto, e i passi che vengono prima di questo.
  const precedenti = passi.filter(
    (p) => p.id !== m.id && p.order_index !== null && m.order_index !== null && p.order_index < m.order_index
  );
  const gruppi: GruppoBersagli[] = [
    {
      titolo: "Project timeline",
      nota: "si muove col cantiere",
      opzioni: eventi.map((e) => ({ id: `evt:${e.id}`, nome: e.nome, data: dataRiga(e) })),
    },
    {
      titolo: `Passi precedenti di ${certNome ?? "questa certificazione"}`,
      nota: "si muove con la certificazione",
      opzioni: precedenti.map((p) => ({
        id: `ms:${p.order_index}`,
        nome: `#${p.order_index} · ${p.requirement}`,
        data: p.due_date,
      })),
    },
  ];

  const sceltaCorrente = m.crono_evento_id
    ? `evt:${m.crono_evento_id}`
    : m.anchor_order != null
    ? `ms:${m.anchor_order}`
    : null;

  const rigaProgetto = eventi.find((e) => e.id === m.crono_evento_id);
  const passoPrec = m.anchor_order != null ? passi.find((p) => p.order_index === m.anchor_order) : undefined;
  const bersaglioNome = rigaProgetto?.nome ?? (passoPrec ? `#${passoPrec.order_index}` : null);
  const agganciato = !!sceltaCorrente;

  const applica = async (chiave: string, offset: number) => {
    const eProgetto = chiave.startsWith("evt:");
    const valore = chiave.slice(4);
    const nome = eProgetto
      ? eventi.find((e) => e.id === valore)?.nome
      : passi.find((p) => String(p.order_index) === valore)?.requirement;
    try {
      await cambia.mutateAsync({
        milestone_id: m.id,
        certification_id: certId,
        requirement: m.requirement,
        evento_id: eProgetto ? valore : null,
        anchor_order: eProgetto ? null : Number(valore),
        offset_days: offset,
        data_precedente: m.due_date,
        cronoprogramma_id: cronoId,
        nota: `${certNome ?? "certificazione"} · collegata a ${nome ?? ""}`,
      });
      onConseguenza(m.id, `D'ora in poi, se «${nome}» si sposta, questa data si ricalcola da sola.`);
      toast({ title: "Collegata", description: eProgetto ? "Si muoverà col cantiere." : "Si muoverà con la certificazione." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <SelettoreAncora
        titolo={m.requirement}
        gruppi={gruppi}
        sceltaCorrente={sceltaCorrente}
        offsetCorrente={m.offset_days ?? 0}
        tinta={tinta}
        onAnteprima={(id) => onAnteprimaAncora(id?.startsWith("evt:") ? id.slice(4) : null)}
        inCorso={cambia.isPending}
        onApplica={applica}
        vuotoMessaggio="Compila qualche data nella project timeline e potrai agganciare questo passo."
        trigger={
          agganciato ? (
            <button
              type="button"
              disabled={!modificabile}
              className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
              style={{ borderColor: tinta, color: tinta }}
              title={`${bersaglioNome ?? "?"} + ${m.offset_days ?? 0} giorni — clicca per vedere o cambiare`}
            >
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{bersaglioNome ?? "riga eliminata"}</span>
              <span className="tabular-nums">+{m.offset_days ?? 0}gg ▾</span>
            </button>
          ) : vincolo ? (
            <button
              type="button"
              disabled={!modificabile}
              className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
              title="Questo passo ha un vincolo di precedenza; puoi anche agganciarlo"
            >
              {vincolo.operatore === "prima_di" ? "prima di" : "dopo di"}: {vincolo.evento_nome} ▾
            </button>
          ) : (
            <button
              type="button"
              disabled={!modificabile}
              className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              — si calcola da ▾
            </button>
          )
        }
      />
      {agganciato && modificabile && (
        <Sgancia m={m} certId={certId} cronoId={cronoId} certNome={certNome} onConseguenza={onConseguenza} />
      )}
    </span>
  );
}

/** Sganciare si può, ma va spiegato prima — flusso v2 §3.2.1 punto 5. */
function Sgancia({
  m,
  certId,
  cronoId,
  certNome,
  onConseguenza,
}: {
  m: TimelineMilestone;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
  onConseguenza: (id: string, testo: string) => void;
}) {
  const { toast } = useToast();
  const cambia = useCambiaAncoraggio();
  const [chiedi, setChiedi] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setChiedi(true)}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
        title="Sgancia: la data resta ma non si aggiornerà più"
      >
        <Unlink className="h-3 w-3" />
      </button>
      <AlertDialog open={chiedi} onOpenChange={setChiedi}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sganciare «{m.requirement}»?</AlertDialogTitle>
            <AlertDialogDescription>
              La data resta quella di adesso ({df(m.due_date)}), ma <b>non si aggiornerà più</b> quando
              il progetto si sposta. Potrai riagganciarla in ogni momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await cambia.mutateAsync({
                    milestone_id: m.id,
                    certification_id: certId,
                    requirement: m.requirement,
                    evento_id: null,
                    anchor_order: null,
                    offset_days: null,
                    data_da_congelare: m.due_date,
                    data_precedente: m.due_date,
                    cronoprogramma_id: cronoId,
                    nota: `${certNome ?? "certificazione"} · sganciata, data manuale`,
                  });
                  onConseguenza(m.id, "Sganciata: da ora la data la decidi tu.");
                  toast({ title: "Sganciata", description: "Ora è una data manuale." });
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Errore", description: e.message });
                }
              }}
            >
              Sgancia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
