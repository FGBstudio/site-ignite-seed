import { describe, it, expect } from "vitest";
import {
  classifyProjectStatus,
  countByProjectStatus,
  PROJECT_STATUS_META,
  PROJECT_STATUS_ORDER,
} from "@/lib/projectStatus";
import { macroPhaseOfMilestone } from "@/data/certificationTemplates";

describe("classifyProjectStatus", () => {
  it("certificato vince su tutto, on hold compreso", () => {
    expect(classifyProjectStatus({ setup_status: "certificato", on_hold: true })).toBe("certified");
    expect(classifyProjectStatus({ setup_status: "in_corso", issued_date: "2026-03-01" })).toBe("certified");
  });

  it("l'on hold sospende la fase", () => {
    expect(classifyProjectStatus({ setup_status: "in_corso", on_hold: true, macro_phase: "Construction" }))
      .toBe("on_hold");
  });

  it("prima dell'approvazione c'e' solo l'offerta", () => {
    for (const s of ["potential", "quotation", "quotation_approved"]) {
      expect(classifyProjectStatus({ setup_status: s, macro_phase: "Construction" })).toBe("quotation_phase");
    }
  });

  it("dopo l'approvazione comanda la fase di lavoro", () => {
    expect(classifyProjectStatus({ setup_status: "in_corso", macro_phase: "Design" })).toBe("design_phase");
    expect(classifyProjectStatus({ setup_status: "in_corso", macro_phase: "Construction" })).toBe("construction_phase");
    expect(classifyProjectStatus({ setup_status: "in_corso", macro_phase: "Certification" }))
      .toBe("certification_in_progress");
  });

  it("senza fase nota si parte dalla progettazione", () => {
    expect(classifyProjectStatus({ setup_status: "da_configurare" })).toBe("design_phase");
    expect(classifyProjectStatus({})).toBe("design_phase");
  });
});

describe("countByProjectStatus", () => {
  it("assegna ogni progetto a uno stato solo, e la somma torna", () => {
    const projects = [
      { setup_status: "certificato" },
      { setup_status: "in_corso", on_hold: true },
      { setup_status: "quotation" },
      { setup_status: "in_corso", macro_phase: "Construction" },
      { setup_status: "in_corso", macro_phase: "Certification" },
      { setup_status: "da_configurare" },
    ];
    const counts = countByProjectStatus(projects);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(projects.length);
    expect(counts.certified).toBe(1);
    expect(counts.on_hold).toBe(1);
    expect(counts.quotation_phase).toBe(1);
    expect(counts.construction_phase).toBe(1);
    expect(counts.certification_in_progress).toBe(1);
    expect(counts.design_phase).toBe(1);
  });

  it("restituisce sempre tutte e sei le voci, anche a zero", () => {
    const counts = countByProjectStatus([]);
    expect(Object.keys(counts).sort()).toEqual([...PROJECT_STATUS_ORDER].sort());
  });
});

describe("PROJECT_STATUS_META", () => {
  it("ha un colore distinto per ogni stato", () => {
    const colors = PROJECT_STATUS_ORDER.map((s) => PROJECT_STATUS_META[s].color);
    expect(new Set(colors).size).toBe(PROJECT_STATUS_ORDER.length);
  });

  it("copre l'ordine di visualizzazione senza buchi", () => {
    for (const s of PROJECT_STATUS_ORDER) {
      expect(PROJECT_STATUS_META[s].label).toBeTruthy();
    }
  });
});

describe("macroPhaseOfMilestone", () => {
  // I nomi sono quelli veri caricati in cert_timeline_steps: la vecchia tabella
  // per nome esatto ne riconosceva una manciata e mandava tutto in "Design".
  it("riconosce le milestone di certificazione", () => {
    expect(macroPhaseOfMilestone("LEED Project Submission")).toBe("Certification");
    expect(macroPhaseOfMilestone("BREEAM Certification Attainment")).toBe("Certification");
    expect(macroPhaseOfMilestone("WELL Performance Verification Results")).toBe("Certification");
    expect(macroPhaseOfMilestone("GC Provides Closed-out Documentation")).toBe("Certification");
    expect(macroPhaseOfMilestone("WiredScore Auditor Site Visit")).toBe("Certification");
  });

  it("riconosce le milestone di cantiere", () => {
    expect(macroPhaseOfMilestone("Construction Start")).toBe("Construction");
    expect(macroPhaseOfMilestone("Construction End (Handover)")).toBe("Construction");
    expect(macroPhaseOfMilestone("LEED GC Training")).toBe("Construction");
    expect(macroPhaseOfMilestone("QlAir Shipment")).toBe("Construction");
    expect(macroPhaseOfMilestone("Final Construction Credits Completed")).toBe("Construction");
  });

  it("riconosce le milestone di progettazione", () => {
    expect(macroPhaseOfMilestone("Pre-assessment")).toBe("Design");
    expect(macroPhaseOfMilestone("FGB Sustainability Guidelines")).toBe("Design");
    expect(macroPhaseOfMilestone("FGB Tendering Requirements")).toBe("Design");
  });

  it("non si fa fermare dalle maiuscole", () => {
    expect(macroPhaseOfMilestone("leed gc training")).toBe("Construction");
    expect(macroPhaseOfMilestone("LEED GC TRAINING")).toBe("Construction");
  });

  it("davanti a un nome sconosciuto non inventa una fase avanzata", () => {
    expect(macroPhaseOfMilestone("Qualcosa di mai visto")).toBe("Design");
    expect(macroPhaseOfMilestone(null)).toBe("Design");
  });
});
