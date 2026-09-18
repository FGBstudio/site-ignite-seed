import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { FileMinus, Plus } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useEmettiBozzaNC, useTutteLeNoteCredito } from "@/hooks/usePayments";
import { Money, Pill } from "@/components/payments/Comuni";
import { PannelloNotaCredito } from "@/components/payments/PannelloNotaCredito";
import { importo } from "@/lib/payments/aggregati";
import { useToast } from "@/hooks/use-toast";
import type { CreditNote, InvoiceRow } from "@/types/payments";

/**
 * Note di Credito — le rettifiche, con il loro effetto.
 *
 * Una nota di credito non è una riga contabile astratta: è l'unica cosa che può
 * ridurre il fatturato. Per questo ogni riga mostra cosa ha fatto alla fattura
 * («€ 18.400 → € 12.400») invece del solo importo, e la barra in fondo tiene
 * sempre sotto gli occhi quanto pesano sul totale.
 */

const d = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: it });

const MOTIVI = [
  "Storno parziale su rinegoziazione",
  "Servizio non erogato",
  "Errore di fatturazione",
  "Sconto riconosciuto",
  "Annullamento fattura",
];

export default function NoteCredito() {
  const { fatture } = usePaymentsCtx();
  const { data: note = [], isLoading } = useTutteLeNoteCredito();
  const emettiBozza = useEmettiBozzaNC();
  const { toast } = useToast();
  const [nuova, setNuova] = useState(false);

  const perId = useMemo(() => new Map(fatture.map((f) => [f.id, f])), [fatture]);

  // Solo le note delle fatture visibili: il filtro società in alto vale anche
  // qui, altrimenti il totale in fondo direbbe un numero di un'altra scala.
  const righe = useMemo(
    () => note.filter((n) => perId.has(n.invoice_id)),
    [note, perId],
  );

  const emesse = righe.filter((n) => n.state === "issued");
  const lordo = fatture.reduce((t, f) => t + f.total_eur, 0);
  const totaleNc = emesse.reduce((t, n) => {
    const f = perId.get(n.invoice_id);
    return t + n.amount * (f?.exch_rate ?? 1);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Note di Credito</h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            L'unico modo di correggere una fattura emessa: l'originale resta, la rettifica si
            vede accanto con il suo motivo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNuova(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: "var(--purple)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Nuova nota di credito
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>N° NC</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Fattura</th>
                <th className="text-right">Importo</th>
                <th>Tipo</th>
                <th>Effetto sul residuo</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                    Caricamento…
                  </td>
                </tr>
              )}

              {!isLoading && righe.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
                    Nessuna nota di credito. È il caso migliore: vuol dire che non c'è stato
                    niente da correggere.
                  </td>
                </tr>
              )}

              {righe.map((n) => (
                <RigaNc
                  key={n.id}
                  n={n}
                  f={perId.get(n.invoice_id)}
                  onEmetti={async () => {
                    try {
                      await emettiBozza.mutateAsync(n.id);
                      toast({ title: "Nota di credito emessa" });
                    } catch (e: any) {
                      toast({ variant: "destructive", title: "Non emessa", description: e.message });
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Lordo − NC = Netto, sempre sotto gli occhi ── */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12.5px]"
          style={{ background: "var(--dark)", color: "#fff" }}
        >
          <span className="label" style={{ color: "rgba(255,255,255,.65)" }}>
            Fatturato al netto delle rettifiche
          </span>
          <span className="num font-semibold">
            {importo(lordo)}
            <span style={{ color: "rgba(255,255,255,.6)" }}> − </span>
            <span style={{ color: "#d9c2f5" }}>{importo(totaleNc)}</span>
            <span style={{ color: "rgba(255,255,255,.6)" }}> = </span>
            <b>{importo(lordo - totaleNc)}</b>
          </span>
        </div>
      </div>

      <PannelloNotaCredito aperto={nuova} onChiudi={() => setNuova(false)} motivi={MOTIVI} />
    </div>
  );
}

function RigaNc({
  n,
  f,
  onEmetti,
}: {
  n: CreditNote;
  f: InvoiceRow | undefined;
  onEmetti: () => void;
}) {
  const emessa = n.state === "issued";

  // Il residuo prima di questa nota: quello di adesso più l'importo che la nota
  // ha già tolto. Su una bozza non ha ancora tolto niente.
  const prima = f ? f.residual + (emessa ? n.amount : 0) : null;
  const dopo = f ? (emessa ? f.residual : f.residual - n.amount) : null;

  return (
    <tr>
      <td className="num font-semibold">
        {emessa ? n.number : <span style={{ color: "var(--faint)" }}>—</span>}
      </td>
      <td className="num" style={{ color: "var(--muted)" }}>{d(n.date)}</td>
      <td>{f?.client_name ?? "—"}</td>
      <td>
        {/* Link al registro: da una rettifica si vuole sempre arrivare al
            documento che corregge. */}
        <Link
          to="/payments/registro"
          className="num font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--teal-dark)" }}
        >
          {f?.number ?? "—"}
        </Link>
        {f?.project_name && (
          <span className="ml-1.5 text-[11px]" style={{ color: "var(--faint)" }}>
            {f.project_name}
          </span>
        )}
      </td>
      <td className="text-right font-bold" style={{ color: "var(--purple)" }}>
        <Money valore={-n.amount} valuta={f?.currency} />
      </td>
      <td>
        <Pill tinta={n.kind === "total" ? "purple" : "neutro"}>
          {n.kind === "total" ? "Totale" : "Parziale"}
        </Pill>
      </td>
      <td className="num text-[12px]" style={{ color: "var(--muted)" }}>
        {prima !== null && dopo !== null ? (
          <>
            {importo(prima, f?.currency)} → <b style={{ color: dopo <= 0 ? "var(--green)" : "var(--ink)" }}>
              {importo(Math.max(dopo, 0), f?.currency)}
            </b>
            {dopo <= 0 && <span style={{ color: "var(--green)" }}> · chiusa</span>}
          </>
        ) : (
          "—"
        )}
      </td>
      <td>
        <Pill tinta={emessa ? "green" : "neutro"} pallino>
          {emessa ? "Emessa" : "Bozza"}
        </Pill>
      </td>
      <td>
        {!emessa && (
          <button
            type="button"
            onClick={onEmetti}
            className="rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ background: "var(--purple)" }}
          >
            Emetti
          </button>
        )}
      </td>
    </tr>
  );
}
