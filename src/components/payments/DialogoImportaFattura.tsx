import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload, FileText, AlertTriangle, Check, Plus, X } from "lucide-react";
import {
  leggiFattura, caricaPdfStorico, useImportaFatturaStorica, useAnagrafiche, useCreaAnagrafica,
} from "@/hooks/usePayments";
import {
  bozzaDaLettura, avvisi, importabile, abbinaContatto, contattoDaLettura,
  VALUTE_AMMESSE, numeroPulito,
  type LetturaFattura, type BozzaFattura, type ContattoNoto, type Abbinamento,
} from "@/lib/payments/letturaFattura";
import { useToast } from "@/hooks/use-toast";

/**
 * Far entrare nel registro una fattura emessa prima del registro.
 *
 * Il modello legge il PDF, una persona rivede, il database salva. Il passaggio
 * in mezzo non e' una formalita': una cifra sbagliata qui diventa il fatturato
 * di un anno, e il modello non ha l'ultima parola su un dato contabile.
 *
 * Il documento originale viene conservato insieme alla riga. E' il solo che
 * valga davvero: tutto il resto e' una lettura, e una lettura si rilegge.
 */

interface Props {
  aperto: boolean;
  onChiudi: () => void;
}

type Fase = "attesa" | "lettura" | "revisione" | "salvataggio";

