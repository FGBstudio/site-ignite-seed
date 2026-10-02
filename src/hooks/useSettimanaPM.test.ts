import { describe, expect, it } from "vitest";
import { chiaveTranche, settimanaCorrente } from "./useSettimanaPM";

/**
 * La finestra della settimana.
 *
 * È il perno di tutta la sezione «questa settimana»: se sbaglia di un giorno, il
 * PM vede gli impegni di lunedì fra quelli della settimana scorsa — e non ha modo
 * di accorgersene, perché l'elenco sembra comunque plausibile.
 */

describe("settimanaCorrente", () => {
  it("da un giovedì torna il lunedì e la domenica che lo contengono", () => {
    // 2026-10-01 è un giovedì.
    expect(settimanaCorrente(new Date(2026, 9, 1))).toEqual({
      dal: "2026-09-28",
      al: "2026-10-04",
    });
  });

  it("il lunedì è il primo giorno, non l'ultimo della settimana prima", () => {
    expect(settimanaCorrente(new Date(2026, 8, 28)).dal).toBe("2026-09-28");
  });

  it("la domenica chiude la sua settimana, non apre quella dopo", () => {
    // Col conteggio americano la domenica aprirebbe la settimana successiva, e
    // tutti gli impegni di quel giorno slitterebbero.
    expect(settimanaCorrente(new Date(2026, 9, 4))).toEqual({
      dal: "2026-09-28",
      al: "2026-10-04",
    });
  });

  it("scavalca il mese senza perdere giorni", () => {
    const { dal, al } = settimanaCorrente(new Date(2026, 9, 2));
    expect(dal).toBe("2026-09-28");
    expect(al).toBe("2026-10-04");
  });

  it("scavalca l'anno", () => {
    // 2026-12-31 è un giovedì: la settimana va dal 28 dicembre al 3 gennaio.
    expect(settimanaCorrente(new Date(2026, 11, 31))).toEqual({
      dal: "2026-12-28",
      al: "2027-01-03",
    });
  });

  it("la finestra è sempre di sette giorni", () => {
    for (let i = 0; i < 14; i++) {
      const { dal, al } = settimanaCorrente(new Date(2026, 9, 1 + i));
      const giorni =
        (new Date(`${al}T00:00:00Z`).getTime() - new Date(`${dal}T00:00:00Z`).getTime()) /
          86_400_000 +
        1;
      expect(giorni).toBe(7);
    }
  });
});

/**
 * Il legame fra una milestone e la tranche che sblocca.
 *
 * Qui l'errore non si vede: l'importo sbagliato è l'importo vero di un altro
 * progetto, quindi è una cifra plausibile in un posto plausibile. Nei dati di
 * oggi due passi del cronoprogramma sono condivisi da 70 progetti, con tranche da
 * 600 a 11.100 €.
 */
describe("chiaveTranche", () => {
  it("due progetti sullo stesso passo non si confondono", () => {
    const a = chiaveTranche("progetto-a", "passo-condiviso");
    const b = chiaveTranche("progetto-b", "passo-condiviso");
    expect(a).not.toBe(b);
  });

  it("lo stesso progetto sullo stesso passo dà la stessa chiave", () => {
    expect(chiaveTranche("p", "s")).toBe(chiaveTranche("p", "s"));
  });

  it("senza passo non c'è chiave: la milestone non sblocca pagamenti", () => {
    expect(chiaveTranche("p", null)).toBeNull();
    expect(chiaveTranche("p", undefined)).toBeNull();
  });

  it("senza progetto non c'è chiave", () => {
    // Una chiave col solo passo pescherebbe la tranche di un progetto qualsiasi.
    expect(chiaveTranche(null, "s")).toBeNull();
  });

  it("la tranche letta per un progetto non si trova cercando l'altro", () => {
    const mappa = new Map<string, number>();
    mappa.set(chiaveTranche("beijing", "primo-dato")!, 3720);
    mappa.set(chiaveTranche("tokyo", "primo-dato")!, 1680);
    expect(mappa.get(chiaveTranche("beijing", "primo-dato")!)).toBe(3720);
    expect(mappa.get(chiaveTranche("tokyo", "primo-dato")!)).toBe(1680);
  });
});
