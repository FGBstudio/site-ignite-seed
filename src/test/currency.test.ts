import { describe, it, expect } from "vitest";
import { formatMoney, eurEquivalent, currencySymbol } from "@/lib/currency";

describe("formatMoney", () => {
  it("mette il simbolo davanti al numero", () => {
    expect(formatMoney(20000, "EUR")).toBe("€20,000");
    expect(formatMoney(20000, "GBP")).toBe("£20,000");
    expect(formatMoney(20000, "CNY")).toBe("¥20,000");
  });

  it("stacca il simbolo quando e' un codice e non un simbolo", () => {
    expect(formatMoney(1000, "CHF")).toBe("CHF 1,000");
  });

  it("ripiega sull'euro quando la valuta manca", () => {
    expect(formatMoney(500, null)).toBe("€500");
    expect(formatMoney(500, undefined)).toBe("€500");
  });

  it("usa il codice come simbolo per una valuta che non conosce", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ");
    expect(formatMoney(10, "XYZ")).toBe("XYZ 10");
  });

  it("un importo assente e' un trattino, non uno zero", () => {
    expect(formatMoney(null, "EUR")).toBe("—");
    expect(formatMoney(undefined, "GBP")).toBe("—");
    // Zero e' un importo vero e va scritto.
    expect(formatMoney(0, "EUR")).toBe("€0");
  });
});

describe("eurEquivalent", () => {
  it("converte moltiplicando per il cambio verso l'euro", () => {
    // 1 GBP = 1,168 EUR -> 20.000 GBP fanno 23.360 EUR.
    expect(eurEquivalent(20000, "GBP", 1.168)).toBe("≈ €23,360");
  });

  it("tace su un'offerta gia' in euro", () => {
    expect(eurEquivalent(20000, "EUR", 1)).toBeNull();
  });

  it("tace quando non c'e' niente da convertire", () => {
    expect(eurEquivalent(null, "GBP", 1.168)).toBeNull();
    expect(eurEquivalent(20000, "GBP", null)).toBeNull();
    // Un cambio a zero renderebbe zero ogni importo: meglio non dire niente.
    expect(eurEquivalent(20000, "GBP", 0)).toBeNull();
  });

  it("non si fa ingannare dalle minuscole", () => {
    expect(eurEquivalent(100, "eur", 1)).toBeNull();
    expect(eurEquivalent(100, "gbp", 1.168)).toBe("≈ €117");
  });
});
