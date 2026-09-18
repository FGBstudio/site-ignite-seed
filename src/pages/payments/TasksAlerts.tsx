import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Check, ExternalLink } from "lucide-react";
import { useAlertPayments, useChiudiAlert } from "@/hooks/usePayments";
import { Pill } from "@/components/payments/Comuni";
import { useToast } from "@/hooks/use-toast";

/**
 * Tasks & Alerts — il lavoro non ancora fatto.
 *
 * Un alert resta finché l'azione non è compiuta, e si chiude da solo quando il
 * sistema si accorge che è stata compiuta: emessa la fattura, registrato
 * l'incasso. Il pulsante «Fatto» serve solo a quelli che il sistema non può
 * vedere — un extra-canone da valutare non lascia tracce nel database.
 *
 * È la differenza fra una lista di cose da fare e una lista di cose da
 * spuntare: la prima si svuota lavorando, la seconda lavorando e ricordandosi
 * di spuntare.
 */

const TIPI: Record<string, { nome: string; tinta: "red" | "teal" | "green" | "amber" | "purple" | "neutro"; auto: boolean }> = {
  extra_canone: { nome: "Extra-canone", tinta: "red", auto: false },
  quotation_to_payments: { nome: "Emetti", tinta: "teal", auto: true },
  billing_due: { nome: "Emetti", tinta: "teal", auto: true },
  invoice_paid: { nome: "Incasso", tinta: "green", auto: true },
  recall_yellow_expired: { nome: "Sollecito", tinta: "amber", auto: true },
  project_on_hold: { nome: "Progetto fermo", tinta: "purple", auto: true },
};

export default function TasksAlerts() {
  const { data: alert = [], isLoading } = useAlertPayments();
  const chiudi = useChiudiAlert();
  const { toast } = useToast();

  // I manuali per primi: sono gli unici che restano lì finché non se ne occupa
  // una persona, e quindi gli unici che possono marcire.
  const ordinati = useMemo(
    () =>
      [...alert].sort((a, b) => {
        const am = TIPI[a.alert_type]?.auto === false ? 0 : 1;
        const bm = TIPI[b.alert_type]?.auto === false ? 0 : 1;
        return am - bm || b.created_at.localeCompare(a.created_at);
      }),
    [alert],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titolo text-lg">Tasks &amp; Alerts</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          Lavoro non ancora fatto. Quasi tutto si chiude da solo quando l'azione risulta
          compiuta — non serve spuntarlo.
        </p>
      </div>

      {isLoading ? (
        <p className="card p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Caricamento…
        </p>
      ) : ordinati.length === 0 ? (
        <p className="card p-10 text-center text-[12px]" style={{ color: "var(--muted)" }}>
          Niente in sospeso.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ordinati.map((a) => {
            const t = TIPI[a.alert_type] ?? {
              nome: a.alert_type,
              tinta: "neutro" as const,
              auto: false,
            };
            return (
              <article key={a.id} className="card flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Pill tinta={t.tinta}>{t.nome}</Pill>
                  <span className="text-[10.5px]" style={{ color: "var(--faint)" }}>
                    {formatDistanceToNow(parseISO(a.created_at), { locale: it, addSuffix: true })}
                  </span>
                </div>

                <p className="text-[13px] font-semibold leading-snug">{a.title}</p>
                {a.description && (
                  <p className="text-[11.5px] leading-snug" style={{ color: "var(--muted)" }}>
                    {a.description}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Link
                    to={a.invoice_id ? "/payments/registro" : "/payments/da-emettere"}
                    className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold"
                    style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
                  >
                    <ExternalLink className="h-3 w-3" /> Apri
                  </Link>

                  {/* «Fatto» solo dove serve: su un alert che si chiude da solo
                      sarebbe un pulsante che toglie una notifica senza che il
                      lavoro sia stato fatto. */}
                  {!t.auto && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await chiudi.mutateAsync(a.id);
                          toast({ title: "Segnato come fatto" });
                        } catch (e: any) {
                          toast({ variant: "destructive", title: "Non riuscito", description: e.message });
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
                      style={{ background: "var(--teal)" }}
                    >
                      <Check className="h-3 w-3" /> Fatto
                    </button>
                  )}

                  {t.auto && (
                    <span className="text-[10.5px]" style={{ color: "var(--faint)" }}>
                      si chiude da solo
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
