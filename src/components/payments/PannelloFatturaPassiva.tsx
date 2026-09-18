import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileCheck2, Loader2, Upload } from "lucide-react";
import {
  caricaPdfPassiva,
  useRegistraFatturaPassiva,
  useSalvaFornitore,
} from "@/hooks/usePayments";
import { indoviniDaTesto, testoDaPdf } from "@/lib/payments/leggiPdf";
import type { Currency, Supplier } from "@/types/payments";

/**
 * Registrare una fattura ricevuta.
 *
 * Il PDF si trascina qui dentro e il modulo prova a leggerlo: numero, data e
 * importi arrivano già scritti, da confermare. Sono proposte, non verità — un
 * campo indovinato male e presentato come certo farebbe registrare l'importo
 * sbagliato senza che nessuno riguardi il documento.
 */
export function PannelloFatturaPassiva({
  aperto,
  onChiudi,
  fornitori,
}: {
  aperto: boolean;
  onChiudi: () => void;
  fornitori: Supplier[];
}) {
  const { toast } = useToast();
  const registra = useRegistraFatturaPassiva();
  const salvaFornitore = useSalvaFornitore();
  const input = useRef<HTMLInputElement>(null);

  const [fornitoreId, setFornitoreId] = useState("");
  const [nuovoNome, setNuovoNome] = useState("");
  const [numero, setNumero] = useState("");
  const [ricezione, setRicezione] = useState(() => new Date().toISOString().slice(0, 10));
  const [emissione, setEmissione] = useState("");
  const [giorni, setGiorni] = useState("60");
  const [imponibile, setImponibile] = useState("");
  const [tassa, setTassa] = useState("");
  const [totale, setTotale] = useState("");
  const [valuta, setValuta] = useState<Currency>("EUR");
  const [pdf, setPdf] = useState<File | null>(null);
  const [letto, setLetto] = useState(false);
  const [leggendo, setLeggendo] = useState(false);

  useEffect(() => {
    if (!aperto) return;
    setFornitoreId("");
    setNuovoNome("");
    setNumero("");
    setRicezione(new Date().toISOString().slice(0, 10));
    setEmissione("");
    setGiorni("60");
    setImponibile("");
    setTassa("");
    setTotale("");
    setValuta("EUR");
    setPdf(null);
    setLetto(false);
  }, [aperto]);

  // I termini seguono il fornitore, ma solo finché non li si tocca a mano:
  // sono il suo accordo, e ricopiarli ogni volta è il lavoro che il sistema
  // deve togliere.
  useEffect(() => {
    const f = fornitori.find((x) => x.id === fornitoreId);
    if (f) {
      setGiorni(String(f.default_terms_days));
      setValuta(f.default_currency);
    }
  }, [fornitoreId, fornitori]);

  const prendiPdf = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Solo PDF", description: "L'archivio accetta PDF." });
      return;
    }
    setPdf(file);
    setLeggendo(true);
    try {
      const g = indoviniDaTesto(await testoDaPdf(file));
      // Si riempie solo quello che è ancora vuoto: se hai già scritto tu, la
      // lettura del PDF non ti sovrascrive.
      if (g.numero && !numero) setNumero(g.numero);
      if (g.dataEmissione && !emissione) setEmissione(g.dataEmissione);
      if (g.imponibile !== undefined && !imponibile) setImponibile(String(g.imponibile));
      if (g.tassa !== undefined && !tassa) setTassa(String(g.tassa));
      if (g.totale !== undefined && !totale) setTotale(String(g.totale));
      setLetto(Object.keys(g).length > 0);
    } catch {
      // Un PDF scansionato non ha testo da leggere: si registra a mano, e il
      // file resta comunque archiviato.
      setLetto(false);
    } finally {
      setLeggendo(false);
    }
  };

  const valoreTotale = Number(String(totale).replace(",", "."));
  const pronta =
    (!!fornitoreId || !!nuovoNome.trim()) &&
    !!numero.trim() &&
    !!ricezione &&
    Number.isFinite(valoreTotale) &&
    valoreTotale > 0;

  const scadenza = (() => {
    if (!ricezione) return null;
    const d = new Date(ricezione);
    d.setDate(d.getDate() + (Number(giorni) || 0));
    return d.toISOString().slice(0, 10);
  })();

  const salva = async () => {
    try {
      let id = fornitoreId;
      if (!id && nuovoNome.trim()) {
        const f = await salvaFornitore.mutateAsync({
          name: nuovoNome.trim(),
          default_currency: valuta,
          default_terms_days: Number(giorni) || 60,
        });
        id = f.id;
      }

      const nome = fornitori.find((x) => x.id === id)?.name ?? (nuovoNome.trim() || "fornitore");
      const percorso = pdf ? await caricaPdfPassiva(pdf, nome) : null;

      await registra.mutateAsync({
        number: numero.trim(),
        supplier_id: id,
        received_date: ricezione,
        issue_date: emissione || null,
        terms_days: Number(giorni) || 60,
        taxable: Number(String(imponibile).replace(",", ".")) || 0,
        tax: Number(String(tassa).replace(",", ".")) || 0,
        total: valoreTotale,
        currency: valuta,
        pdf_path: percorso,
      });

      toast({
        title: "Fattura registrata",
        description: `Scade il ${scadenza}${percorso ? " · PDF archiviato" : " · senza PDF"}`,
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non registrata", description: e.message });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registra fattura passiva</DialogTitle>
          <DialogDescription>
            La scadenza si calcola dalla data di ricezione più i termini del fornitore.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* ── Il PDF ── */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) prendiPdf(f);
            }}
            onClick={() => input.current?.click()}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-xs"
          >
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) prendiPdf(f);
              }}
            />
            {leggendo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Leggo il documento…
              </>
            ) : pdf ? (
              <>
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{pdf.name}</span>
                <span className="text-muted-foreground">
                  {letto ? "· campi proposti dal PDF, controllali" : "· nessun testo leggibile"}
                </span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Trascina qui il PDF, o clicca. Proverò a leggere numero, data e importi.
                </span>
              </>
            )}
          </div>

          {/* ── Chi ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Fornitore</Label>
              <select
                value={fornitoreId}
                onChange={(e) => setFornitoreId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">— nuovo fornitore —</option>
                {fornitori.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.default_terms_days} gg
                  </option>
                ))}
              </select>
            </div>
            {!fornitoreId && (
              <div>
                <Label className="text-xs">Nome del nuovo fornitore</Label>
                <Input
                  value={nuovoNome}
                  onChange={(e) => setNuovoNome(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            )}
          </div>

          {/* ── Cosa ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">N° fattura</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Ricezione</Label>
              <Input
                type="date"
                value={ricezione}
                onChange={(e) => setRicezione(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Emissione</Label>
              <Input
                type="date"
                value={emissione}
                onChange={(e) => setEmissione(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-5">
            <div>
              <Label className="text-xs">Termini (gg)</Label>
              <Input
                inputMode="numeric"
                value={giorni}
                onChange={(e) => setGiorni(e.target.value)}
                className="mt-1 h-9 tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Imponibile</Label>
              <Input
                inputMode="decimal"
                value={imponibile}
                onChange={(e) => setImponibile(e.target.value)}
                className="mt-1 h-9 tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Tassa</Label>
              <Input
                inputMode="decimal"
                value={tassa}
                onChange={(e) => setTassa(e.target.value)}
                className="mt-1 h-9 tabular-nums"
              />
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
          </div>

          {scadenza && (
            <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Scade il <b className="tabular-nums text-foreground">{scadenza}</b> — ricezione più{" "}
              {giorni} giorni.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>
            Annulla
          </Button>
          <Button disabled={!pronta || registra.isPending} onClick={salva}>
            {registra.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
