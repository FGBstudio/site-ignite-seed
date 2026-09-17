import { describe, expect, it } from "vitest";
import { inizialiPersona, nomePersona, nomePuntato } from "@/lib/nomePersona";

/**
 * Il difetto che questi test bloccano: `display_name` saltato.
 *
 * Su 28 profili, 13 hanno il nome SOLO in `display_name`. Leggendo
 * `full_name || email` — com'era in diciannove punti dell'app — quelle 13
 * persone comparivano col loro indirizzo di posta accanto a colleghi che
 * comparivano col nome.
 */

describe("nomePersona", () => {
  it("il nome anagrafico viene prima di tutto", () => {
    expect(
      nomePersona({ full_name: "Shikha Gadru", display_name: "shikha", email: "s.gadru@fgb-studio.com" })
    ).toBe("Shikha Gadru");
  });

  it("senza full_name usa display_name — il caso dei 13 profili", () => {
    expect(
      nomePersona({ full_name: null, display_name: "Matteo Martignoni", email: "m.martignoni@fgb-studio.com" })
    ).toBe("Matteo Martignoni");
  });

  it("senza nessun nome ricostruisce dalla casella invece di mostrare l'email", () => {
    expect(nomePersona({ email: "m.martignoni@fgb-studio.com" })).toBe("M. Martignoni");
    expect(nomePersona({ email: "alice.rinaldi@boucheron.com" })).toBe("Alice Rinaldi");
    expect(nomePersona({ email: "store.manager@fendi.com" })).toBe("Store Manager");
  });

  it("una casella di servizio si maiuscola, non le si inventa un cognome", () => {
    expect(nomePersona({ email: "monitoring@fgb-studio.com" })).toBe("Monitoring");
  });

  it("le caselle con numeri restano email: meglio brutte che ambigue", () => {
    expect(nomePersona({ email: "user12345@x.com" })).toBe("user12345@x.com");
  });

  it("i vuoti e gli spazi non contano come nome", () => {
    expect(nomePersona({ full_name: "   ", display_name: "Vero Nome" })).toBe("Vero Nome");
    expect(nomePersona({ full_name: "", display_name: "", email: "" })).toBe("—");
    expect(nomePersona(null)).toBe("—");
    expect(nomePersona(undefined)).toBe("—");
  });

  it("non restituisce mai vuoto: una riga senza nome sembra un errore", () => {
    expect(nomePersona({}).length).toBeGreaterThan(0);
  });
});

describe("inizialiPersona", () => {
  it("prima e ultima lettera del nome risolto", () => {
    expect(inizialiPersona({ full_name: "Shikha Gadru" })).toBe("SG");
    expect(inizialiPersona({ display_name: "Matteo Martignoni" })).toBe("MM");
  });

  it("passa dal nome risolto anche partendo dall'email", () => {
    // Senza questo, un avatar mostra «MM» e quello accanto «m.».
    expect(inizialiPersona({ email: "m.martignoni@fgb-studio.com" })).toBe("MM");
  });

  it("un nome solo da' due lettere", () => {
    expect(inizialiPersona({ full_name: "Monitoring" })).toBe("MO");
  });

  it("senza niente non esplode", () => {
    expect(inizialiPersona(null)).toBe("?");
    expect(inizialiPersona({})).toBe("?");
  });
});

describe("nomePuntato", () => {
  it("accorcia il nome proprio e tiene il cognome intero", () => {
    expect(nomePuntato({ full_name: "Marco Rossi" })).toBe("M. Rossi");
    expect(nomePuntato({ full_name: "Maria Luisa De Santis" })).toBe("M. Luisa De Santis");
  });

  it("un nome solo resta intero", () => {
    expect(nomePuntato({ full_name: "Monitoring" })).toBe("Monitoring");
  });
});
