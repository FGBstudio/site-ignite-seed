import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { FileText, Send } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useAlertPayments, useTrancheAperte } from "@/hooks/usePayments";
import { KpiCard, Pill } from "@/components/payments/Comuni";
import { DialogoEmissione } from "@/components/payments/DialogoEmissione";
import { importo } from "@/lib/payments/aggregati";
import type { Tranche } from "@/lib/payments/aggregati";

/**
 * Da Emettere — il lavoro che gli eventi hanno generato.
 *
 * Nessuno compila questa lista: ci finisce dentro quello che è successo altrove
 * — una quotazione approvata, una milestone chiusa dal PM. È il punto in cui il
 * lavoro di chi esegue diventa lavoro di chi fattura, senza che i due debbano
 * parlarsi.
 *
 * `due` è esigibile adesso; `pending` è previsto ma l'evento non è ancora
 * arrivato. Tenerli separati evita di emettere una fattura per un lavoro non
 * ancora fatto.
 *
 * Le esigibili si spuntano, anche più di una: una fattura può chiudere il 50%
 * del LEED e il 50% della Tassonomia insieme, ed è così che le fatture vengono
 * emesse davvero. Il raggruppamento per intestatario non è estetico — una
 * fattura si intesta a una società sola, e le caselle di clienti diversi non si
 * possono spuntare insieme.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy", { locale: it }) : "—");

/** Chi paga, per raggruppare. Il nome quando c'è, altrimenti il progetto. */
const chiPaga = (t: Tranche) => t.cliente ?? t.progetto ?? "Senza cliente";