export function DialogoImportaFattura({ aperto, onChiudi }: Props) {
  const { toast } = useToast();
  const importa = useImportaFatturaStorica();
  const creaAnagrafica = useCreaAnagrafica();
  const { data: clienti = [] } = useAnagrafiche("client");
  const { data: emittenti = [] } = useAnagrafiche("issuer");
  const inputRef = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("attesa");
  const [file, setFile] = useState<File | null>(null);
  const [lettura, setLettura] = useState<LetturaFattura | null>(null);
  const [bozza, setBozza] = useState<BozzaFattura | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string>("");
  const [emittenteId, setEmittenteId] = useState<string>("");
  const [abbCliente, setAbbCliente] = useState<Abbinamento>({ contatto: null, motivo: null });
  const [abbEmittente, setAbbEmittente] = useState<Abbinamento>({ contatto: null, motivo: null });

  // Chiudendo si riparte da zero: riaprire e ritrovare la fattura di prima
  // mezza compilata e' il modo piu' facile per importarla due volte.
  useEffect(() => {
    if (aperto) return;
    const t = setTimeout(() => {
      setFase("attesa"); setFile(null); setLettura(null); setBozza(null);
      setErrore(null); setClienteId(""); setEmittenteId("");
      setAbbCliente({ contatto: null, motivo: null });
      setAbbEmittente({ contatto: null, motivo: null });
    }, 250);
    return () => clearTimeout(t);
  }, [aperto]);

  const scegli = async (f: File) => {
    setFile(f);
    setErrore(null);
    setFase("lettura");
    try {
      const l = await leggiFattura(f);
      setLettura(l);
      setBozza(bozzaDaLettura(l));
      const ac = abbinaContatto(l.cliente, clienti);
      const ae = abbinaContatto(l.emittente, emittenti);
      setAbbCliente(ac);
      setAbbEmittente(ae);
      setClienteId(ac.contatto?.id ?? "");
      setEmittenteId(ae.contatto?.id ?? "");
      setFase("revisione");
    } catch (e: any) {
      setErrore(e?.message ?? "Lettura non riuscita");
      setFase("attesa");
    }
  };

  const problemi = useMemo(
    () => (bozza && lettura ? avvisi(bozza, lettura) : []),
    [bozza, lettura],
  );
  const puoSalvare =
    !!bozza && !!lettura && !!emittenteId && importabile(bozza, lettura) && fase === "revisione";

  const salva = async () => {
    if (!bozza || !lettura || !file) return;
    setFase("salvataggio");
    try {
      // Prima il documento, poi la riga: se il caricamento fallisce non resta
      // una fattura che dichiara un PDF che non c'e'.
      const percorso = await caricaPdfStorico(file, bozza.numero);
      await importa.mutateAsync({
        number: bozza.numero.trim(),
        issuer_contact_id: emittenteId,
        client_contact_id: clienteId || null,
        issue_date: bozza.dataEmissione,
        total: numeroPulito(bozza.totale) ?? 0,
        vat_amount: numeroPulito(bozza.iva) ?? 0,
        currency: bozza.valuta,
        payment_terms_days: bozza.terminiGiorni,
        notes: bozza.note.trim() || null,
        documento_path: percorso,
        estrazione: lettura,
        incassata: bozza.incassata,
        data_incasso: bozza.incassata ? bozza.dataIncasso || null : null,
      });
      toast({
        title: `Fattura ${bozza.numero} importata`,
        description: bozza.incassata
          ? "Entra nel registro come chiusa, con il suo incasso."
          : "Entra aperta: la troverai fra quelle da incassare.",
      });
      onChiudi();
    } catch (e: any) {
      setFase("revisione");
      toast({
        title: "Non importata",
        description: e?.message ?? "Salvataggio non riuscito",
        variant: "destructive",
      });
    }
  };

  const creaDaLettura = async (quale: "client" | "issuer") => {
    if (!lettura) return;
    const letta = quale === "client" ? lettura.cliente : lettura.emittente;
    try {
      const nuovo = await creaAnagrafica.mutateAsync(contattoDaLettura(letta, quale));
      if (quale === "client") setClienteId(nuovo.id);
      else setEmittenteId(nuovo.id);
      toast({ title: `${nuovo.company_name} aggiunta alle anagrafiche` });
    } catch (e: any) {
      toast({ title: "Anagrafica non creata", description: e?.message, variant: "destructive" });
    }
  };

  if (!aperto) return null;

  const campo = (k: keyof BozzaFattura, v: string | number | boolean) =>
    setBozza((b) => (b ? { ...b, [k]: v } : b));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        style={{ background: "var(--card, #fff)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              Registro fatture
            </div>
            <h2 className="text-lg font-medium">Importa una fattura già emessa</h2>
          </div>
          <button onClick={onChiudi} className="rounded p-1 hover:bg-black/5" aria-label="Chiudi">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* ── Il file ── */}
          {fase === "attesa" && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-sm hover:bg-black/[0.02]"
              >
                <Upload className="h-6 w-6 opacity-40" />
                <span>Scegli il PDF della fattura</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  Lo legge un modello e ti mostra i dati da confermare. Niente viene salvato prima.
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) scegli(f);
                  e.target.value = "";
                }}
              />
              {errore && (
                <p className="flex items-start gap-2 text-[12px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {errore}
                </p>
              )}
            </>
          )}

          {fase === "lettura" && (
            <div className="flex flex-col items-center gap-3 py-10 text-sm">
              <Loader2 className="h-6 w-6 animate-spin opacity-50" />
              <span>Sto leggendo {file?.name}…</span>
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                Numero, date, imponibile, IVA, totale, e le anagrafiche delle due parti.
              </span>
            </div>
          )}

          {/* ── La revisione ── */}
          {bozza && lettura && (fase === "revisione" || fase === "salvataggio") && (
            <>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--ground)" }}>
                <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="truncate">{file?.name}</span>
                {lettura.diario && (
                  <span className="ml-auto truncate text-[11px]" style={{ color: "var(--muted)" }} title={lettura.diario}>
                    {lettura.diario}
                  </span>
                )}
              </div>

              {problemi.length > 0 && (
                <ul className="space-y-1">
                  {problemi.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px]"
                      style={{ color: a.grave ? "var(--destructive, #b91c1c)" : "var(--amber, #b45309)" }}
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {a.testo}
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Campo etichetta="Numero">
                  <input className={CL} value={bozza.numero} onChange={(e) => campo("numero", e.target.value)} />
                </Campo>
                <Campo etichetta="Data di emissione">
                  <input type="date" className={CL} value={bozza.dataEmissione} onChange={(e) => campo("dataEmissione", e.target.value)} />
                </Campo>
                <Campo etichetta="Imponibile">
                  <input className={CL} value={bozza.imponibile} onChange={(e) => campo("imponibile", e.target.value)} />
                </Campo>
                <Campo etichetta="IVA">
                  <input className={CL} value={bozza.iva} onChange={(e) => campo("iva", e.target.value)} />
                </Campo>
                <Campo etichetta="Totale documento">
                  <input className={CL} value={bozza.totale} onChange={(e) => campo("totale", e.target.value)} />
                </Campo>
                <Campo etichetta="Valuta">
                  <select className={CL} value={bozza.valuta} onChange={(e) => campo("valuta", e.target.value)}>
                    {VALUTE_AMMESSE.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </Campo>
                <Campo etichetta="Termini (giorni)" nota="La scadenza si calcola da qui, non si scrive">
                  <input
                    type="number"
                    className={CL}
                    value={bozza.terminiGiorni}
                    onChange={(e) => campo("terminiGiorni", Number(e.target.value) || 0)}
                  />
                </Campo>
                <Campo etichetta="Oggetto">
                  <input className={CL} value={bozza.note} onChange={(e) => campo("note", e.target.value)} />
                </Campo>
              </div>

              <Parte
                titolo="Emittente"
                nota="Chi ha emesso: è la società a cui va il fatturato"
                letta={lettura.emittente.ragione_sociale}
                piva={lettura.emittente.partita_iva}
                abbinamento={abbEmittente}
                elenco={emittenti}
                valore={emittenteId}
                onScegli={setEmittenteId}
                onCrea={() => creaDaLettura("issuer")}
                creando={creaAnagrafica.isPending}
              />

              <Parte
                titolo="Cliente"
                nota="L'intestatario, quello che ha pagato"
                letta={lettura.cliente.ragione_sociale}
                piva={lettura.cliente.partita_iva}
                abbinamento={abbCliente}
                elenco={clienti}
                valore={clienteId}
                onScegli={setClienteId}
                onCrea={() => creaDaLettura("client")}
                creando={creaAnagrafica.isPending}
              />

              <div className="rounded-lg border px-3 py-2.5">
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={bozza.incassata}
                    onChange={(e) => campo("incassata", e.target.checked)}
                  />
                  È già stata incassata
                </label>
                {bozza.incassata ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      Quando:
                    </span>
                    <input
                      type="date"
                      className={CL}
                      value={bozza.dataIncasso}
                      onChange={(e) => campo("dataIncasso", e.target.value)}
                    />
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      vuoto = alla scadenza
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--amber, #b45309)" }}>
                    Entrerà aperta: comparirà fra le fatture da incassare e, se scaduta, in Recall.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            Il PDF viene conservato insieme alla riga.
          </span>
          <div className="flex gap-2">
            <button onClick={onChiudi} className="rounded-lg border px-3 py-1.5 text-[13px]">
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={!puoSalvare}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-white disabled:opacity-40"
              style={{ background: "var(--primary, #009193)" }}
            >
              {fase === "salvataggio" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Importa nel registro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CL =
  "w-full rounded-lg border px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--primary,#009193)]/30";

function Campo({
  etichetta, nota, children,
}: { etichetta: string; nota?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px]" style={{ color: "var(--muted)" }}>{etichetta}</span>
      {children}
      {nota && <span className="mt-0.5 block text-[10px]" style={{ color: "var(--muted)" }}>{nota}</span>}
    </label>
  );
}

/**
 * Una delle due parti della fattura, con il suo abbinamento.
 *
 * Dice sempre due cose: cosa c'era scritto sul documento e a quale anagrafica
 * e' stata attribuita. Sono informazioni diverse, e confonderle e' il modo in
 * cui una fattura finisce attribuita alla societa' sbagliata.
 */
function Parte({
  titolo, nota, letta, piva, abbinamento, elenco, valore, onScegli, onCrea, creando,
}: {
  titolo: string;
  nota: string;
  letta: string | null;
  piva?: string | null;
  abbinamento: Abbinamento;
  elenco: ContattoNoto[];
  valore: string;
  onScegli: (id: string) => void;
  onCrea: () => void;
  creando: boolean;
}) {
  const trovato = abbinamento.contatto;
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium">{titolo}</span>
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>{nota}</span>
      </div>

      <p className="mt-1 text-[12px]">
        <span style={{ color: "var(--muted)" }}>Sul documento: </span>
        {letta ?? <i>non letto</i>}
        {piva && <span style={{ color: "var(--muted)" }}> · {piva}</span>}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <select className={CL} value={valore} onChange={(e) => onScegli(e.target.value)}>
          <option value="">— nessuna anagrafica —</option>
          {elenco.map((c) => (
            <option key={c.id} value={c.id}>{c.company_name}</option>
          ))}
        </select>
        {letta && !trovato && (
          <button
            onClick={onCrea}
            disabled={creando}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] disabled:opacity-40"
          >
            {creando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Crea
          </button>
        )}
      </div>

      {trovato && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
          {abbinamento.motivo === "partita_iva"
            ? "Abbinata per partita IVA: è la stessa società."
            : "Abbinata per somiglianza del nome: controlla che sia davvero lei."}
        </p>
      )}
      {!trovato && letta && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--amber, #b45309)" }}>
          Nessuna anagrafica corrisponde: scegline una o creala da quello che c'è in fattura.
        </p>
      )}
    </div>
  );
}
