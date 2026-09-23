import { useState } from "react";
import { AlertTriangle, Check, Link2, X } from "lucide-react";
import { Pill } from "@/components/payments/Comuni";
import { importo } from "@/lib/payments/aggregati";
import {
  useAbbinaFattura,
  useApprovaFattura,
  useProponiAbbinamento,
  useVerificaCongruenza,
} from "@/hooks/useFornitura";
import { useToast } from "@/hooks/use-toast";
import type { PassiveInvoice } from "@/types/payments";

/**
 * Abbinare la fattura del fornitore alla rata dell'ordine.
 *
 * L'OCR sa leggere un importo; non sa dire a quale rata di quale ordine
 * corrisponde. Quella domanda la risolve il database, che conosce le
 * condizioni negoziate e sa quali rate sono già state fatturate: qui si
 * scelgono fra le proposte, ordinate per vicinanza dell'importo.
 *
 * Approvare non fa uscire denaro. Sposta la rata da previsione a debito con
 * una scadenza esatta — sulla timeline resta tratteggiata, solo più fitta.
 */
export function AbbinaOrdine({
  fattura,
  onChiudi,
}: {
  fattura: PassiveInvoice;
  onChiudi: () => void;
}) {
  const { data: proposte = [], isLoading } = useProponiAbbinamento(
    fattura.supplier_id,
    fattura.total,
    fattura.currency,
  );
  const { data: controlli = [] } = useVerificaCongruenza(
    fattura.po_condizione_id ? fattura.id : null,
  );
  const abbina = useAbbinaFattura();
  const approva = useApprovaFattura();
  const { toast } = useToast();
  const [scadenza, setScadenza] = useState<string>("");

  const discordi = controlli.filter((c) => c.esito === "discorde" || c.esito === "assente");

  const scegli = async (poId: string, condizioneId: string) => {
    try {
      await abbina.mutateAsync({ id: fattura.id, po_id: poId, condizione_id: condizioneId });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Abbinamento non riuscito", description: e.message });
    }
  };

  const conferma = async () => {
    try {
      await approva.mutateAsync({ id: fattura.id, scadenza: scadenza || null });
      toast({
        title: `${fattura.number} verificata`,
        description: "La rata è ora un debito con scadenza esatta sulla timeline.",
      });
      onChiudi();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Approvazione non riuscita", description: e.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,.35)" }}>
      <div className="card w-full max-w-[640px] max-h-[86vh] overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="titolo text-[14px]">Abbina {fattura.number} a un ordine</h2>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
              {importo(fattura.total, fattura.currency)} · ricevuta il{" "}
              {fattura.received_date} · scadenza {fattura.due_date}
            </p>
          </div>
          <button type="button" onClick={onChiudi} aria-label="Chiudi" style={{ color: "var(--muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Le proposte ── */}
        <p className="label mt-4">Rate compatibili</p>
        {isLoading ? (
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Cerco…
          </p>
        ) : proposte.length === 0 ? (
          <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
            Nessun ordine di questo fornitore ha condizioni di pagamento registrate. Va prima
            compilata la Richiesta di Fornitura.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {proposte.slice(0, 6).map((p) => {
              const scelta = fattura.po_condizione_id === p.condizione_id;
              return (
                <li key={p.condizione_id}>
                  <button
                    type="button"
                    onClick={() => scegli(p.po_id, p.condizione_id)}
                    className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px]"
                    style={{
                      border: `1px solid ${scelta ? "var(--teal)" : "var(--border)"}`,
                      background: scelta ? "var(--teal-bg)" : "#fff",
                    }}
                  >
                    <span className="w-[70px] shrink-0 font-semibold">{p.po_number ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate">{p.rata}</span>
                    <span className="num">{importo(p.atteso, p.valuta)}</span>
                    {p.gia_coperta ? (
                      <Pill tinta="amber">già fatturata</Pill>
                    ) : p.confidenza === "importo esatto" ? (
                      <Pill tinta="green">esatto</Pill>
                    ) : p.confidenza === "scarto sotto il 2%" ? (
                      <Pill tinta="amber">
                        {p.scarto > 0 ? "+" : ""}
                        {importo(p.scarto, p.valuta)}
                      </Pill>
                    ) : (
                      <Pill tinta="neutro">
                        {p.scarto > 0 ? "+" : ""}
                        {importo(p.scarto, p.valuta)}
                      </Pill>
                    )}
                    {scelta && <Link2 className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* ── La congruenza ── */}
        {fattura.po_condizione_id && controlli.length > 0 && (
          <>
            <p className="label mt-4">Congruenza con l'ordine</p>
            <ul className="mt-1 space-y-0.5">
              {controlli.map((c) => (
                <li key={c.controllo} className="flex items-baseline gap-2 text-[12px]">
                  <span
                    className="w-[74px] shrink-0 font-semibold"
                    style={{
                      color:
                        c.esito === "ok"
                          ? "var(--green)"
                          : c.esito === "tollerato"
                            ? "var(--amber)"
                            : "var(--red)",
                    }}
                  >
                    {c.controllo}
                  </span>
                  <span style={{ color: "var(--muted)" }}>{c.dettaglio}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {discordi.length > 0 && (
          <p
            className="mt-3 flex items-start gap-1.5 rounded-[8px] p-2 text-[11.5px]"
            style={{ background: "var(--red-bg)", color: "var(--red)" }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {discordi.length === 1
              ? "Un controllo non torna: approvare vuol dire dire che va bene lo stesso."
              : `${discordi.length} controlli non tornano: approvare vuol dire dire che vanno bene lo stesso.`}
          </p>
        )}

        {/* ── La scadenza, se diversa da quella del documento ── */}
        {fattura.po_condizione_id && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-[12px]">
              <span className="label block">Scadenza concordata</span>
              <input
                type="date"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
                className="mt-0.5 h-8 rounded-[10px] px-2 text-[12px] outline-none"
                style={{ border: "1px solid var(--border)", background: "#fff" }}
              />
            </label>
            <p className="flex-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Vuota: vale quella della fattura ({fattura.due_date}). Cambiandola si spostano i
              termini, perché la scadenza è calcolata da quelli.
            </p>
            <button
              type="button"
              onClick={conferma}
              disabled={fattura.stato_verifica === "verificata"}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--teal)" }}
            >
              <Check className="h-3.5 w-3.5" />
              {fattura.stato_verifica === "verificata" ? "Già verificata" : "Verifica e approva"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
