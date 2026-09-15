import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Link2, Minus, Plus, Unlink } from "lucide-react";
import {
  ANCORA_NOME,
  naturaPasso,
  type CronoEvento,
  type TimelineMilestone,
} from "@/types/cronoprogramma";
import { useCambiaAncoraggio } from "@/hooks/useCronoprogramma";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/** La data di una riga di progetto: la fine se e' una fase, l'inizio se no. */
export function dataRiga(e: CronoEvento): string | null {
  return e.data_effettiva ?? e.data_fine ?? e.data_pianificata ?? null;
}

/**
 * La colonna «Ancorato a» e l'esperienza di ancoraggio — flusso v2 §3.2 e §3.2.1.
 *
 * Il riferimento dichiarato e' il collegamento predecessore/successore di
 * Microsoft Project, ridotto al nostro caso: una riga di progetto piu' un
 * offset in giorni. Da li' vengono le quattro cose che contano:
 *
 *  1. il linguaggio e' una frase, non un codice — «Si calcola da: Handover
 *     (15 mar 27) + 60 giorni → 14 mag 27»;
 *  2. il selettore mostra bersagli veri: **solo** le righe della project
 *     timeline di questo sito, con la loro data, e passandoci sopra il nodo
 *     pulsa sul pannello (e' il punto sbagliato prima: elencava passi di
 *     certificazione, che non sono bersagli);
 *  3. la data risultante si vede **prima** di confermare;
 *  4. sganciare e' possibile ma spiegato, e mantiene il valore.
 */

interface Props {
  m: TimelineMilestone;
  eventi: CronoEvento[];
  vincolo: { operatore: string; ancora: string } | undefined;
  modificabile: boolean;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
  tinta: string;
  /** Accende il nodo corrispondente sul pannello mentre si sceglie. */
  onAnteprimaAncora: (eventoId: string | null) => void;
  onConseguenza: (milestoneId: string, testo: string) => void;
}

export function AncoratoA({
  m,
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
  if (nat === "auto") {
    return <span className="text-[11px] text-muted-foreground">da spedizione</span>;
  }
  if (nat === "serie") {
    return (
      <span className="text-[11px] text-muted-foreground">
        mensile · da Construction start a Handover
      </span>
    );
  }

  const agganciato = !!m.crono_evento_id;
  const riga = eventi.find((e) => e.id === m.crono_evento_id);

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {agganciato ? (
        <>
          <Selettore
            m={m}
            eventi={eventi}
            modificabile={modificabile}
            certId={certId}
            cronoId={cronoId}
            certNome={certNome}
            tinta={tinta}
            onAnteprimaAncora={onAnteprimaAncora}
            onConseguenza={onConseguenza}
            trigger={
              <button
                type="button"
                disabled={!modificabile}
                className="inline-flex max-w-[210px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
                style={{ borderColor: tinta, color: tinta }}
                title={`${riga?.nome ?? "?"} + ${m.offset_days ?? 0} giorni — clicca per vedere o cambiare`}
              >
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{riga?.nome ?? "riga eliminata"}</span>
                <span className="tabular-nums">+{m.offset_days ?? 0}gg ▾</span>
              </button>
            }
          />
          <Sgancia
            m={m}
            certId={certId}
            cronoId={cronoId}
            certNome={certNome}
            modificabile={modificabile}
            onConseguenza={onConseguenza}
          />
        </>
      ) : vincolo ? (
        <span className="text-[11px] text-muted-foreground">
          {vincolo.operatore === "prima_di" ? "prima di" : "dopo di"}:{" "}
          {ANCORA_NOME[vincolo.ancora as keyof typeof ANCORA_NOME] ?? vincolo.ancora}
        </span>
      ) : (
        <Selettore
          m={m}
          eventi={eventi}
          modificabile={modificabile}
          certId={certId}
          cronoId={cronoId}
          certNome={certNome}
          tinta={tinta}
          onAnteprimaAncora={onAnteprimaAncora}
          onConseguenza={onConseguenza}
          trigger={
            <button
              type="button"
              disabled={!modificabile}
              className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              — si calcola da ▾
            </button>
          }
        />
      )}
    </span>
  );
}

