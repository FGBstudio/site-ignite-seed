import { describe, expect, it } from "vitest";
import {
  fatturatoSettimana,
  importo,
  ivaPerMese,
  kpiAnno,
  kpiFunnel,
  kpiPortafoglio,
  lunediDi,
  perEntita,
  previsioneAnno,
  registroClienti,
  scadenzaIva,
} from "@/lib/payments/aggregati";
import type { InvoiceRow } from "@/types/payments";

/**
 * Gli aggregati della sezione Payments.
 *
 * Il residuo della singola fattura non si prova qui: vive in SQL, e i suoi casi
 * stanno in `supabase/tests/payments_formule.sql`. Qui si prova quello che il
 * database non fa — le somme di portafoglio, la settimana, il consolidato fra
 * valute — cioe' i numeri che finiscono in cima alla dashboard e che nessuno
 * ricontrolla mai a mano.
 */

let n = 0;
/** Una fattura, con solo i campi che l'aggregato guarda. */
function fattura(p: Partial<InvoiceRow>): InvoiceRow {
  n += 1;
  return {
    id: `i${n}`,
    number: `FT-UK-2026-${String(n).padStart(4, "0")}`,
    external_number: null,
    issuer_contact_id: "e1",
    entity_code: "uk",
    issuer_name: "FGB UK",
    client_contact_id: null,
    client_name: null,
    certification_id: null,
    project_name: null,
    tranche_id: null,
    currency: "EUR",
    exch_rate: 1,
    total: 0,
    vat_amount: 0,
    issue_date: "2026-06-01",
    payment_terms_days: 30,
    due_date: "2026-07-01",
    lifecycle_state: "issued",
    recall_status: null,
    yellow_until: null,
    reminders_count: 0,
    last_reminder_date: null,
    next_reminder_date: null,
    recovery_state: null,
    notes: null,
    created_at: "2026-06-01",
    paid_amount: 0,
    credited_amount: 0,
    decurtato_amount: 0,
    ammanco_da_recuperare: 0,
    commessa: null,
    residual: 0,
    payment_status: "unpaid",
    days_late: 0,
    total_eur: 0,
    residual_eur: 0,
    ...p,
  };
}

describe("KPI di portafoglio", () => {
  const righe = [
    // saldata: non deve contare da nessuna parte
    fattura({ total: 10000, total_eur: 10000, paid_amount: 10000, residual: 0, residual_eur: 0, payment_status: "paid", lifecycle_state: "closed" }),
    // parziale
    fattura({ total: 20000, total_eur: 20000, paid_amount: 12000, residual: 8000, residual_eur: 8000, payment_status: "partial", days_late: 30 }),
    // mai pagata e scaduta
    fattura({ total: 5000, total_eur: 5000, residual: 5000, residual_eur: 5000, payment_status: "unpaid", days_late: 12, lifecycle_state: "in_recall" }),
    // a recupero
    fattura({ total: 3000, total_eur: 3000, residual: 3000, residual_eur: 3000, payment_status: "unpaid", lifecycle_state: "insoluto", recovery_state: "legale" }),
    // persa e archiviata: tracciata, ma non e' piu' un credito
    fattura({ total: 9000, total_eur: 9000, residual: 9000, residual_eur: 9000, payment_status: "unpaid", lifecycle_state: "insoluto", recovery_state: "write_off" }),
  ];
  const k = kpiPortafoglio(righe);

  it("il residuo crediti somma solo le fatture ancora aperte", () => {
    expect(k.residuoCrediti).toBe(8000 + 5000 + 3000 + 9000);
  });

  it("«di cui parziali» isola le fatture pagate a meta'", () => {
    expect(k.residuoParziali).toBe(8000);
    expect(k.fattureParziali).toBe(1);
  });

  it("la write-off resta fuori dall'insoluto che si sta ancora inseguendo", () => {
    // 9.000 sono persi e archiviati: contarli qui direbbe che c'è più da
    // recuperare di quanto ce ne sia davvero.
    expect(k.insoluto).toBe(3000);
    expect(k.fattureInsolute).toBe(1);
  });

  it("le scadute si contano solo se hanno ancora residuo", () => {
    expect(k.scadute).toBe(2);
  });

  it("una fattura saldata non lascia traccia nei crediti", () => {
    const solaSaldata = kpiPortafoglio([righe[0]]);
    expect(solaSaldata.residuoCrediti).toBe(0);
    expect(solaSaldata.scadute).toBe(0);
  });
});

