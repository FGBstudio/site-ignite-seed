import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, Download, Search, TriangleAlert } from "lucide-react";
import {
  useProgettiFatturazione, useTrancheProgetto,
  type ProgettoFatturazione,
} from "@/hooks/useFatturazioneProgetti";
import { Money } from "@/components/payments/Comuni";
import { decimaliUtili, importo } from "@/lib/payments/aggregati";
import type { EntityCode } from "@/types/payments";

/**
 * L'«Elenco Progetti»: quanto è stato quotato, quanto fatturato, quanto manca.
 *
 * È il foglio che Francesca sta ricostruendo a mano, con una differenza che si
 * vede solo nei casi limite: dove la quotazione non è mai stata registrata, i
 * conti che dipendono da lei restano **vuoti**. Il foglio a mano lì scriveva
 * zero, e uno zero si legge come «non resta niente da fatturare».
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yy", { locale: it }) : "—");

export function ProgettiFatturazione({ entita }: { entita: EntityCode | null }) {
  const { data: progetti = [], isLoading } = useProgettiFatturazione();
  const [cerca, setCerca] = useState("");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [aperto, setAperto] = useState<string | null>(null);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return progetti.filter((p) => {
      if (entita && p.entity_code !== entita) return false;
      // Di norma si guardano i progetti che hanno una storia di fatturazione o
      // una quotazione viva: i 1.400 importati senza né l'una né l'altra
      // renderebbero l'elenco illeggibile.
      if (soloAttivi && p.fatturato === 0 && !p.quotato) return false;
      if (!q) return true;
      return `${p.progetto} ${p.brand ?? ""} ${p.intestatario ?? ""} ${p.city ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [progetti, cerca, entita, soloAttivi]);

  const totali = useMemo(
    () => ({
      quotato: righe.reduce((s, p) => s + (p.quotato ?? 0), 0),
      fatturato: righe.reduce((s, p) => s + p.fatturato, 0),
      incassato: righe.reduce((s, p) => s + p.incassato, 0),
      daIncassare: righe.reduce((s, p) => s + p.da_incassare, 0),
      senzaQuotazione: righe.filter((p) => p.quotazione_mancante).length,
    }),
    [righe],
  );

  const esporta = () => {
    const testa = [
      "Cliente", "Brand", "Progetto", "Città", "Protocollo", "Livello", "Emittente",
      "Stato", "PM", "Quotato", "Fatturato", "% fatturazione", "Da fatturare",
      "Incassato", "Da incassare", "Tranche", "di cui fatturate",
    ];
    const corpo = righe.map((p) => [
      p.intestatario ?? "", p.brand ?? "", p.progetto, p.city ?? "",
      [p.cert_type, p.cert_rating].filter(Boolean).join(" "), p.cert_level ?? "",
      p.emittente ?? "", p.status, p.pm ?? "",
      p.quotato ?? "", p.fatturato,
      p.pct_fatturazione != null ? Math.round(p.pct_fatturazione * 100) + "%" : "",
      p.da_fatturare ?? "", p.incassato, p.da_incassare,
      p.quante_tranche, p.tranche_fatturate,
    ]);
    const csv = [testa, ...corpo]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `elenco-progetti-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--faint)" }} />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca cliente, brand, progetto, città…"
            className="h-9 w-[280px] rounded-[10px] pl-8 pr-3 text-[12px] outline-none"
            style={{ border: "1px solid var(--border)", background: "#fff" }}
          />
        </span>

        <label className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--muted)" }}>
          <input type="checkbox" checked={soloAttivi} onChange={(e) => setSoloAttivi(e.target.checked)} />
          solo quelli con una quotazione o una fattura
        </label>

        <button
          type="button"
          onClick={esporta}
          disabled={righe.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
          style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }}
        >
          <Download className="h-3.5 w-3.5" /> Esporta elenco
        </button>
      </div>

      {totali.senzaQuotazione > 0 && (
        <p
          className="flex items-start gap-2 rounded-[10px] px-3 py-2 text-[11.5px]"
          style={{ background: "var(--amber-bg)", color: "var(--amber)" }}
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {totali.senzaQuotazione} progetti hanno fatture ma nessuna quotazione registrata: per
            loro «da fatturare» e la percentuale restano vuoti, perché non c&apos;è un termine di
            paragone. Si riempiono caricando le offerte che le hanno generate.
          </span>
        </p>
      )}

      <div className="tabella-guscio overflow-x-auto">
        <table className="tabella w-full text-[12px]">
          <thead>
            <tr>
              <th style={{ width: 24 }} />
              <th>Cliente</th>
              <th>Progetto</th>
              <th>Protocollo</th>
              <th className="text-right">Quotato</th>
              <th className="text-right">Fatturato</th>
              <th className="text-right">%</th>
              <th className="text-right">Da fatturare</th>
              <th className="text-right">Incassato</th>
              <th className="text-right">Da incassare</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Un momento…
                </td>
              </tr>
            )}
            {!isLoading && righe.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Nessun progetto con questi filtri.
                </td>
              </tr>
            )}
            {righe.map((p) => (
              <RigaProgetto
                key={p.id}
                p={p}
                aperto={aperto === p.id}
                onApri={() => setAperto(aperto === p.id ? null : p.id)}
              />
            ))}
          </tbody>
        </table>

        {righe.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[11px]"
            style={{ background: "var(--ground)", color: "var(--muted)" }}
          >
            <span className="num">{righe.length} progetti</span>
            <span className="num">
              quotato <b>{importo(totali.quotato)}</b> · fatturato{" "}
              <b>{importo(totali.fatturato)}</b> · incassato <b>{importo(totali.incassato)}</b> ·
              da incassare{" "}
              <b style={{ color: totali.daIncassare > 0 ? "var(--red)" : undefined }}>
                {importo(totali.daIncassare)}
              </b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RigaProgetto({
  p, aperto, onApri,
}: {
  p: ProgettoFatturazione;
  aperto: boolean;
  onApri: () => void;
}) {
  const { data: tranche = [] } = useTrancheProgetto(aperto ? p.id : null);

  return (
    <>
      <tr className="riga" onClick={onApri}>
        <td>
          {aperto ? (
            <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--muted)" }} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--faint)" }} />
          )}
        </td>
        <td className="font-semibold">
          {p.intestatario || "—"}
          {p.brand && p.brand !== p.intestatario && (
            <span className="ml-1.5 font-normal" style={{ color: "var(--muted)" }}>
              × {p.brand}
            </span>
          )}
        </td>
        <td>
          {p.progetto}
          {p.city && (
            <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--faint)" }}>
              {p.city}
            </span>
          )}
        </td>
        <td style={{ color: "var(--muted)" }}>
          {[p.cert_type, p.cert_rating, p.cert_level].filter(Boolean).join(" ") || "—"}
        </td>
        <td className="text-right">
          {p.quotato != null ? (
            <Money valore={p.quotato} valuta={p.currency} decimali={decimaliUtili(p.quotato)} />
          ) : (
            <span title="Quotazione mai registrata" style={{ color: "var(--faint)" }}>
              —
            </span>
          )}
        </td>
        <td className="text-right">
          <Money valore={p.fatturato} valuta={p.currency} decimali={decimaliUtili(p.fatturato)} />
        </td>
        <td className="num text-right" style={{ color: "var(--muted)" }}>
          {p.pct_fatturazione != null ? `${Math.round(p.pct_fatturazione * 100)}%` : "—"}
        </td>
        <td className="text-right" style={{ color: "var(--muted)" }}>
          {p.da_fatturare != null ? (
            <Money valore={p.da_fatturare} valuta={p.currency} decimali={decimaliUtili(p.da_fatturare)} />
          ) : (
            "—"
          )}
        </td>
        <td className="text-right">
          <Money
            valore={p.incassato}
            valuta={p.currency}
            decimali={decimaliUtili(p.incassato)}
            className={p.incassato > 0 ? "text-[var(--green)]" : undefined}
          />
        </td>
        <td className="text-right">
          <Money
            valore={p.da_incassare}
            valuta={p.currency}
            decimali={decimaliUtili(p.da_incassare)}
            className={p.da_incassare > 0 ? "text-[var(--red)]" : undefined}
          />
        </td>
        <td style={{ color: "var(--muted)" }}>{p.status}</td>
      </tr>

      {aperto && (
        <tr>
          <td colSpan={11} className="dettaglio p-0">
            <div className="p-4">
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
                <span>emittente <b>{p.emittente ?? "—"}</b></span>
                <span>PM <b>{p.pm ?? "—"}</b></span>
                <span>offerta inviata <b>{d(p.quotation_sent_date)}</b></span>
                <span>approvata <b>{d(p.quotation_approved_at)}</b></span>
                {p.listino != null && p.quotato != null && p.listino > p.quotato && (
                  <span>
                    listino <b>{importo(p.listino, p.currency)}</b> · praticato{" "}
                    <b>{importo(p.quotato, p.currency)}</b>
                  </span>
                )}
              </div>

              {tranche.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                  Nessuna tranche registrata per questo progetto: la fatturazione non ha una
                  scaletta a cui appoggiarsi.
                </p>
              ) : (
                <table className="tabella w-full text-[11.5px]">
                  <thead>
                    <tr>
                      <th style={{ width: 20 }} />
                      <th>Tranche</th>
                      <th className="text-right">%</th>
                      <th className="text-right">Previsto</th>
                      <th>Fattura</th>
                      <th>Emessa</th>
                      <th>Scade</th>
                      <th className="text-right">Fatturato</th>
                      <th className="text-right">Incassato</th>
                      <th className="text-right">Residuo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tranche.map((t) => (
                      <tr key={t.tranche_id}>
                        {/* La spunta non è uno stato scritto da nessuno: è
                            l'esistenza di una fattura per questa tranche. */}
                        <td style={{ color: t.fatturata ? "var(--green)" : "var(--faint)" }}>
                          {t.fatturata ? "✓" : "○"}
                        </td>
                        <td>{t.tranche ?? `${t.tranche_order ?? "?"}ª`}</td>
                        <td className="num text-right" style={{ color: "var(--muted)" }}>
                          {t.tranche_pct != null ? `${t.tranche_pct}%` : "—"}
                        </td>
                        <td className="text-right" style={{ color: "var(--muted)" }}>
                          {t.importo_previsto != null
                            ? importo(t.importo_previsto, p.currency)
                            : "—"}
                        </td>
                        <td className="num">{t.fattura ?? "—"}</td>
                        <td className="num" style={{ color: "var(--muted)" }}>{d(t.emessa_il)}</td>
                        <td
                          className="num"
                          style={{ color: (t.days_late ?? 0) > 0 ? "var(--red)" : "var(--muted)" }}
                        >
                          {d(t.scade_il)}
                          {(t.days_late ?? 0) > 0 && ` +${t.days_late}gg`}
                        </td>
                        <td className="text-right">
                          {t.fatturato != null ? importo(t.fatturato, t.currency ?? p.currency) : "—"}
                        </td>
                        <td className="text-right" style={{ color: "var(--green)" }}>
                          {t.incassato ? importo(t.incassato, t.currency ?? p.currency) : "—"}
                        </td>
                        <td
                          className="text-right"
                          style={{ color: (t.residuo ?? 0) > 0 ? "var(--red)" : undefined }}
                        >
                          {t.residuo ? importo(t.residuo, t.currency ?? p.currency) : "—"}
                        </td>
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
