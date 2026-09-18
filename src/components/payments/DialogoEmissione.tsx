import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import {
  useClientiDelBrand,
  useCommesseFatturabili,
  useEmettiFattura,
  useEntita,
  useTrancheDue,
} from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import type { Currency } from "@/types/payments";

/**
 * Emettere una fattura.
 *
 * Quasi tutto e' gia' noto: partendo dalla commessa arrivano cliente, importo e
 * termini senza ridigitarli — ridigitarli vorrebbe dire creare una seconda
 * versione di dati che il sistema ha gia'.
 *
 * Il numero non c'e' fra i campi: lo assegna il database all'emissione. Un
 * progressivo scelto a mano e' un progressivo che prima o poi si ripete.
 */
export function DialogoEmissione({
  aperto,
  onChiudi,
}: {
  aperto: boolean;
  onChiudi: () => void;
}) {
  const { toast } = useToast();
  const emetti = useEmettiFattura();
  const { data: entita = [] } = useEntita();
  const { data: commesse = [] } = useCommesseFatturabili();

  const [emittenteId, setEmittenteId] = useState("");
  const [certId, setCertId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [trancheId, setTrancheId] = useState("");
  const [valuta, setValuta] = useState<Currency>("EUR");
  const [tasso, setTasso] = useState("1");
  const [totale, setTotale] = useState("");
  const [iva, setIva] = useState("");
  const [dataEmissione, setDataEmissione] = useState(() => new Date().toISOString().slice(0, 10));
  const [giorni, setGiorni] = useState("30");
  const [numeroEsterno, setNumeroEsterno] = useState("");
  const [nuovoCliente, setNuovoCliente] = useState(false);

  const commessa = useMemo(() => commesse.find((c) => c.id === certId) ?? null, [commesse, certId]);
  const brandId = commessa?.sites?.brand_id ?? null;
  const { data: clienti = [] } = useClientiDelBrand(brandId);
  const { data: tranche = [] } = useTrancheDue(certId || null);

  useEffect(() => {
    if (!aperto) return;
    setEmittenteId(entita.length === 1 ? entita[0].id : "");
    setCertId("");
    setClienteId("");
    setTrancheId("");
    setValuta("EUR");
    setTasso("1");
    setTotale("");
    setIva("");
    setDataEmissione(new Date().toISOString().slice(0, 10));
    setGiorni("30");
    setNumeroEsterno("");
  }, [aperto, entita]);

  // Scelta la commessa, si portano dietro le cose che gia' si sanno.
  useEffect(() => {
    if (!commessa) return;
    setClienteId(commessa.billing_contact_id ?? "");
    if (commessa.currency) setValuta(commessa.currency as Currency);
    setTotale(commessa.total_fees ? String(commessa.total_fees) : "");
  }, [commessa]);

  // Scelta la tranche, l'importo e' il suo: e' quello il pezzo da fatturare.
  useEffect(() => {
    const t = tranche.find((x) => x.id === trancheId);
    if (t?.amount) setTotale(String(t.amount));
  }, [trancheId, tranche]);

  const valoreTotale = Number(String(totale).replace(",", "."));
  const pronta =
    !!emittenteId && Number.isFinite(valoreTotale) && valoreTotale > 0 && !!dataEmissione;

  const scadenza = useMemo(() => {
    if (!dataEmissione) return null;
    const d = new Date(dataEmissione);
    d.setDate(d.getDate() + (Number(giorni) || 0));
    return d.toISOString().slice(0, 10);
  }, [dataEmissione, giorni]);

  const salva = async () => {
    try {
      const f = await emetti.mutateAsync({
        issuer_contact_id: emittenteId,
        total: valoreTotale,
        issue_date: dataEmissione,
        payment_terms_days: Number(giorni) || 30,
        client_contact_id: clienteId || null,
        certification_id: certId || null,
        tranche_id: trancheId || null,
        currency: valuta,
        exch_rate: Number(String(tasso).replace(",", ".")) || 1,
        vat_amount: Number(String(iva).replace(",", ".")) || 0,
        external_number: numeroEsterno || null,
      });
      toast({
        title: `Fattura ${f?.number ?? ""} emessa`,
        description: `Scadenza ${scadenza} · il numero è stato assegnato dal sistema.`,
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fattura non emessa", description: e.message });
    }
  };

  return (
    <>
      <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuova fattura</DialogTitle>
            <DialogDescription>
              Il numero lo assegna il sistema all'emissione. La scadenza si calcola dalla data
              di emissione reale, non dall'approvazione della quotazione.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* ── Chi emette e per cosa ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Società che emette</Label>
                <select
                  value={emittenteId}
                  onChange={(e) => setEmittenteId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Scegli…</option>
                  {entita.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.company_name}
                      {e.entity_code ? ` · ${e.entity_code.toUpperCase()}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Commessa (facoltativa)</Label>
                <select
                  value={certId}
                  onChange={(e) => {
                    setCertId(e.target.value);
                    setTrancheId("");
                  }}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Nessuna — fattura libera</option>
                  {commesse.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client ?? "—"} · {c.name ?? c.sites?.name ?? "—"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── La tranche da fatturare ── */}
            {certId && tranche.length > 0 && (
              <div>
                <Label className="text-xs">Tranche da emettere</Label>
                <select
                  value={trancheId}
                  onChange={(e) => setTrancheId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Nessuna — importo libero</option>
                  {tranche.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? `Tranche ${t.tranche_order}`}
                      {t.amount ? ` · ${importo(t.amount, valuta)}` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Scegliendola, il «da emettere» si chiude da solo quando la fattura è creata.
                </p>
              </div>
            )}

            {/* ── A chi ── */}
            <div>
              <Label className="text-xs">Società cliente</Label>
              <div className="mt-1 flex gap-2">
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  disabled={!brandId}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                >
                  <option value="">
                    {brandId ? "Scegli la società…" : "Scegli prima una commessa"}
                  </option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                      {c.vat_number ? ` · ${c.vat_number}` : ""}
                    </option>
                  ))}
                </select>
                {/* Se la società non era stata confermata in offerta si crea qui,
                    senza uscire dall'emissione e perdere quello che si è scritto. */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!brandId}
                  onClick={() => setNuovoCliente(true)}
                  className="shrink-0"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nuova
                </Button>
              </div>
            </div>

            {/* ── Quanto ── */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Valuta</Label>
                <select
                  value={valuta}
                  onChange={(e) => setValuta(e.target.value as Currency)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {(["EUR", "GBP", "CNY", "USD"] as Currency[]).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Totale</Label>
                <Input
                  inputMode="decimal"
                  value={totale}
                  onChange={(e) => setTotale(e.target.value)}
                  className="mt-1 h-9 tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">di cui IVA</Label>
                <Input
                  inputMode="decimal"
                  value={iva}
                  onChange={(e) => setIva(e.target.value)}
                  placeholder="0"
                  className="mt-1 h-9 tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">Cambio in EUR</Label>
                <Input
                  inputMode="decimal"
                  value={tasso}
                  onChange={(e) => setTasso(e.target.value)}
                  disabled={valuta === "EUR"}
                  className="mt-1 h-9 tabular-nums disabled:opacity-50"
                />
              </div>
            </div>

            {/* ── Quando ── */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Data di emissione</Label>
                <Input
                  type="date"
                  value={dataEmissione}
                  onChange={(e) => setDataEmissione(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Termini (giorni)</Label>
                <Input
                  inputMode="numeric"
                  value={giorni}
                  onChange={(e) => setGiorni(e.target.value)}
                  className="mt-1 h-9 tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">N° del commercialista</Label>
                <Input
                  value={numeroEsterno}
                  onChange={(e) => setNumeroEsterno(e.target.value)}
                  placeholder="facoltativo"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            {scadenza && (
              <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                Scade il <b className="tabular-nums text-foreground">{scadenza}</b>. Passata
                quella data, senza incasso la fattura entra da sola in Recall.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onChiudi}>
              Annulla
            </Button>
            <Button disabled={!pronta || emetti.isPending} onClick={salva}>
              {emetti.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Emetti fattura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactFormDialog
        open={nuovoCliente}
        onOpenChange={setNuovoCliente}
        defaultKind="client"
        defaultBrandId={brandId}
      />
    </>
  );
}
