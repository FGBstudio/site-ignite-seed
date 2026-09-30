import { describe, expect, it } from "vitest";
import {
  fasciaOfferta,
  giorniDallInvio,
  GIORNI_FERMA,
  GIORNI_PRIMO_SOLLECITO,
  riepilogoOfferte,
  valoreInEuro,
  type OffertaInAttesa,
} from "./quotationFollowup";

/**
 * Le offerte in attesa.
 *
 * I numeri veri del 30 settembre 2026: 33 offerte pendenti, di cui **17 senza
 * data di invio**, 1 fresca, 10 da sollecitare, 5 ferme da più di due mesi. E 9
 * senza un importo, che è il motivo per cui il «valore aperto» va detto insieme a
 * quante offerte lo compongono.
 */

const OGGI = "2026-09-30";

const off = (p: Partial<OffertaInAttesa>): OffertaInAttesa => ({
  id: p.id ?? "q1",
  name: p.name ?? "Progetto",
  client: p.client ?? "Cliente",
  quotation_sent_date: p.quotation_sent_date ?? null,
  total_fees: p.total_fees ?? null,
  total_fees_eur: p.total_fees_eur ?? null,
  currency: p.currency ?? "EUR",
  status: p.status ?? "quotation",
});

describe("giorniDallInvio", () => {
  it("conta i giorni", () => {
    expect(giorniDallInvio("2026-09-16", OGGI)).toBe(14);
  });

  it("senza data non sa: null, non zero", () => {
    // Zero direbbe «inviata oggi», che è l'opposto di «non si sa se è uscita».
    expect(giorniDallInvio(null, OGGI)).toBeNull();
    expect(giorniDallInvio(undefined, OGGI)).toBeNull();
  });

  it("una data storta non diventa un numero", () => {
    expect(giorniDallInvio("il mese scorso", OGGI)).toBeNull();
  });

  it("attraversa i mesi", () => {
    expect(giorniDallInvio("2026-08-12", OGGI)).toBe(49);
  });
});

describe("fasciaOfferta", () => {
  it("senza data di invio non si sollecita: si guarda se è uscita", () => {
    expect(fasciaOfferta(null, OGGI)).toBe("mai_inviata");
  });

  it("dentro le due settimane è fresca: telefonare sarebbe mettere fretta", () => {
    expect(fasciaOfferta("2026-09-25", OGGI)).toBe("fresca");
  });

  it("il giorno esatto del primo sollecito ci entra", () => {
    const g = GIORNI_PRIMO_SOLLECITO; // 14
    expect(fasciaOfferta("2026-09-16", OGGI)).toBe("da_sollecitare");
    expect(giorniDallInvio("2026-09-16", OGGI)).toBe(g);
  });

  it("il giorno prima no", () => {
    expect(fasciaOfferta("2026-09-17", OGGI)).toBe("fresca");
  });

  it("dopo due mesi è ferma, non in attesa", () => {
    expect(fasciaOfferta("2026-08-01", OGGI)).toBe("ferma");
    expect(giorniDallInvio("2026-08-01", OGGI)).toBeGreaterThanOrEqual(GIORNI_FERMA);
  });

  it("una data nel futuro è un errore di battitura, non un'attesa", () => {
    // Meglio «fresca» che «da sollecitare fra tre mesi»: non compare in un
    // elenco di telefonate da fare.
    expect(fasciaOfferta("2027-01-01", OGGI)).toBe("fresca");
  });
});

describe("valoreInEuro", () => {
  it("usa il convertito quando c'è", () => {
    expect(valoreInEuro(off({ total_fees: 10000, currency: "USD", total_fees_eur: 9200 }))).toBe(9200);
  });

  it("in euro vale il totale", () => {
    expect(valoreInEuro(off({ total_fees: 8000, currency: "EUR" }))).toBe(8000);
  });

  it("una valuta estera senza conversione non si somma a caso", () => {
    // Sommare 10.000 dollari come fossero euro gonfia il valore aperto del 9%:
    // meglio zero, che si vede nel conteggio «senza importo».
    expect(valoreInEuro(off({ total_fees: 10000, currency: "USD" }))).toBe(0);
  });

  it("senza importo vale zero", () => {
    expect(valoreInEuro(off({}))).toBe(0);
  });
});

describe("riepilogoOfferte", () => {
  const offerte = [
    off({ id: "a", quotation_sent_date: null, total_fees: 5000 }),
    off({ id: "b", quotation_sent_date: null }),
    off({ id: "c", quotation_sent_date: "2026-09-25", total_fees: 1000 }),
    off({ id: "d", quotation_sent_date: "2026-09-03", total_fees: 9500 }),
    off({ id: "e", quotation_sent_date: "2026-09-16", total_fees: 2000 }),
    off({ id: "f", quotation_sent_date: "2026-08-12", total_fees: 28000 }),
    off({ id: "g", quotation_sent_date: "2026-01-10", total_fees: 4000 }),
  ];

  it("divide per quello che c'è da farne", () => {
    const r = riepilogoOfferte(offerte, OGGI);
    expect(r.in_attesa).toBe(7);
    expect(r.mai_inviate.map((o) => o.id)).toEqual(["a", "b"]);
    expect(r.fresche.map((o) => o.id)).toEqual(["c"]);
    expect(r.da_sollecitare.map((o) => o.id)).toEqual(["f", "d", "e"]);
    expect(r.ferme.map((o) => o.id)).toEqual(["g"]);
  });

  it("le più vecchie prima: è l'ordine in cui si telefona", () => {
    const r = riepilogoOfferte(offerte, OGGI);
    expect(r.da_sollecitare[0].id).toBe("f"); // 12 agosto
  });

  it("il valore aperto è la somma di quello che ha un importo", () => {
    const r = riepilogoOfferte(offerte, OGGI);
    expect(r.valore_aperto).toBe(49500);
    expect(r.senza_importo).toBe(1);
  });

  it("nessuna offerta: nessun numero inventato", () => {
    const r = riepilogoOfferte([], OGGI);
    expect(r.in_attesa).toBe(0);
    expect(r.valore_aperto).toBe(0);
    expect(r.da_sollecitare).toEqual([]);
  });
});