describe("fatturato dell'anno", () => {
  it("il netto e' il lordo meno le note di credito", () => {
    const k = kpiAnno(
      [
        fattura({ issue_date: "2026-03-10", total_eur: 100000 }),
        fattura({ issue_date: "2026-09-01", total_eur: 50000, credited_amount: 12000 }),
        fattura({ issue_date: "2025-12-30", total_eur: 999999 }),
      ],
      2026,
    );
    expect(k.lordo).toBe(150000);
    expect(k.noteCredito).toBe(12000);
    expect(k.netto).toBe(138000);
    expect(k.fatture).toBe(2);
  });

  it("l'anno precedente resta fuori", () => {
    expect(kpiAnno([fattura({ issue_date: "2025-12-31", total_eur: 5000 })], 2026).lordo).toBe(0);
  });
});

describe("valute", () => {
  it("il consolidato converte col tasso scritto sulla fattura", () => {
    // 10.000 sterline a 1,17 sono 11.700 euro: il tasso è quello del giorno
    // dell'emissione, non quello di oggi.
    const k = kpiAnno([fattura({ issue_date: "2026-05-05", currency: "GBP", exch_rate: 1.17, total: 10000, total_eur: 11700 })], 2026);
    expect(k.lordo).toBe(11700);
  });

  it("ogni valuta si scrive col suo simbolo", () => {
    expect(importo(39500)).toBe("€ 39.500");
    expect(importo(52000, "USD")).toBe("$ 52.000");
    expect(importo(1234.5, "GBP", 2)).toBe("£ 1.234,50");
    expect(importo(0)).toBe("€ 0");
  });
});

describe("la settimana", () => {
  it("comincia di lunedi', anche se oggi e' domenica", () => {
    // Domenica 20 settembre 2026 appartiene alla settimana che inizia lunedì 14.
    expect(lunediDi(new Date(2026, 8, 20)).getDate()).toBe(14);
    expect(lunediDi(new Date(2026, 8, 14)).getDate()).toBe(14);
  });

  it("prende le fatture della settimana corrente e nessun'altra", () => {
    const oggi = new Date(2026, 8, 17); // giovedì
    const s = fatturatoSettimana(
      [
        fattura({ issue_date: "2026-09-14", total_eur: 100000 }), // lunedì: dentro
        fattura({ issue_date: "2026-09-20", total_eur: 12400 }), // domenica: dentro
        fattura({ issue_date: "2026-09-21", total_eur: 999 }), // lunedì dopo: fuori
        fattura({ issue_date: "2026-09-13", total_eur: 888 }), // domenica prima: fuori
      ],
      oggi,
    );
    expect(s.importo).toBe(112400);
    expect(s.fatture).toBe(2);
  });
});

describe("il funnel della dashboard", () => {
  const quotazioni = [
    { id: "q1", name: null, client: null, status: "quotation", total_fees: 100000 },
    { id: "q2", name: null, client: null, status: "potential", total_fees: 200000 },
    { id: "q3", name: null, client: null, status: "quotation", total_fees: null }, // senza importo
  ];
  const tranche = [
    { id: "t1", certification_id: "c1", name: null, amount: 30000, tranche_state: "due" as const },
    { id: "t2", certification_id: "c1", name: null, amount: 40000, tranche_state: "pending" as const },
    { id: "t3", certification_id: "c1", name: null, amount: 50000, tranche_state: "invoiced" as const },
  ];
  const k = kpiFunnel(quotazioni, tranche);

  it("il potenziale somma le quotazioni aperte a valore pieno", () => {
    expect(k.potenziale).toBe(300000);
    expect(k.potenzialeQuotazioni).toBe(2);
  });

  it("il ponderato pesa ogni stato per la sua probabilita'", () => {
    // 100.000 × 0,40 + 200.000 × 0,15 = 70.000. Sommare tutto quello che si
    // spera darebbe 300.000, un numero in cui nessuno crede.
    expect(k.potenzialePonderato).toBe(70000);
  });

  it("il «da contabilizzare» esclude quello che e' gia' fatturato", () => {
    expect(k.daContabilizzare).toBe(70000);
    expect(k.daContabilizzarePezzi).toBe(2);
  });

  it("le tranche gia' esigibili si contano a parte", () => {
    expect(k.dueOra).toBe(30000);
    expect(k.dueOraPezzi).toBe(1);
  });
});

