import { describe, expect, it } from "vitest";
import { leggiData } from "@/components/cronoprogramma/CampoData";
import { attesoOggi, rollup } from "@/components/cronoprogramma/AnelloAvanzamento";
import { distribuisci } from "@/components/cronoprogramma/TimelineVerticale";

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

describe("distribuisci", () => {
  const separate = (v: number[], passo: number) =>
    [...v].sort((a, b) => a - b).every((x, i, arr) => i === 0 || x - arr[i - 1] >= passo - 0.01);

  it("lascia stare le etichette che gia' non si toccano", () => {
    const ideali = [10, 50, 90];
    expect(distribuisci(ideali, 25, 0, 200)).toEqual(ideali);
  });

  it("separa le etichette impilate sulla stessa data", () => {
    // Il caso vero: otto permessi che partono tutti il 1 marzo.
    const ideali = [100, 100, 100, 100, 100, 100, 100, 100];
    const out = distribuisci(ideali, 25, 0, 400);
    expect(separate(out, 25)).toBe(true);
    // Centrate sul punto di partenza: lo scarto si divide, non si scarica
    // tutto sull'ultima.
    const centro = out.reduce((a, b) => a + b, 0) / out.length;
    expect(Math.abs(centro - 100)).toBeLessThan(1);
  });

  it("non scambia mai l'ordine: quello che viene prima resta sopra", () => {
    const ideali = [10, 12, 14, 200, 201];
    const out = distribuisci(ideali, 25, 0, 400);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });

  it("rispetta l'ordine anche se gli ideali arrivano mescolati", () => {
    const ideali = [200, 10, 100, 12];
    const out = distribuisci(ideali, 25, 0, 400);
    // La riga con l'ideale piu' basso deve finire piu' in alto di tutte.
    expect(out[1]).toBeLessThan(out[3]);
    expect(out[3]).toBeLessThan(out[2]);
    expect(out[2]).toBeLessThan(out[0]);
  });

  it("tiene tutto dentro la cornice", () => {
    const out = distribuisci([5, 5, 5, 5], 25, 0, 200);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-0.01);
    expect(Math.max(...out)).toBeLessThanOrEqual(200.01);
  });

  it("quando non ci stanno, stringe invece di uscire", () => {
    const out = distribuisci([50, 50, 50, 50, 50], 25, 0, 40);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-0.01);
    expect(Math.max(...out)).toBeLessThanOrEqual(40.01);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });

  it("nessuna etichetta, nessuna posizione", () => {
    expect(distribuisci([], 25, 0, 100)).toEqual([]);
  });
});
