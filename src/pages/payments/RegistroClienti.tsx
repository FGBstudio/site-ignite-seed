import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useQuotazioniAperte } from "@/hooks/usePayments";
import { KpiCard, Money, PillCiclo, PillPagamento } from "@/components/payments/Comuni";
import { importo, registroClienti, type SchedaCliente } from "@/lib/payments/aggregati";
import { cn } from "@/lib/utils";

/**
 * Registro Clienti — quanto abbiamo fatturato, quanto ci devono, quanto ancora.
 *
 * Sono le tre domande che arrivano sempre insieme e che oggi costringono a
 * incrociare tre schermate a mano: è così che nascono i numeri sbagliati nelle
 * riunioni. Qui stanno su una riga sola, per cliente, e aprendola si vedono le
 * fatture dalla più recente.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yy", { locale: it }) : "—");

export default function RegistroClienti() {
  const { fatture, caricamento } = usePaymentsCtx();
  const { data: quotazioni = [] } = useQuotazioniAperte();

  const [cerca, setCerca] = useState("");
  const [progetto, setProgetto] = useState("tutti");
  const [aperto, setAperto] = useState<string | null>(null);

  const clienti = useMemo(
    () => registroClienti(fatture, quotazioni),
    [fatture, quotazioni],
  );

  const progetti = useMemo(
    () => [...new Set(fatture.map((f) => f.project_name).filter(Boolean) as string[])].sort(),
    [fatture],
  );

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return clienti
      .filter((c) => (q ? c.nome.toLowerCase().includes(q) : true))
      // Filtrando per progetto restano solo i clienti che ci lavorano, e di
      // loro solo le fatture di quel progetto: un totale che comprendesse le
      // altre risponderebbe a una domanda diversa da quella fatta.
      .map((c) =>
        progetto === "tutti"
          ? c
          : {
              ...c,
              fatture: c.fatture.filter((f) => f.project_name === progetto),
            },
      )
      .filter((c) => progetto === "tutti" || c.fatture.length > 0)
      .map((c) => (progetto === "tutti" ? c : ricalcola(c)));
  }, [clienti, cerca, progetto]);

  const tot = righe.reduce(
    (t, c) => ({
      netto: t.netto + c.netto,
      aperto: t.aperto + c.aperto,
      insoluto: t.insoluto + c.insoluto,
      potenziale: t.potenziale + c.potenziale,
    }),
    { netto: 0, aperto: 0, insoluto: 0, potenziale: 0 },
  );

  const esporta = () => {
    const testa = ["Cliente", "Fatturato netto", "Incassato", "Da incassare", "Insoluto", "Potenziale", "Fatture", "Ultima"];
    const corpo = righe.map((c) => [
      c.nome, c.netto, c.incassato, c.aperto, c.insoluto, c.potenziale, c.fatture.length, c.ultima ?? "",
    ]);
    const csv = [testa, ...corpo]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `registro-clienti-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Registro Clienti</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Quanto gli abbiamo fatturato, quanto devono ancora, quanto potremmo fatturargli.
          </p>
        </div>
        <button
          type="button"
          onClick={esporta}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold"
          style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }}
        >
          <Download className="h-3.5 w-3.5" /> Esporta CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard etichetta="Fatturato netto" valore={importo(tot.netto)} sotto={`${righe.length} clienti`} />
        <KpiCard etichetta="Da incassare" valore={importo(tot.aperto)} variante="ambra" sotto="crediti aperti" />
        <KpiCard etichetta="Insoluto" valore={importo(tot.insoluto)} variante="rossa" sotto="in recupero" />
        <KpiCard etichetta="Potenziale" valore={importo(tot.potenziale)} sotto="quotazioni non approvate" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--faint)" }} />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca un cliente…"
            aria-label="Cerca un cliente"
            className="h-8 w-64 rounded-[10px] pl-8 pr-3 text-[12px] outline-none"
            style={{ border: "1px solid var(--border)", background: "#fff" }}
          />
        </span>
        <select
          value={progetto}
          onChange={(e) => setProgetto(e.target.value)}
          aria-label="Filtra per progetto"
          className="h-8 max-w-[260px] rounded-[10px] px-2 text-[12px] outline-none"
          style={{ border: "1px solid var(--border)", background: "#fff" }}
        >
          <option value="tutti">Tutti i progetti</option>
          {progetti.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {progetto !== "tutti" && (
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            I totali contano solo le fatture di questo progetto.
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Cliente</th>
                <th>Progetti</th>
                <th className="text-right">Fatturato netto</th>
                <th className="text-right">Incassato</th>
                <th className="text-right">% incassato</th>
                <th className="text-right">Da incassare</th>
                <th className="text-right">Insoluto</th>
                <th className="text-right">Potenziale</th>
                <th>Ultima fattura</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr><td colSpan={10} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>Caricamento…</td></tr>
              )}
              {!caricamento && righe.length === 0 && (
                <tr><td colSpan={10} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>Nessun cliente con questi filtri.</td></tr>
              )}

              {righe.map((c) => (
                <RigaCliente
                  key={c.chiave}
                  c={c}
                  aperto={aperto === c.chiave}
                  onApri={() => setAperto(aperto === c.chiave ? null : c.chiave)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="px-3 py-2.5 text-[11px]" style={{ background: "var(--ground)", color: "var(--muted)" }}>
          Il <b>potenziale</b> viene dalle quotazioni non ancora approvate, abbinate al cliente
          per nome: le fatture puntano a una società in anagrafica, le quotazioni portano il nome
          come testo, e fra le due non esiste un legame. Se un cliente è scritto in due modi
          diversi, il suo potenziale può finire su una riga a parte.
        </p>
      </div>
    </div>
  );
}

/** Rifà i totali su un sottoinsieme di fatture: serve al filtro per progetto. */
function ricalcola(c: SchedaCliente): SchedaCliente {
  const fatturato = c.fatture.reduce((t, f) => t + f.total_eur, 0);
  const nc = c.fatture.reduce((t, f) => t + f.credited_amount * f.exch_rate, 0);
  return {
    ...c,
    fatturato,
    noteCredito: nc,
    netto: fatturato - nc,
    incassato: c.fatture.reduce((t, f) => t + f.paid_amount * f.exch_rate, 0),
    aperto: c.fatture
      .filter((f) => f.residual > 0 && f.lifecycle_state !== "closed")
      .reduce((t, f) => t + f.residual_eur, 0),
    insoluto: c.fatture
      .filter((f) => f.lifecycle_state === "insoluto" && f.recovery_state !== "write_off")
      .reduce((t, f) => t + f.residual_eur, 0),
    ultima: c.fatture[0]?.issue_date ?? null,
  };
}

