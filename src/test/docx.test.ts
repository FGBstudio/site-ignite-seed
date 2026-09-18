import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { compilaDocx } from "@/lib/docx";

/**
 * Il compilatore dei modelli Word, provato sui modelli veri.
 *
 * Non su un .docx costruito per il test: su `template_offerta.docx` e
 * `template_fattura_uk.docx`, gli stessi file che vanno al cliente. Un modello
 * finto direbbe solo che il codice fa quello che credo — Word spezza il testo a
 * ogni cambio di formato, e i punti dove lo spezza sono esattamente quelli che
 * un modello scritto a mano non riprodurrebbe.
 */

const cartella = join(__dirname, "..", "..", "servizio-offerte");
const modello = (nome: string) => new Uint8Array(readFileSync(join(cartella, nome)));

/** Il testo leggibile di una parte del documento, come lo vedrebbe chi apre il file. */
function testo(docx: Uint8Array, parte = "word/document.xml"): string {
  const z = unzipSync(docx);
  return strFromU8(z[parte])
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    // Le entità vanno sciolte, altrimenti si verificherebbe l'XML e non il
    // documento: dentro al file «&» si scrive «&amp;», ma chi apre il Word
    // legge «&». L'ordine conta — `&amp;` per ultimo, o si scioglierebbero due
    // volte le altre.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}

function apribile(docx: Uint8Array): boolean {
  const z = unzipSync(docx);
  // Le tre parti senza cui Word si rifiuta di aprire il file.
  return (
    !!z["[Content_Types].xml"] && !!z["word/document.xml"] && !!z["_rels/.rels"]
  );
}

const OFFERTA = {
  data: "18 settembre 2026",
  cliente_ragione_sociale: "Banca Agricola Popolare di Sicilia",
  cliente_indirizzo: "Via Europa 65",
  cliente_cap_citta: "97100 Ragusa",
  cliente_piva: "P.IVA 00026870881",
  titolo_riga1: "BAPS",
  titolo_riga2: "Green Tech",
  oggetto: "LEED BD+C",
  righe: ["Pre-assessment e gap analysis", "Assistenza alla certificazione", "Commissioning"],
  prezzo_listino_txt: "48.000 Euro",
  prezzo_finale: "39.500",
  cliente_breve: "BAPS",
  termini_giorni: "30",
  emittente_ragione_sociale: "FGB studio * Zmyrna limited",
  emittente_indirizzo: "3 The Shrubberies, George Lane, E18 1BD, London, United Kingdom",
  emittente_piva: "VAT GB 215421643",
};

describe("offerta", () => {
  const fatto = compilaDocx(modello("template_offerta.docx"), OFFERTA);
  const t = testo(fatto);

  it("il documento resta apribile", () => {
    expect(apribile(fatto)).toBe(true);
  });

  it("l'intestazione porta il cliente", () => {
    expect(t).toContain("Banca Agricola Popolare di Sicilia");
    expect(t).toContain("Via Europa 65");
    expect(t).toContain("97100 Ragusa");
    expect(t).toContain("P.IVA 00026870881");
  });

  it("il ciclo produce una riga per voce, nell'ordine", () => {
    for (const r of OFFERTA.righe) expect(t).toContain(r);
    expect(t.indexOf(OFFERTA.righe[0])).toBeLessThan(t.indexOf(OFFERTA.righe[2]));
  });

  it("non resta in giro nessun segnaposto né comando", () => {
    // È il controllo che conta davvero: un `{{ … }}` dimenticato finisce
    // stampato sul documento che il cliente riceve.
    expect(t).not.toMatch(/\{\{|\{%|%\}|\}\}/);
  });

  it("i due prezzi convivono nella stessa riga", () => {
    expect(t).toContain("48.000 Euro");
    expect(t).toContain("39.500");
  });

  it("l'emittente compare nel piede", () => {
    const piede = testo(fatto, "word/footer1.xml");
    expect(piede).toContain("FGB studio * Zmyrna limited");
    expect(piede).toContain("VAT GB 215421643");
    expect(piede).not.toMatch(/\{\{|\}\}/);
  });

  it("un cliente col nome che contiene & non rompe il file", () => {
    const d = compilaDocx(modello("template_offerta.docx"), {
      ...OFFERTA,
      cliente_ragione_sociale: "Rossi & C. <Holding>",
    });
    expect(apribile(d)).toBe(true);
    expect(testo(d)).toContain("Rossi & C. <Holding>");
  });

  it("senza listino la riga del totale non mostra un prezzo barrato", () => {
    const d = compilaDocx(modello("template_offerta.docx"), {
      ...OFFERTA,
      prezzo_listino_txt: "",
    });
    expect(testo(d)).not.toContain("48.000");
    expect(testo(d)).toContain("39.500");
  });

  it("una lista vuota non lascia righe fantasma", () => {
    const d = compilaDocx(modello("template_offerta.docx"), { ...OFFERTA, righe: [] });
    expect(testo(d)).not.toContain("Commissioning");
    expect(apribile(d)).toBe(true);
  });
});

describe("fattura", () => {
  const DATI = {
    data: "18 settembre 2026",
    cliente_ragione_sociale: "Banca Agricola Popolare di Sicilia",
    cliente_indirizzo: ["Via Europa 65", "97100 Ragusa", "Italia"],
    brand: "BAPS",
    sito: "Ragusa HQ",
    numero: "2026/041",
    po: "",
    oggetto: "LEED BD+C — fase 1",
    voci: [
      { descrizione: "Pre-assessment", importo: "12.000" },
      { descrizione: "Gap analysis", importo: "8.000" },
    ],
    totali: [
      { etichetta: "Subtotal", importo: "20.000" },
      { etichetta: "Total", importo: "20.000" },
    ],
    termini: "30 giorni",
    scadenza: "18 ottobre 2026",
    emittente_banca: "HSBC London Bridge Branch",
    emittente_ragione_sociale: "FGB studio * Zmyrna Limited",
    emittente_conto: "76185988",
    emittente_iban: "GB52 HBUK 4012 7676 1859 88",
    emittente_bic: "HBUKGB4B",
  };

  const fatto = compilaDocx(modello("template_fattura_uk.docx"), DATI);
  const t = testo(fatto);

  it("il documento resta apribile", () => {
    expect(apribile(fatto)).toBe(true);
  });

  it("l'indirizzo su piu' righe diventa piu' righe", () => {
    for (const r of DATI.cliente_indirizzo) expect(t).toContain(r);
  });

  it("voci e totali escono con descrizione e importo", () => {
    expect(t).toContain("Pre-assessment");
    expect(t).toContain("12.000");
    expect(t).toContain("Subtotal");
  });

  it("le coordinate bancarie sono quelle dell'emittente, non piu' fisse", () => {
    expect(t).toContain("GB52 HBUK 4012 7676 1859 88");
    expect(t).toContain("HBUKGB4B");
    expect(t).toContain("76185988");
  });

  it("un PO assente fa sparire la sua riga", () => {
    // Non deve restare «PO:» seguito dal nulla: la riga intera se ne va.
    expect(t).not.toContain("PO:");
  });

  it("un PO presente fa comparire la riga", () => {
    const d = testo(compilaDocx(modello("template_fattura_uk.docx"), { ...DATI, po: "4500123" }));
    expect(d).toContain("PO: 4500123");
  });

  it("senza scadenza la riga «Due by» non compare", () => {
    const d = testo(compilaDocx(modello("template_fattura_uk.docx"), { ...DATI, scadenza: "" }));
    expect(d).not.toContain("Due by");
  });

  it("non resta in giro nessun segnaposto né comando", () => {
    expect(t).not.toMatch(/\{\{|\{%|%\}|\}\}/);
  });
});