describe("IVA", () => {
  const righe = [
    fattura({ entity_code: "it", issue_date: "2026-03-10", vat_amount: 22000 }),
    fattura({ entity_code: "it", issue_date: "2026-03-28", vat_amount: 8000 }),
    // Una fattura UK non genera IVA italiana: contarla farebbe versare soldi
    // su un debito che non esiste.
    fattura({ entity_code: "uk", issue_date: "2026-03-15", vat_amount: 99999 }),
    fattura({ entity_code: "it", issue_date: "2026-11-02", vat_amount: 5000 }),
  ];
  const mesi = ivaPerMese(righe, 2026, new Date(2026, 8, 18));

  it("riguarda solo l'entita' italiana", () => {
    expect(mesi[2].importo).toBe(30000);
  });

  it("i mesi futuri sono marcati come stime", () => {
    expect(mesi[2].stimato).toBe(false);
    expect(mesi[8].stimato).toBe(false); // settembre: mese corrente
    expect(mesi[10].stimato).toBe(true); // novembre
  });

  it("il termine di versamento e' il 16 del mese dopo", () => {
    const s = scadenzaIva(2026, 8); // settembre
    expect(s.getMonth()).toBe(9);
    expect(s.getDate()).toBe(16);
    // Dicembre si versa a gennaio dell'anno dopo.
    expect(scadenzaIva(2026, 11).getFullYear()).toBe(2027);
  });
});

describe("previsionale", () => {
  const righe = [fattura({ issue_date: "2026-02-10", total: 100000, credited_amount: 10000 })];
  const tranche = [
    { id: "t1", certification_id: "c1", name: null, amount: 50000, tranche_state: "due" as const, data_attesa: "2026-06-15" },
    { id: "t2", certification_id: "c1", name: null, amount: 20000, tranche_state: "invoiced" as const, data_attesa: "2026-06-15" },
  ];
  const quotazioni = [
    { id: "q1", name: null, client: null, status: "quotation", total_fees: 100000, data_attesa: "2026-09-01" },
  ];
  const mesi = previsioneAnno(righe, tranche, quotazioni, 2026);

  it("l'emesso e' al netto delle note di credito", () => {
    expect(mesi[1].emesso).toBe(90000);
  });

  it("i tre strati restano distinti", () => {
    expect(mesi[5].pianificato).toBe(50000);
    expect(mesi[8].potenziale).toBe(40000); // 100.000 × 0,40
    expect(mesi[5].emesso).toBe(0);
  });

  it("le tranche gia' fatturate non si contano due volte", () => {
    // t2 è già diventata fattura: sommarla al pianificato la conterebbe
    // insieme all'emesso.
    expect(mesi[5].pianificato).toBe(50000);
  });

  it("il cumulato cresce e arriva al totale atteso", () => {
    expect(mesi[0].cumulato).toBe(0);
    expect(mesi[1].cumulato).toBe(90000);
    expect(mesi[5].cumulato).toBe(140000);
    expect(mesi[11].cumulato).toBe(180000);
  });

  it("uno slittamento sposta la tranche nel mese nuovo", () => {
    // È il criterio della specifica: il forecast legge la data attesa
    // dell'evento, quindi si aggiorna da solo quando la costruzione slitta.
    const dopo = previsioneAnno(
      righe,
      [{ ...tranche[0], data_attesa: "2026-10-15" }],
      [],
      2026,
    );
    expect(dopo[5].pianificato).toBe(0);
    expect(dopo[9].pianificato).toBe(50000);
  });

  it("una tranche senza data attesa finisce a dicembre, non nel mese corrente", () => {
    const senza = previsioneAnno([], [{ ...tranche[0], data_attesa: null }], [], 2026);
    expect(senza[11].pianificato).toBe(50000);
  });
});

