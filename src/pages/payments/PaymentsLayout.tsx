import { createContext, useContext, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { cn } from "@/lib/utils";
import { useFatture } from "@/hooks/usePayments";
import type { EntityCode, InvoiceRow } from "@/types/payments";
import { perEntita } from "@/lib/payments/aggregati";
import "./payments.css";

/**
 * La sezione Payments.
 *
 * Nove schede su un registro solo: non sono nove elenchi, sono nove tagli degli
 * stessi dati. Le fatture si caricano qui una volta e ogni scheda filtra le
 * righe che ha già — così i conteggi sui badge e i numeri dentro le schermate
 * vengono per forza dalla stessa fonte e non possono discordare.
 *
 * Il selettore entità vive qui per lo stesso motivo: filtrare per società è una
 * decisione che vale per tutta la sezione, non una preferenza di una schermata.
 */

interface Contesto {
  /** Le fatture già filtrate per la società scelta. */
  fatture: InvoiceRow[];
  /** Tutte, per i casi in cui serve il consolidato a prescindere dal filtro. */
  tutte: InvoiceRow[];
  entita: EntityCode | null;
  caricamento: boolean;
}

const CtxPayments = createContext<Contesto | null>(null);

export function usePaymentsCtx(): Contesto {
  const c = useContext(CtxPayments);
  if (!c) throw new Error("usePaymentsCtx va usato dentro PaymentsLayout");
  return c;
}

const SCHEDE = [
  { a: "/payments", nome: "Dashboard", esatta: true },
  { a: "/payments/registro", nome: "Registro Fatture" },
  { a: "/payments/da-emettere", nome: "Da Emettere", badge: "neutro" as const },
  { a: "/payments/recall", nome: "Recall", badge: "rosso" as const },
  { a: "/payments/insoluti", nome: "Insoluti", badge: "rosso" as const },
  { a: "/payments/clienti", nome: "Clienti" },
  { a: "/payments/note-credito", nome: "Note di Credito" },
  { a: "/payments/passive", nome: "Fatture Passive" },
  { a: "/payments/iva", nome: "IVA & Previsionale" },
  { a: "/payments/alerts", nome: "Tasks & Alerts", badge: "rosso" as const },
];

const ENTITA: Array<{ codice: EntityCode | null; nome: string }> = [
  { codice: null, nome: "Consolidato" },
  { codice: "uk", nome: "FGB UK" },
  { codice: "it", nome: "FGB Italia" },
  { codice: "cn", nome: "FGB Cina" },
];

export default function PaymentsLayout() {
  const [entita, setEntita] = useState<EntityCode | null>(null);
  const { data: tutte = [], isLoading } = useFatture();

  const fatture = useMemo(() => perEntita(tutte, entita), [tutte, entita]);

  // I badge contano le righe già filtrate: il numero sulla scheda e quello
  // dentro la schermata sono lo stesso conto, non due conti che si somigliano.
  const conteggi = useMemo(
    () => ({
      "/payments/recall": fatture.filter((f) => f.lifecycle_state === "in_recall").length,
      "/payments/insoluti": fatture.filter((f) => f.lifecycle_state === "insoluto").length,
    }),
    [fatture],
  );

  const ctx: Contesto = { fatture, tutte, entita, caricamento: isLoading };

  return (
    <MainLayout title="Payments" subtitle="Un registro, molte viste">
      <div className="fgb-payments -mx-4 -my-4 min-h-[calc(100vh-8rem)] px-4 py-4 sm:-mx-6 sm:px-6">
        {/* ── Chi emette ── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="label">Società</span>
          <div
            className="inline-flex rounded-full p-0.5"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            role="group"
            aria-label="Società emittente"
          >
            {ENTITA.map((e) => {
              const attiva = entita === e.codice;
              return (
                <button
                  key={e.nome}
                  type="button"
                  onClick={() => setEntita(e.codice)}
                  aria-pressed={attiva}
                  className="rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors"
                  style={{
                    background: attiva ? "var(--teal)" : "transparent",
                    color: attiva ? "#fff" : "var(--muted)",
                  }}
                >
                  {e.nome}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Le nove schede ── */}
        <nav
          className="mb-5 flex gap-1 overflow-x-auto pb-1"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {SCHEDE.map((s) => {
            const n = conteggi[s.a as keyof typeof conteggi];
            return (
              <NavLink
                key={s.a}
                to={s.a}
                end={s.esatta}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12.5px] font-semibold transition-colors",
                    isActive ? "" : "hover:opacity-70",
                  )
                }
                style={({ isActive }) => ({
                  color: isActive ? "var(--teal-dark)" : "var(--muted)",
                  borderBottom: `2px solid ${isActive ? "var(--teal)" : "transparent"}`,
                  marginBottom: "-1px",
                })}
              >
                {s.nome}
                {!!n && (
                  <span
                    className="num rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={
                      s.badge === "rosso"
                        ? { background: "var(--red-bg)", color: "var(--red)" }
                        : { background: "var(--ground)", color: "var(--muted)" }
                    }
                  >
                    {n}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <CtxPayments.Provider value={ctx}>
          <Outlet />
        </CtxPayments.Provider>
      </div>
    </MainLayout>
  );
}

/** Segnaposto per le schermate delle fasi successive. */
export function InCostruzione({ nome, fase }: { nome: string; fase: number }) {
  return (
    <div className="card p-8 text-center">
      <p className="titolo text-sm">{nome}</p>
      <p className="mt-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
        Questa schermata arriva con la fase {fase}. Il motore che la alimenta —
        stati, tranche, solleciti — è già attivo: quello che manca è la vista.
      </p>
    </div>
  );
}
