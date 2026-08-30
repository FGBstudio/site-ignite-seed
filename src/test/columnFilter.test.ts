import { describe, it, expect } from "vitest";
import { applyColumnFiltersAndSort, type ColFiltersMap } from "@/components/common/ColumnFilter";

interface Riga {
  client: string;
  city: string | null;
  handover: string | null;
}

const RIGHE: Riga[] = [
  { client: "PRADA",   city: "HOUSTON", handover: "2025-02-02" },
  { client: "FENDI",   city: "MILAN",   handover: "2026-04-01" },
  { client: "LOEWE",   city: null,      handover: "2025-12-31" },
  { client: "BOXENGO", city: "ROME",    handover: null },
];

const resolvers = {
  client: (r: Riga) => r.client,
  city: (r: Riga) => r.city ?? "",
  // Come in tabella: leggibile, non ordinabile.
  handover: (r: Riga) => (r.handover ? new Date(r.handover).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : ""),
};

const sortResolvers = {
  handover: (r: Riga) => r.handover ?? "",
};

const noFilter: ColFiltersMap = {};

describe("applyColumnFiltersAndSort · spunte", () => {
  it("senza filtri non tocca niente", () => {
    expect(applyColumnFiltersAndSort(RIGHE, noFilter, null, resolvers)).toHaveLength(4);
  });

  it("tiene solo i valori spuntati", () => {
    const f: ColFiltersMap = { client: { search: "", selectedValues: ["PRADA", "FENDI"] } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers).map(r => r.client))
      .toEqual(["PRADA", "FENDI"]);
  });

  it("un elenco vuoto non lascia passare nessuno", () => {
    const f: ColFiltersMap = { client: { search: "", selectedValues: [] } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers)).toHaveLength(0);
  });

  it("le righe senza valore si spuntano come (Blanks)", () => {
    const f: ColFiltersMap = { city: { search: "", selectedValues: ["(Blanks)"] } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers).map(r => r.client))
      .toEqual(["LOEWE"]);
  });
});

describe("applyColumnFiltersAndSort · la casella di ricerca", () => {
  // Prima restringeva solo l'elenco dei valori: l'imbuto si accendeva
  // sull'intestazione e la tabella restava intera.
  it("filtra le righe, non solo l'elenco dei valori", () => {
    const f: ColFiltersMap = { city: { search: "mil", selectedValues: undefined } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers).map(r => r.client))
      .toEqual(["FENDI"]);
  });

  it("non distingue maiuscole e minuscole", () => {
    const f: ColFiltersMap = { client: { search: "prAdA", selectedValues: undefined } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers)).toHaveLength(1);
  });

  it("cercare in una colonna senza risolutore non svuota la tabella", () => {
    const f: ColFiltersMap = { colonna_inesistente: { search: "xyz", selectedValues: undefined } };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers)).toHaveLength(4);
  });

  it("ricerca e spunte si sommano", () => {
    const f: ColFiltersMap = {
      city: { search: "o", selectedValues: undefined },
      client: { search: "", selectedValues: ["PRADA"] },
    };
    expect(applyColumnFiltersAndSort(RIGHE, f, null, resolvers).map(r => r.client))
      .toEqual(["PRADA"]);
  });
});

describe("applyColumnFiltersAndSort · ordinamento", () => {
  it("ordina per testo nei due versi", () => {
    const asc = applyColumnFiltersAndSort(RIGHE, noFilter, { key: "client", direction: "asc" }, resolvers);
    expect(asc.map(r => r.client)).toEqual(["BOXENGO", "FENDI", "LOEWE", "PRADA"]);
    const desc = applyColumnFiltersAndSort(RIGHE, noFilter, { key: "client", direction: "desc" }, resolvers);
    expect(desc.map(r => r.client)).toEqual(["PRADA", "LOEWE", "FENDI", "BOXENGO"]);
  });

  it("le date si ordinano in cronologia, non in alfabeto", () => {
    // Senza sortResolvers si ordinerebbe "01 Apr 26" prima di "02 Feb 25".
    const asc = applyColumnFiltersAndSort(
      RIGHE, noFilter, { key: "handover", direction: "asc" }, resolvers, sortResolvers,
    );
    expect(asc.map(r => r.handover)).toEqual([null, "2025-02-02", "2025-12-31", "2026-04-01"]);
  });

  it("senza il risolutore dedicato la data sbaglia — e' il motivo per cui esiste", () => {
    const asc = applyColumnFiltersAndSort(RIGHE, noFilter, { key: "handover", direction: "asc" }, resolvers);
    expect(asc.map(r => r.handover)).not.toEqual([null, "2025-02-02", "2025-12-31", "2026-04-01"]);
  });

  it("una chiave di ordinamento sconosciuta lascia l'ordine com'e'", () => {
    const out = applyColumnFiltersAndSort(RIGHE, noFilter, { key: "boh", direction: "asc" }, resolvers);
    expect(out.map(r => r.client)).toEqual(["PRADA", "FENDI", "LOEWE", "BOXENGO"]);
  });
});
