import { describe, it, expect } from "vitest";
import {
  chiavePartitaIva, chiaveNome, abbinaContatto, giorniTraDate, numeroPulito,
  bozzaDaLettura, avvisi, importabile, contattoDaLettura,
  type LetturaFattura, type ContattoNoto,
} from "./letturaFattura";

/**
 * Qui si prova la parte che decide cosa diventa una fattura letta da un PDF.
 * Vale la pena provarla perche' un errore non si vede: una riga sbagliata
 * entra nel registro e da quel momento e' il fatturato di un anno.
 */

const NOTI: ContattoNoto[] = [
  { id: "k", company_name: "Kering Eyewear Spa", vat_number: "IT04846890285" },
  { id: "f", company_name: "FGB studio Italy srl", vat_number: "04846890999" },
  { id: "v", company_name: "Versace S.p.A.", vat_number: null },
];

function lettura(p: Partial<LetturaFattura> = {}): LetturaFattura {
  return {
    numero: "2023/114",
    data_emissione: "2023-05-10",
    data_scadenza: null,
    termini_giorni: null,
    valuta: "EUR",
    imponibile: 5000,
    iva: 1100,
    totale: 6100,
    emittente: { ragione_sociale: "FGB studio Italy srl", partita_iva: "04846890999" },
    cliente: { ragione_sociale: "Kering Eyewear Spa", partita_iva: "IT 04846890285" },
    ...p,
  };
}

describe("la partita IVA come chiave", () => {
  it("riconosce la stessa societa' scritta in tre modi", () => {
    const a = chiavePartitaIva("IT04846890285");
    expect(chiavePartitaIva("IT 048 4689 0285")).toBe(a);
    expect(chiavePartitaIva("04846890285")).toBe(a);
    expect(chiavePartitaIva("it-04846890285")).toBe(a);
  });

  it("non inventa una chiave da niente o da due cifre", () => {
    expect(chiavePartitaIva(null)).toBeNull();
    expect(chiavePartitaIva("  ")).toBeNull();
    expect(chiavePartitaIva("IT12")).toBeNull();
  });

  it("toglie il paese solo se davvero e' un prefisso di paese", () => {
    // «12IT345678» non comincia con due lettere: non si taglia niente.
    expect(chiavePartitaIva("12IT345678")).toBe("12IT345678");
  });
});

describe("il nome come chiave", () => {
  it("appiattisce forme societarie e punteggiatura", () => {
    expect(chiaveNome("FGB studio S.r.l.")).toBe(chiaveNome("FGB STUDIO srl"));
    expect(chiaveNome("Versace S.p.A.")).toBe(chiaveNome("versace spa"));
  });

  it("non confonde due societa' diverse", () => {
    expect(chiaveNome("Kering Eyewear Spa")).not.toBe(chiaveNome("Kering Italia Spa"));
  });
});

describe("l'abbinamento con le anagrafiche gia' a sistema", () => {
  it("abbina sulla partita IVA anche se il nome e' scritto diverso", () => {
    const e = abbinaContatto({ ragione_sociale: "KERING EYEWEAR", partita_iva: "04846890285" }, NOTI);
    expect(e.contatto?.id).toBe("k");
    expect(e.motivo).toBe("partita_iva");
  });

  it("ripiega sul nome quando la partita IVA sul documento non c'e'", () => {
    const e = abbinaContatto({ ragione_sociale: "versace spa" }, NOTI);
    expect(e.contatto?.id).toBe("v");
    expect(e.motivo).toBe("nome");
  });

  it("la partita IVA vince sul nome: due societa' del gruppo non si confondono", () => {
    // Si chiama come Kering ma ha la partita IVA di FGB: comanda il codice.
    const e = abbinaContatto({ ragione_sociale: "Kering Eyewear Spa", partita_iva: "04846890999" }, NOTI);
    expect(e.contatto?.id).toBe("f");
    expect(e.motivo).toBe("partita_iva");
  });

  it("dice di non sapere invece di indovinare", () => {
    const e = abbinaContatto({ ragione_sociale: "Tizio Caio Srl", partita_iva: "99999999999" }, NOTI);
    expect(e.contatto).toBeNull();
    expect(e.motivo).toBeNull();
  });
});

describe("i numeri come li scrive un contabile", () => {
  it("legge la notazione italiana e quella inglese", () => {
    expect(numeroPulito("1.234,56")).toBe(1234.56);
    expect(numeroPulito("1,234.56")).toBe(1234.56);
    expect(numeroPulito("6100")).toBe(6100);
    expect(numeroPulito("€ 2.520,00")).toBe(2520);
  });

  it("non trasforma il vuoto in zero", () => {
    expect(numeroPulito("")).toBeNull();
    expect(numeroPulito(null)).toBeNull();
    expect(numeroPulito("abc")).toBeNull();
  });
});

