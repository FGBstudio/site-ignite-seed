import { describe, it, expect } from "vitest";
import {
  dividiPerOrigine,
  meseDi, meseCorrente, meseVicino, meseEsteso, ultimoGiornoDelMese,
  previsionaleDelMese, definitivoDelMese, mesiDisponibili, somma,
} from "./followup";

/**
 * Il prospetto del venerdi' e' un documento che gira: quello che ci finisce
 * dentro diventa la cassa che l'azienda si aspetta. Una riga di troppo nel
 * previsionale e' una promessa che nessuno ha fatto.
 */

const F = (p: Partial<{ mese_previsto: string | null; entity_code: string | null; imponibile: number; vat_amount: number; residual: number }>) => ({
  mese_previsto: null, entity_code: "uk", imponibile: 0, vat_amount: 0, residual: 0, ...p,
});

describe("il mese", () => {
  it("si ricava dalla data e non inventa niente dal vuoto", () => {
    expect(meseDi("2026-09-30")).toBe("2026-09");
    expect(meseDi(null)).toBeNull();
    expect(meseDi("")).toBeNull();
    expect(meseDi("2026")).toBeNull();
  });

  it("scorre avanti e indietro restando nell'anno giusto", () => {
    expect(meseVicino("2026-12", 1)).toBe("2027-01");
    expect(meseVicino("2026-01", -1)).toBe("2025-12");
    expect(meseVicino("2026-09", 2)).toBe("2026-11");
  });

  it("si scrive come lo scrive una persona", () => {
    expect(meseEsteso("2026-09")).toBe("settembre 2026");
    expect(meseEsteso("2026-01")).toBe("gennaio 2026");
  });

  it("di oggi e' quello di oggi", () => {
    const d = new Date(2026, 8, 15);
    expect(meseCorrente(d)).toBe("2026-09");
  });
});

describe("il mese senza giorno", () => {
  it("diventa l'ultimo giorno: e' l'ipotesi che non anticipa cassa", () => {
    expect(ultimoGiornoDelMese("2026-11")).toBe("2026-11-30");
    expect(ultimoGiornoDelMese("2026-02")).toBe("2026-02-28");
    expect(ultimoGiornoDelMese("2028-02")).toBe("2028-02-29");
    expect(ultimoGiornoDelMese("2026-12")).toBe("2026-12-31");
  });
});

describe("il previsionale", () => {
  const righe = [
    F({ mese_previsto: "2026-09", imponibile: 11000, residual: 11000 }),
    F({ mese_previsto: "2026-09", imponibile: 4440, residual: 4440 }),
    F({ mese_previsto: "2026-10", imponibile: 7500, residual: 7500 }),
    F({ mese_previsto: null, imponibile: 99999, residual: 99999 }),
  ];

  it("tiene solo le fatture con una promessa per quel mese", () => {
    const set = previsionaleDelMese(righe, "2026-09");
    expect(set).toHaveLength(2);
    expect(somma(set, (r) => r.imponibile)).toBe(15440);
  });

  it("lascia fuori chi non ha promesso niente, anche se scaduto da mesi", () => {
    const tutti = ["2026-09", "2026-10", "2026-11"].flatMap((m) => previsionaleDelMese(righe, m));
    expect(tutti.some((r) => r.imponibile === 99999)).toBe(false);
  });

  it("la fattura slittata cambia mese da sola: niente «−7500» a mano", () => {
    // È il caso vero del prospetto: H.I.G. Vitoria sottratta da settembre e
    // riscritta a ottobre. Qui basta che cambi la promessa.
    const settembre = previsionaleDelMese(righe, "2026-09");
    const ottobre = previsionaleDelMese(righe, "2026-10");
    expect(somma(settembre, (r) => r.imponibile)).toBe(15440);
    expect(somma(ottobre, (r) => r.imponibile)).toBe(7500);
  });

  it("si può guardare una società per volta", () => {
    const miste = [
      F({ mese_previsto: "2026-09", entity_code: "uk", imponibile: 100 }),
      F({ mese_previsto: "2026-09", entity_code: "it", imponibile: 200 }),
    ];
    expect(somma(previsionaleDelMese(miste, "2026-09", "it"), (r) => r.imponibile)).toBe(200);
    expect(somma(previsionaleDelMese(miste, "2026-09"), (r) => r.imponibile)).toBe(300);
  });
});

describe("il definitivo", () => {
  const incassi = [
    { mese_incasso: "2026-09", entity_code: "uk", incassato: 8900 },
    { mese_incasso: "2026-09", entity_code: "it", incassato: 2360 },
    { mese_incasso: "2026-08", entity_code: "uk", incassato: 5000 },
  ];

  it("conta i soldi arrivati nel mese, non le fatture", () => {
    expect(somma(definitivoDelMese(incassi, "2026-09"), (r) => r.incassato)).toBe(11260);
  });

  it("una fattura pagata in due volte entra nei due mesi in cui è arrivata", () => {
    const due = [
      { mese_incasso: "2026-08", entity_code: "uk", incassato: 5000 },
      { mese_incasso: "2026-09", entity_code: "uk", incassato: 5000 },
    ];
    expect(somma(definitivoDelMese(due, "2026-08"), (r) => r.incassato)).toBe(5000);
    expect(somma(definitivoDelMese(due, "2026-09"), (r) => r.incassato)).toBe(5000);
  });
});

describe("i mesi su cui spostarsi", () => {
  it("sono quelli che esistono, dal più recente, senza doppioni", () => {
    expect(mesiDisponibili(["2026-09", null, "2026-10", "2026-09", undefined]))
      .toEqual(["2026-10", "2026-09"]);
  });
});

describe("dividiPerOrigine", () => {
  const r = (mese_da_promessa: boolean | undefined, residual: number) => ({
    mese_previsto: "2026-10",
    mese_da_promessa,
    imponibile: residual,
    vat_amount: 0,
    residual,
  });

  it("separa quello che il cliente ha promesso da quello che solo scade", () => {
    const { promesse, attese } = dividiPerOrigine([r(true, 100), r(false, 200), r(true, 50)]);
    expect(promesse.map((x) => x.residual)).toEqual([100, 50]);
    expect(attese.map((x) => x.residual)).toEqual([200]);
  });

  it("senza il campo la riga non è una promessa", () => {
    // Le fatture vecchie non hanno l'informazione: trattarle come promesse
    // gonfierebbe il totale di cui si risponde al titolare.
    const { promesse, attese } = dividiPerOrigine([r(undefined, 300)]);
    expect(promesse).toHaveLength(0);
    expect(attese).toHaveLength(1);
  });

  it("nessuna riga: due elenchi vuoti, non un errore", () => {
    const { promesse, attese } = dividiPerOrigine([]);
    expect(promesse).toEqual([]);
    expect(attese).toEqual([]);
  });
});
