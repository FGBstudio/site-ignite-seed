import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { firmaBadge, codiceBadge, minutoCorrente, FORMA_BADGE } from "./badgeFirma";

/**
 * Queste prove servono a una cosa sola: che la firma prodotta dal telefono sia
 * identica a quella che il database rifa' per confrontarla. Se le due meta'
 * divergono di un carattere, nessuno timbra piu' — e non lo si scopre qui, lo
 * si scopre alle otto e mezza con venti persone in fila.
 *
 * Il termine di paragone non e' la nostra funzione: e' un HMAC calcolato da
 * `node:crypto`, cioe' da un'altra implementazione, come fa Postgres con
 * `extensions.hmac`.
 */

const SEGRETO = "hr_0123456789abcdef0123456789abcdef";
const BADGE = "aabbccddeeff00112233445566778899";

/** Lo stesso conto che fa `hr_timbra`, fatto da un'altra libreria. */
function firmaAttesa(segreto: string, minuto: number) {
  return createHmac("sha256", segreto).update(String(minuto)).digest("hex").slice(0, 10);
}

describe("la firma del badge", () => {
  it("coincide con l'HMAC che ricalcola il database", async () => {
    for (const minuto of [0, 1, 29_000_000, 29_123_456]) {
      expect(await firmaBadge(SEGRETO, minuto)).toBe(firmaAttesa(SEGRETO, minuto));
    }
  });

  it("e' dieci caratteri esadecimali, non di piu'", async () => {
    const f = await firmaBadge(SEGRETO, 29_000_000);
    expect(f).toMatch(/^[0-9a-f]{10}$/);
  });

  it("cambia a ogni minuto", async () => {
    const a = await firmaBadge(SEGRETO, 29_000_000);
    const b = await firmaBadge(SEGRETO, 29_000_001);
    expect(a).not.toBe(b);
  });

  it("cambia se cambia il segreto: due badge non firmano uguale", async () => {
    const a = await firmaBadge(SEGRETO, 29_000_000);
    const b = await firmaBadge("hr_ffffffffffffffffffffffffffffffff", 29_000_000);
    expect(a).not.toBe(b);
  });
});

describe("il codice nel QR", () => {
  it("ha la forma che il varco accetta", async () => {
    const codice = await codiceBadge({ id: BADGE, segreto: SEGRETO }, 29_000_000);
    expect(codice).toMatch(FORMA_BADGE);
  });

  it("non contiene il segreto: e' il motivo per cui si puo' mostrare", async () => {
    const codice = await codiceBadge({ id: BADGE, segreto: SEGRETO }, 29_000_000);
    expect(codice).not.toContain(SEGRETO);
    // Nemmeno un pezzo riconoscibile: se ci fosse, una fotografia basterebbe.
    expect(codice).not.toContain(SEGRETO.slice(3, 15));
  });

  it("porta minuto e badge in chiaro, cosi' il varco sa cosa verificare", async () => {
    const codice = await codiceBadge({ id: BADGE, segreto: SEGRETO }, 29_000_000);
    const [prefisso, badge, minuto, firma] = codice.split(".");
    expect(prefisso).toBe("hr1");
    expect(badge).toBe(BADGE);
    expect(minuto).toBe("29000000");
    expect(firma).toBe(firmaAttesa(SEGRETO, 29_000_000));
  });

  it("il codice di un minuto fa e' diverso da quello di adesso", async () => {
    const m = minutoCorrente();
    const adesso = await codiceBadge({ id: BADGE, segreto: SEGRETO }, m);
    const prima = await codiceBadge({ id: BADGE, segreto: SEGRETO }, m - 1);
    expect(adesso).not.toBe(prima);
  });
});

describe("la forma che il varco rifiuta", () => {
  it("rifiuta il vecchio token statico", () => {
    expect(FORMA_BADGE.test(SEGRETO)).toBe(false);
  });

  it("rifiuta un QR qualunque", () => {
    expect(FORMA_BADGE.test("Matteo Martignoni")).toBe(false);
    expect(FORMA_BADGE.test("https://example.com")).toBe(false);
  });

  it("rifiuta una firma troncata o allungata", () => {
    expect(FORMA_BADGE.test(`hr1.${BADGE}.29000000.abc`)).toBe(false);
    expect(FORMA_BADGE.test(`hr1.${BADGE}.29000000.abcdefabcdef`)).toBe(false);
  });
});

describe("il minuto", () => {
  it("avanza di uno ogni sessanta secondi", () => {
    const m = minutoCorrente();
    expect(Number.isInteger(m)).toBe(true);
    expect(Math.floor((Date.now() + 60_000) / 60_000)).toBe(m + 1);
  });
});
