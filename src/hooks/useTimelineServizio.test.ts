import { describe, expect, it } from "vitest";
import { chiaveTimeline, proponiPasso, type PassoTimeline } from "./useTimelineServizio";
import type { CatalogEntry } from "./useCertCatalog";

/**
 * Le tranche si agganciano alla timeline del servizio quotato.
 *
 * Il difetto che questi test chiudono: il menu delle attività mostrava cinque
 * voci generiche — firma, fine design, fine costruzione, sottomissione, SAL —
 * uguali per ogni servizio. Nessuna di quelle voci esiste in una timeline
 * vera, quindi nessuna milestone chiusa dal PM poteva sbloccare una fattura.
 */

const voce = (p: Partial<CatalogEntry> & { scheme: string }): CatalogEntry => ({
  id: p.scheme + (p.rating_system ?? "") + (p.typology ?? ""),
  rating_system: null,
  typology: null,
  version: null,
  delivery_context: null,
  display_label: "",
  outcome_model: "none",
  score_unit: null,
  timeline_key: null,
  is_sellable: true,
  order_index: 0,
  ...p,
});

const CATALOGO: CatalogEntry[] = [
  voce({ scheme: "Energy", timeline_key: "Energy" }),
  voce({ scheme: "Air", timeline_key: "Air" }),
  voce({ scheme: "LEED", rating_system: "BD+C", typology: "Retail", timeline_key: "LEED BD+C" }),
  voce({ scheme: "LEED", rating_system: "BD+C", typology: "Schools", timeline_key: "LEED BD+C" }),
  voce({ scheme: "LEED", rating_system: "ID+C", typology: "Retail", timeline_key: "LEED ID+C" }),
  voce({ scheme: "LEED", rating_system: "O+M", typology: "Retail", timeline_key: "LEED O+M" }),
];

const passo = (order_index: number, requirement: string): PassoTimeline => ({
  id: `s${order_index}`,
  timeline_key: "x",
  order_index,
  requirement,
  optional: false,
});

/**
 * Le timeline vere, copiate da `cert_timeline_steps`.
 *
 * Non fixture semplificate: la proposta va provata sui nomi che esistono
 * davvero, perché è proprio lì che sbaglia — su Energy il passo 7 contiene
 * «messa in rete» e verrebbe scambiato per la consegna se l'ordine delle
 * alternative fosse sbagliato.
 */
const LEED_BDC = [
  passo(1, "Pre-assessment"),
  passo(2, "FGB Design Guidelines"),
  passo(3, "FGB Tendering Requirements"),
  passo(4, "Construction Start"),
  passo(5, "LEED GC Training"),
  passo(6, "CLAIR Shipment"),
  passo(7, "Greeny Shipment"),
  passo(8, "Commissioning tests and reports"),
  passo(9, "Construction End (Handover)"),
  passo(10, "GC Provides Closed-out Documentation"),
  passo(11, "CxA site inspection and tests"),
  passo(12, "LEED Project Submission"),
  passo(13, "LEED Certification Attainment"),
];

const ENERGY = [
  passo(1, "Kick-off e sopralluogo quadri elettrici"),
  passo(2, "CT Builder — circuiti e sensori definiti"),
  passo(3, "Conferma bridge e PAN"),
  passo(4, "Ordine hardware emesso"),
  passo(5, "Spedizione"),
  passo(6, "Installazione elettrica"),
  passo(7, "Configurazione bridge e messa in rete"),
  passo(8, "Primo dato ricevuto"),
  passo(9, "Verifica letture e taratura"),
  passo(10, "Consegna accessi dashboard al cliente"),
  passo(11, "Report di avvio (baseline)"),
];

