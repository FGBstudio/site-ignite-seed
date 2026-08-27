import { describe, it, expect } from "vitest";
import { surnameFirst, displayPersonName, byPersonName } from "@/lib/personName";

describe("surnameFirst", () => {
  it("mette il cognome davanti", () => {
    expect(surnameFirst("Laura Braghieri")).toBe("Braghieri Laura");
    expect(surnameFirst("Muthu Sundaresan")).toBe("Sundaresan Muthu");
  });

  it("tiene insieme le particelle del cognome", () => {
    expect(surnameFirst("Micaela De Carlo")).toBe("De Carlo Micaela");
    expect(surnameFirst("Jan van der Berg")).toBe("van der Berg Jan");
  });

  it("non tocca chi ha una parola sola", () => {
    expect(surnameFirst("monitoring")).toBe("monitoring");
    expect(surnameFirst("")).toBe("");
    expect(surnameFirst(null)).toBe("");
  });

  it("regge gli spazi in eccesso", () => {
    expect(surnameFirst("  Karla   Cardoso ")).toBe("Cardoso Karla");
  });

  it("non e' idempotente, e va applicato una volta sola", () => {
    // Documenta la trappola: il nome arriva gia' convertito da
    // useAdminPlannerData, quindi chi lo consuma non deve riconvertirlo.
    expect(surnameFirst(surnameFirst("Laura Braghieri"))).toBe("Laura Braghieri");
  });
});

describe("displayPersonName", () => {
  it("ripiega sull'indirizzo quando il nome manca", () => {
    expect(displayPersonName(null, "g.denegri@fgb-studio.com")).toBe("g.denegri");
    expect(displayPersonName("", "monitoring@fgb-studio.com")).toBe("monitoring");
  });

  it("preferisce sempre il nome all'indirizzo", () => {
    expect(displayPersonName("Cecilia Ferrante", "c.ferrante@fgb-studio.com")).toBe("Ferrante Cecilia");
  });

  it("non lascia mai una cella vuota", () => {
    expect(displayPersonName(null, null)).toBe("—");
  });
});

describe("byPersonName", () => {
  it("ordina per cognome ignorando maiuscole e accenti", () => {
    const names = ["Sundaresan Muthu", "De Carlo Micaela", "braghieri Laura", "Àbate Anna"];
    expect([...names].sort(byPersonName)).toEqual([
      "Àbate Anna",
      "braghieri Laura",
      "De Carlo Micaela",
      "Sundaresan Muthu",
    ]);
  });
});
