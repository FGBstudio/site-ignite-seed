import { describe, expect, it } from "vitest";
import {
  componiDescrizione,
  giorniFineMese,
  imponibile,
  numero,
  progettoFatturabile,
  righeEmettibili,
  righeIncomplete,
  trancheChiuse,
  trancheRipetute,
  unicoComune,
} from "./righeFattura";

/**
 * Le regole delle righe.
 *
 * Il caso vero che le ha fatte nascere è la fattura 3.089 di Louis Vuitton
 * Dallas: 8.750 di 50% LEED, 2.250 di 50% Tassonomia, 3.650 di rimborso bolli e
 * GBCI fees. Prima una fattura puntava a una tranche sola e quella fattura non
 * si poteva scrivere.
 */

describe("numero", () => {
  it("legge la virgola come separatore decimale", () => {
    expect(numero("8750,50")).toBe(8750.5);
  });

  it("legge anche il punto, perché chi incolla da un foglio inglese non lo cambia", () => {
    expect(numero("8750.50")).toBe(8750.5);
  });

  it("toglie gli spazi", () => {
    expect(numero(" 8 750 ")).toBe(8750);
  });

  it("un campo vuoto vale zero, non NaN", () => {
    expect(numero("")).toBe(0);
    expect(numero(null)).toBe(0);
    expect(numero(undefined)).toBe(0);
  });

  it("quello che non è un numero vale zero, non contamina la somma", () => {
    expect(numero("ottomila")).toBe(0);
  });
});

describe("imponibile", () => {
  it("è la somma delle righe: la fattura 3.089", () => {
    const righe = [
      { tranche_id: "t1", descrizione: "50% LEED GOLD", importo: 8750 },
      { tranche_id: "t2", descrizione: "50% EU Taxonomy", importo: 2250 },
      { tranche_id: null, descrizione: "#Reimbursement for Bank & GBCI Fees", importo: 3650 },
    ];
    expect(imponibile(righe)).toBe(14650);
  });

  it("non lascia scarti di un centesimo", () => {
    // 0,1 + 0,2 in binario fa 0,30000000000000004: sommato venti volte lo
    // scarto arriva dove si vede.
    const righe = Array.from({ length: 20 }, () => ({ descrizione: "x", importo: 0.1 }));
    expect(imponibile(righe)).toBe(2);
  });

  it("nessuna riga fa zero", () => {
    expect(imponibile([])).toBe(0);
  });
});

describe("righeIncomplete", () => {
  it("dice quale riga manca, non che qualcosa manca", () => {
    const esiti = righeIncomplete([
      { descrizione: "ok", importo: 100 },
      { descrizione: "", importo: 100 },
      { descrizione: "senza importo", importo: "" },
    ]);
    expect(esiti.map((e) => e.indice)).toEqual([1, 2]);
    expect(esiti[0].perche).toMatch(/descrizione/);
    expect(esiti[1].perche).toMatch(/zero/);
  });

  it("uno spazio non è una descrizione", () => {
    expect(righeIncomplete([{ descrizione: "   ", importo: 10 }])).toHaveLength(1);
  });

  it("un importo negativo non passa", () => {
    expect(righeIncomplete([{ descrizione: "x", importo: -50 }])).toHaveLength(1);
  });

  it("zero non passa: una riga da zero euro non è una riga", () => {
    expect(righeIncomplete([{ descrizione: "x", importo: 0 }])).toHaveLength(1);
  });
});

describe("righeEmettibili", () => {
  it("serve almeno una riga", () => {
    expect(righeEmettibili([])).toBe(false);
  });

  it("tutte complete: si emette", () => {
    expect(righeEmettibili([{ descrizione: "50% LEED", importo: "8.750" }])).toBe(true);
  });

  it("una sola incompleta blocca tutto", () => {
    expect(
      righeEmettibili([
        { descrizione: "ok", importo: 100 },
        { descrizione: "", importo: 100 },
      ]),
    ).toBe(false);
  });
});

describe("unicoComune", () => {
  it("un solo valore: è quello", () => {
    expect(unicoComune(["p1", "p1", "p1"])).toBe("p1");
  });

  it("due valori: nessuno, e non il primo", () => {
    expect(unicoComune(["p1", "p2"])).toBeNull();
  });

  it("i nulli non contano: una riga libera non impedisce l'accordo", () => {
    expect(unicoComune(["p1", null, "p1", undefined])).toBe("p1");
  });

  it("tutti nulli: nessuno", () => {
    expect(unicoComune([null, null])).toBeNull();
  });
});

describe("trancheChiuse", () => {
  it("conta solo le righe legate a una tranche", () => {
    expect(
      trancheChiuse([
        { tranche_id: "t1", descrizione: "a", importo: 1 },
        { tranche_id: null, descrizione: "rimborso bolli", importo: 2 },
        { tranche_id: "t2", descrizione: "b", importo: 3 },
      ]),
    ).toEqual(["t1", "t2"]);
  });

  it("una fattura di soli extra non chiude niente", () => {
    expect(trancheChiuse([{ tranche_id: null, descrizione: "x", importo: 1 }])).toEqual([]);
  });
});

