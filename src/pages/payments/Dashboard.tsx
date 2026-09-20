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

      {/*
        Due colonne, non una pila di card tutte uguali.
        A sinistra il lavoro da fare — le fatture da emettere — che è la sola
        cosa su cui si agisce da qui: tenerla grande e in alto significa che si
        apre la pagina e si vede cosa fare. A destra i numeri, che si leggono e
        basta: stanno stretti perché guardarli è un gesto più corto.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ══ Sinistra: il lavoro ══ */}
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <header
              className="flex flex-wrap items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--teal-bg)" }}
            >
              <Send className="h-4 w-4" style={{ color: "var(--teal-dark)" }} />
              <h2 className="titolo text-[13px]">Da emettere ora</h2>
              <span className="num text-[13px] font-extrabold" style={{ color: "var(--teal-dark)" }}>
                {importo(funnel.dueOra)}
              </span>
              <Link
                to="/payments/da-emettere"
                className="ml-auto text-[11.5px] font-semibold"
                style={{ color: "var(--teal-dark)" }}
              >
                Tutte le {due.length} →
              </Link>
            </header>

            {due.length === 0 ? (
              <p className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                Niente da emettere: tutto quello che è maturato è già fatturato.
              </p>
            ) : (
              <ul>
                {due.slice(0, 8).map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <Pill tinta="teal">{t.name ?? "Tranche"}</Pill>
                    <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--muted)" }}>
                      {t.data_attesa
                        ? `Evento atteso ${format(new Date(t.data_attesa), "d MMM", { locale: it })}`
                        : "Esigibile"}
                    </span>
                    <span className="num text-[14px] font-bold">{importo(t.amount ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11.5px]"
              style={{ background: "var(--ground)", color: "var(--muted)" }}
            >
              <span>
                Questa settimana: emesse <b className="num text-foreground">{importo(settimana.importo)}</b>
                {" "}({settimana.fatture}) · da emettere{" "}
                <b className="num text-foreground">{importo(funnel.dueOra)}</b> ({funnel.dueOraPezzi})
              </span>
            </div>
          </section>

          {/* Le azioni richieste stanno con il lavoro, non coi numeri. */}
          <section className="card overflow-hidden">
            <header
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <Bell className="h-4 w-4" style={{ color: "var(--amber)" }} />
              <h2 className="titolo text-[13px]">Azioni richieste</h2>
              {alert.length > 0 && (
                <span className="num text-[11px]" style={{ color: "var(--muted)" }}>{alert.length}</span>
              )}
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
        </div>

        {/* ══ Destra: i numeri ══ */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <KpiCard
              etichetta={`Contabilizzato ${anno}`}
              valore={importo(anno_.netto)}
              sotto={
                <>
                  {anno_.fatture} fatture · lordo {importo(anno_.lordo)}
                  {anno_.noteCredito > 0 && ` · NC −${importo(anno_.noteCredito)}`}
                </>
              }
              variante="scura"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard
              etichetta="Potenziale"
              valore={importo(funnel.potenziale)}
              sotto={`${funnel.potenzialeQuotazioni} quotazioni aperte`}
            />
            <KpiCard
              etichetta="Da contabilizzare"
              valore={importo(funnel.daContabilizzare)}
              sotto={`${funnel.daContabilizzarePezzi} tranche · ${funnel.dueOraPezzi} esigibili`}
              variante="accento"
            />
          </div>

          {/* Le percentuali: due importi affiancati costringono a fare il conto
              a mente, e chi lo fa di fretta lo fa male. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard
              etichetta={`Incassato ${anno}`}
              valore={importo(incassatoYtd)}
              sotto={<Percentuale parte={incassatoYtd} tutto={anno_.netto} testo="del contabilizzato" />}
            />
            <KpiCard
              etichetta="Residuo crediti"
              valore={importo(port.residuoCrediti)}
              sotto={<Percentuale parte={port.residuoCrediti} tutto={anno_.netto} testo="ancora da incassare" />}
            />
            <KpiCard
              etichetta="di cui parziali"
              valore={importo(port.residuoParziali)}
              sotto={
                <>
                  {port.fattureParziali} fatture ·{" "}
                  <Percentuale parte={port.residuoParziali} tutto={port.residuoCrediti} testo="del residuo" />
                </>
              }
              variante="ambra"
            />
            <KpiCard
              etichetta="Insoluto"
              valore={importo(port.insoluto)}
              sotto={
                <>
                  {port.fattureInsolute} in recupero ·{" "}
                  <Percentuale parte={port.insoluto} tutto={anno_.netto} testo="del fatturato" />
                </>
              }
              variante="rossa"
            />
          </div>

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

/**
 * Una percentuale accanto all'importo.
 *
 * «€ 6.410.000 su € 7.930.000» costringe a fare una divisione a mente, e chi la
 * fa di fretta la fa male. «80,8%» si legge e basta.
 */
function Percentuale({
  parte,
  tutto,
  testo,
}: {
  parte: number;
  tutto: number;
  testo: string;
}) {
  // Senza un totale la percentuale non esiste: meglio niente che «0%», che
  // sembra un dato e invece è l'assenza di dati.
  if (!tutto) return <>{testo}</>;
  return (
    <>
      <b className="num text-foreground">{Math.round((parte / tutto) * 100)}%</b> {testo}
    </>
  );
}
