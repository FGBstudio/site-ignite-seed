import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import {
  useAmmanchiAperti,
  useClientiTutti,
  useCommesseFatturabili,
  useEmettiFattura,
  useEntita,
  useTerminiDiCommessa,
  useTrancheAperte,
} from "@/hooks/usePayments";
import { importo } from "@/lib/payments/aggregati";
import {
  imponibile as sommaRighe,
  numero,
  righeEmettibili,
  righeIncomplete,
  giorniFineMese,
  trancheRipetute,
  unicoComune,
} from "@/lib/payments/righeFattura";
import type { Currency, RigaDaEmettere } from "@/types/payments";

/**
 * Le aliquote che si usano.
 *
 * 22 è l'Italia, 6 è la Cina (le fatture di Zmyrna la portano), 9 e 13 sono le
 * ridotte cinesi. Lo zero non è «niente IVA per sbaglio»: è fuori campo, ed è il
 * caso delle fatture UK verso l'estero — la maggior parte di quelle emesse.
 */
const ALIQUOTE: Array<{ chiave: string; nome: string; pct: number | null }> = [
  { chiave: "0", nome: "0 % — fuori campo", pct: 0 },
  { chiave: "22", nome: "22 % — Italia", pct: 22 },
  { chiave: "13", nome: "13 % — Cina", pct: 13 },
  { chiave: "9", nome: "9 % — Cina ridotta", pct: 9 },
  { chiave: "6", nome: "6 % — Cina servizi", pct: 6 },
  { chiave: "custom", nome: "Importo a mano", pct: null },
];

/** I termini delle offerte, più il campo libero per il sesto caso. */
const TERMINI: Array<{ giorni: string; nome: string }> = [
  { giorni: "30", nome: "30 giorni" },
  { giorni: "60", nome: "60 giorni" },
  { giorni: "90", nome: "90 giorni" },
];

/**
 * Emettere una fattura — dalle tranche, o da zero.
 *
 * Una fattura ha **righe**. Prima ne aveva una sola, incollata a una tranche:
 * la fattura 3.089 di Louis Vuitton Dallas — 50% LEED, 50% Tassonomia, più il
 * rimborso dei bolli GBCI — non si poteva scrivere, e chi la emetteva doveva
 * sceglierne una e mettere il resto nelle note.
 *
 * Le righe sono di due specie, e la differenza conta:
 * - **legate a una tranche**: la tranche passa a «fatturata» e sparisce dal «da
 *   emettere». È il pezzo di quotazione che si sta incassando.
 * - **libere**: rimborsi, bolli, extra concordati. Nessuna quotazione le aveva
 *   previste, e inventare una tranche per contenerle vorrebbe dire sporcare il
 *   piano di fatturazione con righe che non c'erano.
 *
 * Il totale non si digita: è la somma. Il numero non si scrive: lo assegna il
 * database, continuando la serie vera dell'emittente.
 */
