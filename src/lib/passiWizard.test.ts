import { describe, expect, it } from "vitest";
import { passoPrecedente, prossimoPasso } from "./passiWizard";

/**
 * Il bug che questi test chiudono.
 *
 * Il wizard aveva quattro passi e il tetto era scritto a mano: `next > 4`.
 * Aggiungendo Payments fra Strategy e Review, l'ultimo passo e' diventato il
 * quinto e quel confronto ha smesso di far avanzare: il pulsante Continue
 * calcolava il passo giusto e poi lo buttava via. Nessun errore, nessun
 * messaggio, solo un pulsante che non faceva niente.
 */

const CINQUE = { ultimo: 5, saltaStrategia: false };
const CINQUE_SENZA_STRATEGIA = { ultimo: 5, saltaStrategia: true };

describe("prossimoPasso", () => {
  it("avanza fino all'ultimo passo, non a uno prima", () => {
    expect(prossimoPasso(4, CINQUE)).toBe(5);
  });

  it("attraversa tutti i passi in ordine", () => {
    expect([1, 2, 3, 4].map((n) => prossimoPasso(n, CINQUE))).toEqual([2, 3, 4, 5]);
  });

  it("sull'ultimo passo resta fermo", () => {
    expect(prossimoPasso(5, CINQUE)).toBe(5);
  });

  it("salta la Strategia quando c'è una sola certificazione", () => {
    expect(prossimoPasso(2, CINQUE_SENZA_STRATEGIA)).toBe(4);
  });

  it("non salta la Strategia quando le certificazioni sono più d'una", () => {
    expect(prossimoPasso(2, CINQUE)).toBe(3);
  });

  it("il tetto lo decide chi chiama, non un numero scritto dentro", () => {
    // È la prova che il difetto non può tornare aggiungendo un passo.
    expect(prossimoPasso(5, { ultimo: 6, saltaStrategia: false })).toBe(6);
    expect(prossimoPasso(3, { ultimo: 3, saltaStrategia: false })).toBe(3);
  });
});

describe("passoPrecedente", () => {
  it("torna indietro di uno", () => {
    expect(passoPrecedente(5, CINQUE)).toBe(4);
  });

  it("salta la Strategia anche all'indietro", () => {
    expect(passoPrecedente(4, CINQUE_SENZA_STRATEGIA)).toBe(2);
  });

  it("sul primo passo resta fermo", () => {
    expect(passoPrecedente(1, CINQUE)).toBe(1);
  });

  it("andata e ritorno riportano allo stesso passo", () => {
    for (const n of [1, 2, 3, 4]) {
      expect(passoPrecedente(prossimoPasso(n, CINQUE), CINQUE)).toBe(n);
    }
    for (const n of [1, 2, 4]) {
      expect(
        passoPrecedente(prossimoPasso(n, CINQUE_SENZA_STRATEGIA), CINQUE_SENZA_STRATEGIA),
      ).toBe(n);
    }
  });
});
