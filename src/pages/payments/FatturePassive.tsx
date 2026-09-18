import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check, FileWarning, Paperclip, Plus, Upload } from "lucide-react";
import {
  linkPdfPassiva,
  useFatturePassive,
  useFornitori,
  usePagaFatturaPassiva,
} from "@/hooks/usePayments";
import { KpiCard, Pill } from "@/components/payments/Comuni";
import { PannelloFatturaPassiva } from "@/components/payments/PannelloFatturaPassiva";
import { importo } from "@/lib/payments/aggregati";
import { useToast } from "@/hooks/use-toast";
import type { Currency, PassiveInvoice, Supplier } from "@/types/payments";

/**
 * Fatture Passive — quello che dobbiamo noi.
 *
 * La scadenza si conta dalla RICEZIONE, non dall'emissione: è la data in cui il
 * documento è entrato in casa che fa decorrere i termini, e prendere quella
 * sbagliata significa pagare in ritardo credendo di essere in anticipo.
 *
 * Raggruppate per fornitore perché è così che si guardano: «quanto devo a
 * questo, e quando».
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM", { locale: it })
 : "—");

export default function FatturePassive() {
  const { data: fatture = [], isLoading } = useFatturePassive();
  const { data: fornitori = [] } = useFornitori();
  const paga = usePagaFatturaPassiva();
  const { toast } = useToast();

  const [nuova, setNuova] = useState(false);
  const [filtroFornitore, setFiltroFornitore] = useState("tutti");
  const [filtroStato, setFiltroStato] = useState("tutti");
  const [filtroValuta, setFiltroValuta] = useState("tutte");

  const perId = useMemo(() => new Map(fornitori.map((f) => [f.id, f])), [fornitori]);
  const oggi = new Date();

  const righe = useMemo(
    () =>
      fatture.filter((f) => {
        if (filtroFornitore !== "tutti" && f.supplier_id !== filtroFornitore) return false;
        if (filtroStato !== "tutti" && f.state !== filtroStato) return false;
        if (filtroValuta !== "tutte" && f.currency !== filtroValuta) return false;
        return true;
      }),
    [fatture, filtroFornitore, filtroStato, filtroValuta],
  );

  const daPagare = righe.filter((f) => f.state !== "paid");
  const entro30 = daPagare.filter(
    (f) => differenceInCalendarDays(parseISO(f.due_date), oggi) <= 30,
  );
  const scadute = daPagare.filter((f) => differenceInCalendarDays(parseISO(f.due_date), oggi) < 0);

  /** I totali restano in valuta: sommare euro e yuan darebbe un numero che non esiste. */
  const perValuta = useMemo(() => {
    const m = new Map<Currency, number>();
    for (const f of daPagare) m.set(f.currency, (m.get(f.currency) ?? 0) + f.total);
    return [...m.entries()];
  }, [daPagare]);

  const gruppi = useMemo(() => {
    const m = new Map<string, PassiveInvoice[]>();
    for (const f of righe) {
      const g = m.get(f.supplier_id) ?? [];
      g.push(f);
      m.set(f.supplier_id, g);
    }
    return [...m.entries()].sort(
      (a, b) => (perId.get(a[0])?.name ?? "").localeCompare(perId.get(b[0])?.name ?? ""),
    );
  }, [righe, perId]);

  const apriPdf = async (percorso: string) => {
    try {
      window.open(await linkPdfPassiva(percorso), "_blank", "noopener");
    } catch (e: any) {
      toast({ variant: "destructive", title: "PDF non raggiungibile", description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Fatture Passive</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            La scadenza si conta dalla ricezione, non dall'emissione: è quando il documento
            entra in casa che partono i termini.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNuova(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: "var(--teal)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Registra fattura
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          etichetta="Da pagare entro 30 gg"
          valore={importo(entro30.reduce((t, f) => t + f.total, 0))}
          sotto={`${entro30.length} fatture in scadenza`}
        />
        <KpiCard
          etichetta="Scadute"
          valore={importo(scadute.reduce((t, f) => t + f.total, 0))}
          sotto={`${scadute.length} oltre i termini`}
          variante="rossa"
        />
        <div className="card p-4">
          <p className="label">Per valuta</p>
          {perValuta.length === 0 ? (
            <p className="mt-1.5 text-[12px]" style={{ color: "var(--muted)" }}>
              Niente da pagare.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {perValuta.map(([v, t]) => (
                <li key={v} className="num flex justify-between text-[12.5px]">
                  <span style={{ color: "var(--muted)" }}>{v}</span>
                  <b>{importo(t, v)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Filtri ── */}
      <div className="flex flex-wrap gap-2">
        <Tendina value={filtroFornitore} onChange={setFiltroFornitore} aria="Fornitore">
          <option value="tutti">Tutti i fornitori</option>
          {fornitori.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Tendina>
        <Tendina value={filtroStato} onChange={setFiltroStato} aria="Stato">
          <option value="tutti">Tutti gli stati</option>
          <option value="to_pay">Da pagare</option>
          <option value="overdue">Scadute</option>
          <option value="paid">Pagate</option>
        </Tendina>
        <Tendina value={filtroValuta} onChange={setFiltroValuta} aria="Valuta">
          <option value="tutte">Tutte le valute</option>
          {["EUR", "GBP", "CNY", "USD"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Tendina>
      </div>

      {/* ── Raggruppate per fornitore ── */}
      {isLoading ? (
        <p className="card p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Caricamento…
        </p>
      ) : gruppi.length === 0 ? (
        <p className="card p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Nessuna fattura passiva registrata.
        </p>
      ) : (
        gruppi.map(([idFornitore, lista]) => {
          const f = perId.get(idFornitore);
          return (
            <section key={idFornitore} className="card overflow-hidden">
              <header
                className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                style={{ background: "var(--ground)", borderBottom: "1px solid var(--border)" }}
              >
                <h2 className="titolo text-[12.5px]">{f?.name ?? "Fornitore"}</h2>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {f?.default_currency}
                </span>
                {/* I termini diversi dal default si vedono: sono un accordo
                    particolare con quel fornitore, non una svista. */}
                {f && f.default_terms_days !== 60 ? (
                  <Pill tinta="amber">{f.default_terms_days} gg ✎</Pill>
                ) : (
                  <Pill tinta="neutro">{f?.default_terms_days ?? 60} gg</Pill>
                )}
                <span className="num ml-auto text-[12px] font-semibold">
                  {importo(
                    lista.filter((x) => x.state !== "paid").reduce((t, x) => t + x.total, 0),
                    (f?.default_currency ?? "EUR") as Currency,
                  )}{" "}
                  <span className="font-normal" style={{ color: "var(--muted)" }}>
                    da pagare
                  </span>
                </span>
              </header>

              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>N° fattura</th>
                      <th>Ricezione</th>
                      <th>Emissione</th>
                      <th>Termini</th>
                      <th>Scadenza</th>
                      <th className="text-right">Imponibile</th>
                      <th className="text-right">Tassa</th>
                      <th className="text-right">Totale</th>
                      <th>PDF</th>
                      <th>Stato</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => {
                      const giorni = differenceInCalendarDays(parseISO(r.due_date), oggi);
                      const inRitardo = r.state !== "paid" && giorni < 0;
                      return (
                        <tr key={r.id}>
                          <td className="num font-semibold">{r.number}</td>
                          <td className="num" style={{ color: "var(--muted)" }}>{d(r.received_date)}</td>
                          <td className="num" style={{ color: "var(--muted)" }}>{d(r.issue_date)}</td>
                          <td>
                            <Pill tinta="neutro">{r.terms_days} gg</Pill>
                          </td>
                          <td className="num" style={{ color: inRitardo ? "var(--red)" : undefined }}>
                            {d(r.due_date)}
                            {inRitardo && <b> +{Math.abs(giorni)}gg</b>}
                          </td>
                          <td className="num text-right" style={{ color: "var(--muted)" }}>
                            {importo(r.taxable, r.currency)}
                          </td>
                          <td className="num text-right" style={{ color: "var(--muted)" }}>
                            {importo(r.tax, r.currency)}
                          </td>
                          <td className="num text-right font-bold">{importo(r.total, r.currency)}</td>
                          <td>
                            {r.pdf_path ? (
                              <button
                                type="button"
                                onClick={() => apriPdf(r.pdf_path!)}
                                className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                                style={{ color: "var(--teal-dark)" }}
                              >
                                <Paperclip className="h-3 w-3" /> apri
                              </button>
                            ) : (
                              // Segnalato, non bloccante: registrare la fattura
                              // senza allegato è meglio che non registrarla.
                              <span
                                className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                                style={{ color: "var(--red)" }}
                              >
                                <FileWarning className="h-3 w-3" /> manca
                              </span>
                            )}
                          </td>
                          <td>
                            <Pill
                              tinta={r.state === "paid" ? "green" : inRitardo ? "red" : "neutro"}
                              pallino
                            >
                              {r.state === "paid"
                                ? `Pagata ${d(r.paid_date)}`
                                : inRitardo
                                  ? "Scaduta"
                                  : "Da pagare"}
                            </Pill>
                          </td>
                          <td>
                            {r.state !== "paid" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await paga.mutateAsync({ id: r.id });
                                    toast({ title: `${r.number} segnata come pagata` });
                                  } catch (e: any) {
                                    toast({
                                      variant: "destructive",
                                      title: "Non riuscito",
                                      description: e.message,
                                    });
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
                                style={{ background: "var(--green)" }}
                              >
                                <Check className="h-3 w-3" /> Pagata
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
        <Upload className="h-3 w-3" />
        I PDF restano nell'archivio fiscale, consultabili con un link temporaneo: il deposito è
        privato, non esiste un indirizzo indovinabile.
      </p>

      <PannelloFatturaPassiva
        aperto={nuova}
        onChiudi={() => setNuova(false)}
        fornitori={fornitori}
      />
    </div>
  );
}

function Tendina({
  value,
  onChange,
  aria,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={aria}
      className="h-8 rounded-[10px] px-2 text-[12px] outline-none"
      style={{ border: "1px solid var(--border)", background: "#fff" }}
    >
      {children}
    </select>
  );
}