function Selettore({
  m,
  eventi,
  modificabile,
  certId,
  cronoId,
  certNome,
  tinta,
  onAnteprimaAncora,
  onConseguenza,
  trigger,
}: Omit<Props, "vincolo"> & { trigger: React.ReactNode }) {
  const { toast } = useToast();
  const cambia = useCambiaAncoraggio();
  const [aperto, setAperto] = useState(false);
  const [scelta, setScelta] = useState<string | null>(m.crono_evento_id);
  const [offset, setOffset] = useState<number>(m.offset_days ?? 0);

  // Bersagli veri: solo le righe della project timeline che hanno una data.
  const bersagli = useMemo(
    () => eventi.filter((e) => dataRiga(e) !== null),
    [eventi]
  );
  const rigaScelta = bersagli.find((e) => e.id === scelta);
  const base = rigaScelta ? dataRiga(rigaScelta) : null;
  const risultato = base
    ? format(new Date(new Date(`${base}T12:00:00`).getTime() + offset * 86400000), "d LLL yy", { locale: it })
    : null;

  if (!modificabile) return <>{trigger}</>;

  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o);
        if (o) {
          setScelta(m.crono_evento_id);
          setOffset(m.offset_days ?? 0);
        } else {
          onAnteprimaAncora(null);
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-3">
        <p className="mb-2 text-sm font-medium">{m.requirement}</p>

        {bersagli.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nessuna riga della project timeline ha ancora una data: dagliene una e potrai agganciare
            questo passo.
          </p>
        ) : (
          <>
            <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Si calcola da
            </p>
            <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {bersagli.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseEnter={() => onAnteprimaAncora(e.id)}
                  onFocus={() => onAnteprimaAncora(e.id)}
                  onMouseLeave={() => onAnteprimaAncora(scelta)}
                  onClick={() => {
                    setScelta(e.id);
                    onAnteprimaAncora(e.id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted",
                    scelta === e.id && "bg-muted font-medium"
                  )}
                >
                  <span className="min-w-0 truncate">
                    {e.nome}
                    {e.ancora && <span className="ml-1 text-[9px] text-muted-foreground">●</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{df(dataRiga(e))}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => setOffset((o) => Math.max(0, o - 5))} className="rounded border p-1 hover:bg-muted" aria-label="Meno cinque giorni">
                <Minus className="h-3 w-3" />
              </button>
              <Input
                type="number"
                value={offset}
                onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-20 text-center text-xs"
                aria-label="Giorni di scarto"
              />
              <span className="text-xs text-muted-foreground">giorni dopo</span>
              <button type="button" onClick={() => setOffset((o) => o + 5)} className="rounded border p-1 hover:bg-muted" aria-label="Piu' cinque giorni">
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* La frase, non il codice. E la conseguenza si vede prima. */}
            <p className="mt-3 text-xs">
              Si calcola da <b>{rigaScelta?.nome ?? "—"}</b>
              {base && <span className="text-muted-foreground"> ({df(base)})</span>} + {offset} giorni →{" "}
              <b style={{ color: tinta }}>{risultato ?? "—"}</b>
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              D'ora in poi, se «{rigaScelta?.nome ?? "questa riga"}» si sposta, questa data si
              ricalcola da sola.
            </p>

            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAperto(false)}>
                Annulla
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!scelta || cambia.isPending}
                onClick={async () => {
                  try {
                    await cambia.mutateAsync({
                      milestone_id: m.id,
                      certification_id: certId,
                      requirement: m.requirement,
                      evento_id: scelta,
                      offset_days: offset,
                      data_precedente: m.due_date,
                      cronoprogramma_id: cronoId,
                      nota: `${certNome ?? "certificazione"} · collegata a ${rigaScelta?.nome ?? ""}`,
                    });
                    setAperto(false);
                    onAnteprimaAncora(null);
                    onConseguenza(
                      m.id,
                      `D'ora in poi, se «${rigaScelta?.nome}» si sposta, questa data si ricalcola da sola.`
                    );
                    toast({ title: "Collegata", description: "Si aggiornerà con la project timeline." });
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Errore", description: e.message });
                  }
                }}
              >
                Applica collegamento
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Sganciare si puo', ma va spiegato prima — §3.2.1 punto 5. */
function Sgancia({
  m,
  certId,
  cronoId,
  certNome,
  modificabile,
  onConseguenza,
}: {
  m: TimelineMilestone;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
  modificabile: boolean;
  onConseguenza: (id: string, testo: string) => void;
}) {
  const { toast } = useToast();
  const cambia = useCambiaAncoraggio();
  const [chiedi, setChiedi] = useState(false);
  if (!modificabile) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setChiedi(true)}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
        title="Sgancia: la data resta ma non si aggiornerà più"
      >
        <Unlink className="h-3 w-3" /> Sgancia
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
