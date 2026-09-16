import { describe, expect, it } from "vitest";
import { distribuisci, quotaPerData } from "@/lib/distribuzioneVerticale";

/**
 * L'allineamento temporale fra le due colonne della vista Timeline.
 *
 * La colonna PROGETTO detta l'asse a passo fisso; ogni passo di
 * certificazione si posiziona dove cade la sua data fra le tappe del
 * cantiere. Questi test difendono proprio quella relazione: e' la risposta
 * alla domanda «mentre succede questo, a che punto e' il cantiere?».
 */

describe("quotaPerData", () => {
  const date = ["2026-01-01", "2026-07-01", "2027-01-01"];
  const quote = [100, 300, 500];

  it("una data che coincide con una tappa ne prende la quota", () => {
    expect(quotaPerData("2026-01-01", date, quote)).toBe(100);
    expect(quotaPerData("2026-07-01", date, quote)).toBe(300);
    expect(quotaPerData("2027-01-01", date, quote)).toBe(500);
  });

  it("a meta' strada fra due tappe sta a meta' altezza", () => {
    // 1 gen → 1 lug: il 1 aprile e' circa a meta'.
    const y = quotaPerData("2026-04-01", date, quote)!;
    expect(y).toBeGreaterThan(190);
    expect(y).toBeLessThan(210);
  });

  it("la data del 15 marzo 27 finisce in fondo, non in cima", () => {
    // E' il caso concreto: un passo di certificazione che parte dopo la fine
    // del cantiere non deve comparire allineato alla prima attivita'.
    expect(quotaPerData("2027-03-15", date, quote)).toBe(500);
  });

  it("fuori dall'intervallo si appoggia agli estremi", () => {
    expect(quotaPerData("2020-01-01", date, quote)).toBe(100);
    expect(quotaPerData("2099-01-01", date, quote)).toBe(500);
  });

  it("con una sola tappa o nessuna non inventa una scala", () => {
    expect(quotaPerData("2026-05-01", ["2026-01-01"], [100])).toBe(100);
    expect(quotaPerData("2026-05-01", [], [])).toBeNull();
  });

  it("due tappe lo stesso giorno non dividono per zero", () => {
    expect(quotaPerData("2026-01-01", ["2026-01-01", "2026-01-01"], [100, 200])).toBe(100);
  });
});

describe("distribuisci — l'allineamento non fa accavallare", () => {
  it("due passi ravvicinati nel tempo restano leggibili", () => {
    // Due milestone a tre giorni di distanza avrebbero quote quasi identiche:
    // l'allineamento temporale da solo le sovrapporrebbe.
    const out = distribuisci([300, 303], 120, 100, 900);
    expect(Math.abs(out[1] - out[0])).toBeGreaterThanOrEqual(119);
    expect(out[0]).toBeLessThan(out[1]);
  });

  it("lo scarto si divide, non si scarica sull'ultimo", () => {
    const out = distribuisci([400, 400, 400], 100, 0, 1000);
    const centro = out.reduce((a, b) => a + b, 0) / out.length;
    expect(Math.abs(centro - 400)).toBeLessThan(1);
  });
});