export default function DaEmettere() {
  const { caricamento } = usePaymentsCtx();
  const { data: tranche = [], isLoading } = useTrancheAperte();
  const { data: alert = [] } = useAlertPayments();
  const [emissione, setEmissione] = useState(false);
  const [spuntate, setSpuntate] = useState<string[]>([]);

  /**
   * Arrivare qui da un avviso apre già il dialogo sulla tranche giusta.
   *
   * L'avviso dice «emetti questa fattura» e porta con sé commessa e tranche
   * nella rotta: aprire il dialogo vuoto vorrebbe dire restituire a chi
   * fattura il lavoro di ricerca che l'automazione aveva appena tolto.
   */
  const [params, setParams] = useSearchParams();
  const certDaAvviso = params.get("cert");
  const trancheDaAvviso = params.get("tranche");

  useEffect(() => {
    if (certDaAvviso || trancheDaAvviso) {
      if (trancheDaAvviso) setSpuntate([trancheDaAvviso]);
      setEmissione(true);
    }
  }, [certDaAvviso, trancheDaAvviso]);

  const chiudiEmissione = () => {
    setSpuntate([]);
    setEmissione(false);
    // La rotta torna pulita: ricaricare la pagina non deve riaprire un dialogo
    // su una fattura appena emessa.
    if (certDaAvviso || trancheDaAvviso) {
      const p = new URLSearchParams(params);
      p.delete("cert");
      p.delete("tranche");
      setParams(p, { replace: true });
    }
  };

  const due = useMemo(() => tranche.filter((t) => t.tranche_state === "due"), [tranche]);
  const previste = useMemo(() => tranche.filter((t) => t.tranche_state === "pending"), [tranche]);

  /**
   * L'intestatario delle spuntate: vincola cosa si può spuntare ancora.
   *
   * Meglio disabilitare le caselle degli altri clienti che lasciar comporre una
   * fattura che il database rifiuterà: l'errore si scopre allo stesso modo, ma
   * dopo aver compilato tutto il resto.
   */
  const gruppoScelto = useMemo(() => {
    const scelte = due.filter((t) => spuntate.includes(t.id));
    const gruppi = new Set(scelte.map(chiPaga));
    return gruppi.size === 1 ? [...gruppi][0] : null;
  }, [due, spuntate]);

  const totaleSpuntato = due
    .filter((t) => spuntate.includes(t.id))
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  const spunta = (id: string) =>
    setSpuntate((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Le esigibili, per intestatario: è l'ordine in cui si fattura. */
  const perCliente = useMemo(() => {
    const m = new Map<string, Tranche[]>();
    for (const t of due) {
      const k = chiPaga(t);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((s, t) => s + (t.amount ?? 0), 0) - a[1].reduce((s, t) => s + (t.amount ?? 0), 0),
    );
  }, [due]);

  // La causa la racconta l'alert che l'evento ha aperto: è l'unico posto dove
  // sta scritto *perché* quella tranche è diventata esigibile.
  const causa = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of alert) {
      if (a.certification_id && a.description) m.set(a.certification_id, a.description);
    }
    return m;
  }, [alert]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Da Emettere</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Nessuno compila questa lista: ci arriva quello che è successo — una quotazione
            approvata, una milestone chiusa dal PM.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEmissione(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: "var(--teal)" }}
        >
          <Send className="h-3.5 w-3.5" /> Emetti fattura
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          etichetta="Esigibili ora"
          valore={importo(due.reduce((t, x) => t + (x.amount ?? 0), 0))}
          sotto={`${due.length} tranche pronte da fatturare`}
          variante="accento"
        />
        <KpiCard
          etichetta="Previste, evento non ancora arrivato"
          valore={importo(previste.reduce((t, x) => t + (x.amount ?? 0), 0))}
          sotto={`${previste.length} tranche in attesa`}
        />
      </div>

      {/* ── Le esigibili, per intestatario ──────────────────────────────────── */}
      <section className="card overflow-hidden">
        <header
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <FileText className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h2 className="titolo text-[13px]">Esigibili ora</h2>
          <span className="num text-[11px]" style={{ color: "var(--muted)" }}>
            {due.length}
          </span>
          {gruppoScelto && (
            <span className="ml-auto text-[11px]" style={{ color: "var(--muted)" }}>
              Selezione su <b>{gruppoScelto}</b>
            </span>
          )}
        </header>

        {due.length === 0 ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            Niente da emettere: tutto quello che è maturato è già fatturato.
          </p>
        ) : (
          perCliente.map(([cliente, righe]) => {
            // Un cliente diverso da quello già spuntato non si può aggiungere:
            // sarebbero due fatture, non una.
            const bloccato = gruppoScelto != null && gruppoScelto !== cliente;
            return (
              <div key={cliente}>
                <div
                  className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide">{cliente}</p>
                  <p className="num text-[11px]" style={{ color: "var(--muted)" }}>
                    {importo(righe.reduce((s, t) => s + (t.amount ?? 0), 0))}
                  </p>
                </div>
                <ul>
                  {righe.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        opacity: bloccato ? 0.45 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={spuntate.includes(t.id)}
                        disabled={bloccato}
                        onChange={() => spunta(t.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--teal)]"
                        aria-label={`Seleziona ${t.name ?? "tranche"}`}
                      />
                      <Pill tinta="teal">{t.progetto ?? "Progetto"}</Pill>

                      <div className="min-w-[200px] flex-1">
                        <p className="text-[12.5px] font-semibold">{t.name ?? "—"}</p>
                        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                          {t.certification_id && causa.get(t.certification_id)
                            ? causa.get(t.certification_id)
                            : t.data_attesa
                              ? `Attesa ${d(t.data_attesa)}`
                              : "Nessuna data attesa"}
                        </p>
                      </div>

                      <p className="num text-[14px] font-bold">{importo(t.amount ?? 0)}</p>

                      <button
                        type="button"
                        disabled={bloccato}
                        onClick={() => {
                          setSpuntate([t.id]);
                          setEmissione(true);
                        }}
                        className="rounded-[10px] px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
                        style={{ background: "var(--teal)" }}
                      >
                        Emetti
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <Elenco
        titolo="Previste"
        vuoto="Nessuna tranche futura definita sulle quotazioni approvate."
        righe={previste}
        causa={causa}
      />

      {/* ── La barra della selezione ─────────────────────────────────────────
          Sta in basso e resta visibile: mentre si spunta si scorre, e un
          pulsante in cima sarebbe fuori schermo proprio quando serve. */}
      {spuntate.length > 0 && !emissione && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border bg-background p-3 shadow-lg">
          <p className="text-[12px]">
            <b>{spuntate.length}</b> {spuntate.length === 1 ? "tranche" : "tranche"} ·{" "}
            <b className="num">{importo(totaleSpuntato)}</b>
            {gruppoScelto && <span style={{ color: "var(--muted)" }}> · {gruppoScelto}</span>}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSpuntate([])}
              className="rounded-[10px] border px-3 py-2 text-[12px] font-semibold"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => setEmissione(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
              style={{ background: "var(--teal)" }}
            >
              <Send className="h-3.5 w-3.5" />
              Emetti fattura per {spuntate.length === 1 ? "la selezionata" : `le ${spuntate.length} selezionate`}
            </button>
          </div>
        </div>
      )}

      <DialogoEmissione
        aperto={emissione}
        onChiudi={chiudiEmissione}
        certIniziale={certDaAvviso}
        trancheIniziali={spuntate}
      />

      {(isLoading || caricamento) && (
        <p className="text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Caricamento…
        </p>
      )}
    </div>
  );
}

function Elenco({
  titolo,
  vuoto,
  righe,
  causa,
}: {
  titolo: string;
  vuoto: string;
  righe: Tranche[];
  causa: Map<string, string>;
}) {
  return (
    <section className="card overflow-hidden">
      <header
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <FileText className="h-4 w-4" style={{ color: "var(--faint)" }} />
        <h2 className="titolo text-[13px]">{titolo}</h2>
        <span className="num text-[11px]" style={{ color: "var(--muted)" }}>
          {righe.length}
        </span>
      </header>

      {righe.length === 0 ? (
        <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          {vuoto}
        </p>
      ) : (
        <ul>
          {righe.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <Pill tinta="neutro">{t.progetto ?? "Progetto"}</Pill>

              <div className="min-w-[200px] flex-1">
                <p className="text-[12.5px] font-semibold">{t.name ?? "—"}</p>
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {t.certification_id && causa.get(t.certification_id)
                    ? causa.get(t.certification_id)
                    : t.data_attesa
                      ? `Attesa ${d(t.data_attesa)}`
                      : "Nessuna data attesa"}
                </p>
              </div>

              <p className="num text-[14px] font-bold">{importo(t.amount ?? 0)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
