import { beforeEach, describe, expect, it } from "vitest";
import { nomeSchema, registraEtichetteSchemi } from "./nomeSchema";

/**
 * I nomi degli schemi.
 *
 * Il difetto da cui veniamo non dava errori: uno schema senza etichetta compariva
 * col proprio codice in una tendina commerciale, e nessun test lo notava perché
 * la mappa era in quattro copie e nessuna era la verità.
 */
describe("nomeSchema", () => {
  beforeEach(() => registraEtichetteSchemi({}));

  it("usa l'etichetta del catalogo quando c'è", () => {
    registraEtichetteSchemi({ Energy: "Energy — Greeny" });
    expect(nomeSchema("Energy")).toBe("Energy — Greeny");
  });

  it("senza catalogo almeno togliere gli underscore", () => {
    // Prima del caricamento, o per un codice che il catalogo non conosce.
    expect(nomeSchema("WELL_GC_Support")).toBe("WELL GC Support");
    expect(nomeSchema("MEP_Commissioning")).toBe("MEP Commissioning");
  });

  it("un codice senza underscore resta se stesso", () => {
    expect(nomeSchema("LEED")).toBe("LEED");
  });

  it("niente dentro, niente fuori", () => {
    // Un progetto senza tipo esiste: non deve stampare «null».
    expect(nomeSchema(null)).toBe("");
    expect(nomeSchema(undefined)).toBe("");
    expect(nomeSchema("")).toBe("");
  });

  it("registrare di nuovo sostituisce, non accumula", () => {
    registraEtichetteSchemi({ A: "Alfa" });
    registraEtichetteSchemi({ B: "Beta" });
    expect(nomeSchema("B")).toBe("Beta");
    expect(nomeSchema("A")).toBe("A");
  });
});