describe("trancheRipetute", () => {
  it("la stessa tranche su due righe si vede prima del database", () => {
    expect(
      trancheRipetute([
        { tranche_id: "t1", descrizione: "a", importo: 1 },
        { tranche_id: "t1", descrizione: "a di nuovo", importo: 1 },
      ]),
    ).toEqual(["t1"]);
  });

  it("righe libere diverse non sono doppioni: nessuna chiude una tranche", () => {
    expect(
      trancheRipetute([
        { tranche_id: null, descrizione: "bolli", importo: 1 },
        { tranche_id: null, descrizione: "GBCI fees", importo: 2 },
      ]),
    ).toEqual([]);
  });
});

describe("giorniFineMese", () => {
  it("una fattura del 15 novembre scade il 31 dicembre: 46 giorni", () => {
    // 15/11 + 30 = 15/12, e la fine di quel mese è il 31/12.
    expect(giorniFineMese("2026-11-15")).toBe(46);
  });

  it("una fattura del 1° febbraio scade il 31 marzo: 58 giorni", () => {
    // 01/02 + 30 = 03/03, fine mese 31/03. Il febbraio corto non sposta niente:
    // il conto parte dalla data, non dal mese.
    expect(giorniFineMese("2026-02-01")).toBe(58);
  });

  it("l'ultimo giorno del mese: +30 cade nel mese dopo, e la scadenza è la sua fine", () => {
    expect(giorniFineMese("2026-01-31")).toBe(59); // 31/01 → 02/03 → 31/03
  });

  it("scavalca l'anno senza sbagliare mese", () => {
    expect(giorniFineMese("2026-12-20")).toBe(42); // 20/12 → 19/01 → 31/01
  });

  it("una data che non è una data vale 30: non si inventa una scadenza", () => {
    expect(giorniFineMese("")).toBe(30);
    expect(giorniFineMese("non una data")).toBe(30);
  });
});

describe("progettoFatturabile", () => {
  it("un progetto cancellato non ha niente da fatturare", () => {
    expect(progettoFatturabile("canceled")).toBe(false);
    expect(progettoFatturabile("cancelled")).toBe(false);
  });

  it("un'offerta non ancora approvata non si fattura: è una proposta", () => {
    expect(progettoFatturabile("quotation")).toBe(false);
    expect(progettoFatturabile("potential")).toBe(false);
  });

  it("dall'approvazione in poi sì, fino al certificato", () => {
    for (const s of ["quotation_approved", "da_configurare", "in_corso", "completato", "certificato"]) {
      expect(progettoFatturabile(s), s).toBe(true);
    }
  });

  it("non guarda le maiuscole: i dati vecchi non sono coerenti", () => {
    expect(progettoFatturabile("CANCELED")).toBe(false);
  });

  it("senza stato si mostra: nascondere qualcosa che non si sa è peggio", () => {
    expect(progettoFatturabile(null)).toBe(true);
    expect(progettoFatturabile(undefined)).toBe(true);
  });
});

describe("componiDescrizione", () => {
  it("percentuale più servizio: com'è scritto sulle fatture vere", () => {
    expect(componiDescrizione(50, "LEED ID+C Gold consultancy")).toBe(
      "50% LEED ID+C Gold consultancy",
    );
  });

  it("non scrive la percentuale due volte", () => {
    // Successo davvero: «60% 60% all'ordine hardware».
    expect(componiDescrizione(60, "60% all'ordine hardware")).toBe("60% all'ordine hardware");
  });

  it("riconosce la percentuale anche staccata o con decimali", () => {
    expect(componiDescrizione(40, "40 % al primo dato")).toBe("40 % al primo dato");
    expect(componiDescrizione(33.5, "33,5% alla firma")).toBe("33,5% alla firma");
  });

  it("senza percentuale resta il servizio: non tutte le righe sono una quota", () => {
    expect(componiDescrizione(null, "EU Taxonomy")).toBe("EU Taxonomy");
    expect(componiDescrizione(0, "EU Taxonomy")).toBe("EU Taxonomy");
  });

  it("le percentuali intere non prendono decimali", () => {
    expect(componiDescrizione(50.0, "Energy Model")).toBe("50% Energy Model");
  });

  it("i decimali si scrivono con la virgola", () => {
    expect(componiDescrizione(33.5, "Energy Model")).toBe("33,5% Energy Model");
  });

  it("senza dicitura non inventa una descrizione", () => {
    expect(componiDescrizione(50, null)).toBe("");
    expect(componiDescrizione(50, "   ")).toBe("");
  });
});
