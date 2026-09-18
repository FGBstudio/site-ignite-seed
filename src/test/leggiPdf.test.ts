import { describe, expect, it } from "vitest";
import { indoviniDaTesto } from "@/lib/payments/leggiPdf";

/**
 * La lettura di una fattura passiva dal testo del PDF.
 *
 * Quello che si prova qui è che la proposta sia plausibile e, soprattutto, che
 * NON inventi: un campo indovinato male e presentato come certo fa registrare
 * l'importo sbagliato. Meglio nessuna proposta che una proposta finta.
 */

describe("il numero della fattura", () => {
  it("lo prende dopo la parola che lo annuncia", () => {
    expect(indoviniDaTesto("Fattura n. 2026/0147 del 12/03/2026").numero).toBe("2026/0147");
    expect(indoviniDaTesto("INVOICE No. INV-8891").numero).toBe("INV-8891");
  });

  it("non scambia la partita IVA per un numero di fattura", () => {
    // In cima a una fattura ci sono P.IVA, CAP e civici: prendere il primo
    // numero del foglio darebbe quasi sempre la cosa sbagliata.
    const t = "ACME Srl - Via Roma 12 - 20121 Milano - P.IVA 01234567890 Fattura n. 77/A";
    expect(indoviniDaTesto(t).numero).toBe("77/A");
  });
});

describe("gli importi", () => {
  it("legge il formato italiano", () => {
    const g = indoviniDaTesto("Imponibile 1.234,56 IVA 271,60 Totale documento 1.506,16");
    expect(g.imponibile).toBe(1234.56);
    expect(g.tassa).toBe(271.6);
    expect(g.totale).toBe(1506.16);
  });

  it("legge anche il formato inglese", () => {
    const g = indoviniDaTesto("Taxable 1,234.56 VAT 271.60 Total 1,506.16");
    expect(g.imponibile).toBe(1234.56);
    expect(g.totale).toBe(1506.16);
  });

  it("non scambia un migliaio per decimali", () => {
    // «Totale 12.000» in una fattura italiana è dodicimila, non dodici.
    expect(indoviniDaTesto("Totale documento 12.000").totale).toBe(12000);
  });

  it("deduce il totale quando ci sono le due parti", () => {
    const g = indoviniDaTesto("Imponibile 1.000,00 IVA 220,00");
    expect(g.totale).toBe(1220);
  });

  it("deduce l'imponibile da totale e imposta", () => {
    const g = indoviniDaTesto("IVA 220,00 Totale documento 1.220,00");
    expect(g.imponibile).toBe(1000);
  });

  it("preferisce «totale documento» a un totale qualsiasi", () => {
    const t = "Totale righe 900,00 Totale documento 1.098,00";
    expect(indoviniDaTesto(t).totale).toBe(1098);
  });
});

describe("la data", () => {
  it("normalizza i formati che si incontrano", () => {
    expect(indoviniDaTesto("del 12/03/2026").dataEmissione).toBe("2026-03-12");
    expect(indoviniDaTesto("del 5-9-26").dataEmissione).toBe("2026-09-05");
  });

  it("scarta quello che data non è", () => {
    // 45/13/2026 non è una data: meglio nessuna proposta che una sbagliata.
    expect(indoviniDaTesto("codice 45/13/2026").dataEmissione).toBeUndefined();
  });
});

describe("quando non c'è niente da leggere", () => {
  it("non propone nulla invece di inventare", () => {
    const g = indoviniDaTesto("Questo documento non contiene importi.");
    expect(g.totale).toBeUndefined();
    expect(g.imponibile).toBeUndefined();
    expect(g.dataEmissione).toBeUndefined();
  });

  it("regge un testo vuoto", () => {
    expect(indoviniDaTesto("")).toEqual({});
  });
});
