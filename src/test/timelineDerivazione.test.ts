import { describe, expect, it } from "vitest";
import {
  aggiungiGiorni,
  avanzamentoAttivita,
  creaCiclo,
  dataDaAncora,
  derivaAttivita,
  derivaPassi,
  etichettaDurata,
  inizioDaDipendenze,
  intervallo,
  naturaPasso,
  posizioneOggi,
  statoAttivita,
  type AttivitaProgetto,
  type PassoServizio,
} from "@/lib/timelineDerivazione";

/**
 * SPECIFICA_TIMELINE §11 — i criteri di accettazione che si possono verificare
 * senza aprire il browser. Ogni test cita il criterio che copre.
 */

const OGGI = "2026-06-15";

const attivita = (p: Partial<AttivitaProgetto> & { id: string }): AttivitaProgetto => ({
  nome: p.id,
  inizio: null,
  fine: null,
  ordine: 0,
  ...p,
});

const passo = (p: Partial<PassoServizio> & { id: string }): PassoServizio => ({
  nome: p.id,
  ordine: 0,
  ancora: null,
  dataForzata: null,
  avanzamento: 0,
  ...p,
});

describe("aggiungiGiorni", () => {
  it("non scivola sul cambio dell'ora legale", () => {
    // Ultima domenica di marzo: con `Date` a mezzanotte si perderebbe un'ora
    // e il giorno tornerebbe indietro.
    expect(aggiungiGiorni("2026-03-28", 1)).toBe("2026-03-29");
    expect(aggiungiGiorni("2026-03-28", 2)).toBe("2026-03-30");
    expect(aggiungiGiorni("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("scavalca i mesi e gli anni", () => {
    expect(aggiungiGiorni("2026-01-31", 1)).toBe("2026-02-01");
    expect(aggiungiGiorni("2026-12-31", 1)).toBe("2027-01-01");
    expect(aggiungiGiorni("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("avanzamento delle attività di progetto (§11: 100/in corso/0)", () => {
  it("attività conclusa nel passato → 100% completata", () => {
    const pct = avanzamentoAttivita({ inizio: "2026-01-01", fine: "2026-03-01" }, OGGI);
    expect(pct).toBe(100);
    expect(statoAttivita(pct)).toBe("completata");
  });

  it("attività a cavallo di oggi → percentuale coerente col tempo (±1%)", () => {
    // 1 giu → 1 lug, oggi 15 giu: 14 giorni su 30 = 47%
    const pct = avanzamentoAttivita({ inizio: "2026-06-01", fine: "2026-07-01" }, OGGI);
    expect(pct).toBeGreaterThanOrEqual(46);
    expect(pct).toBeLessThanOrEqual(48);
    expect(statoAttivita(pct)).toBe("in corso");
  });

  it("attività futura → 0% pianificata", () => {
    const pct = avanzamentoAttivita({ inizio: "2026-09-01", fine: "2026-12-01" }, OGGI);
    expect(pct).toBe(0);
    expect(statoAttivita(pct)).toBe("pianificata");
  });

  it("manca una delle due date → non si dice, e non si dice zero", () => {
    expect(avanzamentoAttivita({ inizio: "2026-01-01", fine: null }, OGGI)).toBeNull();
    expect(avanzamentoAttivita({ inizio: null, fine: "2026-01-01" }, OGGI)).toBeNull();
    expect(statoAttivita(null)).toBeNull();
  });

  it("inizio e fine lo stesso giorno non divide per zero", () => {
    // Spec §5 e prototipo: `0 se today ≤ start` viene prima di
    // `100 se today ≥ end`. Un'attività che inizia e finisce oggi non è
    // completata finché oggi non è passato.
    expect(avanzamentoAttivita({ inizio: "2026-06-15", fine: "2026-06-15" }, OGGI)).toBe(0);
    expect(avanzamentoAttivita({ inizio: "2026-06-14", fine: "2026-06-14" }, OGGI)).toBe(100);
    expect(avanzamentoAttivita({ inizio: "2026-08-01", fine: "2026-08-01" }, OGGI)).toBe(0);
  });

  it("spostare la fine ricalcola subito (§11: cambio Fine senza reload)", () => {
    const prima = avanzamentoAttivita({ inizio: "2026-06-01", fine: "2026-06-20" }, OGGI);
    const dopo = avanzamentoAttivita({ inizio: "2026-06-01", fine: "2026-12-31" }, OGGI);
    expect(prima!).toBeGreaterThan(dopo!);
  });
});

describe("dataDaAncora — il punto (start | end)", () => {
  const fase = attivita({ id: "constr", inizio: "2026-01-01", fine: "2026-09-01" });
  const mappa = new Map([[fase.id, fase]]);

  it("su una fase, start ed end danno date diverse", () => {
    const daInizio = dataDaAncora({ attivitaId: "constr", punto: "start", offsetGiorni: 30 }, mappa);
    const daFine = dataDaAncora({ attivitaId: "constr", punto: "end", offsetGiorni: 30 }, mappa);
    expect(daInizio).toBe("2026-01-31");
    expect(daFine).toBe("2026-10-01");
    expect(daInizio).not.toBe(daFine);
  });

  it("offset negativo: «60 gg prima dell'inizio»", () => {
    expect(dataDaAncora({ attivitaId: "constr", punto: "start", offsetGiorni: -60 }, mappa)).toBe(
      "2025-11-02"
    );
  });

  it("su una milestone senza fine, end ricade sull'inizio", () => {
    const ms = attivita({ id: "h", inizio: "2027-03-15", fine: null });
    const m = new Map([[ms.id, ms]]);
    expect(dataDaAncora({ attivitaId: "h", punto: "end", offsetGiorni: 30 }, m)).toBe("2027-04-14");
  });

  it("attività senza date → il passo resta in attesa", () => {
    const vuota = attivita({ id: "x" });
    const m = new Map([[vuota.id, vuota]]);
    const d = dataDaAncora({ attivitaId: "x", punto: "end", offsetGiorni: 30 }, m);
    expect(d).toBeNull();
    expect(naturaPasso({ dataForzata: null }, d)).toBe("in attesa");
  });
});

describe("derivaPassi", () => {
  const atts = [
    attivita({ id: "defin", inizio: "2026-01-01", fine: "2026-02-01", ordine: 1 }),
    attivita({ id: "handover", inizio: "2026-09-01", fine: "2026-09-01", ordine: 2 }),
  ];

  it("ancorato → natura calcolata (§11)", () => {
    const [p] = derivaPassi(
      [passo({ id: "a", ancora: { attivitaId: "defin", punto: "end", offsetGiorni: 90 } })],
      atts
    );
    expect(p.dataEffettiva).toBe("2026-05-02");
    expect(p.natura).toBe("calcolata");
  });

  it("override → natura manuale, e vince sull'àncora (§11)", () => {
    const [p] = derivaPassi(
      [
        passo({
          id: "a",
          ancora: { attivitaId: "defin", punto: "end", offsetGiorni: 90 },
          dataForzata: "2026-07-01",
        }),
      ],
      atts
    );
    expect(p.dataEffettiva).toBe("2026-07-01");
    expect(p.natura).toBe("manuale");
  });

  it("tolto l'override si torna al calcolo (§11: il ↺ funziona)", () => {
    const base = passo({ id: "a", ancora: { attivitaId: "defin", punto: "end", offsetGiorni: 90 } });
    const [conOverride] = derivaPassi([{ ...base, dataForzata: "2026-07-01" }], atts);
    const [senza] = derivaPassi([base], atts);
    expect(conOverride.dataEffettiva).toBe("2026-07-01");
    expect(senza.dataEffettiva).toBe("2026-05-02");
    expect(senza.natura).toBe("calcolata");
  });

  it("le durate si misurano sull'ordine di DATA, non di elenco", () => {
    // Il caso trovato nei dati veri: il passo che viene dopo per elenco cade
    // prima nel tempo. Ordinando per elenco la durata sarebbe negativa.
    const p = derivaPassi(
      [
        passo({ id: "tardi", ordine: 1, dataForzata: "2026-07-01" }),
        passo({ id: "presto", ordine: 2, dataForzata: "2026-03-01" }),
      ],
      atts
    );
    const presto = p.find((x) => x.id === "presto")!;
    const tardi = p.find((x) => x.id === "tardi")!;
    expect(presto.durataGiorni).toBe(122); // 1 mar → 1 lug
    expect(tardi.durataGiorni).toBeNull(); // è l'ultimo nel tempo
    expect(p.every((x) => x.durataGiorni === null || x.durataGiorni >= 0)).toBe(true);
  });

  it("l'array torna nell'ordine di elenco (§6.6)", () => {
    const p = derivaPassi(
      [
        passo({ id: "primo", ordine: 1, dataForzata: "2026-07-01" }),
        passo({ id: "secondo", ordine: 2, dataForzata: "2026-03-01" }),
      ],
      atts
    );
    expect(p.map((x) => x.id)).toEqual(["primo", "secondo"]);
  });

  it("l'ultimo passo non ha durata, e i passi senza data nemmeno", () => {
    const p = derivaPassi(
      [
        passo({ id: "a", ordine: 1, dataForzata: "2026-03-01" }),
        passo({ id: "b", ordine: 2, dataForzata: "2026-04-01" }),
        passo({ id: "muto", ordine: 3 }),
      ],
      atts
    );
    expect(p.find((x) => x.id === "b")!.durataGiorni).toBeNull();
    expect(p.find((x) => x.id === "muto")!.durataGiorni).toBeNull();
    expect(p.find((x) => x.id === "muto")!.natura).toBe("in attesa");
  });
});

describe("etichettaDurata", () => {
  it("giorni sotto i due mesi, mesi sopra", () => {
    expect(etichettaDurata(47)).toBe("47 gg");
    expect(etichettaDurata(59)).toBe("59 gg");
    expect(etichettaDurata(60)).toBe("2 mesi");
    expect(etichettaDurata(180)).toBe("6 mesi");
    expect(etichettaDurata(null)).toBeNull();
  });
});

describe("intervallo", () => {
  it("copre sia le attività sia i passi", () => {
    const att = derivaAttivita([attivita({ id: "a", inizio: "2026-01-01", fine: "2026-02-01" })], OGGI);
    const pas = derivaPassi([passo({ id: "p", dataForzata: "2026-12-31" })], []);
    const i = intervallo(att, pas)!;
    expect(i.min).toBe("2026-01-01");
    expect(i.max).toBe("2026-12-31");
    expect(i.mesi).toBe(12);
  });

  it("niente date, niente intervallo (§11: stato vuoto)", () => {
    expect(intervallo([], [])).toBeNull();
  });
});

describe("posizioneOggi", () => {
  it("trova il segmento che contiene oggi e dove cade dentro", () => {
    const r = posizioneOggi(["2026-06-01", "2026-07-01", "2026-08-01"], OGGI)!;
    expect(r.indice).toBe(0);
    expect(r.frazione).toBeGreaterThan(0.4);
    expect(r.frazione).toBeLessThan(0.5);
  });

  it("oggi fuori da tutte le tappe → nessun marcatore", () => {
    expect(posizioneOggi(["2027-01-01", "2027-02-01"], OGGI)).toBeNull();
    expect(posizioneOggi(["2025-01-01", "2025-02-01"], OGGI)).toBeNull();
  });

  it("meno di due tappe → niente segmento su cui posizionarsi", () => {
    expect(posizioneOggi(["2026-06-15"], OGGI)).toBeNull();
    expect(posizioneOggi([], OGGI)).toBeNull();
  });
});

describe("dipendenze", () => {
  const a = attivita({ id: "a", inizio: "2026-01-01", fine: "2026-03-01" });
  const b = attivita({ id: "b", inizio: "2026-02-01", fine: "2026-06-01" });
  const mappa = new Map([
    [a.id, a],
    [b.id, b],
  ]);

  it("con più madri si parte quando l'ULTIMA ha finito", () => {
    expect(inizioDaDipendenze(["a", "b"], mappa)).toBe("2026-06-01");
    expect(inizioDaDipendenze(["a"], mappa)).toBe("2026-03-01");
  });

  it("nessuna dipendenza, nessuna proposta", () => {
    expect(inizioDaDipendenze([], mappa)).toBeNull();
    expect(inizioDaDipendenze(undefined, mappa)).toBeNull();
  });

  it("madre senza date → nessuna proposta", () => {
    const vuota = attivita({ id: "v" });
    expect(inizioDaDipendenze(["v"], new Map([[vuota.id, vuota]]))).toBeNull();
  });

  it("riconosce i cicli diretti e transitivi (§11: niente cicli)", () => {
    const rete = [
      attivita({ id: "a" }),
      attivita({ id: "b", dipendeDa: ["a"] }),
      attivita({ id: "c", dipendeDa: ["b"] }),
    ];
    expect(creaCiclo("a", "a", rete)).toBe(true); // se stessa
    expect(creaCiclo("a", "b", rete)).toBe(true); // b già dipende da a
    expect(creaCiclo("a", "c", rete)).toBe(true); // c → b → a
    expect(creaCiclo("c", "a", rete)).toBe(false); // legittima
  });

  it("non va in loop su una rete che contiene già un ciclo", () => {
    const rotta = [
      attivita({ id: "x", dipendeDa: ["y"] }),
      attivita({ id: "y", dipendeDa: ["x"] }),
    ];
    expect(creaCiclo("z", "x", rotta)).toBe(false);
  });
});
