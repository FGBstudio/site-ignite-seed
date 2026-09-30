import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useClientiTutti } from "@/hooks/usePayments";
import { useCancellaProgetto, useCreditoDaCancellazione } from "@/hooks/useCreditiCliente";
import { importo } from "@/lib/payments/aggregati";
import { numero } from "@/lib/payments/righeFattura";

/**
 * Cancellare un progetto — e decidere cosa resta al cliente.
 *
 * Prima cancellare voleva dire cambiare uno stato in una tendina, e se il cliente
 * aveva pagato più di quello che gli era stato consegnato quella differenza
 * restava in una mail. Diciotto mesi dopo, all'offerta nuova, non se la ricordava
 * nessuno.
 *
 * Il sistema sa già quanto è stato incassato e quante tranche erano state
 * consegnate, quindi **propone** una cifra. Proposta, non imposta: quanto
 * trattenere di un progetto interrotto è una trattativa, e chi cancella deve
 * poterla scrivere.
 *
 * Le certificazioni possono essere più di una — dal form di Operations si
 * cancella il sito con tutto quello che ci sta sopra — ma **il credito è uno**:
 * a pagare è una società, e a lei si riconosce una cifra sola.
 */
export function DialogoCancellazione({
  aperto,
  onChiudi,
  certificationIds,
  nomeProgetto,
  onCancellato,
}: {
  aperto: boolean;
  onChiudi: () => void;
  /** Le certificazioni da cancellare: quelle che il chiamante stava modificando. */
  certificationIds: string[];
  nomeProgetto?: string | null;
  /** Chiamato dopo la cancellazione: serve a chi deve chiudere una schermata. */
  onCancellato?: () => void;
}) {
  const { toast } = useToast();
  const cancella = useCancellaProgetto();
  const { data: conti = [], isLoading } = useCreditoDaCancellazione(
    aperto ? certificationIds : [],
  );
  const { data: clienti = [] } = useClientiTutti();

  /** Se c'è un credito o no: è la prima decisione, e non ha una risposta ovvia. */
  const [conCredito, setConCredito] = useState(false);
  const [cifra, setCifra] = useState("");
  const [motivo, setMotivo] = useState("progetto cancellato a metà");
  const [clienteId, setClienteId] = useState("");
  const [note, setNote] = useState("");

  /**
   * Il conto, sommato su tutte le certificazioni.
   *
   * Sommare è corretto perché il cliente è uno: quello che ha pagato e quello che
   * ha ricevuto sono due totali, e la differenza fra loro è la sua.
   */
  const totale = useMemo(() => {
    const somma = (f: (c: (typeof conti)[number]) => number) =>
      conti.reduce((s, c) => s + (Number(f(c)) || 0), 0);
    return {
      incassato: somma((c) => c.incassato),
      consegnato: somma((c) => c.consegnato),
      quante_consegnate: somma((c) => c.quante_consegnate),
      quante_tranche: somma((c) => c.quante_tranche),
      differenza: Math.max(
        Math.round((somma((c) => c.incassato) - somma((c) => c.consegnato)) * 100) / 100,
        0,
      ),
      giaRegistrato: somma((c) => c.credito_gia_registrato ?? 0),
      valuta: conti[0]?.valuta ?? "EUR",
      intestatario: conti.find((c) => c.billing_contact_id)?.billing_contact_id ?? "",
      giaCancellati: conti.filter((c) => c.status === "canceled").length,
    };
  }, [conti]);

  useEffect(() => {
    if (!aperto || conti.length === 0) return;
    // La proposta è spuntata solo se c'è davvero una differenza: aprire con
    // «credito di 0,00» già scelto è un invito a premere avanti senza leggere.
    setConCredito(totale.differenza > 0);
    setCifra(totale.differenza > 0 ? String(totale.differenza) : "");
    setMotivo("progetto cancellato a metà");
    setClienteId(totale.intestatario);
    setNote("");
    // `totale` è ricalcolato da `conti`: dipendere da entrambi riaprirebbe il
    // reset a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, conti]);

  const valore = numero(cifra);
  const pronta =
    certificationIds.length > 0 &&
    (!conCredito || (valore > 0 && motivo.trim() !== "" && !!clienteId));

  const esegui = async () => {
    try {
      // Il credito va su una sola chiamata: registrarlo su ciascuna
      // certificazione lo moltiplicherebbe per il numero di schemi del sito.
      for (const [i, id] of certificationIds.entries()) {
        await cancella.mutateAsync({
          certification_id: id,
          credito: i === 0 && conCredito ? valore : 0,
          motivo: i === 0 && conCredito ? motivo.trim() : null,
          contact_id: i === 0 && conCredito ? clienteId : null,
          note: note.trim() || null,
        });
      }
      toast({
        title:
          certificationIds.length > 1
            ? `${certificationIds.length} certificazioni cancellate`
            : "Progetto cancellato",
        description: conCredito
          ? `Registrato un credito di ${importo(valore, totale.valuta)} al cliente.`
          : "Nessun credito: trattenuto per intero.",
      });
      onCancellato?.();
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non cancellato", description: e.message });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Cancelli «{nomeProgetto ?? conti[0]?.progetto ?? "questo progetto"}»
            {certificationIds.length > 1 && ` e altre ${certificationIds.length - 1} certificazioni`}
          </DialogTitle>
          <DialogDescription>
            Se il cliente ha pagato più di quello che gli è stato consegnato, quella differenza
            è sua. Registrarla adesso è l'unico momento in cui qualcuno se la ricorda.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Calcolo in corso…</p>
        ) : (
          <div className="grid gap-4">
            {/* ── Il conto, per esteso ──────────────────────────────────────
                Non è un numero da credere sulla parola: è una sottrazione fra
                due cose che il sistema sa già, e si legge riga per riga. */}
            <div className="num rounded-[10px] border bg-muted/40 p-3 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Incassato dal cliente</span>
                <b>{importo(totale.incassato, totale.valuta)}</b>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">
                  Lavoro consegnato ({totale.quante_consegnate} di {totale.quante_tranche})
                </span>
                <b>− {importo(totale.consegnato, totale.valuta)}</b>
              </div>
              <div className="mt-2 flex justify-between border-t pt-2">
                <span>Differenza a suo favore</span>
                <b className={totale.differenza > 0 ? "text-[var(--amber)]" : ""}>
                  {importo(totale.differenza, totale.valuta)}
                </b>
              </div>
            </div>

            {totale.differenza === 0 && (
              <p className="text-[12px] text-muted-foreground">
                Il cliente non ha pagato più di quanto gli è stato consegnato: non c'è niente da
                riconoscergli. Se sai di un credito che il sistema non vede — un acconto arrivato
                fuori dalle fatture — puoi registrarlo comunque.
              </p>
            )}

            {totale.giaRegistrato > 0 && (
              <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Su questo progetto è già registrato un credito di{" "}
                  <b>{importo(totale.giaRegistrato, totale.valuta)}</b>: registrarne un altro lo
                  raddoppia.
                </span>
              </p>
            )}

            {totale.giaCancellati > 0 && (
              <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {totale.giaCancellati === 1
                    ? "Una certificazione è già cancellata: la cancellazione si fermerà su quella."
                    : `${totale.giaCancellati} certificazioni sono già cancellate: la cancellazione si fermerà sulla prima.`}
                </span>
              </p>
            )}

            {/* ── La decisione ─────────────────────────────────────────────── */}
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-[10px] border p-2.5 text-[12.5px]">
                <input
                  type="radio"
                  checked={!conCredito}
                  onChange={() => setConCredito(false)}
                  className="mt-0.5 accent-[var(--teal)]"
                />
                <span>
                  <b>Nessun credito</b> — trattenuto per intero.
                  <span className="block text-[11px] text-muted-foreground">
                    Il lavoro impostato, le ore già spese: la parte nostra.
                  </span>
                </span>
              </label>

              <div className="rounded-[10px] border p-2.5 text-[12.5px]">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    checked={conCredito}
                    onChange={() => setConCredito(true)}
                    className="mt-0.5 accent-[var(--teal)]"
                  />
                  <span>
                    <b>Credito al cliente</b> — da usare su un progetto futuro.
                  </span>
                </label>

                {conCredito && (
                  <div className="mt-2 space-y-2 pl-6">
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="decimal"
                        value={cifra}
                        onChange={(e) => setCifra(e.target.value)}
                        placeholder="0,00"
                        className="h-9 w-32 tabular-nums"
                        aria-label="Importo del credito"
                      />
                      <span className="text-[11px] text-muted-foreground">{totale.valuta}</span>
                    </div>

                    <div>
                      <Label className="text-[11px]">A chi</Label>
                      <select
                        value={clienteId}
                        onChange={(e) => setClienteId(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="">Scegli la società…</option>
                        {clienti.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.company_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label className="text-[11px]">Motivo</Label>
                      <Input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="mt-1 h-9"
                        placeholder="perché questo credito esiste"
                      />
                      {/* Senza motivo, fra un anno, è un numero che nessuno sa
                          spiegare al cliente che lo reclama. */}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Lo leggerà chi preparerà l'offerta in cui il credito torna utile.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs">Note sulla cancellazione (facoltative)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="cosa è successo"
                className="mt-1 h-9"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Non cancellare
          </Button>
          <Button
            variant="destructive"
            disabled={!pronta || cancella.isPending}
            onClick={esegui}
          >
            {cancella.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {conCredito && valore > 0
              ? `Cancella e riconosci ${importo(valore, totale.valuta)}`
              : "Cancella, nessun credito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
