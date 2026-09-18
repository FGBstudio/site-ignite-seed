import { cn } from "@/lib/utils";
import { importo } from "@/lib/payments/aggregati";
import type { Currency, LifecycleState, PaymentStatus, RecallStatus } from "@/types/payments";

/**
 * I pezzi condivisi della sezione Payments.
 *
 * Uno solo di ciascuno, usato ovunque: la specifica lo chiede e la ragione è
 * pratica. Una seconda pill di stato scritta per il Recall e una scritta per il
 * Registro finirebbero per raccontare lo stesso stato con due colori diversi, e
 * chi guarda non saprebbe quale credere.
 */

/* ── Importi ──────────────────────────────────────────────────────────────── */

/**
 * Un importo, con il simbolo della valuta della fattura.
 *
 * Una fattura in sterline resta in sterline anche in una tabella dove le altre
 * sono in euro: convertirla per farla stare in colonna vorrebbe dire mostrare
 * un numero che su nessun documento esiste.
 */
export function Money({
  valore,
  valuta = "EUR",
  decimali = 0,
  className,
}: {
  valore: number | null | undefined;
  valuta?: Currency;
  decimali?: number;
  className?: string;
}) {
  if (valore === null || valore === undefined) {
    return <span className={cn("num text-[var(--faint)]", className)}>—</span>;
  }
  return <span className={cn("num", className)}>{importo(valore, valuta, decimali)}</span>;
}

/* ── Pill di stato ────────────────────────────────────────────────────────── */

type Tinta = "green" | "amber" | "red" | "purple" | "teal" | "neutro" | "dark";

const TINTE: Record<Tinta, { bg: string; fg: string; bordo: string }> = {
  green: { bg: "var(--green-bg)", fg: "var(--green)", bordo: "transparent" },
  amber: { bg: "var(--amber-bg)", fg: "var(--amber)", bordo: "transparent" },
  red: { bg: "var(--red-bg)", fg: "var(--red)", bordo: "transparent" },
  purple: { bg: "var(--purple-bg)", fg: "var(--purple)", bordo: "transparent" },
  teal: { bg: "var(--teal-bg)", fg: "var(--teal-dark)", bordo: "transparent" },
  neutro: { bg: "#fff", fg: "var(--muted)", bordo: "var(--border)" },
  dark: { bg: "var(--dark)", fg: "#fff", bordo: "transparent" },
};

export function Pill({
  children,
  tinta = "neutro",
  pallino = false,
  contorno = false,
  className,
}: {
  children: React.ReactNode;
  tinta?: Tinta;
  /** Il pallino precede il testo: si legge lo stato anche senza leggere la parola. */
  pallino?: boolean;
  /** Solo bordo: è il «bonifico disposto», una promessa e non un fatto. */
  contorno?: boolean;
  className?: string;
}) {
  const t = TINTE[tinta];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        className,
      )}
      style={{
        background: contorno ? "transparent" : t.bg,
        color: t.fg,
        border: `1px solid ${contorno ? t.fg : t.bordo}`,
      }}
    >
      {pallino && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

const PAGAMENTO: Record<PaymentStatus, { testo: string; tinta: Tinta }> = {
  paid: { testo: "Saldata", tinta: "green" },
  partial: { testo: "Parziale", tinta: "amber" },
  unpaid: { testo: "Non pagata", tinta: "red" },
  credited: { testo: "Chiusa da NC", tinta: "purple" },
};

/** Quanto è stata pagata. Ortogonale allo stato di ciclo: sono due cose. */
export function PillPagamento({ stato }: { stato: PaymentStatus }) {
  const s = PAGAMENTO[stato] ?? { testo: String(stato), tinta: "neutro" as Tinta };
  return (
    <Pill tinta={s.tinta} pallino>
      {s.testo}
    </Pill>
  );
}

const CICLO: Record<LifecycleState, { testo: string; tinta: Tinta }> = {
  issued: { testo: "Emessa", tinta: "neutro" },
  in_recall: { testo: "In sollecito", tinta: "red" },
  blocked: { testo: "Bloccata", tinta: "purple" },
  insoluto: { testo: "Insoluta", tinta: "red" },
  closed: { testo: "Chiusa", tinta: "green" },
};

/**
 * Dove si trova nel suo percorso.
 *
 * Il giallo non è uno stato di ciclo a sé: è un recall con una promessa in
 * corso, e si mostra come tale — stesso stato, contorno invece di pieno.
 */
export function PillCiclo({
  stato,
  recall,
  giorniRitardo = 0,
}: {
  stato: LifecycleState;
  recall?: RecallStatus | null;
  giorniRitardo?: number;
}) {
  if (stato === "in_recall" && recall === "yellow") {
    return (
      <Pill tinta="amber" contorno>
        Bonifico disposto
      </Pill>
    );
  }
  const s = CICLO[stato] ?? { testo: String(stato), tinta: "neutro" as Tinta };
  const coda = giorniRitardo > 0 && (stato === "in_recall" || stato === "insoluto")
    ? ` · ${giorniRitardo} gg`
    : "";
  return (
    <Pill tinta={s.tinta} pallino>
      {s.testo}
      {coda}
    </Pill>
  );
}

/* ── Card dei numeri ──────────────────────────────────────────────────────── */

export function KpiCard({
  etichetta,
  valore,
  sotto,
  variante = "neutra",
  className,
}: {
  etichetta: string;
  valore: React.ReactNode;
  sotto?: React.ReactNode;
  variante?: "neutra" | "scura" | "accento" | "ambra" | "rossa";
  className?: string;
}) {
  const stile: React.CSSProperties =
    variante === "scura"
      ? { background: "var(--dark)", color: "#fff", borderColor: "transparent" }
      : variante === "accento"
        ? { background: "var(--teal-bg)", borderColor: "var(--teal)" }
        : {};

  const tintaValore =
    variante === "ambra" ? "var(--amber)" : variante === "rossa" ? "var(--red)" : undefined;

  return (
    <div className={cn("card p-4", className)} style={stile}>
      <p
        className="label"
        style={variante === "scura" ? { color: "rgba(255,255,255,.65)" } : undefined}
      >
        {etichetta}
      </p>
      <p className="num mt-1.5 text-2xl font-extrabold" style={{ color: tintaValore }}>
        {valore}
      </p>
      {sotto && (
        <p
          className="mt-1 text-[11px] leading-snug"
          style={{ color: variante === "scura" ? "rgba(255,255,255,.7)" : "var(--muted)" }}
        >
          {sotto}
        </p>
      )}
    </div>
  );
}