export function DialogoEmissione({
  aperto,
  onChiudi,
  certIniziale,
  trancheIniziali,
}: {
  aperto: boolean;
  onChiudi: () => void;
  /** La commessa da cui partire, quando si arriva da un avviso o da una riga. */
  certIniziale?: string | null;
  /**
   * Le tranche già scelte: diventano le prime righe.
   *
   * Arrivare qui dal «da emettere» con due caselle spuntate deve aprire un
   * dialogo con quelle due righe dentro. Aprirlo vuoto restituirebbe a chi
   * fattura il lavoro di ricerca che le caselle avevano appena tolto.
   */
  trancheIniziali?: string[];
}) {
  const { toast } = useToast();
  const emetti = useEmettiFattura();
  const { data: entita = [] } = useEntita();
  const { data: commesse = [] } = useCommesseFatturabili();
  const { data: tutteLeTranche = [] } = useTrancheAperte();

  const [emittenteId, setEmittenteId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [righe, setRighe] = useState<RigaDaEmettere[]>([]);
  const [certLibera, setCertLibera] = useState("");
  const [valuta, setValuta] = useState<Currency>("EUR");
  const [tasso, setTasso] = useState("1");
  /** L'aliquota scelta. L'importo dell'IVA ne è la conseguenza, non un campo. */
  const [aliquota, setAliquota] = useState("0");
  const [iva, setIva] = useState("");
  const [dataEmissione, setDataEmissione] = useState(() => new Date().toISOString().slice(0, 10));
  const [giorni, setGiorni] = useState("30");
  /** Quale preset è selezionato: «fine mese» produce un numero di giorni che non lo somiglia. */
  const [preset, setPreset] = useState("30");
  const [po, setPo] = useState("");
  const [nuovoCliente, setNuovoCliente] = useState(false);

  /** Le tranche esigibili, indicizzate: servono per costruire le righe iniziali. */
  const perId = useMemo(
    () => new Map(tutteLeTranche.map((t) => [t.id, t])),
    [tutteLeTranche],
  );

  /**
   * Il progetto di riferimento: quello delle righe, se ne parlano tutte uno.
   *
   * Non è un campo da compilare — si legge dalle righe. Serve per i termini di
   * pagamento e per gli ammanchi da riportare, che sono del progetto.
   */
  const certDelleRighe = useMemo(
    () =>
      unicoComune(
        righe.map((r) => (r.tranche_id ? perId.get(r.tranche_id)?.certification_id : null)),
      ),
    [righe, perId],
  );

  const certId = certDelleRighe ?? certLibera ?? "";
  const commessa = useMemo(() => commesse.find((c) => c.id === certId) ?? null, [commesse, certId]);
  const brandId = commessa?.sites?.brand_id ?? null;
  const { data: clienti = [] } = useClientiTutti(brandId);
  const { data: termini } = useTerminiDiCommessa(certId || null);

  /**
   * La firma dell'apertura: quali tranche, per quale progetto.
   *
   * L'array dei prop è nuovo a ogni render del chiamante — usarlo come
   * dipendenza rifarebbe il reset in continuazione. La stringa cambia solo
   * quando cambia davvero la selezione.
   */
  const firma = `${certIniziale ?? ""}|${(trancheIniziali ?? []).join(",")}`;
  const [firmaApplicata, setFirmaApplicata] = useState<string | null>(null);

  useEffect(() => {
    if (!aperto) {
      setFirmaApplicata(null);
      return;
    }
    // Le righe si compilano quando le tranche sono arrivate: farlo prima
    // significherebbe scriverle vuote e non riempirle mai più.
    const chiavi = trancheIniziali ?? [];
    const trovate = chiavi.map((id) => perId.get(id)).filter(Boolean);
    if (chiavi.length > 0 && trovate.length < chiavi.length) return;
    if (firmaApplicata === firma) return;

    setFirmaApplicata(firma);
    setEmittenteId(entita.length === 1 ? entita[0].id : "");
    setClienteId("");
    setCertLibera(certIniziale ?? "");
    setValuta("EUR");
    setTasso("1");
    setAliquota("0");
    setIva("");
    setDataEmissione(new Date().toISOString().slice(0, 10));
    setGiorni("30");
    setPreset("30");
    setPo("");

    // Le tranche scelte diventano righe con la loro descrizione e il loro
    // importo: sono dati che esistono, e ridigitarli vorrebbe dire poterli
    // sbagliare.
    setRighe(
      trovate.length > 0
        ? trovate.map((t) => ({
            tranche_id: t!.id,
            descrizione: t!.name ?? "Tranche",
            importo: t!.amount ?? 0,
            progetto: t!.progetto ?? null,
          }))
        : [{ tranche_id: null, descrizione: "", importo: "" }],
    );
  }, [aperto, firma, firmaApplicata, entita, certIniziale, trancheIniziali, perId]);

  /**
   * Quello che si sa già del progetto si porta dietro, invece di richiederlo.
   *
   * Anche la società che emette: quale delle tre fatturi è stato deciso in
   * offerta e sta su `certifications.issuer_contact_id`. Riscegliere all'emissione
   * vuol dire poter emettere dalla società sbagliata — e una fattura intestata
   * dalla società sbagliata non si corregge, si annulla.
   */
  useEffect(() => {
    if (!commessa) return;
    if (commessa.billing_contact_id) setClienteId(commessa.billing_contact_id);
    if (commessa.issuer_contact_id) setEmittenteId(commessa.issuer_contact_id);
    if (commessa.currency) setValuta(commessa.currency as Currency);
  }, [commessa]);

  /**
   * I termini di pagamento arrivano dalla commessa, non da un 30 scritto qui.
   *
   * Erano stati negoziati in offerta e vivono su `commesse.termini_giorni`:
   * ridigitarli a ogni fattura vorrebbe dire avere due versioni dello stesso
   * accordo, e prima o poi discordano. Restano modificabili — l'amministrazione
   * può concordare una scadenza diversa su una singola fattura.
   */
  useEffect(() => {
    if (termini == null) return;
    setGiorni(String(termini));
    setPreset(TERMINI.some((t) => t.giorni === String(termini)) ? String(termini) : "custom");
  }, [termini]);

  /** L'emittente italiano non passa da qui: la fattura vera la fa lo SdI. */
  const emittenteItaliano =
    entita.find((e) => e.id === emittenteId)?.entity_code === "it";

  // Emittente italiano: l'aliquota è il 22%, non lo zero. Proposta, non imposta —
  // ci sono esenzioni — ma partire da zero su una fattura italiana significa che
  // nove volte su dieci va corretta a mano.
  useEffect(() => {
    if (emittenteItaliano && aliquota === "0") setAliquota("22");
  }, [emittenteItaliano, aliquota]);

  // «30 fine mese» dipende dalla data di emissione: se la data cambia, il numero
  // di giorni cambia con lei, altrimenti la scadenza smette di cadere a fine mese.
  useEffect(() => {
    if (preset === "fine-mese") setGiorni(String(giorniFineMese(dataEmissione)));
  }, [preset, dataEmissione]);

  /** Le tranche ancora libere del progetto: si aggiungono come righe. */
  const trancheDisponibili = useMemo(() => {
    const giaDentro = new Set(righe.map((r) => r.tranche_id).filter(Boolean));
    return tutteLeTranche
      .filter((t) => t.tranche_state === "due" && !giaDentro.has(t.id))
      .filter((t) => (certId ? t.certification_id === certId : true));
  }, [tutteLeTranche, righe, certId]);

  const imponibile = sommaRighe(righe);
  const pct = ALIQUOTE.find((a) => a.chiave === aliquota)?.pct ?? null;
  // Con un'aliquota l'IVA è una moltiplicazione sull'imponibile, e l'imponibile
  // è la somma delle righe: cambiare una riga la ricalcola da sola.
  const valoreIva =
    pct == null ? numero(iva) : Math.round(imponibile * pct) / 100;
  const totale = Math.round((imponibile + valoreIva) * 100) / 100;

  /** Cosa non va, riga per riga: si dice mentre si compila, non al salvataggio. */
  const incomplete = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of righeIncomplete(righe)) m.set(e.indice, e.perche);
    return m;
  }, [righe]);
  const doppie = useMemo(() => new Set(trancheRipetute(righe)), [righe]);

  /**
   * Gli ammanchi lasciati aperti dalle fatture precedenti dello stesso progetto.
   *
   * Non li sommo da solo: chi emette deve *decidere* di riportarli, perché un
   * importo che cresce da sé mentre si compila è un importo che nessuno
   * riconosce più. Li propongo come riga da aggiungere.
   */
  const { data: ammanchi = [] } = useAmmanchiAperti(aperto && certId ? certId : null);
  const ammancoAperto = ammanchi.reduce((s, a) => s + Number(a.importo ?? 0), 0);
  const ammancoRiportato = righe.some((r) => r.descrizione.startsWith("Ammanco riportato"));

  const scadenza = useMemo(() => {
    if (!dataEmissione) return null;
    const d = new Date(dataEmissione);
    d.setDate(d.getDate() + (Number(giorni) || 0));
    return d.toISOString().slice(0, 10);
  }, [dataEmissione, giorni]);

  const pronta =
    !!emittenteId && !!clienteId && !!dataEmissione && righeEmettibili(righe) && doppie.size === 0;

  const cambia = (i: number, patch: Partial<RigaDaEmettere>) =>
    setRighe((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const salva = async () => {
    try {
      const f = await emetti.mutateAsync({
        issuer_contact_id: emittenteId,
        righe: righe.map((r) => ({
          tranche_id: r.tranche_id,
          descrizione: r.descrizione.trim(),
          importo: numero(r.importo),
        })),
        issue_date: dataEmissione,
        payment_terms_days: Number(giorni) || 30,
        client_contact_id: clienteId,
        currency: valuta,
        exch_rate: numero(tasso) || 1,
        vat_amount: valoreIva,
        po_riferimento: po || null,
      });
      toast({
        title: `Fattura ${f?.number ?? ""} emessa`,
        description: `${righe.length} ${righe.length === 1 ? "riga" : "righe"} · ${importo(totale, valuta)} · scade il ${scadenza}.`,
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fattura non emessa", description: e.message });
    }
  };

  return (
    <>
      <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuova fattura</DialogTitle>
            <DialogDescription>
              Il numero lo assegna il sistema continuando la serie dell'emittente. Il totale è la
              somma delle righe: non si digita.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* ── Chi emette, a chi ────────────────────────────────────────── */}
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
                {/* Va detto prima, non dopo: una fattura italiana passa dallo SdI,
                    e chi la componesse qui per intero scoprirebbe solo alla fine
                    che il documento valido lo emette un altro sistema. */}
                {emittenteItaliano && (
                  <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                    Le fatture italiane si emettono dal gestionale della fatturazione
                    elettronica. Qui la registri — numero, righe, scadenza — e ci alleghi il PDF.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Intestatario</Label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Scegli la società…</option>
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
                    onClick={() => setNuovoCliente(true)}
                    className="shrink-0"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Nuova
                  </Button>
                </div>
                {certId && !commessa?.billing_contact_id && clienteId && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Resta registrato sul progetto: la prossima fattura non lo richiederà.
                  </p>
                )}
              </div>
            </div>

            {/* ── Il progetto, quando le righe non lo dicono ──────────────── */}
            {!certDelleRighe && (
              <div>
                <Label className="text-xs">Commessa di riferimento (facoltativa)</Label>
                <select
                  value={certLibera}
                  onChange={(e) => setCertLibera(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Nessuna — fattura libera</option>
                  {commesse.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client ?? "—"} · {c.name ?? c.sites?.name ?? "—"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Serve solo per proporre le tranche e i termini: sulla fattura il progetto lo
                  scrivono le righe.
                </p>
              </div>
            )}
            {certDelleRighe && (
              <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                Le righe parlano di <b className="text-foreground">{commessa?.name ?? "un progetto solo"}</b>:
                la fattura resta attribuita a quello.
              </p>
            )}

            {/* ── Le righe ─────────────────────────────────────────────────── */}
            <div>
              <div className="flex items-end justify-between gap-2">
                <Label className="text-xs">Righe</Label>
                <span className="text-[11px] text-muted-foreground">
                  Una riga senza tranche è un extra: rimborsi, bolli, GBCI fees.
                </span>
              </div>

              <div className="mt-1 divide-y rounded-md border">
                {righe.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2">
                    <div className="flex-1">
                      <Input
                        value={r.descrizione}
                        onChange={(e) => cambia(i, { descrizione: e.target.value })}
                        placeholder="Cosa si sta fatturando"
                        className="h-9"
                      />
                      {/* Il motivo sta sotto la riga che lo riguarda: un pulsante
                          spento senza spiegazione lascia a indovinare quale
                          delle quattro righe non va. */}
                      <p
                        className={`mt-1 text-[11px] ${
                          incomplete.has(i) || (r.tranche_id && doppie.has(r.tranche_id))
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {r.tranche_id && doppie.has(r.tranche_id)
                          ? "Questa tranche è già su un'altra riga: si fattura una volta"
                          : (incomplete.get(i) ??
                            (r.tranche_id
                              ? `Tranche · ${r.progetto ?? "progetto"} — passerà a «fatturata»`
                              : "Riga libera · nessuna tranche si chiude"))}
                      </p>
                    </div>
                    <Input
                      inputMode="decimal"
                      value={r.importo}
                      onChange={(e) => cambia(i, { importo: e.target.value })}
                      placeholder="0,00"
                      className="h-9 w-32 tabular-nums"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0"
                      disabled={righe.length === 1}
                      onClick={() => setRighe((x) => x.filter((_, k) => k !== i))}
                      aria-label="Togli la riga"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRighe((x) => [...x, { tranche_id: null, descrizione: "", importo: "" }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Riga libera
                </Button>

                {trancheDisponibili.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const t = perId.get(e.target.value);
                      if (!t) return;
                      setRighe((x) => [
                        ...x,
                        {
                          tranche_id: t.id,
                          descrizione: t.name ?? "Tranche",
                          importo: t.amount ?? 0,
                          progetto: t.progetto ?? null,
                        },
                      ]);
                    }}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">Aggiungi una tranche…</option>
                    {trancheDisponibili.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.progetto ? `${t.progetto} · ` : ""}
                        {t.name ?? "Tranche"}
                        {t.amount ? ` · ${importo(t.amount, valuta)}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {/* L'ammanco si riporta come riga, così si legge in fattura invece
                    di essere nascosto in un totale cresciuto da sé. */}
                {ammancoAperto > 0 && !ammancoRiportato && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-900"
                    onClick={() =>
                      setRighe((x) => [
                        ...x,
                        {
                          tranche_id: null,
                          descrizione: `Ammanco riportato dalle fatture ${ammanchi.map((a) => a.fatture).filter(Boolean).join(", ")}`,
                          importo: ammancoAperto,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Riporta ammanco {importo(ammancoAperto, valuta)}
                  </Button>
                )}
              </div>
            </div>

            {/* ── Quanto ───────────────────────────────────────────────────── */}
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
                <Label className="text-xs">Imponibile</Label>
                <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-2 text-sm tabular-nums">
                  {importo(imponibile, valuta)}
                </div>
              </div>
              {/* ── L'IVA per aliquota, non per importo ────────────────────
                  Chi fattura conosce l'aliquota — 22 in Italia, 6 in Cina, 0
                  fuori campo — e l'importo è una moltiplicazione. Farla a mano
                  vuol dire poterla sbagliare, e uno scarto di un centesimo
                  sull'IVA lo trova il commercialista, non chi ha digitato. */}
              <div>
                <Label className="text-xs">IVA</Label>
                <div className="mt-1 flex gap-1">
                  <select
                    value={aliquota}
                    onChange={(e) => setAliquota(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-1 text-sm"
                  >
                    {ALIQUOTE.map((a) => (
                      <option key={a.chiave} value={a.chiave}>
                        {a.nome}
                      </option>
                    ))}
                  </select>
                  {aliquota === "custom" && (
                    <Input
                      inputMode="decimal"
                      value={iva}
                      onChange={(e) => setIva(e.target.value)}
                      placeholder="0,00"
                      className="h-9 w-24 tabular-nums"
                      aria-label="Importo IVA"
                    />
                  )}
                </div>
                {aliquota !== "custom" && aliquota !== "0" && (
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    {importo(valoreIva, valuta)}
                  </p>
                )}
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

            {/* ── Quando, e con quale riferimento ─────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Data di emissione</Label>
                <Input
                  type="date"
                  value={dataEmissione}
                  onChange={(e) => setDataEmissione(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              {/* I termini che si usano davvero sono cinque, e sono quelli delle
                  offerte: 30 e 60 in Italia, 90 sui grandi gruppi, «30 fine
                  mese» quando il cliente paga a scadenze fisse. Il campo libero
                  resta, perché il sesto caso esiste sempre. */}
              <div>
                <Label className="text-xs">Termini</Label>
                <div className="mt-1 flex gap-1">
                  <select
                    value={preset}
                    onChange={(e) => {
                      setPreset(e.target.value);
                      if (e.target.value === "fine-mese") {
                        setGiorni(String(giorniFineMese(dataEmissione)));
                      } else if (e.target.value !== "custom") {
                        setGiorni(e.target.value);
                      } else {
                        setGiorni("");
                      }
                    }}
                    className="h-9 w-full rounded-md border bg-background px-1 text-sm"
                  >
                    {TERMINI.map((t) => (
                      <option key={t.giorni} value={t.giorni}>
                        {t.nome}
                      </option>
                    ))}
                    <option value="fine-mese">30 gg fine mese</option>
                    <option value="custom">Altro…</option>
                  </select>
                  {preset === "custom" && (
                    <Input
                      inputMode="numeric"
                      value={giorni}
                      onChange={(e) => setGiorni(e.target.value)}
                      placeholder="gg"
                      className="h-9 w-16 tabular-nums"
                      aria-label="Giorni"
                    />
                  )}
                </div>
                {preset === "fine-mese" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sono {giorni} giorni: la scadenza è calcolata in giorni, non in «fine mese».
                  </p>
                )}
              </div>
              {/* ── Il riferimento d'ordine del cliente ────────────────────
                  Ha preso il posto del «numero del commercialista», che qui non
                  serviva: quel numero lo assegna lo studio dopo, non chi emette.
                  Il PO invece arriva prima — «WBS: W-INV-2010-13-26401-101» —
                  e senza di lui la fattura torna indietro non pagata. Resta sul
                  dialogo di importazione, dove una fattura vecchia il suo numero
                  esterno ce l'ha già. */}
              <div className="sm:col-span-2">
                <Label className="text-xs">Rif. ordine del cliente</Label>
                <Input
                  value={po}
                  onChange={(e) => setPo(e.target.value)}
                  placeholder="PO / WBS — senza, molti clienti non pagano"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs">
              <span className="text-muted-foreground">
                {scadenza ? (
                  <>
                    Scade il <b className="tabular-nums text-foreground">{scadenza}</b>. Passata
                    quella data, senza incasso entra da sola in Recall.
                  </>
                ) : (
                  "Serve la data di emissione: la scadenza si calcola da lì."
                )}
              </span>
              <span className="text-[13px] font-bold tabular-nums">
                Totale {importo(totale, valuta)}
              </span>
            </div>
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
