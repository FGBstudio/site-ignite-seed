import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KpiCard, Pill } from "@/components/payments/Comuni";
import {
  useChiudiCredito,
  useCreditiCliente,
  type CreditoCliente,
  type StatoCredito,
} from "@/hooks/useCreditiCliente";
import { importo } from "@/lib/payments/aggregati";

/**
 * I crediti dei clienti — quello che dobbiamo a loro, non loro a noi.
 *
 * Nascono quando un progetto si chiude prima di consumare quello che il cliente
 * aveva pagato. Non si cancellano: cambiano stato. «usato» quando finiscono in
 * un'offerta nuova, «rimborsato» quando i soldi tornano indietro, «perso» quando
 * si decide di non riconoscerli — e in quel caso resta scritto che si è deciso,
 * che è diverso dal non averne mai parlato.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy", { locale: it }) : "—");

const TINTA: Record<StatoCredito, "teal" | "amber" | "neutro" | "red"> = {
  aperto: "amber",
  usato: "teal",
  rimborsato: "neutro",
  perso: "red",
};

const NOME: Record<StatoCredito, string> = {
  aperto: "Aperto",
  usato: "Usato",
  rimborsato: "Rimborsato",
  perso: "Perso",
};

export function CreditiCliente() {
  const { toast } = useToast();
  const { data: crediti = [], isLoading } = useCreditiCliente();
  const chiudi = useChiudiCredito();
  const [filtro, setFiltro] = useState<StatoCredito | "tutti">("tutti");

  const aperti = crediti.filter((c) => c.stato === "aperto");
  const righe = filtro === "tutti" ? crediti : crediti.filter((c) => c.stato === filtro);

  const chiudiCon = async (c: CreditoCliente, stato: "rimborsato" | "perso") => {
    const nota = window.prompt(
      stato === "rimborsato"
        ? `Rimborsati ${importo(c.importo, c.valuta)} a ${c.cliente}. Come?`
        : `Perché ${importo(c.importo, c.valuta)} di ${c.cliente} non vengono riconosciuti?`,
      "",
    );
    // Annullare il prompt è annullare il gesto: `null` non è una nota vuota.
    if (nota === null) return;
    try {
      await chiudi.mutateAsync({ credito_id: c.id, stato, note: nota || null });
      toast({ title: `Credito ${NOME[stato].toLowerCase()}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non chiuso", description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          etichetta="Credito aperto verso i clienti"
          valore={importo(aperti.reduce((s, c) => s + Number(c.importo), 0))}
          sotto={`${aperti.length} ${aperti.length === 1 ? "voce" : "voci"} da usare o rimborsare`}
          variante="ambra"
        />
        <KpiCard
          etichetta="Già tenuto in conto"
          valore={importo(
            crediti.filter((c) => c.stato === "usato").reduce((s, c) => s + Number(c.importo), 0),
          )}
          sotto="finito in offerte nuove"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["tutti", "aperto", "usato", "rimborsato", "perso"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFiltro(s)}
            aria-pressed={filtro === s}
            className="rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors"
            style={{
              background: filtro === s ? "var(--teal)" : "#fff",
              color: filtro === s ? "#fff" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {s === "tutti" ? "Tutti" : NOME[s]}
            <span className="ml-1.5 num opacity-70">
              {s === "tutti" ? crediti.length : crediti.filter((c) => c.stato === s).length}
            </span>
          </button>
        ))}
      </div>

      <section className="card overflow-hidden">
        <header
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Wallet className="h-4 w-4" style={{ color: "var(--amber)" }} />
          <h2 className="titolo text-[13px]">Crediti dei clienti</h2>
        </header>

        {isLoading ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            Caricamento…
          </p>
        ) : righe.length === 0 ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            {filtro === "tutti"
              ? "Nessun credito registrato. Ne nasce uno quando si cancella un progetto su cui il cliente aveva pagato più di quanto gli è stato consegnato."
              : `Nessun credito «${NOME[filtro as StatoCredito].toLowerCase()}».`}
          </p>
        ) : (
          <ul>
            {righe.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <Pill tinta={TINTA[c.stato]}>{NOME[c.stato]}</Pill>

                <div className="min-w-[220px] flex-1">
                  <p className="text-[12.5px] font-semibold">{c.cliente}</p>
                  <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {c.motivo}
                    {c.progetto_origine && ` — da «${c.progetto_origine}»`}
                    {" · "}
                    {d(c.data)}
                    {c.stato === "usato" && c.progetto_uso && (
                      <> · tenuto in conto su «{c.progetto_uso}» il {d(c.usato_il)}</>
                    )}
                  </p>
                  {c.note && (
                    <p className="mt-0.5 whitespace-pre-line text-[11px]" style={{ color: "var(--faint)" }}>
                      {c.note}
                    </p>
                  )}
                </div>

                <p className="num text-[14px] font-bold">{importo(c.importo, c.valuta)}</p>

                {/* Un credito aperto si chiude in due modi. «Usato» no: quello lo
                    segna il wizard delle offerte, dove si sa su quale offerta. */}
                {c.stato === "aperto" && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => chiudiCon(c, "rimborsato")}
                      className="rounded-[10px] border px-2.5 py-1 text-[11px] font-semibold"
                      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      Rimborsato
                    </button>
                    <button
                      type="button"
                      onClick={() => chiudiCon(c, "perso")}
                      className="rounded-[10px] border px-2.5 py-1 text-[11px] font-semibold"
                      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      Non riconosciuto
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
