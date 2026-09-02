import { describe, it, expect } from "vitest";
import { isMonitoringOnline, ONLINE_COLOR, PROJECT_STATUS_META } from "@/lib/projectStatus";

describe("isMonitoringOnline", () => {
  it("riconosce Energy e Air che trasmettono", () => {
    expect(isMonitoringOnline({ cert_type: "Energy", cert_level: "Online" })).toBe(true);
    expect(isMonitoringOnline({ cert_type: "Air", cert_level: "Online" })).toBe(true);
  });

  it("non si fa fermare da maiuscole o spazi", () => {
    expect(isMonitoringOnline({ cert_type: "ENERGY", cert_level: " online " })).toBe(true);
    expect(isMonitoringOnline({ cert_type: "air", cert_level: "ONLINE" })).toBe(true);
  });

  it("in attesa non e' online", () => {
    expect(isMonitoringOnline({ cert_type: "Energy", cert_level: "Pending" })).toBe(false);
    expect(isMonitoringOnline({ cert_type: "Air", cert_level: null })).toBe(false);
    expect(isMonitoringOnline({ cert_type: "Air" })).toBe(false);
  });

  it("vale solo per il monitoraggio, non per le certificazioni", () => {
    // Nessuna LEED o WELL puo' avere questo livello — e se un giorno un dato
    // sporco ce lo mettesse, non deve prendersi l'evidenza del traguardo.
    expect(isMonitoringOnline({ cert_type: "LEED", cert_level: "Online" })).toBe(false);
    expect(isMonitoringOnline({ cert_type: "WELL", cert_level: "Online" })).toBe(false);
    expect(isMonitoringOnline({ cert_type: null, cert_level: "Online" })).toBe(false);
  });
});

describe("il colore del traguardo", () => {
  it("l'online non e' lo stesso verde del certificato", () => {
    expect(ONLINE_COLOR).not.toBe(PROJECT_STATUS_META.certified.color);
  });

  it("ed e' il verde acqua del marchio", () => {
    expect(ONLINE_COLOR.toLowerCase()).toBe("#009193");
  });
});
