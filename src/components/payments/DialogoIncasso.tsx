import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  CAUSALI_DECURTAZIONE, useRegistraDecurtazione, useRegistraIncasso,
} from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import type { InvoiceRow } from "@/types/payments";

/**
 * Registrare un incasso, e quello che non arriverà.
 *
 * Si scrivono fatti — questo giorno sono arrivati questi soldi, di questi altri
 * se n'è presa una fetta la banca — e nient'altro. Nessuno stato da aggiornare,
 * nessuna casella «pagata» da spuntare: il residuo si ricalcola da solo e, se
 * non resta niente, la fattura si chiude, esce dal recall e chi stava
 * sollecitando lo viene a sapere.
 *
 * Le due cose stanno nello stesso dialogo perché sono lo stesso gesto: si
 * guarda l'estratto conto, si vede che su 2.520 sono arrivati 2.463,50, e i
 * 56,50 che mancano non sono un credito — sono la commissione del bonifico.
 * Chiedere due schermate per un bonifico solo vorrebbe dire che la seconda non
 * la apre nessuno, e la fattura resta scoperta per sempre di cinquanta euro.
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
  const decurta = useRegistraDecurtazione();

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [somma, setSomma] = useState("");
  const [metodo, setMetodo] = useState("Bonifico");
  const [riferimento, setRiferimento] = useState("");

  const [taglia, setTaglia] = useState(false);
  const [tagliaSomma, setTagliaSomma] = useState("");
  const [causale, setCausale] = useState<string>("spese_bancarie");
  const [destino, setDestino] = useState<"da_recuperare" | "assorbito">("da_recuperare");
  const [nota, setNota] = useState("");

  // All'apertura si propone il saldo: e' il caso di gran lunga piu' frequente,
  // e chi incassa un acconto lo corregge in un gesto.
  useEffect(() => {
    if (aperto && fattura) {
      setData(new Date().toISOString().slice(0, 10));
      setSomma(String(fattura.residual));
      setMetodo("Bonifico");
      setRiferimento("");
      setTaglia(false);
      setTagliaSomma("");
      setCausale("spese_bancarie");
      setDestino("da_recuperare");
      setNota("");
    }
  }, [aperto, fattura]);

  if (!fattura) return null;

  const numero = (s: string) => Number(String(s).replace(",", "."));

  const valore = somma.trim() === "" ? 0 : numero(somma);
  const incassoValido = somma.trim() === "" || (Number.isFinite(valore) && valore >= 0);

  const tagliato = taglia ? (tagliaSomma.trim() === "" ? 0 : numero(tagliaSomma)) : 0;
  const tagliatoValido = !taglia || (Number.isFinite(tagliato) && tagliato > 0);

  const totale = valore + tagliato;
  // Il limite si dice prima di premere, ma a rifiutare davvero e' il database:
  // questo e' un aiuto, non la garanzia.
  const eccede = totale > fattura.residual + 0.005;
  const serveNota = taglia && causale === "altro" && nota.trim().length < 3;
  const qualcosa = totale > 0;
  const valido = incassoValido && tagliatoValido && qualcosa && !eccede && !serveNota;
  const chiude = valido && totale >= fattura.residual - 0.005;
  const manca = Math.round((fattura.residual - valore) * 100) / 100;
  const inCorso = registra.isPending || decurta.isPending;

  /** Il resto, quando si spunta: il caso quasi sempre giusto. */
  const proponiTaglio = (on: boolean) => {
    setTaglia(on);
    if (on && tagliaSomma.trim() === "" && manca > 0) setTagliaSomma(String(manca));
  };

  const salva = async () => {
    try {
      // Prima l'incasso, poi la decurtazione: il guardiano del database
      // confronta ogni riga col residuo del momento, e invertire l'ordine
      // farebbe rifiutare una coppia che insieme sta dentro.
      if (valore > 0) {
        await registra.mutateAsync({
          invoice_id: fattura.id,
          date: data,
          amount: valore,
          method: metodo.trim() || null,
          bank_ref: riferimento.trim() || null,
        });
      }
      if (tagliato > 0) {
        await decurta.mutateAsync({
          invoice_id: fattura.id,
          date: data,
          amount: tagliato,
          causale,
          destino,
          note: nota.trim() || null,
        });
      }
      toast({
        title: chiude ? "Fattura saldata" : "Registrato",
        description: chiude
          ? `${fattura.number} esce dal recall e i solleciti si chiudono da soli.`
          : `Restano ${importo(fattura.residual - totale, fattura.currency)} su ${fattura.number}.`,
      });
      onChiudi();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Non registrato",
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
              <Label className="text-xs">Incassato ({fattura.currency})</Label>
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

          {/* ── Quello che non arriverà ─────────────────────────────────────
              Compare solo quando c'è un buco: offrirla su una fattura che si
              salda da sola sarebbe suggerire di tagliare qualcosa che nessuno
              ha chiesto di tagliare. */}
          {manca > 0.005 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={taglia}
                  onChange={(e) => proponiTaglio(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-xs leading-snug">
                  <b>I {importo(manca, fattura.currency)} che mancano non sono arrivati.</b>
                  <br />
                  <span className="text-muted-foreground">
                    Commissione bancaria, ritenuta, differenza cambio: il cliente ha pagato,
                    a trattenerne un pezzo è stato un terzo. La fattura si chiude senza dire
                    che quei soldi sono entrati — ma il credito resta.
                  </span>
                </span>
              </label>

              {taglia && (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Importo</Label>
                      <Input
                        inputMode="decimal"
                        value={tagliaSomma}
                        onChange={(e) => setTagliaSomma(e.target.value)}
                        className="mt-1 h-9 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Causale</Label>
                      <Select value={causale} onValueChange={setCausale}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CAUSALI_DECURTAZIONE.map((c) => (
                            <SelectItem key={c.valore} value={c.valore}>
                              {c.etichetta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Il destino, e il default è recuperare: un default che
                      perde denaro è un default sbagliato. Se qualcuno deve fare
                      uno sforzo, che lo faccia per rinunciare a un credito. */}
                  <div>
                    <Label className="text-xs">Che fine fa</Label>
                    <Select
                      value={destino}
                      onValueChange={(v) => setDestino(v as "da_recuperare" | "assorbito")}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="da_recuperare">
                          Da recuperare sulla prossima fattura
                        </SelectItem>
                        <SelectItem value="assorbito">Assorbito — è una perdita</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {destino === "da_recuperare"
                        ? "Resterà segnalato finché la prossima fattura di questo progetto non lo porterà a compensazione."
                        : "La partita si chiude qui: questi soldi escono dai conti e nessuno li chiederà più."}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Nota {causale === "altro" && <span className="text-destructive">·  obbligatoria</span>}
                    </Label>
                    <Input
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      placeholder="Commissione trattenuta dalla banca del cliente"
                      className="mt-1 h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {eccede && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Su questa fattura restano {importo(fattura.residual, fattura.currency)}. Incasso e
              decurtazione insieme non possono superarli: se sono arrivati più soldi del dovuto è
              un fatto da guardare, non da far sparire nel residuo.
            </p>
          )}
          {serveNota && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              «Altro» senza una spiegazione non è una causale. Fra un anno questa riga dovrà
              ancora dire perché quei soldi non sono arrivati.
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
          <Button disabled={!valido || inCorso} onClick={salva}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
