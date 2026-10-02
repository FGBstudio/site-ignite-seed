import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useFollowupPrevisionale, useFollowupDefinitivo } from "@/hooks/useFollowup";
import { Money } from "@/components/payments/Comuni";
import { decimaliUtili } from "@/lib/payments/aggregati";
import { cifra, scaricaCsv, type Cella } from "@/lib/payments/csv";
import {
  definitivoDelMese, dividiPerOrigine, meseCorrente, meseEsteso, meseVicino,
  mesiDisponibili, previsionaleDelMese, somma,
} from "@/lib/payments/followup";

/**
 * Follow-up — il prospetto che si consegna ogni venerdì.
 *
 * Due letture dello stesso mese. Il **previsionale** guarda le fatture: il mese
 * è quello della scadenza finché nessuno dice altro, e diventa quello della
 * promessa quando il cliente dice quando pagherà. Le due specie restano
 * distinte e hanno due totali separati — un totale unico spaccerebbe per cassa
 * promessa quella che nessuno ha promesso. Il **definitivo** guarda gli
 * incassi, e il mese lo decide il bonifico.
 *
 * Nel foglio a mano il totale di settembre era `=SUM(...)−7500`: una fattura
 * slittata a ottobre, sottratta di qua e riscritta di là. Qui la riga si sposta
 * da sola quando cambia la promessa, e quel meno non serve più.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yy", { locale: it }) : "—");

export default function Followup() {
  const { entita } = usePaymentsCtx();
  const { data: fatture = [], isLoading: caricaP } = useFollowupPrevisionale();
  const { data: incassi = [], isLoading: caricaD } = useFollowupDefinitivo();

  const [vista, setVista] = useState<"previsionale" | "definitivo">("previsionale");
  const [mese, setMese] = useState<string>(meseCorrente());

  const righeP = useMemo(
    () => previsionaleDelMese(fatture, mese, entita),
    [fatture, mese, entita],
  );
  const righeD = useMemo(
    () => definitivoDelMese(incassi, mese, entita),
    [incassi, mese, entita],
  );

  const previsionale = vista === "previsionale";
  const valuta = (previsionale ? righeP[0]?.currency : righeD[0]?.currency) ?? "EUR";
  const totale = previsionale
    ? somma(righeP, (r) => r.imponibile)
    : somma(righeD, (r) => r.incassato);

  /**
   * Le due specie di riga del previsionale, e i loro totali.
   *
   * Una promessa del cliente e una semplice scadenza finiscono nello stesso mese
   * e non valgono la stessa cosa: il totale si legge in riunione, e deve dire
   * quale parte è stata promessa da qualcuno.
   */
  const { promesse, attese } = useMemo(() => dividiPerOrigine(righeP), [righeP]);
  const totalePromesso = somma(promesse, (r) => r.imponibile);
  const totaleAtteso = somma(attese, (r) => r.imponibile);

  /**
   * I mesi che hanno righe, per non lasciare la pagina in un vicolo chiuso.
   *
   * Il prospetto si apre sul mese corrente, e se quel mese è vuoto non c'è
   * niente che dica dove guardare: si cambia mese a tentoni e dopo due tentativi
   * si torna all'Excel.
   */
  const mesiPieni = useMemo(
    () =>
      mesiDisponibili(
        previsionale
          ? fatture.filter((r) => !entita || r.entity_code === entita).map((r) => r.mese_previsto)
          : incassi.filter((r) => !entita || r.entity_code === entita).map((r) => r.mese_incasso),
      ).filter((m) => m !== mese),
    [previsionale, fatture, incassi, entita, mese],
  );

  /**
   * Lo stesso foglio, nello stesso ordine: si consegna senza ricopiare niente.
   *
   * Il previsionale porta via anche la distinzione che si vede in pagina. Un
   * foglio con un totale solo rimetterebbe nella stessa riga la cassa che un
   * cliente ha promesso e quella che nessuno ha promesso — ed è il motivo per cui
   * in pagina i totali sono due. Qui la colonna ORIGINE lo dice riga per riga, e
   * in fondo ci sono i tre numeri: promesso, atteso, totale.
   */
  const esporta = () => {
    const testa = previsionale
      ? ["DATA FATTURA", "CLIENTE", "N. FATTURA", "PROGETTO", "IMPORTO", "VAT", "ORIGINE", "RECALL", "GG IN RECALL", "INCASSO ATTESO", "NOTE"]
      : ["DATA FATTURA", "CLIENTE", "N. FATTURA", "PROGETTO", "IMPORTO", "VAT", "OUTSTANDING", "DATA PAGAMENTO", "GG", "NOTE"];
    const corpo = previsionale
      ? righeP.map((r) => [
          r.issue_date, r.client_name ?? "", r.number, r.project_name ?? "",
          cifra(r.imponibile), cifra(r.vat_amount),
          r.mese_da_promessa ? "promessa del cliente" : "scadenza della fattura",
          r.in_recall ? "SI" : "NO",
          r.giorni_in_recall ?? "", r.data_incasso_attesa ?? "", r.ultima_nota ?? "",
        ])
      : righeD.map((r) => [
          r.issue_date, r.client_name ?? "", r.number, r.project_name ?? "",
          cifra(r.imponibile), cifra(r.vat_amount), cifra(r.outstanding), r.incassato_il,
          cifra(r.giorni_per_incassare), r.ultima_nota ?? "",
        ]);
    const coda: Cella[][] = previsionale
      ? [
          [],
          ["PROMESSO DAL CLIENTE", "", "", "", cifra(totalePromesso)],
          ["ATTESO A SCADENZA", "", "", "", cifra(totaleAtteso)],
          ["TOTALE", "", "", "", cifra(totale)],
        ]
      : [[], ["TOTALE INCASSATO", "", "", "", cifra(totale)]];
    scaricaCsv(`prospetto-${vista}-${mese}.csv`, [testa, ...corpo, ...coda]);
  };

  const vuoto = previsionale ? righeP.length === 0 : righeD.length === 0;
  const carica = previsionale ? caricaP : caricaD;

  return (
    <div className="space-y-4">
      {/* ── Testata ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Follow-up</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            {previsionale
              ? "Quello che mi aspetto di incassare: nel mese della scadenza, o in quello che il cliente ha promesso"
              : "Quello che è entrato davvero: una riga per incasso, nel mese in cui è arrivato il bonifico"}
          </p>
        </div>
        <button
          type="button"
          onClick={esporta}
          disabled={vuoto}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold disabled:opacity-40"
          style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }}
        >
          <Download className="h-3.5 w-3.5" /> Esporta prospetto
        </button>
      </div>

      {/* ── Le due letture, e il mese ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex rounded-full p-0.5"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
          role="group"
          aria-label="Quale prospetto"
        >
          {(["previsionale", "definitivo"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
              className="rounded-full px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors"
              style={{
                background: vista === v ? "var(--teal)" : "transparent",
                color: vista === v ? "#fff" : "var(--muted)",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => setMese((m) => meseVicino(m, -1))} aria-label="Mese precedente">
            <ChevronLeft className="h-4 w-4" style={{ color: "var(--muted)" }} />
          </button>
          <span className="num min-w-[130px] text-center text-[13px] font-semibold capitalize">
            {meseEsteso(mese)}
          </span>
          <button type="button" onClick={() => setMese((m) => meseVicino(m, 1))} aria-label="Mese successivo">
            <ChevronRight className="h-4 w-4" style={{ color: "var(--muted)" }} />
          </button>
        </div>

        {mese !== meseCorrente() && (
          <button
            type="button"
            onClick={() => setMese(meseCorrente())}
            className="text-[11px] underline"
            style={{ color: "var(--muted)" }}
          >
            torna a questo mese
          </button>
        )}
      </div>

      {/* ── Il prospetto ── */}
      <div className="tabella-guscio overflow-x-auto">
        <table className="tabella w-full text-[12px]">
          <thead>
            <tr>
              <th>Data fattura</th>
              <th>Cliente</th>
              <th>N. fattura</th>
              <th>Progetto</th>
              <th className="text-right">Importo</th>
              <th className="text-right">VAT</th>
              {previsionale ? (
                <>
                  <th>Recall</th>
                  <th className="text-right">gg</th>
                  <th>Incasso atteso</th>
                </>
              ) : (
                <>
                  <th className="text-right">Outstanding</th>
                  <th>Pagata il</th>
                  <th className="text-right">gg</th>
                </>
              )}
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {carica && (
              <tr>
                <td colSpan={10} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Un momento…
                </td>
              </tr>
            )}

            {!carica && vuoto && (
              <tr>
                <td colSpan={10} className="p-10 text-center" style={{ color: "var(--muted)" }}>
                  <p className="text-[12.5px]">
                    {previsionale
                      ? "Nessuna fattura attesa in questo mese."
                      : "Nessun incasso registrato in questo mese."}
                  </p>
                  {/* ── Dove sono i dati ─────────────────────────────────────
                      Un prospetto che si apre vuoto e non dice dove guardare è
                      un vicolo chiuso: si prova a cambiare mese a tentoni, e
                      dopo due tentativi si torna all'Excel. I mesi che hanno
                      righe li sappiamo — tanto vale dirli. */}
                  {mesiPieni.length > 0 && (
                    <p className="mt-3 text-[11.5px]">
                      Righe ci sono in{" "}
                      {mesiPieni.slice(0, 6).map((m, i) => (
                        <span key={m}>
                          {i > 0 && " · "}
                          <button
                            type="button"
                            onClick={() => setMese(m)}
                            className="underline"
                            style={{ color: "var(--teal)" }}
                          >
                            {meseEsteso(m)}
                          </button>
                        </span>
                      ))}
                      {mesiPieni.length > 6 && ` e altri ${mesiPieni.length - 6} mesi`}.
                    </p>
                  )}
                  {previsionale && mesiPieni.length === 0 && (
                    <p className="mt-3 text-[11.5px]">
                      Nessuna fattura aperta, in nessun mese: o è tutto incassato, o le fatture
                      non sono ancora state caricate.
                    </p>
                  )}
                </td>
              </tr>
            )}

            {!carica &&
              previsionale &&
              righeP.map((r) => (
                <tr key={r.id}>
                  <td className="num" style={{ color: "var(--muted)" }}>{d(r.issue_date)}</td>
                  <td className="font-semibold">{r.client_name ?? "—"}</td>
                  <td className="num">{r.number}</td>
                  <td style={{ color: "var(--muted)" }}>{r.project_name ?? "—"}</td>
                  <td className="text-right">
                    <Money valore={r.imponibile} valuta={r.currency} decimali={decimaliUtili(r.imponibile)} />
                  </td>
                  <td className="text-right" style={{ color: "var(--muted)" }}>
                    {r.vat_amount > 0
                      ? <Money valore={r.vat_amount} valuta={r.currency} decimali={decimaliUtili(r.vat_amount)} />
                      : "—"}
                  </td>
                  <td style={{ color: r.in_recall ? "var(--red)" : "var(--muted)" }}>
                    {r.in_recall ? "SI" : "NO"}
                  </td>
                  <td className="num text-right" style={{ color: "var(--muted)" }}>
                    {r.giorni_in_recall ?? "—"}
                  </td>
                  {/* La data, e di che specie è. Senza promessa resta la
                      scadenza, scritta in ambra: è un'attesa nostra, non una
                      parola del cliente. */}
                  <td className="num">
                    {r.mese_da_promessa ? (
                      <>
                        {d(r.data_incasso_attesa)}
                        {r.data_incasso_attesa_fonte === "bonifico_disposto" && (
                          <span className="ml-1 text-[10px]" style={{ color: "var(--faint)" }}>
                            bonifico
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--amber)" }}>
                        {d(r.due_date)}
                        <span className="ml-1 text-[10px]" style={{ color: "var(--faint)" }}>
                          scadenza
                        </span>
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{r.ultima_nota ?? "—"}</td>
                </tr>
              ))}

            {!carica &&
              !previsionale &&
              righeD.map((r) => (
                <tr key={r.incasso_id}>
                  <td className="num" style={{ color: "var(--muted)" }}>{d(r.issue_date)}</td>
                  <td className="font-semibold">{r.client_name ?? "—"}</td>
                  <td className="num">{r.number}</td>
                  <td style={{ color: "var(--muted)" }}>{r.project_name ?? "—"}</td>
                  <td className="text-right">
                    <Money valore={r.incassato} valuta={r.currency} decimali={decimaliUtili(r.incassato)} />
                  </td>
                  <td className="text-right" style={{ color: "var(--muted)" }}>
                    {r.vat_amount > 0
                      ? <Money valore={r.vat_amount} valuta={r.currency} decimali={decimaliUtili(r.vat_amount)} />
                      : "—"}
                  </td>
                  {/* Quasi sempre e' una trattenuta bancaria, non un cliente
                      che non paga: in ambra, come nel Registro. */}
                  <td className="text-right">
                    {r.outstanding > 0 ? (
                      <Money
                        valore={r.outstanding}
                        valuta={r.currency}
                        decimali={decimaliUtili(r.outstanding)}
                        className="text-[var(--amber)]"
                      />
                    ) : (
                      <span style={{ color: "var(--faint)" }}>—</span>
                    )}
                  </td>
                  <td className="num">{d(r.incassato_il)}</td>
                  <td className="num text-right" style={{ color: "var(--muted)" }}>
                    {r.giorni_per_incassare}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{r.ultima_nota ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* ── Il totale, che nel foglio a mano andava corretto a mano ── */}
        {!vuoto && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[11px]"
            style={{ background: "var(--ground)", color: "var(--muted)" }}
          >
            <span className="num">
              {previsionale ? righeP.length : righeD.length}{" "}
              {previsionale ? "fatture attese" : "incassi"} · {meseEsteso(mese)}
            </span>
            {/* ── Due totali, non uno ───────────────────────────────────────
                «Il cliente ha detto che paga il 30» e «scade il 30» cadono nello
                stesso mese e non valgono la stessa cosa. Un totale unico
                spaccerebbe per cassa promessa quella che nessuno ha promesso —
                ed è il numero che poi si porta in riunione. */}
            <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {previsionale && promesse.length > 0 && (
                <span className="num text-[12px]">
                  Promesso{" "}
                  <b style={{ color: "var(--green)" }}>
                    <Money valore={totalePromesso} valuta={valuta} decimali={decimaliUtili(totalePromesso)} />
                  </b>
                </span>
              )}
              {previsionale && attese.length > 0 && (
                <span className="num text-[12px]">
                  Solo in scadenza{" "}
                  <b style={{ color: "var(--amber)" }}>
                    <Money valore={totaleAtteso} valuta={valuta} decimali={decimaliUtili(totaleAtteso)} />
                  </b>
                </span>
              )}
              <span className="num text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                {previsionale ? "In tutto" : "Entrato"}{" "}
                <Money valore={totale} valuta={valuta} decimali={decimaliUtili(totale)} />
              </span>
            </span>
          </div>
        )}
      </div>

      {previsionale && (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Le fatture cadono nel mese della loro <b>scadenza</b> finché nessuno dice altro. Quando il
          cliente dice <b>quando</b> pagherà — si registra nel Registro, aprendo la riga della
          fattura — la riga si sposta da sola nel mese giusto e passa fra il «promesso».
        </p>
      )}
    </div>
  );
}
