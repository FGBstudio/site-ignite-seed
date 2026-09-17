import { describe, expect, it } from "vitest";
import { dateDaModello, MODELLI } from "@/lib/modelliTimeline";

/**
 * I modelli di partenza.
 *
 * Non si verifica che i nomi siano "giusti" — vengono da file reali, e il PM
 * li cambia comunque. Si verifica che la catena delle date regga: un modello
 * che propone una fine prima dell'inizio, o che dipende da una voce che non
 * esiste ancora, produce una bozza che il PM deve disfare invece di
 * correggere.
 */

describe("i tre modelli", () => {
  it("ci sono tutti e vengono da un file vero", () => {
    expect(MODELLI.map((m) => m.chiave)).toEqual(["idc", "bdc", "cantiere"]);
    MODELLI.forEach((m) => {
      expect(m.origine.length).toBeGreaterThan(5);
      expect(m.voci.length).toBeGreaterThan(5);
    });
  });

  it("i tre ruoli del motore non si ripetono dentro un modello", () => {
    // L'ancora e' unica per cronoprogramma: due voci con lo stesso ruolo
    // sarebbero un salvataggio che fallisce.
    MODELLI.forEach((m) => {
      const ancore = m.voci.map((v) => v.ancora).filter(Boolean);
      expect(new Set(ancore).size).toBe(ancore.length);
    });
  });

  it("ogni modello si chiude con l'handover", () => {
    MODELLI.forEach((m) => {
      expect(m.voci.some((v) => v.ancora === "handover")).toBe(true);
    });
  });

  it("nessuna voce dipende da una che viene dopo", () => {
    MODELLI.forEach((m) => {
      m.voci.forEach((v, i) => {
        if (v.dopo !== undefined) expect(v.dopo).toBeLessThan(i);
      });
    });
  });
});

describe("dateDaModello", () => {
  it("la catena parte dal giorno dato e incatena le dipendenze", () => {
    const d = dateDaModello(
      [
        { nome: "A", giorni: 10, famiglia: "design" },
        { nome: "B", giorni: 5, famiglia: "design", dopo: 0 },
      ],
      "2026-01-01"
    );
    expect(d[0]).toEqual({ inizio: "2026-01-01", fine: "2026-01-11" });
    expect(d[1]).toEqual({ inizio: "2026-01-11", fine: "2026-01-16" });
  });

  it("durata zero e' una milestone: nessuna fine", () => {
    const d = dateDaModello([{ nome: "Handover", giorni: 0, famiglia: "construction" }], "2027-03-15");
    expect(d[0]).toEqual({ inizio: "2027-03-15", fine: null });
  });

  it("una voce che segue una milestone parte dal giorno di quella", () => {
    const d = dateDaModello(
      [
        { nome: "Consegna", giorni: 0, famiglia: "construction" },
        { nome: "Lavori", giorni: 5, famiglia: "construction", dopo: 0 },
      ],
      "2026-04-22"
    );
    expect(d[1].inizio).toBe("2026-04-22");
  });

  it("la fine non viene mai prima dell'inizio, su tutti e tre i modelli", () => {
    MODELLI.forEach((m) => {
      dateDaModello(m.voci, "2026-01-01").forEach((d) => {
        if (d.fine) expect(d.fine >= d.inizio).toBe(true);
      });
    });
  });

  it("i modelli reali producono durate plausibili", () => {
    // Il BDC greco dura anni: se uscisse un progetto di tre mesi, la catena
    // delle dipendenze si e' rotta da qualche parte.
    const bdc = MODELLI.find((m) => m.chiave === "bdc")!;
    const date = dateDaModello(bdc.voci, "2026-01-01");
    const ultima = date[date.length - 1].inizio;
    expect(ultima > "2027-06-01").toBe(true);
  });
});
