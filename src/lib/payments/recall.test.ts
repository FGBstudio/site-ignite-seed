import { describe, it, expect } from "vitest";
import { dividiRecall, oltreLAnno, scopertoTotale } from "./recall";

/**
 * La regola che queste prove tengono ferma e' una sola, e detta da Francesca:
 * «possono rimanere qua quanto voglio, anche oltre l'anno, finche' tu non fai
 * bonifico disposto o blocca progetto».
 *
 * E' il genere di regola che si rompe per sbaglio sei mesi dopo, con un filtro
 * per anno aggiunto per comodita'.
 */

const f = (p: Partial<{
  lifecycle_state: string; residual: number; paid_amount: number;
  residual_eur: number; due_date: string;
}> = {}) => ({
  lifecycle_state: "in_recall",
  residual: 1000,
  paid_amount: 0,
  residual_eur: 1000,
  due_date: "2026-01-31",
  ...p,
}) as never;

describe("i tre insiemi del recall", () => {
  it("separa chi non ha pagato niente da chi ha pagato quasi tutto", () => {
    const { daInseguire, daBilanciare } = dividiRecall([
      f({ residual: 11000, paid_amount: 0 }),
      f({ residual: 20, paid_amount: 3980 }),
    ]);
    expect(daInseguire).toHaveLength(1);
    expect(daBilanciare).toHaveLength(1);
    expect((daBilanciare[0] as { residual: number }).residual).toBe(20);
  });

  it("tiene fuori le bloccate: non sono più dell'amministrazione", () => {
    const { daInseguire, bloccate } = dividiRecall([
      f({ lifecycle_state: "blocked", residual: 5775 }),
      f({ residual: 4440 }),
    ]);
    expect(bloccate).toHaveLength(1);
    expect(daInseguire).toHaveLength(1);
  });

  it("non tiene chi non ha più residuo, anche se lo stato non è stato aggiornato", () => {
    const { daInseguire, daBilanciare } = dividiRecall([
      f({ residual: 0, paid_amount: 1000 }),
      f({ residual: -0.5, paid_amount: 1000.5 }),
    ]);
    expect(daInseguire).toHaveLength(0);
    expect(daBilanciare).toHaveLength(0);
  });
});

describe("il tempo non fa uscire nessuno", () => {
  it("una fattura del 2025 con residuo resta in recall nel 2026", () => {
    const vecchia = f({ due_date: "2025-01-31", residual: 60 });
    const { daInseguire } = dividiRecall([vecchia]);
    expect(daInseguire).toHaveLength(1);
  });

  it("si vede che trascina da oltre un anno, ma resta dov'è", () => {
    const oggi = new Date("2026-09-30T12:00:00Z");
    expect(oltreLAnno({ due_date: "2025-01-31" } as never, oggi)).toBe(true);
    expect(oltreLAnno({ due_date: "2026-08-31" } as never, oggi)).toBe(false);
    // Il giorno esatto in cui l'anno scade: 365 giorni non bastano, ne serve uno in più.
    expect(oltreLAnno({ due_date: "2025-09-30" } as never, oggi)).toBe(false);
    expect(oltreLAnno({ due_date: "2025-09-29" } as never, oggi)).toBe(true);
  });

  it("una scadenza illeggibile non diventa «vecchia» per sbaglio", () => {
    expect(oltreLAnno({ due_date: "" } as never, new Date())).toBe(false);
  });
});

describe("lo scoperto", () => {
  it("somma quello che manca, non quello che è stato pagato", () => {
    expect(scopertoTotale([
      { residual_eur: 11000 } as never,
      { residual_eur: 20 } as never,
    ])).toBe(11020);
  });
});