describe("registro clienti", () => {
  const righe = [
    fattura({ client_contact_id: "c1", client_name: "PRADA", project_name: "Montenapoleone", issue_date: "2026-03-01", total: 100000, total_eur: 100000, paid_amount: 60000, residual: 40000, residual_eur: 40000, payment_status: "partial", lifecycle_state: "in_recall" }),
    fattura({ client_contact_id: "c1", client_name: "PRADA", project_name: "Changi T2", issue_date: "2026-07-01", total: 50000, total_eur: 50000, credited_amount: 10000, paid_amount: 40000, residual: 0, residual_eur: 0, payment_status: "paid", lifecycle_state: "closed" }),
    fattura({ client_contact_id: "c2", client_name: "FENDI", project_name: "Roma", issue_date: "2026-05-01", total: 30000, total_eur: 30000, residual: 30000, residual_eur: 30000, payment_status: "unpaid", lifecycle_state: "insoluto", recovery_state: "legale" }),
  ];
  const quotazioni = [
    { id: "q1", name: null, client: "prada", status: "quotation", total_fees: 80000 },
    { id: "q2", name: null, client: "NUOVO CLIENTE", status: "quotation", total_fees: 25000 },
  ];
  const reg = registroClienti(righe, quotazioni);
  const prada = reg.find((c) => c.nome === "PRADA")!;
  const fendi = reg.find((c) => c.nome === "FENDI")!;

  it("somma il fatturato del cliente al netto delle note di credito", () => {
    expect(prada.fatturato).toBe(150000);
    expect(prada.noteCredito).toBe(10000);
    expect(prada.netto).toBe(140000);
  });

  it("il debito aperto esclude le fatture chiuse", () => {
    expect(prada.aperto).toBe(40000);
    expect(prada.incassato).toBe(100000);
  });

  it("l'insoluto si conta a parte dall'aperto", () => {
    expect(fendi.insoluto).toBe(30000);
    expect(prada.insoluto).toBe(0);
  });

  it("abbina il potenziale al cliente anche se il nome è scritto diverso", () => {
    // Le quotazioni portano il nome come testo, le fatture puntano a una
    // società in anagrafica: «prada» e «PRADA» sono lo stesso cliente.
    expect(prada.potenziale).toBe(80000);
  });

  it("un cliente con sole quotazioni aperte compare lo stesso", () => {
    const nuovo = reg.find((c) => c.nome === "NUOVO CLIENTE");
    expect(nuovo?.potenziale).toBe(25000);
    expect(nuovo?.fatturato).toBe(0);
  });

  it("elenca i progetti del cliente senza ripeterli", () => {
    expect(prada.progetti.sort()).toEqual(["Changi T2", "Montenapoleone"]);
  });

  it("le fatture sono dalla più recente", () => {
    expect(prada.fatture[0].issue_date).toBe("2026-07-01");
    expect(prada.ultima).toBe("2026-07-01");
  });

  it("i clienti escono ordinati per fatturato", () => {
    expect(reg[0].nome).toBe("PRADA");
  });
});

describe("filtro per societa' emittente", () => {
  const righe = [
    fattura({ entity_code: "uk", total_eur: 1000 }),
    fattura({ entity_code: "it", total_eur: 2000 }),
    fattura({ entity_code: "cn", total_eur: 3000 }),
  ];

  it("una societa' alla volta", () => {
    expect(perEntita(righe, "it")).toHaveLength(1);
    expect(perEntita(righe, "it")[0].total_eur).toBe(2000);
  });

  it("consolidato vuol dire tutte", () => {
    expect(perEntita(righe, null)).toHaveLength(3);
  });
});