describe("i giorni fra emissione e scadenza", () => {
  it("li ricava quando il documento porta solo la scadenza", () => {
    expect(giorniTraDate("2023-05-10", "2023-08-08")).toBe(90);
  });

  it("rifiuta scadenze impossibili invece di produrre numeri assurdi", () => {
    expect(giorniTraDate("2023-05-10", "2020-01-01")).toBeNull();
    expect(giorniTraDate("2023-05-10", "2030-01-01")).toBeNull();
    expect(giorniTraDate(null, "2023-08-08")).toBeNull();
  });
});

describe("la bozza che si presenta a chi rivede", () => {
  it("porta i campi letti senza toccarli", () => {
    const b = bozzaDaLettura(lettura());
    expect(b.numero).toBe("2023/114");
    expect(b.dataEmissione).toBe("2023-05-10");
    expect(b.totale).toBe("6100");
    expect(b.valuta).toBe("EUR");
  });

  it("ricava i termini dalla scadenza quando i giorni non sono scritti", () => {
    const b = bozzaDaLettura(lettura({ data_scadenza: "2023-07-09" }));
    expect(b.terminiGiorni).toBe(60);
  });

  it("usa trenta giorni solo quando non c'e' altro da cui ricavarli", () => {
    expect(bozzaDaLettura(lettura()).terminiGiorni).toBe(30);
  });

  it("riporta a euro una valuta che il sistema non tratta", () => {
    expect(bozzaDaLettura(lettura({ valuta: "CHF" })).valuta).toBe("EUR");
    expect(bozzaDaLettura(lettura({ valuta: "usd" })).valuta).toBe("USD");
  });

  it("propone incassata: una vecchia aperta finirebbe in Recall domani", () => {
    expect(bozzaDaLettura(lettura()).incassata).toBe(true);
  });
});

describe("gli avvisi prima di salvare", () => {
  it("tace quando la lettura e' coerente", () => {
    const l = lettura();
    expect(avvisi(bozzaDaLettura(l), l).filter((a) => a.grave)).toHaveLength(0);
    expect(importabile(bozzaDaLettura(l), l)).toBe(true);
  });

  it("si accorge che imponibile piu' IVA non fa il totale", () => {
    const l = lettura({ iva: 1100, imponibile: 5000, totale: 5900 });
    const g = avvisi(bozzaDaLettura(l), l).filter((a) => a.grave);
    expect(g).toHaveLength(1);
    expect(g[0].testo).toContain("6100");
    expect(importabile(bozzaDaLettura(l), l)).toBe(false);
  });

  it("perdona un centesimo di arrotondamento", () => {
    const l = lettura({ imponibile: 5000, iva: 1100.004, totale: 6100 });
    expect(avvisi(bozzaDaLettura(l), l).filter((a) => a.grave)).toHaveLength(0);
  });

  it("blocca la fattura senza numero, senza data o senza totale", () => {
    for (const p of [{ numero: null }, { data_emissione: null }, { totale: null }]) {
      const l = lettura(p as Partial<LetturaFattura>);
      expect(importabile(bozzaDaLettura(l), l)).toBe(false);
    }
  });

  it("blocca un incasso precedente all'emissione", () => {
    const l = lettura();
    const b = { ...bozzaDaLettura(l), dataIncasso: "2023-01-01" };
    expect(importabile(b, l)).toBe(false);
  });

  it("segnala senza bloccare quando il cliente non e' stato letto", () => {
    const l = lettura({ cliente: { ragione_sociale: null } });
    const a = avvisi(bozzaDaLettura(l), l);
    expect(a.some((x) => x.campo === "cliente" && !x.grave)).toBe(true);
    expect(importabile(bozzaDaLettura(l), l)).toBe(true);
  });

  it("segnala che il totale e' stato corretto a mano", () => {
    const l = lettura();
    const b = { ...bozzaDaLettura(l), totale: "6200", imponibile: "5100" };
    expect(avvisi(b, l).some((x) => x.testo.includes("corretto a mano"))).toBe(true);
  });
});

describe("l'anagrafica creata dalla fattura", () => {
  it("prende quello che c'e' e lascia vuoto quello che non c'e'", () => {
    const c = contattoDaLettura(
      { ragione_sociale: "Tizio Srl", partita_iva: "IT99999999999", citta: "Milano", indirizzo: "  " },
      "client",
    );
    expect(c.company_name).toBe("Tizio Srl");
    expect(c.vat_number).toBe("IT99999999999");
    expect(c.city).toBe("Milano");
    expect(c.address).toBeNull();
    expect(c.country).toBeNull();
    expect(c.kind).toBe("client");
  });

  it("dice da dove viene, nelle note", () => {
    const c = contattoDaLettura({ ragione_sociale: "Tizio Srl" }, "issuer");
    expect(c.notes).toContain("fattura");
  });
});
