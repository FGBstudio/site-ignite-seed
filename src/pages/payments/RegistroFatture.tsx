import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, Download, Plus, Search } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useIncassi, useNoteCredito } from "@/hooks/usePayments";
import { Money, PillCiclo, PillPagamento } from "@/components/payments/Comuni";
import { DialogoEmissione } from "@/components/payments/DialogoEmissione";
import { DialogoIncasso } from "@/components/payments/DialogoIncasso";
import { decimaliUtili, importo } from "@/lib/payments/aggregati";
import type { InvoiceRow, LifecycleState, PaymentStatus } from "@/types/payments";
import { cn } from "@/lib/utils";

/**
 * Registro Fatture — il registro unico.
 *
 * Ogni fattura vive un ciclo: emessa, scaduta, in sollecito, bloccata,
 * insoluta, chiusa. Le altre schede non sono altri elenchi: sono questo,
 * filtrato. Per questo i chip in cima portano i conteggi — dicono quanto pesa
 * ogni stato senza doverci entrare.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "dd MMM", { locale: it }) : "—");

const CHIP: Array<{ id: LifecycleState | "tutte"; nome: string }> = [
  { id: "tutte", nome: "Tutte" },
  { id: "issued", nome: "Emessa" },
  { id: "in_recall", nome: "In sollecito" },
  { id: "blocked", nome: "Bloccata" },
  { id: "insoluto", nome: "Insoluta" },
  { id: "closed", nome: "Chiusa" },
];

export default function RegistroFatture() {
  const { fatture, caricamento } = usePaymentsCtx();
  const [stato, setStato] = useState<LifecycleState | "tutte">("tutte");
  const [pagamento, setPagamento] = useState<PaymentStatus | "tutti">("tutti");
  const [anno, setAnno] = useState<string>("tutti");
  const [cerca, setCerca] = useState("");
  const [aperta, setAperta] = useState<string | null>(null);
  const [emissione, setEmissione] = useState(false);
  /** La fattura su cui si sta registrando un incasso. */
  const [incasso, setIncasso] = useState<InvoiceRow | null>(null);

  const anni = useMemo(
    () =>
      [...new Set(fatture.map((f) => f.issue_date.slice(0, 4)))].sort().reverse(),
    [fatture],
  );

  const conteggi = useMemo(() => {
    const c: Record<string, number> = { tutte: fatture.length };
    for (const f of fatture) c[f.lifecycle_state] = (c[f.lifecycle_state] ?? 0) + 1;
    return c;
  }, [fatture]);

  const righe = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return fatture.filter((f) => {
      if (stato !== "tutte" && f.lifecycle_state !== stato) return false;
      if (pagamento !== "tutti" && f.payment_status !== pagamento) return false;
      if (anno !== "tutti" && !f.issue_date.startsWith(anno)) return false;
      if (!q) return true;
      return `${f.number} ${f.external_number ?? ""} ${f.client_name ?? ""} ${f.commessa ?? ""} ${f.project_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [fatture, stato, pagamento, anno, cerca]);

  /** L'esportazione porta via quello che si vede, non tutto il database. */
  const esporta = () => {
    const testa = [
      "Numero", "Numero esterno", "Cliente", "Commessa di riferimento", "Progetto",
      "Entità", "Emissione", "Scadenza", "Valuta", "Totale", "Incassato",
      "Note di credito", "Residuo", "di cui ammanco da riversare",
      "Pagamento", "Stato",
    ];
    const corpo = righe.map((f) => [
      f.number, f.external_number ?? "", f.client_name ?? "", f.commessa ?? "",
      f.project_name ?? "",
      f.entity_code ?? "", f.issue_date, f.due_date, f.currency,
      f.total, f.paid_amount, f.credited_amount, f.residual, f.ammanco_da_recuperare,
      f.payment_status, f.lifecycle_state,
    ]);
    const csv = [testa, ...corpo]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    // Il BOM serve a Excel per capire che è UTF-8: senza, «Società» diventa
    // «SocietÃ ».
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registro-fatture-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      {/* ── Testata ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Registro Fatture</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Un solo registro — ogni fattura vive un ciclo: Emessa → Scaduta → Sollecito →
            Bloccata → Insoluta → Chiusa
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={esporta}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold"
            style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }}
          >
            <Download className="h-3.5 w-3.5" /> Esporta CSV
          </button>
          <button
            type="button"
            onClick={() => setEmissione(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
            style={{ background: "var(--teal)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Nuova fattura
          </button>
        </div>
      </div>

      {/* ── Chip di stato, con i conteggi ── */}
      <div className="flex flex-wrap gap-1.5">
        {CHIP.map((c) => {
          const n = conteggi[c.id] ?? 0;
          const attivo = stato === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setStato(c.id)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: attivo ? "var(--teal)" : "#fff",
                color: attivo ? "#fff" : "var(--muted)",
                border: `1px solid ${attivo ? "var(--teal)" : "var(--border)"}`,
              }}
            >
              {c.nome}
              <span className="num opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filtri ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--faint)" }}
          />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca numero, cliente, commessa, progetto…"
            aria-label="Cerca nel registro"
            className="h-8 w-64 rounded-[10px] pl-8 pr-3 text-[12px] outline-none"
            style={{ border: "1px solid var(--border)", background: "#fff" }}
          />
        </span>

        <select
          value={pagamento}
          onChange={(e) => setPagamento(e.target.value as PaymentStatus | "tutti")}
          aria-label="Stato del pagamento"
          className="h-8 rounded-[10px] px-2 text-[12px] outline-none"
          style={{ border: "1px solid var(--border)", background: "#fff" }}
        >
          <option value="tutti">Pagamento: tutti</option>
          <option value="paid">Saldata</option>
          <option value="partial">Parziale</option>
          <option value="unpaid">Non pagata</option>
          <option value="credited">Chiusa da NC</option>
        </select>

        <select
          value={anno}
          onChange={(e) => setAnno(e.target.value)}
          aria-label="Anno di emissione"
          className="h-8 rounded-[10px] px-2 text-[12px] outline-none"
          style={{ border: "1px solid var(--border)", background: "#fff" }}
        >
          <option value="tutti">Tutti gli anni</option>
          {anni.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* ── La tabella ── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>N° Fattura</th>
                <th>Cliente</th>
                <th>Commessa di riferimento</th>
                <th>Progetto</th>
                <th>Entità</th>
                <th>Emissione</th>
                <th>Scadenza</th>
                <th className="text-right">Totale</th>
                <th className="text-right">Incassato</th>
                <th className="text-right">NC</th>
                <th className="text-right">Residuo</th>
                <th>Pagamento</th>
                <th>Stato ciclo</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={14} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                    Caricamento…
                  </td>
                </tr>
              )}

              {!caricamento && righe.length === 0 && (
                <tr>
                  <td colSpan={14} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                    {fatture.length === 0
                      ? "Nessuna fattura registrata. Le prime arriveranno emettendole da qui."
                      : "Nessuna fattura con questi filtri."}
                  </td>
                </tr>
              )}

              {righe.map((f) => (
                <RigaFattura
                  key={f.id}
                  f={f}
                  aperta={aperta === f.id}
                  onApri={() => setAperta(aperta === f.id ? null : f.id)}
                  onIncassa={() => setIncasso(f)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── La legenda del calcolo ── */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[11px]"
          style={{ background: "var(--ground)", color: "var(--muted)" }}
        >
          <span className="num">
            {righe.length} fattur{righe.length === 1 ? "a" : "e"}
            {righe.length !== fatture.length && ` su ${fatture.length}`}
          </span>
          <span>
            <b>Residuo</b> = Totale − Incassi − Note di credito · calcolato, mai inserito a mano ·
            alla scadenza la fattura passa da sola in Recall · un residuo{" "}
            <b style={{ color: "var(--amber)" }}>in ambra</b> è un ammanco trattenuto dalla banca,
            non un cliente che non paga: va riversato sulla prossima fattura dello stesso progetto
          </span>
        </div>
      </div>

      <DialogoEmissione aperto={emissione} onChiudi={() => setEmissione(false)} />
      <DialogoIncasso fattura={incasso} aperto={!!incasso} onChiudi={() => setIncasso(null)} />
    </div>
  );
}

/** Una riga, e sotto il dettaglio di come si è arrivati al residuo. */
function RigaFattura({
  f,
  aperta,
  onApri,
  onIncassa,
}: {
  f: InvoiceRow;
  aperta: boolean;
  onApri: () => void;
  onIncassa: () => void;
}) {
  const { data: incassi = [] } = useIncassi(aperta ? f.id : null);
  const { data: nc = [] } = useNoteCredito(aperta ? f.id : null);

  /**
   * Il residuo è tutto un ammanco classificato: una trattenuta bancaria, non un
   * cliente che non paga. Resta nel residuo — quei soldi non sono arrivati — ma
   * in ambra e non in rosso, perché ha già una destinazione: la prossima
   * fattura del progetto. Dipingerlo rosso accanto a un insoluto vero direbbe
   * che sono lo stesso problema.
   */
  const soloAmmanco = f.residual > 0 && f.ammanco_da_recuperare >= f.residual - 0.005;

  const tintaResiduo =
    f.residual <= 0
      ? "var(--green)"
      : soloAmmanco
        ? "var(--amber)"
        : f.days_late > 0
          ? "var(--red)"
          : f.payment_status === "partial"
            ? "var(--amber)"
            : "var(--ink)";

  return (
    <>
      <tr className={cn("riga", aperta && "aperta")} onClick={onApri}>
        <td>
          {aperta ? (
            <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--muted)" }} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--faint)" }} />
          )}
        </td>
        <td className="num font-semibold">
          {f.number}
          {/* Il numero del commercialista, quando c'è: la stessa fattura ha due
              nomi e chi cerca può usare l'uno o l'altro. */}
          {f.external_number && (
            <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--faint)" }}>
              {f.external_number}
            </span>
          )}
        </td>
        <td className="font-semibold">{f.client_name ?? "—"}</td>
        <td style={{ color: "var(--muted)" }}>{f.commessa ?? "—"}</td>
        <td style={{ color: "var(--muted)" }}>{f.project_name ?? "—"}</td>
        <td className="uppercase" style={{ color: "var(--muted)" }}>
          {f.entity_code ?? "—"}
        </td>
        <td className="num" style={{ color: "var(--muted)" }}>{d(f.issue_date)}</td>
        <td className="num" style={{ color: f.days_late > 0 ? "var(--red)" : "var(--muted)" }}>
          {d(f.due_date)}
          {f.days_late > 0 && <span className="ml-1">+{f.days_late}gg</span>}
        </td>
        {/* I centesimi si mostrano solo dove ci sono: una colonna di importi
            tondi si legge meglio senza, ma «4.961» al posto di «4.960,50» fa
            sparire proprio la cifra da cui nasce l'ammanco. */}
        <td className="text-right">
          <Money valore={f.total} valuta={f.currency} decimali={decimaliUtili(f.total)} />
        </td>
        <td className="text-right">
          {f.paid_amount > 0 ? (
            <Money
              valore={f.paid_amount}
              valuta={f.currency}
              decimali={decimaliUtili(f.paid_amount)}
              className="text-[var(--green)]"
            />
          ) : (
            <span style={{ color: "var(--faint)" }}>—</span>
          )}
        </td>
        <td className="text-right">
          {f.credited_amount > 0 ? (
            <Money
              valore={f.credited_amount}
              valuta={f.currency}
              decimali={decimaliUtili(f.credited_amount)}
              className="text-[var(--purple)]"
            />
          ) : (
            <span style={{ color: "var(--faint)" }}>—</span>
          )}
        </td>
        {/* L'ammanco sta nel residuo, coi suoi centesimi, e porta la nota che
            dice dove finirà: un segnale che richiede un clic è un segnale che
            nessuno vede, e diciannove euro e cinquanta arrotondati a venti non
            tornerebbero più con la fattura che li recupera. */}
        <td className="text-right font-bold" style={{ color: tintaResiduo }}>
          <Money
            valore={f.residual}
            valuta={f.currency}
            decimali={decimaliUtili(f.residual)}
          />
          {f.ammanco_da_recuperare > 0 && (
            <div
              className="mt-0.5 text-[10px] font-semibold leading-tight"
              style={{ color: "var(--amber)" }}
              title="Trattenuta dalla banca del cliente: va riversata sulla prossima fattura dello stesso progetto a compensazione"
            >
              ammanco da riversare
              <br />
              sulla prossima fattura
            </div>
          )}
        </td>
        <td><PillPagamento stato={f.payment_status} /></td>
        <td>
          <PillCiclo stato={f.lifecycle_state} recall={f.recall_status} giorniRitardo={f.days_late} />
        </td>
      </tr>

      {aperta && (
        <tr>
          <td colSpan={14} className="dettaglio p-0">
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="label">Incassi registrati</p>
                {incassi.length === 0 ? (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--muted)" }}>
                    Nessuno.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {incassi.map((i) => (
                      <li key={i.id} className="flex items-center justify-between text-[12px]">
                        <span style={{ color: "var(--muted)" }}>
                          {d(i.date)}
                          {i.method ? ` · ${i.method}` : ""}
                          {i.bank_ref ? ` · ${i.bank_ref}` : ""}
                        </span>
                        <Money valore={i.amount} valuta={f.currency} className="font-semibold text-[var(--green)]" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="label">Note di credito collegate</p>
                {nc.length === 0 ? (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--muted)" }}>
                    Nessuna.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {nc.map((n) => (
                      <li key={n.id} className="flex items-center justify-between text-[12px]">
                        <span style={{ color: "var(--muted)" }}>
                          {n.number} · {d(n.date)} · {n.kind === "total" ? "Totale" : "Parziale"}
                          {n.state === "draft" && " · bozza"}
                        </span>
                        <Money
                          valore={-n.amount}
                          valuta={f.currency}
                          className={cn("font-semibold", n.state === "draft" ? "opacity-50" : "")}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* La formula scritta per esteso: il residuo non è un numero da
                  credere sulla parola, è una sottrazione che si può rifare. */}
              <div
                className="num sm:col-span-2 rounded-[10px] px-3 py-2 text-[12px]"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                {importo(f.total, f.currency, decimaliUtili(f.total))} −{" "}
                {importo(f.paid_amount, f.currency, decimaliUtili(f.paid_amount))} −{" "}
                {importo(f.credited_amount, f.currency, decimaliUtili(f.credited_amount))} ={" "}
                <b style={{ color: tintaResiduo }}>
                  {importo(f.residual, f.currency, decimaliUtili(f.residual))}
                </b>
                {/* L'ammanco non entra nella formula: non è un quarto termine da
                    sottrarre, è una riga che dice cos'è già dentro il residuo. */}
                {f.ammanco_da_recuperare > 0 && (
                  <div className="mt-1" style={{ color: "var(--amber)" }}>
                    di cui{" "}
                    <b>
                      {importo(
                        f.ammanco_da_recuperare,
                        f.currency,
                        decimaliUtili(f.ammanco_da_recuperare),
                      )}
                    </b>{" "}
                    trattenuti dalla banca del cliente: ammanco da riversare sulla prossima
                    fattura di {f.project_name ?? "questo progetto"} a compensazione
                  </div>
                )}
                {f.payment_status === "partial" && f.lifecycle_state === "in_recall"
                  && !soloAmmanco && (
                  <span style={{ color: "var(--muted)" }}> · resta in Recall solo per la differenza</span>
                )}
              </div>

              {/* Si registra l'incasso solo se c'è ancora qualcosa da incassare:
                  su una fattura chiusa il pulsante sarebbe un invito a sbagliare. */}
              {f.residual > 0 && (
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      // Senza questo il click risale alla riga e la richiude
                      // proprio mentre si apre il dialogo.
                      e.stopPropagation();
                      onIncassa();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
                    style={{ background: "var(--green)" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Registra incasso
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
