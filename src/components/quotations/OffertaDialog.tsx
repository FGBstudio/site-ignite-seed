import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, FileDown, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import {
  datiDaSocieta, scarica, useGeneraOfferta, useSalvaDatiOfferta, useSocietaDelBrand,
  type DatiOfferta,
} from "@/hooks/useOfferta";

/**
 * Emettere un'offerta.
 *
 * Quasi tutto e' gia' noto — cliente, sito, importo — e infatti arriva
 * precompilato. Quello che non si sa è a quale societa' si intesta e cosa
 * esattamente si sta vendendo: sono le due cose che si decidono adesso, e sono
 * le due che il modulo chiede.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificationId: string | null;
}

/** Migliaia con il punto, come si scrive un prezzo su un'offerta italiana. */
const prezzo = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : new Intl.NumberFormat("it-IT").format(n);

export function OffertaDialog({ open, onOpenChange, certificationId }: Props) {
  const { toast } = useToast();
  const genera = useGeneraOfferta();
  const salva = useSalvaDatiOfferta();

  const { data: cert } = useQuery({
    queryKey: ["offerta", "cert", certificationId],
    enabled: open && !!certificationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select(
          `id, name, client, cert_type, cert_rating, project_subtype, currency,
           total_fees, services_fees, gbci_fees, quotation_sent_date, quotation_notes,
           quotation_line_items, quotation_list_price, billing_contact_id,
           sites ( id, name, city, country, address, brand_id, brands ( id, name ) )`,
        )
        .eq("id", certificationId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const brandId = cert?.sites?.brand_id as string | undefined;
  const brandNome = cert?.sites?.brands?.name as string | undefined;
  const { data: societa = [] } = useSocietaDelBrand(brandId);

  const [contattoId, setContattoId] = useState<string>("");
  const [righe, setRighe] = useState<string[]>([""]);
  const [listino, setListino] = useState("");
  const [finale, setFinale] = useState("");
  const [dataOfferta, setDataOfferta] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [titolo2, setTitolo2] = useState("");
  const [giorni, setGiorni] = useState("30");
  const [nuovaSocieta, setNuovaSocieta] = useState(false);

  // Si precompila all'apertura, poi non si tocca piu': sovrascrivere mentre
  // l'utente scrive e' il modo piu' rapido per fargli perdere il lavoro.
  useEffect(() => {
    if (!open || !cert) return;
    setContattoId(cert.billing_contact_id ?? "");
    setRighe(
      cert.quotation_line_items?.length
        ? cert.quotation_line_items
        : cert.quotation_notes
        ? String(cert.quotation_notes).split("\n").filter((r: string) => r.trim())
        : [""],
    );
    setListino(prezzo(cert.quotation_list_price ?? (
      // Senza un listino salvato, la somma delle due componenti e' il prezzo
      // pieno: si propone solo se e' davvero piu' alto del totale, altrimenti
      // sarebbe uno sconto inventato.
      (cert.services_fees ?? 0) + (cert.gbci_fees ?? 0) > (cert.total_fees ?? 0)
        ? (cert.services_fees ?? 0) + (cert.gbci_fees ?? 0)
        : null
    )));
    setFinale(prezzo(cert.total_fees));
    setDataOfferta(
      format(cert.quotation_sent_date ? parseISO(cert.quotation_sent_date) : new Date(),
        "d MMMM yyyy", { locale: it }),
    );
    setOggetto(
      [cert.cert_type, cert.cert_rating, cert.project_subtype].filter(Boolean).join(" "),
    );
    setTitolo2(cert.sites?.name ?? cert.name ?? "");
    setGiorni("30");
  }, [open, cert]);

  const scelta = useMemo(
    () => societa.find((s) => s.id === contattoId) ?? null,
    [societa, contattoId],
  );
  const dati = datiDaSocieta(scelta);

  const righeValide = righe.map((r) => r.trim()).filter(Boolean);
  const pronta =
    !!scelta && dati?.mancanti.length === 0 && righeValide.length > 0 && !!finale.trim();

  const componi = (): DatiOfferta => ({
    data: dataOfferta.trim(),
    cliente_ragione_sociale: dati!.ragioneSociale,
    cliente_indirizzo: dati!.indirizzo,
    cliente_cap_citta: dati!.capCitta,
    cliente_piva: dati!.fiscale,
    titolo_riga1: brandNome ?? cert?.client ?? "",
    titolo_riga2: titolo2.trim(),
    oggetto: oggetto.trim(),
    righe: righeValide,
    prezzo_listino: listino.trim() || undefined,
    prezzo_finale: finale.trim(),
    cliente_breve: brandNome ?? cert?.client ?? "",
    termini_giorni: giorni.trim() || "30",
  });

  const onGenera = async () => {
    try {
      // Prima si salva, poi si genera: se la generazione fallisce — il servizio
      // dorme, la rete cade — quello che hai scritto resta comunque.
      await salva.mutateAsync({
        certification_id: certificationId!,
        billing_contact_id: contattoId || null,
        quotation_line_items: righeValide,
        quotation_list_price: listino.trim()
          ? Number(listino.replace(/\./g, "").replace(",", "."))
          : null,
      });
      const { blob, nome } = await genera.mutateAsync(componi());
      scarica(blob, nome);
      toast({ title: "Offerta generata", description: nome });
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non è stato possibile generare", description: e.message });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Genera offerta</DialogTitle>
            <DialogDescription>
              {cert?.name}
              {brandNome ? ` · ${brandNome}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── A chi si intesta ── */}
            <section className="space-y-2">
              <Label>Società a cui emettere l'offerta</Label>
              {!brandId ? (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  Questa quotazione non ha un sito con un brand: senza brand non si sa
                  quali società proporre.
                </p>
              ) : societa.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Nessuna società registrata per <b>{brandNome}</b>. Un marchio non ha
                    partita IVA: serve il soggetto che fattura.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setNuovaSocieta(true)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Crea la società di {brandNome}
                  </Button>
                </div>
              ) : (
                <>
                  <Select value={contattoId} onValueChange={setContattoId}>
                    <SelectTrigger><SelectValue placeholder="Scegli la società…" /></SelectTrigger>
                    <SelectContent>
                      {societa.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.company_name}
                          {s.vat_number ? ` · ${s.vat_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {dati && dati.mancanti.length > 0 && (
                    /* Non basta che la società esista: questi campi finiscono
                       in testa all'offerta, e vuoti si vedono. */
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        A <b>{dati.ragioneSociale}</b> mancano {dati.mancanti.join(", ")}.
                        Sono dati che compaiono in testa all'offerta.
                      </span>
                    </div>
                  )}
                  {dati && dati.mancanti.length === 0 && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {dati.ragioneSociale} · {dati.indirizzo} · {dati.capCitta} · {dati.fiscale}
                    </p>
                  )}
                  <Button
                    size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setNuovaSocieta(true)}
                  >
                    <Plus className="h-3 w-3" /> Un'altra società per questo brand
                  </Button>
                </>
              )}
            </section>

            {/* ── Le voci ── */}
            <section className="space-y-2">
              <Label>Voci dell'offerta</Label>
              <div className="space-y-1.5">
                {righe.map((r, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={r}
                      placeholder="es. N. 4 Sensori CLAIR Smart IAQ"
                      onChange={(e) =>
                        setRighe((p) => p.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      className="text-sm"
                    />
                    <Button
                      variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                      disabled={righe.length === 1}
                      onClick={() => setRighe((p) => p.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={() => setRighe((p) => [...p, ""])}
              >
                <Plus className="h-3 w-3" /> Aggiungi voce
              </Button>
            </section>

            {/* ── I prezzi ── */}
            <section className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prezzo di listino</Label>
                <Input value={listino} onChange={(e) => setListino(e.target.value)}
                       placeholder="facoltativo" className="text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  Se compilato appare barrato accanto al totale. Vuoto: non compare nulla.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Prezzo finale</Label>
                <Input value={finale} onChange={(e) => setFinale(e.target.value)}
                       className="text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  Senza «Euro»: lo aggiunge il template.
                </p>
              </div>
            </section>

            {/* ── Il resto ── */}
            <section className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input value={dataOfferta} onChange={(e) => setDataOfferta(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>Giorni di pagamento</Label>
                <Input value={giorni} onChange={(e) => setGiorni(e.target.value)} className="text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Oggetto</Label>
                <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} className="text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Seconda riga del titolo</Label>
                <Input value={titolo2} onChange={(e) => setTitolo2(e.target.value)} className="text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  La prima riga è <b>{brandNome ?? cert?.client ?? "—"}</b>, presa dal brand.
                </p>
              </div>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <span className="self-center text-[11px] text-muted-foreground">
              {pronta
                ? "Il PDF si scarica appena pronto."
                : "Servono società completa, almeno una voce e il prezzo finale."}
            </span>
            <Button onClick={onGenera} disabled={!pronta || genera.isPending || salva.isPending}>
              {(genera.isPending || salva.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <FileDown className="mr-1.5 h-4 w-4" />
              Genera PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lo stesso dialogo dei Contacts, col brand già scelto: creare la
          società non deve costare l'uscita dall'offerta. */}
      <ContactFormDialog
        open={nuovaSocieta}
        onOpenChange={setNuovaSocieta}
        defaultKind="client"
        defaultBrandId={brandId ?? null}
      />
    </>
  );
}
