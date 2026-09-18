import { describe, expect, it } from "vitest";
import { datiEmittente } from "@/hooks/useOfferta";

/**
 * Il piede dell'offerta.
 *
 * Qui si verifica una cosa sola ma che vale la pena verificare: la sigla
 * davanti al numero fiscale. Prima stava scritta nel template Word — «VAT », a
 * mano, prima del segnaposto — e con una società britannica sola era giusta per
 * definizione. Dal momento in cui l'emittente è una scelta, quella stessa riga
 * stamperebbe «VAT» sopra una partita IVA italiana: un documento che dichiara
 * il numero giusto sotto il nome sbagliato della cosa.
 *
 * Un errore così non si vede rileggendo il PDF — si vede quando lo legge il
 * commercialista del cliente.
 */

const societa = (p: Record<string, unknown>) =>
  ({ id: "x", company_name: "Tal dei Tali", ...p }) as never;

describe("datiEmittente — la riga fiscale", () => {
  it("una società britannica ha un VAT", () => {
    const d = datiEmittente(societa({ country: "United Kingdom", vat_number: "GB 215421643" }));
    expect(d?.piva).toBe("VAT GB 215421643");
  });

  it("una società italiana ha una P.IVA", () => {
    const d = datiEmittente(societa({ country: "Italia", vat_number: "01234567890" }));
    expect(d?.piva).toBe("P.IVA 01234567890");
  });

  it.each(["Italy", "IT", " italia ", "ITALIA"])("«%s» è comunque l'Italia", (paese) => {
    expect(datiEmittente(societa({ country: paese, vat_number: "1" }))?.piva).toBe("P.IVA 1");
  });

  it("senza paese si sta sul generale: VAT", () => {
    // Non è un ripiego neutro ed è voluto: le società estere sono la
    // maggioranza dei casi, e l'unica registrata oggi è britannica.
    expect(datiEmittente(societa({ vat_number: "123" }))?.piva).toBe("VAT 123");
  });

  it.each(["VAT GB 215421643", "P.IVA 01234567890", "p.iva 999", "vat gb 1"])(
    "non raddoppia la sigla se c'è già: %s",
    (numero) => {
      expect(datiEmittente(societa({ country: "Italia", vat_number: numero }))?.piva).toBe(numero);
    },
  );

  it("senza numero la riga resta vuota, non diventa una sigla sola", () => {
    // «VAT » da solo nel piede sarebbe peggio del vuoto: sembra un dato.
    expect(datiEmittente(societa({ country: "Italia", vat_number: null }))?.piva).toBe("");
    expect(datiEmittente(societa({ vat_number: "   " }))?.piva).toBe("");
  });
});

describe("datiEmittente — il resto del piede", () => {
  it("l'indirizzo è una riga sola, nell'ordine in cui si legge", () => {
    const d = datiEmittente(
      societa({
        address: "The Shrubberies, George Lane",
        postal_code: "E18 1BD",
        city: "London",
        country: "United Kingdom",
      }),
    );
    expect(d?.indirizzo).toBe("The Shrubberies, George Lane, E18 1BD, London, United Kingdom");
  });

  it("i campi vuoti non lasciano virgole appese", () => {
    const d = datiEmittente(societa({ address: "Via Roma 1", city: "Milano" }));
    expect(d?.indirizzo).toBe("Via Roma 1, Milano");
  });

  it("nessuna società scelta: niente piede, e il servizio userà il suo ripiego", () => {
    expect(datiEmittente(null)).toBeNull();
    expect(datiEmittente(undefined)).toBeNull();
  });
});

describe("datiEmittente — le coordinate bancarie della fattura", () => {
  it("passa banca, conto, IBAN e BIC così come sono in anagrafica", () => {
    // Nessuna riscrittura: un IBAN «normalizzato» da noi è un IBAN che
    // qualcuno ha cambiato senza dirlo a nessuno.
    const d = datiEmittente(
      societa({
        bank_name: "HSBC London Bridge Branch",
        bank_account: "76185988",
        iban: "GB52 HBUK 4012 7676 1859 88",
        bic: "HBUKGB4B",
      }),
    );
    expect(d).toMatchObject({
      banca: "HSBC London Bridge Branch",
      conto: "76185988",
      iban: "GB52 HBUK 4012 7676 1859 88",
      bic: "HBUKGB4B",
    });
  });

  it("una società senza banca non inventa niente", () => {
    const d = datiEmittente(societa({ country: "Italia" }));
    expect([d?.banca, d?.conto, d?.iban, d?.bic]).toEqual(["", "", "", ""]);
  });
});
