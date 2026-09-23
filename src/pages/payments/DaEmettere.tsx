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
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy", { locale: it }) : "—");

export default function DaEmettere() {
  const { caricamento } = usePaymentsCtx();
  const { data: tranche = [], isLoading } = useTrancheAperte();
  const { data: alert = [] } = useAlertPayments();
  const [emissione, setEmissione] = useState(false);

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
    if (certDaAvviso) setEmissione(true);
  }, [certDaAvviso]);

  /** Emettere da una riga apre il dialogo su quella riga, non su niente. */
  const [scelta, setScelta] = useState<{ cert: string | null; tranche: string | null } | null>(null);
  const apriSuTranche = (r: { id: string; certification_id: string | null }) => {
    setScelta({ cert: r.certification_id, tranche: r.id });
    setEmissione(true);
  };

  const chiudiEmissione = () => {
    setScelta(null);
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

      <Elenco
        titolo="Esigibili ora"
        vuoto="Niente da emettere: tutto quello che è maturato è già fatturato."
        righe={due}
        causa={causa}
        evidenzia
        onEmetti={(r) => apriSuTranche(r)}
      />

      <Elenco
        titolo="Previste"
        vuoto="Nessuna tranche futura definita sulle quotazioni approvate."
        righe={previste}
        causa={causa}
      />

      <DialogoEmissione
        aperto={emissione}
        onChiudi={chiudiEmissione}
        certIniziale={scelta?.cert ?? certDaAvviso}
        trancheIniziale={scelta?.tranche ?? trancheDaAvviso}
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
  evidenzia,
  onEmetti,
}: {
  titolo: string;
  vuoto: string;
  righe: Array<{
    id: string;
    certification_id: string | null;
    name: string | null;
    amount: number | null;
    data_attesa?: string | null;
  }>;
  causa: Map<string, string>;
  evidenzia?: boolean;
  onEmetti?: (riga: { id: string; certification_id: string | null }) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <header
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <FileText className="h-4 w-4" style={{ color: evidenzia ? "var(--teal)" : "var(--faint)" }} />
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
              <Pill tinta={evidenzia ? "teal" : "neutro"}>{t.name ?? "Tranche"}</Pill>

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

              {evidenzia && onEmetti && (
                <button
                  type="button"
                  onClick={() => onEmetti(t)}
                  className="rounded-[10px] px-3 py-1.5 text-[11.5px] font-semibold text-white"
                  style={{ background: "var(--teal)" }}
                >
                  Emetti
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
