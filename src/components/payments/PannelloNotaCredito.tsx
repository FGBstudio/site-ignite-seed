import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search } from "lucide-react";
import { usePaymentsCtx } from "@/pages/payments/PaymentsLayout";
import { useEmettiNotaCredito } from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import type { InvoiceRow } from "@/types/payments";

/**
 * Nuova nota di credito.
 *
 * Si sceglie fra le sole fatture che hanno ancora residuo: stornare una fattura
 * già chiusa non vuol dire niente, e mostrarla in elenco sarebbe un invito a
 * sbagliare.
 *
 * L'anteprima dell'effetto non è un vezzo: una nota di credito riduce il
 * fatturato, e vedere il numero dopo prima di premere è l'unico modo per
 * accorgersi di uno zero di troppo mentre si può ancora correggere.
 */
export function PannelloNotaCredito({
  aperto,
  onChiudi,
  motivi,
}: {
  aperto: boolean;
  onChiudi: () => void;
  motivi: string[];
}) {
  const { fatture } = usePaymentsCtx();
  const { toast } = useToast();
  const emetti = useEmettiNotaCredito();

  const [cerca, setCerca] = useState("");
  const [sceltaId, setSceltaId] = useState("");
  const [somma, setSomma] = useState("");
  const [tipo, setTipo] = useState<"total" | "partial">("partial");
  const [motivo, setMotivo] = useState(motivi[0] ?? "");

  const candidate = useMemo(
    () => fatture.filter((f) => f.residual > 0),
    [fatture],
  );

  const elenco = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return candidate.slice(0, 40);
    return candidate
      .filter((f) =>
        `${f.number} ${f.client_name ?? ""} ${f.project_name ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [candidate, cerca]);

  const scelta: InvoiceRow | null = useMemo(
    () => fatture.find((f) => f.id === sceltaId) ?? null,
    [fatture, sceltaId],
  );

  useEffect(() => {
    if (aperto) {
      setCerca("");
      setSceltaId("");
      setSomma("");
      setTipo("partial");
      setMotivo(motivi[0] ?? "");
    }
  }, [aperto, motivi]);

  // Scegliere «totale» vuol dire stornare tutto quello che resta: l'importo lo
  // sa già il sistema, e lasciarlo scrivere a mano aprirebbe solo la porta a
  // una totale che non copre il totale.
  useEffect(() => {
    if (tipo === "total" && scelta) setSomma(String(scelta.residual));
  }, [tipo, scelta]);

  const valore = Number(String(somma).replace(",", "."));
  const valido = !!scelta && Number.isFinite(valore) && valore > 0;
  const eccede = valido && scelta! && valore > scelta.residual + 0.005;
  const dopo = scelta ? Math.max(scelta.residual - (valido ? valore : 0), 0) : 0;

  const salva = async (bozza: boolean) => {
    if (!scelta) return;
    try {
      await emetti.mutateAsync({
        invoice_id: scelta.id,
        amount: valore,
        kind: tipo,
        reason: motivo || null,
        bozza,
      });
      toast({
        title: bozza ? "Bozza salvata" : "Nota di credito emessa",
        description: bozza
          ? "Non tocca ancora nessun totale: lo farà quando la emetti."
          : dopo <= 0
            ? `${scelta.number} è chiusa.`
            : `Su ${scelta.number} restano ${importo(dopo, scelta.currency)}.`,
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non è stato possibile", description: e.message });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuova nota di credito</DialogTitle>
          <DialogDescription>
            Solo fatture con residuo. L'importo non può superarlo: il database lo rifiuta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* ── Quale fattura ── */}
          {!scelta ? (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={cerca}
                  onChange={(e) => setCerca(e.target.value)}
                  placeholder="Cerca numero, cliente, progetto…"
                  className="h-9 pl-8"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                {elenco.length === 0 ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    Nessuna fattura con residuo.
                  </p>
                ) : (
                  elenco.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSceltaId(f.id)}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="text-xs font-semibold tabular-nums">{f.number}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {f.client_name ?? "—"} · {f.project_name ?? "—"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {importo(f.residual, f.currency)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              {/* ── Com'è messa la fattura scelta ── */}
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{scelta.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {scelta.client_name ?? "—"} · {scelta.project_name ?? "—"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSceltaId("")}>
                    Cambia
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs tabular-nums">
                  <span>
                    <span className="text-muted-foreground">Totale </span>
                    {importo(scelta.total, scelta.currency)}
                  </span>
                  <span>
                    <span className="text-muted-foreground">Incassato </span>
                    {importo(scelta.paid_amount, scelta.currency)}
                  </span>
                  <span className="font-semibold">
                    <span className="font-normal text-muted-foreground">Residuo </span>
                    {importo(scelta.residual, scelta.currency)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <div className="mt-1 flex gap-1.5">
                    {(["partial", "total"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipo(t)}
                        className="rounded-full border px-3 py-1 text-xs font-medium"
                        style={
                          tipo === t
                            ? { background: "#7a4fb0", color: "#fff", borderColor: "transparent" }
                            : undefined
                        }
                      >
                        {t === "total" ? "Totale" : "Parziale"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Importo ({scelta.currency})</Label>
                  <Input
                    inputMode="decimal"
                    value={somma}
                    onChange={(e) => setSomma(e.target.value)}
                    disabled={tipo === "total"}
                    className="mt-1 h-9 tabular-nums disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Motivo</Label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {motivi.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Cosa succede se premi ── */}
              {valido && !eccede && (
                <div className="rounded-lg border p-3 text-xs" style={{ background: "#f1eaf9", borderColor: "#7a4fb0" }}>
                  <p className="tabular-nums">
                    Residuo {importo(scelta.residual, scelta.currency)} →{" "}
                    <b>{importo(dopo, scelta.currency)}</b>
                    {dopo <= 0 && " · la fattura si chiude"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Il fatturato netto scende di {importo(valore, scelta.currency)}.
                  </p>
                </div>
              )}

              {eccede && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                  Su questa fattura restano {importo(scelta.residual, scelta.currency)}. Una nota
                  più alta renderebbe la fattura un debito verso il cliente: il database la
                  rifiuta.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variant="secondary"
            disabled={!valido || eccede || emetti.isPending}
            onClick={() => salva(true)}
          >
            Salva bozza
          </Button>
          <Button disabled={!valido || eccede || emetti.isPending} onClick={() => salva(false)}>
            {emetti.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Emetti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
