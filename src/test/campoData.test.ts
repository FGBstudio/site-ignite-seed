import { describe, expect, it } from "vitest";
import { leggiData } from "@/components/cronoprogramma/CampoData";
import { attesoOggi, rollup } from "@/components/cronoprogramma/AnelloAvanzamento";

/**
 * Il lettore di date e l'aritmetica dell'avanzamento.
 *
 * Sono i due punti dove un errore silenzioso e' peggio di un errore rumoroso:
 * una data letta male entra nel cronoprogramma e ne sposta altre, una
 * percentuale calcolata male si legge per mesi senza che nessuno la metta in
 * dubbio.
 */

describe("leggiData", () => {
  it("legge i formati che una persona scrive davvero", () => {
    expect(leggiData("15/3/27")).toBe("2027-03-15");
    expect(leggiData("15-03-2027")).toBe("2027-03-15");
    expect(leggiData("15.3.27")).toBe("2027-03-15");
    expect(leggiData("2027-03-15")).toBe("2027-03-15");
    expect(leggiData("20270315")).toBe("2027-03-15");
    expect(leggiData("15 mar 27")).toBe("2027-03-15");
    expect(leggiData("15 marzo 2027")).toBe("2027-03-15");
    expect(leggiData("15mar27")).toBe("2027-03-15");
  });

  it("l'anno a due cifre e' questo secolo, non il precedente", () => {
    // Il difetto classico: 27 letto come 1927 manda la riga fuori scala e la
    // timeline si allunga di un secolo senza dire niente.
    expect(leggiData("1/1/27")).toBe("2027-01-01");
    expect(leggiData("1/1/99")).toBe("1999-01-01");
  });

  it("rifiuta le date che non esistono", () => {
    expect(leggiData("31/2/27")).toBeNull();
    expect(leggiData("32/1/27")).toBeNull();
    expect(leggiData("15/13/27")).toBeNull();
    expect(leggiData("ciao")).toBeNull();
    expect(leggiData("")).toBeNull();
  });

  it("«+30» conta dal riferimento, non da oggi", () => {
    expect(leggiData("+30", "2027-03-15")).toBe("2027-04-14");
    expect(leggiData("-15", "2027-03-15")).toBe("2027-02-28");
    expect(leggiData("+30 gg", "2027-03-15")).toBe("2027-04-14");
  });

  it("senza anno lo prende dal riferimento", () => {
    expect(leggiData("15/3", "2029-01-01")).toBe("2029-03-15");
  });
});

describe("attesoOggi", () => {
  const oggi = new Date(2027, 5, 15, 12); // 15 giugno 2027

  it("dice dove si dovrebbe essere dentro una fase", () => {
    expect(attesoOggi("2027-06-01", "2027-07-01", oggi)).toBe(47);
    expect(attesoOggi("2027-01-01", "2027-12-31", oggi)).toBe(45);
  });

  it("prima dell'inizio e' zero, dopo la fine e' cento", () => {
    expect(attesoOggi("2028-01-01", "2028-06-01", oggi)).toBe(0);
    expect(attesoOggi("2027-01-01", "2027-02-01", oggi)).toBe(100);
  });

  it("senza inizio non si puo' dire, e non si inventa", () => {
    expect(attesoOggi(null, "2027-07-01", oggi)).toBeNull();
  });
});

describe("rollup", () => {
  it("pesa sui giorni, non sul numero di righe", () => {
    // Una fase di sei mesi al 10% e una milestone di un giorno al 100% non
    // fanno «55%»: e' il motivo per cui la media aritmetica e' sbagliata.
    const r = rollup([
      { avanzamento: 10, inizio: "2027-01-01", fine: "2027-07-01" },
      { avanzamento: 100, inizio: "2027-07-02", fine: null },
    ]);
    expect(r.pct).toBeLessThan(15);
  });

  it("due fasi di pari durata fanno la media", () => {
    const r = rollup([
      { avanzamento: 0, inizio: "2027-01-01", fine: "2027-02-01" },
      { avanzamento: 100, inizio: "2027-02-01", fine: "2027-03-01" },
    ]);
    expect(r.pct).toBeGreaterThan(45);
    expect(r.pct).toBeLessThan(55);
  });

  it("nessuna riga non e' zero per divisione, e' zero e basta", () => {
    expect(rollup([]).pct).toBe(0);
  });
});
