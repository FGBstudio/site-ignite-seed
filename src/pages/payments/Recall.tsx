import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Ban, BellRing, HandCoins, Lock, Unlock } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import {
  useBloccaProgetto,
  useBonificoDisposto,
  useProgettiBloccati,
  useSbloccaProgetto,
} from "@/hooks/usePayments";
import { KpiCard, Money, Pill } from "@/components/payments/Comuni";
import { DialogoIncasso } from "@/components/payments/DialogoIncasso";
import { DialogoSollecito } from "@/components/payments/DialogoSollecito";
import { NoteFattura } from "@/components/payments/NoteFattura";
import { decimaliUtili, importo } from "@/lib/payments/aggregati";
import { useToast } from "@/hooks/use-toast";
import type { InvoiceRow } from "@/types/payments";

/**
 * Recall — i crediti da inseguire, e i progetti fermati per farlo.
 *
 * Non è un elenco a parte: sono le fatture del registro che hanno passato la
 * scadenza con del residuo. Ci entrano da sole e ne escono da sole quando i
 * soldi arrivano — nessuno le sposta a mano, ed è per questo che l'elenco è
 * sempre vero.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM", { locale: it }) : "—");

export default function Recall() {
  const { fatture, caricamento } = usePaymentsCtx();
  const { toast } = useToast();
  const { data: bloccati = [] } = useProgettiBloccati();

  const [sollecito, setSollecito] = useState<InvoiceRow | null>(null);
  const [incasso, setIncasso] = useState<InvoiceRow | null>(null);

  const proroga = useBonificoDisposto();
  const blocca = useBloccaProgetto();
  const sblocca = useSbloccaProgetto();

  const inSollecito = useMemo(
    () => fatture.filter((f) => f.lifecycle_state === "in_recall" && f.residual > 0),
    [fatture],
  );
  const fattureBloccate = useMemo(
    () => fatture.filter((f) => f.lifecycle_state === "blocked"),
    [fatture],
  );

  const totale = inSollecito.reduce((t, f) => t + f.residual_eur, 0);
  const parziali = inSollecito.filter((f) => f.payment_status === "partial");
  const totaleParziali = parziali.reduce((t, f) => t + f.residual_eur, 0);

  const azione = async (p: Promise<unknown>, titolo: string) => {
    try {
      await p;
      toast({ title: titolo });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non è stato possibile", description: e.message });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titolo text-lg">Recall</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          Crediti scaduti e non incassati. Le fatture entrano e escono da sole: si esce
          incassando, non spuntando.
        </p>
      </div>

      {/* ── I due numeri che contano ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          etichetta="Insoluto in recall"
          valore={importo(totale)}
          sotto={`${inSollecito.length} fattur${inSollecito.length === 1 ? "a" : "e"} da inseguire`}
          variante="rossa"
        />
        <KpiCard
          etichetta="di cui residui parziali"
          valore={importo(totaleParziali)}
          sotto={`${parziali.length} già pagate in parte`}
          variante="ambra"
        />
        <KpiCard
          etichetta="Progetti fermi"
          valore={bloccati.length}
          sotto="fermati per mancato pagamento"
        />
      </div>

      {/* ── In sollecito ── */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <BellRing className="h-4 w-4" style={{ color: "var(--red)" }} />
          <h2 className="titolo text-[13px]">In sollecito</h2>
          <span className="num text-[11px]" style={{ color: "var(--muted)" }}>
            {inSollecito.length}
          </span>
        </header>

        {caricamento ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            Caricamento…
          </p>
        ) : inSollecito.length === 0 ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            Nessun credito scaduto. È il risultato migliore che questa schermata possa dare.
          </p>
        ) : (
          <ul>
            {inSollecito.map((f) => {
              const giallo = f.recall_status === "yellow";
              const restano = giallo && f.yellow_until
                ? differenceInCalendarDays(parseISO(f.yellow_until), new Date())
                : null;
              // Tutto il residuo è un ammanco trattenuto dalla banca: scaduto sì,
              // ma non c'è niente da sollecitare — si riversa sulla prossima
              // fattura. In rosso accanto a un insoluto vero direbbe che sono lo
              // stesso problema, e si sollecita un cliente che ha già pagato.
              const ammanco = f.ammanco_da_recuperare >= f.residual - 0.005 && f.residual > 0;

              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    // Il giallo ha uno sfondo caldo: si vede da lontano che su
                    // quella riga c'è una promessa in corso, non un silenzio.
                    background: giallo || ammanco ? "var(--amber-bg)" : undefined,
                  }}
                >
                  <div className="min-w-[200px] flex-1">
                    <p className="num text-[13px] font-semibold">
                      {f.number}
                      <span className="ml-2 font-normal" style={{ color: "var(--muted)" }}>
                        {f.client_name ?? "—"}
                      </span>
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {f.project_name ?? "—"} · scad. {d(f.due_date)}
                    </p>
                  </div>

                  {giallo ? (
                    <Pill tinta="amber" contorno>
                      Bonifico disposto
                      {restano !== null && ` · torna rosso fra ${Math.max(restano, 0)} gg`}
                    </Pill>
                  ) : ammanco ? (
                    <Pill tinta="amber" contorno>
                      Ammanco · non si sollecita
                    </Pill>
                  ) : (
                    <Pill tinta="red" pallino>
                      +{f.days_late} gg
                    </Pill>
                  )}

                  <div className="text-right">
                    <p
                      className="num text-[14px] font-bold"
                      style={{ color: giallo || ammanco ? "var(--amber)" : "var(--red)" }}
                    >
                      {importo(f.residual, f.currency, decimaliUtili(f.residual))}
                    </p>
                    {/* Dire che è un residuo parziale evita di leggerlo come
                        l'importo della fattura, che è un altro numero. */}
                    {ammanco ? (
                      <p className="text-[10.5px]" style={{ color: "var(--amber)" }}>
                        da riversare sulla prossima fattura
                      </p>
                    ) : f.payment_status === "partial" ? (
                      <p className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                        {f.credited_amount > 0 ? "(parziale, netto NC)" : "(parziale)"}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-[140px] text-[11px]" style={{ color: "var(--muted)" }}>
                    {f.reminders_count > 0 ? (
                      <>
                        <span className="num">{f.reminders_count}</span> solleciti
                        {f.last_reminder_date && ` · ult. ${d(f.last_reminder_date)}`}
                        {f.next_reminder_date && (
                          <div>prossimo {d(f.next_reminder_date)}</div>
                        )}
                      </>
                    ) : (
                      "mai sollecitata"
                    )}
                  </div>

                  {/* Le note stanno sulla riga e non dietro un click: se per
                      leggerle bisogna aprire qualcosa, chi scorre l'elenco
                      richiama il cliente senza sapere che ha già risposto. */}
                  <div className="order-last w-full">
                    <NoteFattura invoiceId={f.id} />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Bottone onClick={() => setSollecito(f)}>
                      <BellRing className="h-3 w-3" /> Sollecito
                    </Bottone>

                    {!giallo && (
                      <Bottone
                        onClick={() =>
                          azione(
                            proroga.mutateAsync({ invoice_id: f.id }),
                            "Annotato: bonifico disposto, 30 giorni",
                          )
                        }
                      >
                        <HandCoins className="h-3 w-3" /> Bonifico disposto
                      </Bottone>
                    )}

                    <Bottone onClick={() => setIncasso(f)} tinta="green">
                      Registra incasso
                    </Bottone>

                    {f.certification_id && (
                      <Bottone
                        tinta="red"
                        onClick={() =>
                          azione(
                            blocca.mutateAsync({ invoice_id: f.id }),
                            "Progetto fermato per insoluto",
                          )
                        }
                      >
                        <Ban className="h-3 w-3" /> Blocca progetto
                      </Bottone>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Progetti fermi ── */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Lock className="h-4 w-4" style={{ color: "var(--purple)" }} />
          <h2 className="titolo text-[13px]">Progetti fermi per insoluto</h2>
          <span className="num text-[11px]" style={{ color: "var(--muted)" }}>
            {bloccati.length}
          </span>
        </header>

        {bloccati.length === 0 ? (
          <p className="p-8 text-center text-[12px]" style={{ color: "var(--muted)" }}>
            Nessun progetto fermo.
          </p>
        ) : (
          <ul>
            {bloccati.map((c) => {
              const giorni = c.on_hold_at
                ? differenceInCalendarDays(new Date(), parseISO(c.on_hold_at))
                : null;
              const loro = fattureBloccate.filter((f) => f.certification_id === c.id);
              const scoperto = loro.reduce((t, f) => t + f.residual_eur, 0);

              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div className="min-w-[220px] flex-1">
                    <p className="text-[13px] font-semibold">{c.name ?? c.client ?? "—"}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {c.on_hold_reason ?? "Mancato pagamento"}
                      {giorni !== null && ` · fermo da ${giorni} gg`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="num text-[14px] font-bold" style={{ color: "var(--purple)" }}>
                      {importo(scoperto)}
                    </p>
                    <p className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                      {loro.length} fattur{loro.length === 1 ? "a" : "e"} scoperte
                    </p>
                  </div>

                  {/* Dove torna: si dice prima di premere, perché sbloccare
                      significa rimettere il progetto in uno stato preciso. */}
                  <Pill tinta="neutro">
                    riprende come «{c.on_hold_previous_status ?? "—"}»
                  </Pill>

                  <Bottone
                    tinta="teal"
                    onClick={() =>
                      azione(sblocca.mutateAsync({ certification_id: c.id }), "Progetto ripreso")
                    }
                  >
                    <Unlock className="h-3 w-3" /> Sblocca
                  </Bottone>
                </li>
              );
            })}
          </ul>
        )}

        <p className="px-4 py-2.5 text-[11px]" style={{ background: "var(--ground)", color: "var(--muted)" }}>
          Il blocco per insoluto <b>è</b> il fermo del progetto (on&nbsp;hold), con la causa
          dichiarata: uno stato solo, così non esistono due risposte alla domanda «questo
          progetto è fermo?». Il PM lo vede in sola lettura. Quando il credito rientra, il
          progetto riparte da solo e torna allo stato da cui era stato fermato.
        </p>
      </section>

      <DialogoSollecito
        fattura={sollecito}
        aperto={!!sollecito}
        onChiudi={() => setSollecito(null)}
      />
      <DialogoIncasso fattura={incasso} aperto={!!incasso} onChiudi={() => setIncasso(null)} />
    </div>
  );
}

function Bottone({
  children,
  onClick,
  tinta = "neutro",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tinta?: "neutro" | "green" | "red" | "teal";
}) {
  const stile =
    tinta === "green"
      ? { background: "var(--green)", color: "#fff", border: "1px solid transparent" }
      : tinta === "red"
        ? { background: "#fff", color: "var(--red)", border: "1px solid var(--red)" }
        : tinta === "teal"
          ? { background: "var(--teal)", color: "#fff", border: "1px solid transparent" }
          : { background: "#fff", color: "var(--muted)", border: "1px solid var(--border)" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold"
      style={stile}
    >
      {children}
    </button>
  );
}