function RigaCliente({
  c,
  aperto,
  onApri,
}: {
  c: SchedaCliente;
  aperto: boolean;
  onApri: () => void;
}) {
  // La percentuale dice in un colpo quello che due importi affiancati
  // costringono a calcolare a mente.
  const pct = c.netto > 0 ? Math.round((c.incassato / c.netto) * 100) : null;

  return (
    <>
      <tr className={cn("riga", aperto && "aperta")} onClick={onApri}>
        <td>
          {aperto
            ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--muted)" }} />
            : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--faint)" }} />}
        </td>
        <td className="font-semibold uppercase">{c.nome}</td>
        <td className="max-w-[220px] truncate text-[11.5px]" style={{ color: "var(--muted)" }} title={c.progetti.join(" · ")}>
          {c.progetti.length === 0 ? "—" : c.progetti.length === 1 ? c.progetti[0] : `${c.progetti.length} progetti`}
        </td>
        <td className="num text-right font-bold">{importo(c.netto)}</td>
        <td className="num text-right" style={{ color: "var(--green)" }}>
          {c.incassato > 0 ? importo(c.incassato) : "—"}
        </td>
        <td className="num text-right" style={{ color: pct !== null && pct < 100 ? "var(--amber)" : "var(--green)" }}>
          {pct !== null ? `${pct}%` : "—"}
        </td>
        <td className="num text-right font-semibold" style={{ color: c.aperto > 0 ? "var(--amber)" : undefined }}>
          {c.aperto > 0 ? importo(c.aperto) : "—"}
        </td>
        <td className="num text-right font-semibold" style={{ color: c.insoluto > 0 ? "var(--red)" : undefined }}>
          {c.insoluto > 0 ? importo(c.insoluto) : "—"}
        </td>
        <td className="num text-right" style={{ color: "var(--teal-dark)" }}>
          {c.potenziale > 0 ? importo(c.potenziale) : "—"}
        </td>
        <td className="num" style={{ color: "var(--muted)" }}>{d(c.ultima)}</td>
      </tr>

      {aperto && (
        <tr>
          <td colSpan={10} className="dettaglio p-0">
            <div className="p-4">
              <p className="label mb-2">Fatture, dalla più recente</p>
              {c.fatture.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                  Nessuna fattura: questo cliente ha solo quotazioni aperte.
                </p>
              ) : (
                <table>
                  <tbody>
                    {c.fatture.map((f) => (
                      <tr key={f.id}>
                        <td className="num font-semibold">{f.number}</td>
                        <td style={{ color: "var(--muted)" }}>{f.project_name ?? "—"}</td>
                        <td className="num" style={{ color: "var(--muted)" }}>{d(f.issue_date)}</td>
                        <td className="text-right"><Money valore={f.total} valuta={f.currency} /></td>
                        <td className="text-right">
                          {f.paid_amount > 0
                            ? <Money valore={f.paid_amount} valuta={f.currency} className="text-[var(--green)]" />
                            : <span style={{ color: "var(--faint)" }}>—</span>}
                        </td>
                        <td className="text-right font-bold" style={{ color: f.residual > 0 ? "var(--red)" : "var(--green)" }}>
                          <Money valore={f.residual} valuta={f.currency} />
                        </td>
                        <td><PillPagamento stato={f.payment_status} /></td>
                        <td><PillCiclo stato={f.lifecycle_state} recall={f.recall_status} giorniRitardo={f.days_late} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
