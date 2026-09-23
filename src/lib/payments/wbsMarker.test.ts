import { describe, expect, it } from "vitest";
import { disponi, type Milestone } from "./wbs";

/**
 * Cassa e quote non si sommano dentro lo stesso marker.
 *
 * Il caso che ha fatto nascere questi test: la riga «Acquisto materiali» di
 * Fendi Energy 2024 dichiarava 27.520 € di cassa e 17.459 € di quote — due
 * numeri giusti, scritti uno accanto all'altro — e sulla traccia mostrava una
 * freccia da 44.979 €, che è la loro somma. Un numero che non esiste da
 * nessuna parte: né in banca, né su una fattura, né in un contratto.
 *
 * Un marker sbagliato è peggio di un marker assente, perché ha l'aria di
 * essere una risposta.
 */

function m(p: Partial<Milestone> & { id: string; importo: number }): Milestone {
  return {
    colonna: 1,
    lane: "forn",
    importoValuta: p.importo,
    valuta: "EUR",
    titolo: p.id,
    dettaglio: "",
    stato: "pagata",
    quota: false,
    documentale: false,
    certezza: "reale",
    progetto: null,
    percorso: "x",
    ...p,
  };
}

/** I numeri veri del caso: quattro uscite di cassa e una quota. */
const CASSA = [
  m({ id: "c1", importo: -12000 }),
  m({ id: "c2", importo: -8000 }),
  m({ id: "c3", importo: -5000 }),
  m({ id: "c4", importo: -2520 }),
];
const QUOTA = m({ id: "q1", importo: -17459, quota: true, titolo: "Hardware senza PO" });

/**
 * Cosa mostra un marker, che sia un movimento singolo o un totale.
 *
 * La distinzione conta al disegno e non qui: un secchiello con un movimento
 * solo resta quel movimento, perché raggrupparlo non nasconderebbe niente e
 * costerebbe il suo titolo.
 */
const letto = (el: ReturnType<typeof disponi>) =>
  el.map((e) =>
    e.tipo === "gruppo"
      ? { importo: e.a.importo, quota: e.a.quota, chiave: e.a.chiave }
      : { importo: e.m.importo, quota: e.m.quota, chiave: e.m.id },
  );

describe("marker di cassa e quote", () => {
  it("non somma una quota dentro il totale di cassa", () => {
    const v = letto(disponi([...CASSA, QUOTA], "riga", "dettaglio"));
    const importi = v.map((x) => x.importo);

    // Il numero proibito: 27.520 + 17.459.
    expect(importi).not.toContain(-44979);
    expect(importi).toContain(-27520);
    expect(importi).toContain(-17459);
  });

  it("marca come quota solo il marker che contiene solo quote", () => {
    const v = letto(disponi([...CASSA, QUOTA], "riga", "dettaglio"));
    expect(v.find((x) => x.importo === -27520)?.quota).toBe(false);
    expect(v.find((x) => x.importo === -17459)?.quota).toBe(true);
  });

  it("dà ai due marker chiavi distinte, o si sovrascriverebbero", () => {
    const v = letto(disponi([...CASSA, QUOTA], "riga", "dettaglio"));
    const chiavi = v.map((x) => x.chiave);
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });

  it("mette la cassa prima della quota nella stessa corsia", () => {
    const v = letto(disponi([...CASSA, QUOTA], "riga", "dettaglio"));
    expect(v[0].importo).toBe(-27520);
    expect(v[1].importo).toBe(-17459);
  });

  it("in sintesi le quote restano fuori del tutto", () => {
    const el = disponi([...CASSA, QUOTA], "riga", "sintesi");
    const totale = el.reduce(
      (s, e) => s + (e.tipo === "gruppo" ? e.a.importo : e.m.importo),
      0,
    );
    expect(totale).toBe(-27520);
  });

  it("in modo quote resta solo la quota", () => {
    const el = disponi([...CASSA, QUOTA], "riga", "quote");
    const totale = el.reduce(
      (s, e) => s + (e.tipo === "gruppo" ? e.a.importo : e.m.importo),
      0,
    );
    expect(totale).toBe(-17459);
  });

  it("tiene separate anche le corsie, come faceva già", () => {
    const el = disponi(
      [
        m({ id: "forn", importo: -1000 }),
        m({ id: "inst", importo: -500, lane: "inst" }),
        m({ id: "in", importo: 2000, lane: "in" }),
      ],
      "riga",
      "sintesi",
    );
    // Tre movimenti singoli, uno per corsia: nessuno si fonde con l'altro.
    expect(el).toHaveLength(3);
  });

  it("il documento non finisce mai nel secchiello delle quote", () => {
    const el = disponi(
      [
        m({ id: "doc", importo: -27520, documentale: true, quota: true }),
        ...CASSA,
      ],
      "riga",
      "dettaglio",
    );
    // Il documento sta nella sua corsia grigia, e non tocca il totale di cassa.
    const doc = el.find((e) => e.tipo === "singola" && e.m.documentale);
    expect(doc).toBeDefined();
    const cassa = el.flatMap((e) => (e.tipo === "gruppo" ? [e.a] : []));
    expect(cassa.some((a) => a.importo === -44979)).toBe(false);
  });
});
