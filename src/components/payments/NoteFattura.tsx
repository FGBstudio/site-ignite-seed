import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check, History, MessageSquarePlus, Pencil, Send, X } from "lucide-react";
import {
  useCorreggiNota, useNoteFattura, useRegistraEsito, type NotaFattura,
} from "@/hooks/usePayments";
import { useToast } from "@/hooks/use-toast";
import type { TipoNota } from "@/types/payments";

/**
 * Cosa ha detto il cliente.
 *
 * «Il bonifico parte lunedì», «hanno cambiato il responsabile acquisti»,
 * «richiamano a fine mese»: notizie che oggi restano in una mail o in testa a
 * chi ha risposto al telefono, e che servono proprio quando quella persona è in
 * ferie.
 *
 * Si impilano invece di sovrascriversi: due promesse mancate raccontano una
 * storia che una promessa sola non racconta, ed è quella storia che serve quando
 * si decide se mandare una pratica al legale. Una nota si può correggere, ma la
 * versione di prima non sparisce: resta nello storico.
 */

/**
 * Gli esiti tipici di una telefonata.
 *
 * Due portano una data e finiscono nel previsionale; gli altri sono notizie, e
 * la data non ce l'hanno perché non dicono quando arriveranno i soldi. È la
 * stessa distinzione che fa il database, e qui si vede: dove c'è la casella
 * della data, quella voce sposta la cassa.
 */
const ESITI: Array<{ id: TipoNota; nome: string; data: "serve" | "no" | "facoltativa" }> = [
  { id: "pagamento_predisposto", nome: "Pagamento predisposto", data: "serve" },
  { id: "bonifico_disposto", nome: "Bonifico disposto", data: "serve" },
  { id: "quietanza_richiesta", nome: "Richiesta quietanza", data: "no" },
  { id: "fattura_ricevuta", nome: "Fattura ricevuta", data: "no" },
  { id: "libera", nome: "Altro", data: "facoltativa" },
];

const ETICHETTA: Record<TipoNota, string> = {
  pagamento_predisposto: "pagamento predisposto",
  bonifico_disposto: "bonifico disposto",
  quietanza_richiesta: "quietanza",
  fattura_ricevuta: "ricevuta",
  sollecito: "sollecito",
  libera: "",
};

