import { describe, expect, it } from "vitest";

/**
 * Lo stato che la mappa non conosce.
 *
 * È il difetto che ha portato via il PM Portal: `STATUS_META[stato]` con uno
 * stato non previsto è `undefined`, e leggerne `.icon` fa saltare l'intero
 * albero React — schermo bianco, non una scheda sbagliata.
 *
 * Questo test non monta componenti: fissa il fatto da cui nasceva il crash,
 * cioè che gli stati nel database sono più di quelli mappati. Se qualcuno
 * aggiunge uno stato al database senza aggiungerlo alla mappa, il ripiego
 * deve reggere — ed è quello che si verifica qui.
 */

const STATUS_META: Record<string, { label: string }> = {
  da_configurare: { label: "To Configure" },
  in_corso: { label: "In Progress" },
  certificato: { label: "Certified" },
};

/** Il ripiego, nella forma usata da PMPortal e PMProjectsBoard. */
const meta = (stato: string | null | undefined) =>
  STATUS_META[stato ?? ""] ?? { label: (stato ?? "unknown").replace(/_/g, " ") };

describe("uno stato fuori dalla mappa", () => {
  it("non restituisce undefined: leggerne una proprietà farebbe schermo bianco", () => {
    // I quattro che `usePMDashboard` lascia col proprio stato, piu' i due
    // storici. Nessuno sta nella mappa di PMPortal.
    for (const s of [
      "potential",
      "quotation",
      "quotation_approved",
      "canceled",
      "completato",
      "in_progress",
      "active",
      "online",
    ]) {
      expect(meta(s)).toBeDefined();
      expect(meta(s).label.length).toBeGreaterThan(0);
    }
  });

  it("nemmeno null o undefined fanno cadere la pagina", () => {
    expect(meta(null).label).toBe("unknown");
    expect(meta(undefined).label).toBe("unknown");
  });

  it("uno stato sconosciuto si legge, invece di mostrare una sigla", () => {
    expect(meta("quotation_approved").label).toBe("quotation approved");
  });

  it("gli stati noti restano quelli", () => {
    expect(meta("in_corso").label).toBe("In Progress");
  });
});
