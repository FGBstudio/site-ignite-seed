import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Gavel, RotateCcw, Scale } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { usePortaAInsoluto, useRiportaDaInsoluto } from "@/hooks/usePayments";
import { KpiCard, Pill } from "@/components/payments/Comuni";
import { importo } from "@/lib/payments/aggregati";
import { useToast } from "@/hooks/use-toast";
import type { InvoiceRow, RecoveryState } from "@/types/payments";

/**
 * Insoluti — i crediti che non rientrano da soli.
 *
 * Ci si arriva per decisione, mai per scadenza: stabilire che un credito è
 * perso ha conseguenze — recupero legale, svalutazione — e un automatismo
 * toglierebbe quella scelta a chi deve prenderla.
 *
 * Archivio per anno, perché è così che si guarda un insoluto: «quanto abbiamo
 * perso nel 2025» è una domanda che si fa a fine esercizio.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy", { locale: it }) : "—");

const RECUPERO: Record<RecoveryState, { nome: string; tinta: "amber" | "red" | "neutro" }> = {
  in_gestione: { nome: "In gestione", tinta: "amber" },
  legale: { nome: "Legale", tinta: "red" },
  write_off: { nome: "Perdita accettata", tinta: "neutro" },
};

export default function Insoluti() {
  const { fatture } = usePaymentsCtx();
  const porta = usePortaAInsoluto();
  const riporta = useRiportaDaInsoluto();
  const { toast } = useToast();
  const [candidata, setCandidata] = useState<InvoiceRow | null>(null);

  const insolute = useMemo(
    () => fatture.filter((f) => f.lifecycle_state === "insoluto" || f.recovery_state),
    [fatture],
  );

  // Le fatture che si stanno ancora inseguendo da tanto: sono le candidate a
  // diventare insoluti, e averle sott'occhio è il motivo per cui questa pagina
  // non è solo un archivio.
  //
  // Fuori quelle il cui residuo è tutto un ammanco trattenuto dalla banca: sono
  // scadute da altrettanto, ma non si inseguono — si riversano sulla prossima
  // fattura. Chiamarle «candidate al recupero» accanto ai 5.775 di Taipei
  // direbbe che c'è qualcuno da chiamare, e non c'è.
  const inRecallDaTanto = useMemo(
    () =>
      fatture.filter(
        (f) =>
          f.lifecycle_state === "in_recall" &&
          f.days_late > 90 &&
          f.ammanco_da_recuperare < f.residual - 0.005,
      ),
    [fatture],
  );

  const perAnno = useMemo(() => {
    const m = new Map<string, InvoiceRow[]>();
    for (const f of insolute) {
      const a = f.issue_date.slice(0, 4);
      m.set(a, [...(m.get(a) ?? []), f]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [insolute]);

  const daRecuperare = insolute.filter((f) => f.recovery_state !== "write_off");
  const perse = insolute.filter((f) => f.recovery_state === "write_off");

  const azione = async (p: Promise<unknown>, titolo: string) => {
    try {
      await p;
      toast({ title: titolo });
      setCandidata(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non riuscito", description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titolo text-lg">Insoluti</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          Ci si arriva per decisione, mai per scadenza. La perdita accettata resta scritta: un
          credito perso che sparisce è un credito che nessuno impara a evitare.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          etichetta="Ancora da recuperare"
          valore={importo(daRecuperare.reduce((t, f) => t + f.residual_eur, 0))}
          sotto={`${daRecuperare.length} pratiche aperte`}
          variante="rossa"
        />
        <KpiCard
          etichetta="Perdite accettate"
          valore={importo(perse.reduce((t, f) => t + f.residual_eur, 0))}
          sotto={`${perse.length} chiuse in perdita, tracciate`}
        />
        <KpiCard
          etichetta="In sollecito da oltre 90 gg"
          valore={inRecallDaTanto.length}
          sotto="candidate al recupero"
          variante="ambra"
        />
      </div>

      {/* ── Le candidate ── */}
      {inRecallDaTanto.length > 0 && (
        <section className="card overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <Scale className="h-4 w-4" style={{ color: "var(--amber)" }} />
            <h2 className="titolo text-[13px]">Da valutare per il recupero</h2>
          </header>
          <ul>
            {inRecallDaTanto.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="min-w-[220px] flex-1">
                  <p className="num text-[13px] font-semibold">
                    {f.number}
                    <span className="ml-2 font-normal" style={{ color: "var(--muted)" }}>
                      {f.client_name ?? "—"}
                    </span>
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {f.project_name ?? "—"} · scaduta da {f.days_late} giorni ·{" "}
                    {f.reminders_count} solleciti
                  </p>
                </div>
                <p className="num text-[14px] font-bold" style={{ color: "var(--red)" }}>
                  {importo(f.residual, f.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => setCandidata(f)}
                  className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold"
                  style={{ background: "#fff", color: "var(--red)", border: "1px solid var(--red)" }}
                >
                  <Gavel className="h-3 w-3" /> Manda a recupero
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── L'archivio ── */}
      {perAnno.length === 0 ? (
        <p className="card p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Nessun insoluto. È il risultato migliore che questa pagina possa dare.
        </p>
      ) : (
        perAnno.map(([anno, lista]) => (
          <section key={anno} className="card overflow-hidden">
            <header
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: "var(--ground)", borderBottom: "1px solid var(--border)" }}
            >
              <h2 className="titolo text-[12.5px]">{anno}</h2>
              <span className="num ml-auto text-[12px] font-semibold">
                {importo(lista.reduce((t, f) => t + f.residual_eur, 0))}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>N° Fattura</th>
                    <th>Cliente</th>
                    <th>Progetto</th>
                    <th>Emissione</th>
                    <th className="text-right">Totale</th>
                    <th className="text-right">Incassato</th>
                    <th className="text-right">Perduto</th>
                    <th>Recupero</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f) => {
                    const r = f.recovery_state ? RECUPERO[f.recovery_state] : null;
                    return (
                      <tr key={f.id}>
                        <td className="num font-semibold">{f.number}</td>
                        <td>{f.client_name ?? "—"}</td>
                        <td style={{ color: "var(--muted)" }}>{f.project_name ?? "—"}</td>
                        <td className="num" style={{ color: "var(--muted)" }}>{d(f.issue_date)}</td>
                        <td className="num text-right">{importo(f.total, f.currency)}</td>
                        <td className="num text-right" style={{ color: "var(--green)" }}>
                          {f.paid_amount > 0 ? importo(f.paid_amount, f.currency) : "—"}
                        </td>
                        <td className="num text-right font-bold" style={{ color: "var(--red)" }}>
                          {importo(f.residual, f.currency)}
                        </td>
                        <td>{r ? <Pill tinta={r.tinta} pallino>{r.nome}</Pill> : "—"}</td>
                        <td>
                          {/* Si può tornare indietro: il cliente si fa vivo, la
                              pratica rientra. Succede. */}
                          {f.recovery_state !== "write_off" && (
                            <button
                              type="button"
                              onClick={() =>
                                azione(riporta.mutateAsync({ invoice_id: f.id }), "Riportata in recall")
                              }
                              className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold"
                              style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
                            >
                              <RotateCcw className="h-3 w-3" /> Riporta
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
        ))
      )}

      {/* ── La scelta ── */}
      {candidata && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCandidata(null)}
        >
          <div
            className="card w-full max-w-md p-5"
            style={{ background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="titolo text-[13px]">Manda a recupero</h3>
            <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
              {candidata.number} · {candidata.client_name ?? "—"} ·{" "}
              {importo(candidata.residual, candidata.currency)}
            </p>
            <div className="mt-4 space-y-2">
              {(["in_gestione", "legale", "write_off"] as RecoveryState[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    azione(
                      porta.mutateAsync({ invoice_id: candidata.id, recupero: s }),
                      `${candidata.number} → ${RECUPERO[s].nome}`,
                    )
                  }
                  className="w-full rounded-[10px] border p-3 text-left text-[12.5px] hover:bg-[var(--ground)]"
                >
                  <b>{RECUPERO[s].nome}</b>
                  <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                    {s === "in_gestione" && "Si continua a inseguirlo, fuori dai solleciti automatici."}
                    {s === "legale" && "In mano a un legale: resta un credito, non si sollecita più."}
                    {s === "write_off" &&
                      "Perdita accettata: esce dai crediti e la fattura si chiude, ma resta scritta."}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCandidata(null)}
              className="mt-3 w-full rounded-[10px] border px-3 py-2 text-[12px] font-semibold"
              style={{ color: "var(--muted)" }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