export function NoteFattura({ invoiceId }: { invoiceId: string }) {
  const [storico, setStorico] = useState(false);
  const { data: note = [] } = useNoteFattura(invoiceId, storico);
  const registra = useRegistraEsito();
  const correggi = useCorreggiNota();
  const { toast } = useToast();

  const [esito, setEsito] = useState<TipoNota>("libera");
  const [testo, setTesto] = useState("");
  const [quando, setQuando] = useState("");
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [correzione, setCorrezione] = useState("");

  const scelto = ESITI.find((e) => e.id === esito)!;

  const salva = async () => {
    if (scelto.data === "serve" && !quando) {
      toast({
        variant: "destructive",
        title: "Manca la data",
        description: `«${scelto.nome}» dice quando pagherà: senza la data non entra nel previsionale.`,
      });
      return;
    }
    if (esito === "libera" && !testo.trim()) return;
    try {
      await registra.mutateAsync({
        invoice_id: invoiceId,
        esito,
        data: scelto.data === "no" ? null : quando || null,
        testo: testo.trim() || null,
      });
      setTesto("");
      setQuando("");
      setEsito("libera");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Nota non salvata", description: e.message });
    }
  };

  const salvaCorrezione = async (n: NotaFattura) => {
    if (!correzione.trim() || correzione.trim() === n.text) {
      setInModifica(null);
      return;
    }
    try {
      await correggi.mutateAsync({ invoice_id: invoiceId, nota_id: n.id, testo: correzione });
      setInModifica(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Correzione non salvata", description: e.message });
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="label flex items-center gap-1.5">
          <MessageSquarePlus className="h-3 w-3" />
          Aggiornamenti dal cliente
        </p>
        {note.length > 0 && (
          <button
            type="button"
            onClick={() => setStorico((s) => !s)}
            className="flex items-center gap-1 text-[10.5px]"
            style={{ color: "var(--muted)" }}
          >
            <History className="h-3 w-3" />
            {storico ? "solo le attuali" : "storico"}
          </button>
        )}
      </div>

      {note.length > 0 && (
        <ul className="mb-2 space-y-1">
          {note.map((n) => {
            const corretta = !!n.sostituita_da;
            return (
              <li key={n.id} className="flex gap-2 text-[12px]" style={corretta ? { opacity: 0.45 } : undefined}>
                <span className="num shrink-0 tabular-nums" style={{ color: "var(--faint)" }}>
                  {format(parseISO(n.date), "d MMM", { locale: it })}
                </span>

                {inModifica === n.id ? (
                  <span className="flex flex-1 gap-1">
                    <input
                      value={correzione}
                      onChange={(e) => setCorrezione(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvaCorrezione(n);
                        if (e.key === "Escape") setInModifica(null);
                      }}
                      autoFocus
                      className="h-6 flex-1 rounded-[8px] px-2 text-[12px] outline-none"
                      style={{ border: "1px solid var(--border)", background: "#fff" }}
                    />
                    <button type="button" onClick={() => salvaCorrezione(n)} aria-label="Salva">
                      <Check className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} />
                    </button>
                    <button type="button" onClick={() => setInModifica(null)} aria-label="Annulla">
                      <X className="h-3.5 w-3.5" style={{ color: "var(--muted)" }} />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="flex-1">
                      {n.text}
                      {ETICHETTA[n.tipo] && (
                        <span className="ml-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
                          · {ETICHETTA[n.tipo]}
                        </span>
                      )}
                      {n.sostituisce_id && (
                        <span className="ml-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
                          · corretta
                        </span>
                      )}
                    </span>
                    {!corretta && (
                      <button
                        type="button"
                        onClick={() => {
                          setInModifica(n.id);
                          setCorrezione(n.text);
                        }}
                        aria-label="Correggi"
                      >
                        <Pencil className="h-3 w-3" style={{ color: "var(--faint)" }} />
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── L'esito, e la data quando ne porta una ── */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {ESITI.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              setEsito(e.id);
              if (e.data === "no") setQuando("");
            }}
            className="rounded-full px-2.5 py-1 text-[11px] transition-colors"
            style={{
              border: `1px solid ${esito === e.id ? "var(--teal)" : "var(--border)"}`,
              background: esito === e.id ? "var(--teal)" : "#fff",
              color: esito === e.id ? "#fff" : "var(--muted)",
            }}
          >
            {e.nome}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {scelto.data !== "no" && (
          <input
            type="date"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            aria-label="Quando ha detto che pagherà"
            title={
              scelto.data === "serve"
                ? "Quando pagherà: è questa data che lo porta nel previsionale"
                : "Se ti ha detto quando paga, scrivilo qui"
            }
            className="h-8 w-[130px] shrink-0 rounded-[10px] px-2 text-[12px] outline-none"
            style={{ border: "1px solid var(--border)", background: "#fff" }}
          />
        )}
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          // Invio salva: chi annota una telefonata sta ancora al telefono, e
          // cercare un pulsante col mouse è il modo di non annotare niente.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              salva();
            }
          }}
          placeholder={
            esito === "libera" ? "Cosa ti ha detto il cliente…" : "Aggiungi un dettaglio (facoltativo)"
          }
          aria-label="Aggiungi un aggiornamento"
          className="h-8 flex-1 rounded-[10px] px-2.5 text-[12px] outline-none"
          style={{ border: "1px solid var(--border)", background: "#fff" }}
        />
        <button
          type="button"
          onClick={salva}
          disabled={registra.isPending || (esito === "libera" && !testo.trim())}
          className="rounded-[10px] px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--teal)" }}
          aria-label="Registra"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>

      {scelto.data === "serve" && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
          Con la data, questa fattura entra nel previsionale del mese indicato.
        </p>
      )}
    </div>
  );
}
