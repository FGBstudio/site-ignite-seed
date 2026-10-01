import { describe, expect, it } from "vitest";
import {
  chiaveSettimana,
  etichettaSettimana,
  giornoDellaSettimana,
  lunediDellaSettimana,
  settimanaDi,
  settimanaIso,
  settimaneFra,
} from "./settimane";

/**
 * Le settimane ISO.
 *
 * I casi che contano sono quelli a cavallo d'anno: è lì che il conteggio
 * sbaglia, e sbaglia in silenzio — una consegna concordata «per la W1» che
 * finisce nella W53 dell'anno prima non si nota finché il cliente non chiama.
 */

const g = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("lunediDellaSettimana", () => {
  it("un mercoledì torna al suo lunedì", () => {
    // 2026-10-01 è un giovedì.
    expect(lunediDellaSettimana(g("2026-10-01")).toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("un lunedì resta dov'è", () => {
    expect(lunediDellaSettimana(g("2026-09-28")).toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("una domenica è l'ultimo giorno della sua settimana, non il primo", () => {
    // Col conteggio americano la domenica apre la settimana dopo: qui chiude
    // quella prima, ed è la differenza che sposta metà delle date.
    expect(lunediDellaSettimana(g("2026-10-04")).toISOString().slice(0, 10)).toBe("2026-09-28");
  });
});

describe("settimanaIso", () => {
  it("il 1° gennaio 2026 è giovedì: settimana 1 del 2026", () => {
    expect(settimanaIso(g("2026-01-01"))).toEqual({ anno: 2026, settimana: 1 });
  });

  it("il 1° gennaio 2027 è venerdì: cade nella settimana 53 del 2026", () => {
    // È il caso che rompe i conti ingenui: l'anno della settimana non è l'anno
    // della data.
    expect(settimanaIso(g("2027-01-01"))).toEqual({ anno: 2026, settimana: 53 });
  });

  it("il 31 dicembre 2026 sta nella 53 del 2026", () => {
    expect(settimanaIso(g("2026-12-31"))).toEqual({ anno: 2026, settimana: 53 });
  });

  it("il 1° gennaio 2025 è mercoledì: settimana 1 del 2025", () => {
    expect(settimanaIso(g("2025-01-01"))).toEqual({ anno: 2025, settimana: 1 });
  });

  it("il 29 dicembre 2025 è lunedì e apre la settimana 1 del 2026", () => {
    expect(settimanaIso(g("2025-12-29"))).toEqual({ anno: 2026, settimana: 1 });
  });
});

describe("chiaveSettimana", () => {
  it("ordina come il calendario, con lo zero davanti", () => {
    expect(chiaveSettimana(g("2026-03-02"))).toBe("2026-W10");
    expect(chiaveSettimana(g("2026-01-05"))).toBe("2026-W02");
  });

  it("due date della stessa settimana hanno la stessa chiave", () => {
    expect(chiaveSettimana(g("2026-09-28"))).toBe(chiaveSettimana(g("2026-10-04")));
  });
});

describe("settimaneFra", () => {
  it("copre l'intervallo partendo dal lunedì della prima settimana", () => {
    const s = settimaneFra("2026-10-01", "2026-10-20");
    expect(s[0].inizio).toBe("2026-09-28");
    expect(s[0].numero).toBe(40);
    expect(s.at(-1)!.inizio).toBe("2026-10-19");
    expect(s).toHaveLength(4);
  });

  it("l'offset è in giorni dall'origine dell'asse, non dalla prima settimana", () => {
    // Il diagramma posiziona tutto in giorni dall'inizio dell'asse: se qui si
    // restituisse una misura diversa, le barre si staccherebbero dalle colonne.
    const s = settimaneFra("2026-10-01", "2026-10-12", "2026-09-01");
    expect(s[0].offset).toBe(27); // dal 1° settembre al 28 settembre
  });

  it("senza origine l'offset parte dall'inizio dell'intervallo", () => {
    const s = settimaneFra("2026-10-01", "2026-10-12");
    expect(s[0].offset).toBe(-3); // il lunedì è tre giorni prima del giovedì
  });

  it("scavalca l'anno senza inventare settimane", () => {
    const s = settimaneFra("2026-12-20", "2027-01-15");
    const chiavi = s.map((x) => x.chiave);
    expect(chiavi).toContain("2026-W53");
    expect(chiavi).toContain("2027-W01");
    // Nessuna W54: non esiste.
    expect(chiavi.some((k) => /W5[4-9]/.test(k))).toBe(false);
  });

  it("un intervallo rovesciato non produce niente, invece di girare per sempre", () => {
    expect(settimaneFra("2026-10-20", "2026-10-01")).toEqual([]);
  });

  it("una data storta non produce niente", () => {
    expect(settimaneFra("non una data", "2026-10-01")).toEqual([]);
  });
});

describe("settimanaDi", () => {
  const s = settimaneFra("2026-09-01", "2026-10-31");

  it("trova la settimana in cui cade una data", () => {
    expect(settimanaDi(s, "2026-10-01")?.numero).toBe(40);
  });

  it("una data fuori dall'intervallo non trova niente", () => {
    expect(settimanaDi(s, "2027-05-01")).toBeNull();
  });
});

describe("giornoDellaSettimana", () => {
  it("il mercoledì, non il lunedì", () => {
    // Un appunto datato lunedì si rilegge come una scadenza di inizio
    // settimana; il mercoledì si legge per quello che è.
    const s = settimaneFra("2026-10-01", "2026-10-07")[0];
    expect(giornoDellaSettimana(s)).toBe("2026-09-30");
  });
});

describe("etichettaSettimana", () => {
  const s = settimaneFra("2026-12-28", "2027-01-10");

  it("dentro l'anno che si guarda basta il numero", () => {
    expect(etichettaSettimana(s[0], 2026)).toBe("W53");
  });

  it("fuori da quell'anno l'etichetta porta l'anno, o W1 sembrerebbe gennaio scorso", () => {
    const w1 = s.find((x) => x.anno === 2027)!;
    expect(etichettaSettimana(w1, 2026)).toBe("W1 · 2027");
  });

  it("senza anno di riferimento resta il numero", () => {
    expect(etichettaSettimana(s[0])).toBe("W53");
  });
});
