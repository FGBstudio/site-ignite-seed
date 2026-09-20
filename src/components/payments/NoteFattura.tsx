import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { MessageSquarePlus, Send } from "lucide-react";
import { useAggiungiNota, useNoteFattura } from "@/hooks/usePayments";
import { useToast } from "@/hooks/use-toast";

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
 * si decide se mandare una pratica al legale.
 */
export function NoteFattura({ invoiceId }: { invoiceId: string }) {
  const { data: note = [] } = useNoteFattura(invoiceId);
  const aggiungi = useAggiungiNota();
  const { toast } = useToast();
  const [testo, setTesto] = useState("");

  const salva = async () => {
    if (!testo.trim()) return;
    try {
      await aggiungi.mutateAsync({ invoice_id: invoiceId, text: testo });
      setTesto("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Nota non salvata", description: e.message });
    }
  };

  return (
    <div>
      <p className="label mb-1.5 flex items-center gap-1.5">
        <MessageSquarePlus className="h-3 w-3" />
        Aggiornamenti dal cliente
      </p>

      {note.length > 0 && (
        <ul className="mb-2 space-y-1">
          {note.map((n) => (
            <li key={n.id} className="flex gap-2 text-[12px]">
              <span className="num shrink-0 tabular-nums" style={{ color: "var(--faint)" }}>
                {format(parseISO(n.date), "d MMM", { locale: it })}
              </span>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
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
          onClick={(e) => e.stopPropagation()}
          placeholder="Cosa ti ha detto il cliente…"
          aria-label="Aggiungi un aggiornamento"
          className="h-8 flex-1 rounded-[10px] px-2.5 text-[12px] outline-none"
          style={{ border: "1px solid var(--border)", background: "#fff" }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            salva();
          }}
          disabled={!testo.trim() || aggiungi.isPending}
          className="rounded-[10px] px-2.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--teal)" }}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