describe("chiaveTimeline", () => {
  it("trova la timeline esatta di un servizio con rating e tipologia", () => {
    expect(
      chiaveTimeline(CATALOGO, { scheme: "LEED", rating: "BD+C", typology: "Retail" }),
    ).toBe("LEED BD+C");
    expect(
      chiaveTimeline(CATALOGO, { scheme: "LEED", rating: "ID+C", typology: "Retail" }),
    ).toBe("LEED ID+C");
  });

  it("distingue i rating: lo stesso Retail cambia timeline", () => {
    const bdc = chiaveTimeline(CATALOGO, { scheme: "LEED", rating: "BD+C", typology: "Retail" });
    const om = chiaveTimeline(CATALOGO, { scheme: "LEED", rating: "O+M", typology: "Retail" });
    expect(bdc).not.toBe(om);
  });

  it("ripiega sul rating quando la tipologia non è ancora decisa", () => {
    // In offerta capita: si sa che è un BD+C, non ancora se Retail o Schools.
    // I passi sono gli stessi, quindi la timeline è comunque quella giusta.
    expect(chiaveTimeline(CATALOGO, { scheme: "LEED", rating: "BD+C", typology: "" })).toBe(
      "LEED BD+C",
    );
  });

  it("i servizi senza rating si risolvono sullo schema", () => {
    expect(chiaveTimeline(CATALOGO, { scheme: "Energy" })).toBe("Energy");
    expect(chiaveTimeline(CATALOGO, { scheme: "Air" })).toBe("Air");
  });

  it("restituisce null quando lo schema non è a catalogo", () => {
    expect(chiaveTimeline(CATALOGO, { scheme: "CSRD" })).toBeNull();
  });

  it("tratta stringa vuota e spazi come «non scelto»", () => {
    expect(chiaveTimeline(CATALOGO, { scheme: "Energy", rating: "   ", typology: "" })).toBe(
      "Energy",
    );
  });
});

describe("proponiPasso", () => {
  it("aggancia la fine costruzione all'handover, che è come si chiama davvero", () => {
    expect(proponiPasso(LEED_BDC, "costruzione")).toBe(9);
  });

  it("aggancia la sottomissione al passo di submission", () => {
    expect(proponiPasso(LEED_BDC, "sottomissione")).toBe(12);
  });

  it("sulle certificazioni la firma è il primo passo", () => {
    expect(proponiPasso(LEED_BDC, "firma")).toBe(1);
  });

  it("sulle forniture la firma è l'ordine hardware, che è l'impegno vero", () => {
    expect(proponiPasso(ENERGY, "firma")).toBe(4);
  });

  it("su Energy la fine lavori è il primo dato: non c'è cantiere, c'è la trasmissione", () => {
    // È il punto su cui l'utente è stato esplicito: la seconda tranche
    // matura quando il sistema è installato e trasmette.
    expect(proponiPasso(ENERGY, "costruzione")).toBe(8);
    expect(proponiPasso(ENERGY, "sottomissione")).toBe(8);
  });

  it("su Energy non scambia la configurazione della rete per il primo dato", () => {
    // Il passo 7 si chiama «Configurazione bridge e messa in rete»: è lavoro
    // nostro, non il dato che arriva. Cercare «messa in rete» prima di «primo
    // dato» aggancerebbe la fattura al passo sbagliato, e di uno soltanto —
    // il tipo di errore che nessuno nota.
    expect(proponiPasso(ENERGY, "costruzione")).not.toBe(7);
  });

  it("su Air la fine lavori è la messa in rete col primo dato", () => {
    const air = [
      passo(1, "Kick-off e definizione punti di misura"),
      passo(2, "Conferma quantita e modelli"),
      passo(3, "Ordine hardware emesso"),
      passo(4, "Spedizione"),
      passo(5, "Consegna in sito"),
      passo(6, "Installazione sensori"),
      passo(7, "Messa in rete e primo dato ricevuto"),
      passo(8, "Consegna accessi dashboard al cliente"),
      passo(9, "Report di avvio (baseline)"),
    ];
    expect(proponiPasso(air, "firma")).toBe(3);
    expect(proponiPasso(air, "costruzione")).toBe(7);
  });

  it("senza una fase di design propone il momento intermedio, non il vuoto", () => {
    // Energy non ha design, ma una rata di mezzo ha senso lo stesso: cade
    // sull'installazione, fra l'ordine e la trasmissione.
    expect(proponiPasso(ENERGY, "design")).toBe(6);
  });

  it("propone sempre qualcosa quando la timeline esiste", () => {
    for (const m of ["firma", "design", "costruzione", "sottomissione"] as const) {
      expect(proponiPasso(ENERGY, m)).not.toBeNull();
      expect(proponiPasso(LEED_BDC, m)).not.toBeNull();
    }
  });

  it("su una timeline vuota non propone niente", () => {
    expect(proponiPasso([], "firma")).toBeNull();
    expect(proponiPasso([], "costruzione")).toBeNull();
  });
});
