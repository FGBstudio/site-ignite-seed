import { describe, expect, it } from "vitest";
import { cifra, componiCsv, numeroPerExcel, oggiIso } from "./csv";

/**
 * Le esportazioni.
 *
 * Un CSV sbagliato non dà errore: si apre, si legge, sembra giusto. Il difetto si
 * manifesta quando qualcuno somma una colonna e il totale viene zero — di solito
 * dopo che il foglio è stato mandato a qualcuno.
 */

describe("numeroPerExcel", () => {
  it("il decimale è una virgola, non un punto", () => {
    expect(numeroPerExcel(1234.5)).toBe("1234,5");
  });

  it("non mette il punto delle migliaia", () => {
    // Col punto la cella tornerebbe testo: è il difetto da cui veniamo.
    expect(numeroPerExcel(1234567.89)).toBe("1234567,89");
  });

  it("l'intero resta intero", () => {
    expect(numeroPerExcel(1000)).toBe("1000");
  });

  it("il negativo tiene il segno", () => {
    expect(numeroPerExcel(-250.75)).toBe("-250,75");
  });

  it("quello che non è un numero non diventa «NaN»", () => {
    expect(numeroPerExcel(NaN)).toBe("");
    expect(numeroPerExcel(Infinity)).toBe("");
  });
});

describe("componiCsv", () => {
  it("il numero esce nudo, il testo fra apici", () => {
    expect(componiCsv([["Cliente", "Totale"], ["Rossi srl", 1200.5]])).toBe(
      '"Cliente";"Totale"\r\n"Rossi srl";1200,5',
    );
  });

  it("un numero di fattura resta testo", () => {
    // «3.000» è la fattura tremila. Una conversione automatica delle stringhe che
    // sembrano numeri la scriveva `3`, e nessuno se ne accorgeva: per questo la
    // conversione è esplicita e passa da `cifra`.
    expect(componiCsv([["3.000"]])).toBe('"3.000"');
    expect(componiCsv([["2.918"]])).toBe('"2.918"');
  });

  it("il punto e virgola nel testo non spezza la riga", () => {
    expect(componiCsv([["Rossi; Bianchi srl"]])).toBe('"Rossi; Bianchi srl"');
  });

  it("l'apice nel testo si raddoppia", () => {
    expect(componiCsv([['Società "Alfa"']])).toBe('"Società ""Alfa"""');
  });

  it("la cella vuota resta vuota, non «null»", () => {
    expect(componiCsv([[null, undefined, ""]])).toBe('"";"";""');
  });

  it("una data ISO resta una data, non un numero", () => {
    expect(componiCsv([["2026-10-02"]])).toBe('"2026-10-02"');
  });

  it("le righe si separano con CRLF, come vuole il CSV", () => {
    expect(componiCsv([["a"], ["b"]])).toBe('"a"\r\n"b"');
  });
});

describe("cifra", () => {
  it("la stringa del database diventa numero", () => {
    expect(componiCsv([[cifra("1000.00")]])).toBe("1000");
    expect(componiCsv([[cifra("2918.50")]])).toBe("2918,5");
  });

  it("il vuoto resta vuoto, non zero", () => {
    // Uno zero direbbe «incassato nulla»; il vuoto dice «non si sa», che è la
    // verità quando la colonna non c'è.
    expect(cifra(null)).toBe("");
    expect(cifra("")).toBe("");
    expect(cifra(undefined)).toBe("");
  });

  it("lo zero vero resta zero", () => {
    expect(cifra(0)).toBe(0);
    expect(cifra("0.00")).toBe(0);
  });

  it("quello che non è un numero non diventa NaN nel foglio", () => {
    expect(cifra("n/d")).toBe("");
  });
});

describe("oggiIso", () => {
  it("è la data locale, non quella UTC", () => {
    // `toISOString()` alle 00:30 italiane dà ancora il giorno prima: il file si
    // chiamerebbe con la data di ieri.
    const mezzanotte = new Date(2026, 9, 2, 0, 30);
    expect(oggiIso(mezzanotte)).toBe("2026-10-02");
  });

  it("mese e giorno hanno sempre due cifre", () => {
    expect(oggiIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
