import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight, Bell, Send } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import {
  useAlertPayments,
  useIncassiAnno,
  useQuotazioniAperte,
  useTrancheAperte,
} from "@/hooks/usePayments";
import { KpiCard, Pill } from "@/components/payments/Comuni";
import {
  fatturatoSettimana,
  importo,
  ivaPerMese,
  kpiAnno,
  kpiFunnel,
  kpiPortafoglio,
  previsioneAnno,
  scadenzaIva,
} from "@/lib/payments/aggregati";

/**
 * Dashboard — la sezione letta dall'alto.
 *
 * Tutti i numeri qui vengono dalle stesse funzioni che alimentano le altre
 * schede: il «residuo crediti» è lo stesso conto che il Registro mostra riga per
 * riga. Non è un riassunto calcolato a parte — sarebbe il primo numero a
 * divergere, e quello che qualcuno porterebbe in riunione.
 */
export default function Dashboard() {
  const { fatture, tutte } = usePaymentsCtx();
  const { data: tranche = [] } = useTrancheAperte();
  const { data: quotazioni = [] } = useQuotazioniAperte();
  const { data: alert = [] } = useAlertPayments();
  const oggi = new Date();
  const anno = oggi.getFullYear();
  const { data: incassi = [] } = useIncassiAnno(anno);

  const anno_ = useMemo(() => kpiAnno(fatture, anno), [fatture, anno]);
  const port = useMemo(() => kpiPortafoglio(fatture), [fatture]);
  const funnel = useMemo(() => kpiFunnel(quotazioni, tranche), [quotazioni, tranche]);
  const settimana = useMemo(() => fatturatoSettimana(fatture, oggi), [fatture]);

  const incassatoYtd = incassi.reduce((t, i) => t + i.amount, 0);
  const ivaMese = ivaPerMese(tutte, anno, oggi)[oggi.getMonth()];
  const previsione = useMemo(
    () => previsioneAnno(tutte, tranche, quotazioni, anno),
    [tutte, tranche, quotazioni, anno],
  );
  const atteso = previsione[11]?.cumulato ?? 0;

  const due = tranche.filter((t) => t.tranche_state === "due");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="titolo text-lg">Dashboard</h1>
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>
          Aggiornato {format(oggi, "d MMM yyyy · HH:mm", { locale: it })}
        </span>
      </div>

      {/* ── Il funnel ── */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <KpiCard
          className="flex-1"
          etichetta="Potenziale"
          valore={importo(funnel.potenziale)}
          sotto={`${funnel.potenzialeQuotazioni} quotazioni inviate, non approvate`}
        />
        <Freccia />
        <KpiCard
          className="flex-1"
          etichetta="Da contabilizzare"
          valore={importo(funnel.daContabilizzare)}
          sotto={
            <>
              {funnel.daContabilizzarePezzi} tranche non ancora fatturate
              {funnel.dueOraPezzi > 0 && (
                <b style={{ display: "block", color: "var(--teal-dark)" }}>
                  di cui {funnel.dueOraPezzi} esigibili ora · {importo(funnel.dueOra)}
                </b>
              )}
            </>
          }
          variante="accento"
        />
        <Freccia />
        <KpiCard
          className="flex-1"
          etichetta={`Contabilizzato ${anno}`}
          valore={importo(anno_.netto)}
          sotto={
            <>
              {anno_.fatture} fatture · lordo {importo(anno_.lordo)}
              {anno_.noteCredito > 0 && ` · note di credito −${importo(anno_.noteCredito)}`}
            </>
          }
          variante="scura"
        />
      </div>

      {/* ── I quattro numeri ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          etichetta={`Incassato ${anno}`}
          valore={importo(incassatoYtd)}
          sotto={
            anno_.netto > 0
              ? `${Math.round((incassatoYtd / anno_.netto) * 100)}% del contabilizzato`
              : "—"
          }
        />
        <KpiCard
          etichetta="Residuo crediti"
          valore={importo(port.residuoCrediti)}
          sotto="totale − incassi − note di credito"
        />
        <KpiCard
          etichetta="di cui pagate parziali"
          valore={importo(port.residuoParziali)}
          sotto={`${port.fattureParziali} fatture con differenze non pagate`}
          variante="ambra"
        />
        <KpiCard
          etichetta="Insoluto"
          valore={importo(port.insoluto)}
          sotto={`${port.fattureInsolute} in recupero`}
          variante="rossa"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* ── La settimana ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard
              etichetta="Fatturato questa settimana"
              valore={importo(settimana.importo)}
              sotto={`${settimana.fatture} fatture emesse · lun–dom`}
            />
            <KpiCard
              etichetta="Da fatturare questa settimana"
              valore={importo(funnel.dueOra)}
              sotto={`${funnel.dueOraPezzi} tranche esigibili`}
            />
          </div>

          {/* ── Da emettere ora ── */}
          <section className="card overflow-hidden">
            <header
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <Send className="h-4 w-4" style={{ color: "var(--teal)" }} />
              <h2 className="titolo text-[13px]">Da emettere ora</h2>
              <Link
                to="/payments/da-emettere"
                className="ml-auto text-[11.5px] font-semibold"
                style={{ color: "var(--teal-dark)" }}
              >
                Tutte le {due.length} →
              </Link>
            </header>

            {due.length === 0 ? (
              <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                Niente da emettere: tutto quello che è maturato è già fatturato.
              </p>
            ) : (
              <ul>
                {due.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <Pill tinta="teal">{t.name ?? "Tranche"}</Pill>
                    <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--muted)" }}>
                      {t.data_attesa
                        ? `Evento atteso ${format(new Date(t.data_attesa), "d MMM", { locale: it })}`
                        : "Esigibile"}
                    </span>
                    <span className="num text-[13px] font-bold">{importo(t.amount ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── La colonna di destra ── */}
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <header
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <Bell className="h-4 w-4" style={{ color: "var(--amber)" }} />
              <h2 className="titolo text-[13px]">Azioni richieste</h2>
            </header>
            {alert.length === 0 ? (
              <p className="p-6 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                Niente in sospeso.
              </p>
            ) : (
              <>
                <ul>
                  {alert.slice(0, 4).map((a) => (
                    <li key={a.id} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                      <p className="text-[12px] font-semibold">{a.title}</p>
                      {a.description && (
                        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
                          {a.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {alert.length > 4 && (
                  <Link
                    to="/payments/alerts"
                    className="block px-4 py-2 text-[11.5px] font-semibold"
                    style={{ color: "var(--teal-dark)" }}
                  >
                    Altre {alert.length - 4} →
                  </Link>
                )}
              </>
            )}
          </section>

          <Link to="/payments/iva" className="block">
            <KpiCard
              etichetta={`IVA da versare — ${format(oggi, "LLLL", { locale: it })}`}
              valore={importo(ivaMese?.importo ?? 0)}
              sotto={`entro il ${format(scadenzaIva(anno, oggi.getMonth()), "d MMM", { locale: it })} · solo FGB Italia`}
            />
          </Link>

          <Link to="/payments/iva" className="block">
            <KpiCard
              etichetta="Previsione a fine anno"
              valore={importo(atteso)}
              sotto="emesso + da emettere + potenziale ponderato"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** La freccia fra le card del funnel: sparisce in verticale, dove non serve. */
function Freccia() {
  return (
    <ArrowRight
      className="mx-auto hidden h-4 w-4 shrink-0 sm:block"
      style={{ color: "var(--faint)" }}
      aria-hidden
    />
  );
}
