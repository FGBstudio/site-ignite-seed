import { describe, expect, it } from "vitest";
import { ALTEZZA_APPUNTO, ALTEZZA_GANTT, altezzaRiga } from "./appuntiSettimana";

/**
 * L'altezza della riga di un progetto.
 *
 * Il caso che conta è il progetto con molti appunti sparsi: se si sommassero
 * tutti, una riga con venti appunti su venti settimane diventerebbe alta venti
 * righe, e la pagina sarebbe tutta spazio bianco.
 */

const a = (settimana: string) => ({ settimana });

describe("altezzaRiga", () => {
  it("senza appunti la riga è la fascia del Gantt e basta", () => {
    expect(altezzaRiga([])).toBe(ALTEZZA_GANTT);
  });

  it("un appunto aggiunge una riga", () => {
    expect(altezzaRiga([a("2026-W40")])).toBe(ALTEZZA_GANTT + ALTEZZA_APPUNTO + 4);
  });

  it("tre appunti nella stessa settimana si impilano: tre righe", () => {
    expect(altezzaRiga([a("2026-W40"), a("2026-W40"), a("2026-W40")])).toBe(
      ALTEZZA_GANTT + 3 * ALTEZZA_APPUNTO + 4,
    );
  });

  it("appunti su settimane diverse stanno uno accanto all'altro: una riga sola", () => {
    // È il conto che evita la pagina tutta vuota.
    expect(altezzaRiga([a("2026-W40"), a("2026-W41"), a("2026-W42")])).toBe(
      ALTEZZA_GANTT + ALTEZZA_APPUNTO + 4,
    );
  });

  it("conta la settimana più carica, non la prima", () => {
    const appunti = [a("2026-W40"), a("2026-W41"), a("2026-W41"), a("2026-W41")];
    expect(altezzaRiga(appunti)).toBe(ALTEZZA_GANTT + 3 * ALTEZZA_APPUNTO + 4);
  });

  it("venti appunti su venti settimane restano una riga", () => {
    const appunti = Array.from({ length: 20 }, (_, i) => a(`2026-W${String(i + 10)}`));
    expect(altezzaRiga(appunti)).toBe(ALTEZZA_GANTT + ALTEZZA_APPUNTO + 4);
  });
});
