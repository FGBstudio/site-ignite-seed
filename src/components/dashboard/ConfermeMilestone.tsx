import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarClock, Loader2, Stamp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useConfermaMilestone,
  useConfermeMilestone,
  useRinviaMilestone,
  type ConfermaMilestone,
} from "@/hooks/useConfermeMilestone";

/**
 * Le milestone che aspettano il timbro, prima che una fattura parta.
 *
 * Il caso vero: il tempo scorre, la timeline fa considerare raggiunto un
 * traguardo, Payments emette. Ma quella milestone era stata spostata in avanti e
 * nessuno l'ha aggiornata — e il cliente riceve una fattura per un lavoro non
 * fatto. Non ha sbagliato nessuno a mano: l'automatismo ha fatto esattamente
 * quello che gli era stato detto.
 *
 * Qui ci sono le due risposte, e la seconda conta quanto la prima. **È
 * raggiunta** manda l'avviso a Payments, che prima partiva da solo. **Non lo è**
 * sposta la data: senza questa strada l'unico modo di non confermare sarebbe
 * ignorare l'avviso, e un avviso ignorato torna domani identico.
 */

const g = (iso: string | null) =>
  iso ? format(parseISO(iso), "d MMM", { locale: it }) : "—";

export function ConfermeMilestone({ pmId }: { pmId: string | null | undefined }) {
  const { data: conferme = [], isLoading } = useConfermeMilestone(pmId);

  // Niente da timbrare: la sezione non si mostra affatto. Un riquadro vuoto in
  // cima alla dashboard è spazio che si impara a saltare.
  if (isLoading || conferme.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardContent className="p-0">
        <header className="flex items-center gap-2 border-b border-warning/30 bg-warning/5 px-4 py-3">
          <Stamp className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold">Da confermare prima che parta la fattura</h3>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {conferme.length}
          </span>
        </header>
        <p className="border-b px-4 py-2 text-[11.5px] text-muted-foreground">
          Il sistema le considera raggiunte. Finché non lo confermi tu, a Payments non arriva
          niente e nessuna fattura viene emessa.
        </p>
        <ul className="divide-y">
          {conferme.map((c) => (
            <Riga key={c.alert_id} c={c} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Riga({ c }: { c: ConfermaMilestone }) {
  const { toast } = useToast();
  const conferma = useConfermaMilestone();
  const rinvia = useRinviaMilestone();
  const [spostando, setSpostando] = useState(false);
  const [nuovaData, setNuovaData] = useState("");

  const timbra = async () => {
    try {
      const quante = await conferma.mutateAsync({
        milestone_id: c.milestone_id,
        tranche_id: c.tranche_id,
      });
      toast({
        title: "Confermata",
        description:
          quante > 0
            ? `${quante === 1 ? "Una tranche" : `${quante} tranche`} ora è esigibile: Payments la vede in «Da Emettere».`
            : "Nessuna tranche da sbloccare: era già stata fatturata.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non confermata", description: e.message });
    }
  };

  const sposta = async () => {
    if (!nuovaData) return;
    try {
      await rinvia.mutateAsync({
        milestone_id: c.milestone_id,
        nuova_data: nuovaData,
        motivo: "Rinviata dal PM invece di confermare il raggiungimento",
      });
      toast({
        title: "Data spostata",
        description: `La milestone torna in attesa al ${g(nuovaData)}. Nessuna fattura è partita.`,
      });
      setSpostando(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non spostata", description: e.message });
    }
  };

  const inCorso = conferma.isPending || rinvia.isPending;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{c.titolo}</p>
          {c.descrizione && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{c.descrizione}</p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            prevista {g(c.quando)}
            {c.cliente && <> · {c.cliente}</>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" disabled={inCorso} onClick={timbra}>
            {conferma.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            È raggiunta
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={inCorso}
            onClick={() => setSpostando((v) => !v)}
          >
            Non ancora
          </Button>
        </div>
      </div>

      {/* ── Spostare la data ────────────────────────────────────────────────
          «Non ancora» da solo non è una risposta: la milestone resterebbe a
          chiedere la stessa cosa domani. Serve il quando. */}
      {spostando && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2.5">
          <span className="text-[11.5px] text-muted-foreground">Quando sarà raggiunta?</span>
          <Input
            type="date"
            value={nuovaData}
            onChange={(e) => setNuovaData(e.target.value)}
            className="h-8 w-[150px] text-[12px]"
          />
          <Button size="sm" variant="secondary" disabled={!nuovaData || inCorso} onClick={sposta}>
            {rinvia.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Sposta
          </Button>
          <span className="text-[11px] text-muted-foreground">
            La milestone torna in attesa e la richiesta si chiude.
          </span>
        </div>
      )}
    </li>
  );
}
