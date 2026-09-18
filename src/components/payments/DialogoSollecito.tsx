import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useRegistraSollecito, useSolleciti } from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import type { InvoiceRow } from "@/types/payments";

/**
 * Registrare un sollecito.
 *
 * Ogni sollecito è un'azione sulla fattura, non una riga in una lista a parte:
 * è la differenza fra sapere quante volte si è già scritto a quel cliente e
 * doverselo ricordare. Per questo il dialogo mostra prima cosa è già stato
 * tentato — si scrive diversamente al primo sollecito e al terzo.
 */

const CANALI = [
  { id: "email" as const, nome: "Email" },
  { id: "pec" as const, nome: "PEC" },
  { id: "phone" as const, nome: "Telefono" },
];

export function DialogoSollecito({
  fattura,
  aperto,
  onChiudi,
}: {
  fattura: InvoiceRow | null;
  aperto: boolean;
  onChiudi: () => void;
}) {
  const { toast } = useToast();
  const registra = useRegistraSollecito();
  const { data: precedenti = [] } = useSolleciti(aperto && fattura ? fattura.id : null);

  const [canale, setCanale] = useState<"email" | "pec" | "phone">("email");
  const [nota, setNota] = useState("");
  const [prossimo, setProssimo] = useState("");

  useEffect(() => {
    if (aperto) {
      setCanale("email");
      setNota("");
      // Il prossimo sollecito si propone fra una settimana: una data proposta
      // si corregge, una data vuota si dimentica.
      const fra7 = new Date();
      fra7.setDate(fra7.getDate() + 7);
      setProssimo(fra7.toISOString().slice(0, 10));
    }
  }, [aperto]);

  if (!fattura) return null;

  const salva = async () => {
    try {
      await registra.mutateAsync({
        invoice_id: fattura.id,
        channel: canale,
        note: nota.trim() || null,
        prossimo: prossimo || null,
      });
      toast({
        title: "Sollecito registrato",
        description: `${fattura.number} · ${precedenti.length + 1}° sollecito`,
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Sollecito non registrato", description: e.message });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra sollecito</DialogTitle>
          <DialogDescription>
            {fattura.number} · {fattura.client_name ?? "—"} · residuo{" "}
            <b>{importo(fattura.residual, fattura.currency)}</b> · scaduta da{" "}
            {fattura.days_late} giorni
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {precedenti.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Già tentato
              </p>
              <ul className="mt-1 space-y-0.5">
                {precedenti.slice(0, 4).map((s) => (
                  <li key={s.id} className="text-[11.5px] text-muted-foreground">
                    {format(parseISO(s.date), "d MMM", { locale: it })} ·{" "}
                    {CANALI.find((c) => c.id === s.channel)?.nome ?? s.channel}
                    {s.note ? ` · ${s.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label className="text-xs">Canale</Label>
            <div className="mt-1 flex gap-1.5">
              {CANALI.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCanale(c.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                  style={
                    canale === c.id
                      ? { background: "hsl(var(--primary))", color: "#fff", borderColor: "transparent" }
                      : undefined
                  }
                >
                  {c.nome}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Nota</Label>
            <Textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Con chi hai parlato, cosa ti hanno detto"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Prossimo sollecito</Label>
            <Input
              type="date"
              value={prossimo}
              onChange={(e) => setProssimo(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button disabled={registra.isPending} onClick={salva}>
            {registra.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
