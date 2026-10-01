import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, CheckCircle2, ListTodo, MoveRight, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAggiornaAppunto, useAppuntiDellaSettimana } from "@/hooks/useAppunti";
import { settimanaCorrente, useMilestoneDellaSettimana } from "@/hooks/useSettimanaPM";
import { settimanaIso } from "@/lib/settimane";
import { formatMoney } from "@/lib/currency";

/**
 * Questa settimana — la prima cosa che il PM vede aprendo la dashboard.
 *
 * La dashboard diceva quanti progetti ci sono e in che stato: informazioni vere,
 * che però non cambiano da un giorno all'altro. Chi apre la pagina il lunedì
 * mattina ha un'altra domanda — **cosa devo fare entro venerdì** — e non c'era
 * niente che gliela rispondesse.
 *
 * Due elenchi, e sono di natura diversa. Le **milestone** maturano per
 * calendario: le sa il sistema, perché hanno una data. Gli **appunti** li ha
 * scritti il PM sulla casella della settimana: il sistema non può saperli.
 * Mescolarli in una lista sola farebbe sembrare un promemoria un impegno preso
 * col cliente, e viceversa.
 */

const g = (iso: string) => format(parseISO(iso), "EEE d MMM", { locale: it });

export function SettimanaPM({ pmId }: { pmId: string | null | undefined }) {
  const navigate = useNavigate();
  const { dal, al } = settimanaCorrente();
  const { data: milestone = [], isLoading: caricaM } = useMilestoneDellaSettimana(pmId);
  const { data: appunti = [], isLoading: caricaA } = useAppuntiDellaSettimana(dal, al, pmId);
  const aggiorna = useAggiornaAppunto();

  const { settimana } = settimanaIso(new Date());
  const daFare = appunti.filter((a) => a.stato !== "done");
  const fatti = appunti.filter((a) => a.stato === "done");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Questa settimana
          <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
            W{settimana} · {g(dal)} → {g(al)}
          </span>
        </h2>
        {daFare.length + milestone.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {milestone.length} {milestone.length === 1 ? "milestone" : "milestone"} ·{" "}
            {daFare.length} {daFare.length === 1 ? "cosa da fare" : "cose da fare"}
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Le milestone che maturano ─────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Milestone che maturano</h3>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {milestone.length}
              </span>
            </header>

            {caricaM ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Un momento…</p>
            ) : milestone.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                Nessuna milestone matura in questa settimana.
              </p>
            ) : (
              <ul className="divide-y">
                {milestone.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${m.certification_id}`)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="w-[86px] shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {g(m.data)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {m.requisito ?? m.categoria ?? "Milestone"}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {m.cliente ? `${m.cliente} — ` : ""}
                          {m.progetto ?? "—"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {/* ── Quella che apre una fattura ──────────────────────
                            Una milestone qualunque è un promemoria; una che
                            sblocca una tranche è una cosa che il cliente vedrà
                            arrivare. Non possono avere lo stesso peso. */}
                        {m.sblocca_pagamento && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                            <Receipt className="h-3 w-3" />
                            {m.importo_tranche != null
                              ? formatMoney(m.importo_tranche, "EUR")
                              : "fattura"}
                          </span>
                        )}
                        {/* Una data spostata va detta: se non si vede, chi legge
                            crede che l'impegno sia sempre stato questo. */}
                        {m.spostata && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MoveRight className="h-3 w-3" /> spostata
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Gli appunti scritti sulla settimana ───────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <ListTodo className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Da fare</h3>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {daFare.length}
                {fatti.length > 0 && (
                  <span className="text-muted-foreground/60"> / {appunti.length}</span>
                )}
              </span>
            </header>

            {caricaA ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Un momento…</p>
            ) : appunti.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                Niente scritto per questa settimana. Gli appunti si scrivono cliccando sulla
                casella del progetto, nel piano.
              </p>
            ) : (
              <ul className="divide-y">
                {[...daFare, ...fatti].map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        aggiorna.mutate({ id: a.id, stato: a.stato === "done" ? "todo" : "done" })
                      }
                      aria-label={a.stato === "done" ? "Riapri" : "Segna fatto"}
                      title={a.stato === "done" ? "Riapri" : "Segna fatto"}
                      className="mt-0.5 shrink-0"
                    >
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4 transition-colors",
                          a.stato === "done"
                            ? "text-success"
                            : "text-muted-foreground/40 hover:text-muted-foreground",
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${a.certification_id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          a.stato === "done" && "text-muted-foreground line-through",
                        )}
                      >
                        {a.testo}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {a.cliente ? `${a.cliente} — ` : ""}
                        {a.progetto ?? "—"}
                      </span>
                    </button>
                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {g(a.due_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
