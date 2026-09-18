import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useRegistraIncasso } from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import type { InvoiceRow } from "@/types/payments";

/**
 * Registrare un incasso.
 *
 * Si scrive un fatto — questo giorno sono arrivati questi soldi — e nient'altro.
 * Nessuno stato da aggiornare, nessuna casella «pagata» da spuntare: il residuo
 * si ricalcola da solo e, se non resta niente, la fattura si chiude, esce dal
 * recall e chi stava sollecitando lo viene a sapere.
 */
export function DialogoIncasso({
  fattura,
  aperto,
  onChiudi,
}: {
  fattura: InvoiceRow | null;
  aperto: boolean;
  onChiudi: () => void;
}) {
  const { toast } = useToast();
  const registra = useRegistraIncasso();

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [somma, setSomma] = useState("");
  const [metodo, setMetodo] = useState("Bonifico");
  const [riferimento, setRiferimento] = useState("");

  // All'apertura si propone il saldo: e' il caso di gran lunga piu' frequente,
  // e chi incassa un acconto lo corregge in un gesto.
  useEffect(() => {
    if (aperto && fattura) {
      setData(new Date().toISOString().slice(0, 10));
      setSomma(String(fattura.residual));
      setMetodo("Bonifico");
      setRiferimento("");
    }
  }, [aperto, fattura]);

  if (!fattura) return null;

  const valore = Number(String(somma).replace(",", "."));
  const valido = Number.isFinite(valore) && valore > 0;
  // Il limite si dice prima di premere, ma a rifiutare davvero e' il database:
  // questo e' un aiuto, non la garanzia.
  const eccede = valido && valore > fattura.residual + 0.005;
  const chiude = valido && !eccede && valore >= fattura.residual - 0.005;

  const salva = async () => {
    try {
      await registra.mutateAsync({
        invoice_id: fattura.id,
        date: data,
        amount: valore,
        method: metodo.trim() || null,
        bank_ref: riferimento.trim() || null,
      });
      toast({
        title: chiude ? "Incasso registrato: fattura saldata" : "Incasso registrato",
        description: chiude
          ? `${fattura.number} esce dal recall e i solleciti si chiudono da soli.`
          : `Restano ${importo(fattura.residual - valore, fattura.currency)} su ${fattura.number}.`,
      });
      onChiudi();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Incasso non registrato",
        description: e.message ?? "Errore sconosciuto",
      });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra incasso</DialogTitle>
          <DialogDescription>
            {fattura.number} · {fattura.client_name ?? "—"} · residuo{" "}
            <b>{importo(fattura.residual, fattura.currency)}</b>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Importo ({fattura.currency})</Label>
              <Input
                inputMode="decimal"
                value={somma}
                onChange={(e) => setSomma(e.target.value)}
                className="mt-1 h-9 tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Metodo</Label>
              <Input
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                placeholder="Bonifico"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Riferimento</Label>
              <Input
                value={riferimento}
                onChange={(e) => setRiferimento(e.target.value)}
                placeholder="HSBC ····4102"
                className="mt-1 h-9"
              />
            </div>
          </div>

          {eccede && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Su questa fattura restano {importo(fattura.residual, fattura.currency)}. Un incasso
              più alto viene rifiutato: se sono arrivati più soldi del dovuto è un fatto da
              guardare, non da far sparire nel residuo.
            </p>
          )}
          {chiude && !eccede && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900">
              Salda la fattura: uscirà dal recall e i solleciti aperti si chiuderanno da soli.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button disabled={!valido || eccede || registra.isPending} onClick={salva}>
            {registra.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
