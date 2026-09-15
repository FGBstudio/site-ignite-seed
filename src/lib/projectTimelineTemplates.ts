/**
 * I template standard della PROJECT TIMELINE — v1.1 §4.
 *
 * Derivati dai file reali allegati alla specifica (Boucheron Almaty, Grand
 * Vespucci, il cronoprogramma greco, Metro Pontedera). Sono proposte di
 * compilazione, non schemi: il PM aggiunge, toglie, rinomina. Le righe con
 * `ancora` sono le ancore FGB di default — quelle a cui la HQ FGB TIMELINE
 * si aggancia — e l'handover e' sempre ancora.
 *
 * Qui non c'e' I/O: pura definizione, come quotationBudget e paymentSchemes.
 */

import type { CronoAncora } from "@/types/cronoprogramma";

export type ProjectTipo = "design_construction" | "construction" | "existing";
export type Famiglia = "design" | "permitting" | "construction" | "terze_parti";

export const PROJECT_TIPO_LABEL: Record<ProjectTipo, string> = {
  design_construction: "DESIGN+CONSTRUCTION",
  construction: "CONSTRUCTION",
  existing: "EXISTING",
};

export const PROJECT_TIPO_DESC: Record<ProjectTipo, string> = {
  design_construction: "Progettazione, permessi e realizzazione.",
  construction: "Sola fase di costruzione: consulenza al GC su un cantiere altrui.",
  existing: "Edificio in esercizio: nessuna PROJECT TIMELINE, si va dritti alla HQ FGB TIMELINE.",
};

export const FAMIGLIA_LABEL: Record<Famiglia, string> = {
  design: "Design",
  permitting: "Permitting",
  construction: "Construction",
  terze_parti: "Terze parti",
};

export interface TemplateRiga {
  nome: string;
  /** Una fase ha durata; una milestone e' un istante. */
  fase: boolean;
  famiglia: Famiglia | null;
  /** L'ancora FGB, dove la riga coincide con una delle otto canoniche. */
  ancora: CronoAncora | null;
  nota?: string;
}

/** Template IDC (retail fit-out) — da bou_almathy.png, Boucheron Almaty. */
const TEMPLATE_IDC: TemplateRiga[] = [
  { nome: "Kick-off (criteria package, store committee)", fase: true,  famiglia: "design",       ancora: "lancio_gara", nota: "ancora di default: apre il percorso" },
  { nome: "Schematic Design (SD)",                        fase: true,  famiglia: "design",       ancora: null },
  { nome: "Design Development (DD)",                      fase: true,  famiglia: "design",       ancora: null },
  { nome: "Construction Documents (CD)",                  fase: true,  famiglia: "design",       ancora: "progetto_definitivo", nota: "fine CD = design freeze" },
  { nome: "Tender",                                       fase: true,  famiglia: "design",       ancora: "aggiudicazione_gc",  nota: "chiusura = aggiudicazione" },
  { nome: "Pre-construction (preparazione GC, millwork, trasporto)", fase: true, famiglia: "construction", ancora: null },
  { nome: "Construction start",                           fase: false, famiglia: "construction", ancora: "construction_start" },
  { nome: "Mid-construction",                             fase: false, famiglia: "construction", ancora: null },
  { nome: "Construction end",                             fase: false, famiglia: "construction", ancora: "sito_pronto_test" },
  { nome: "Handover",                                     fase: false, famiglia: "construction", ancora: "handover", nota: "da Quotation" },
  { nome: "Opening",                                      fase: false, famiglia: "construction", ancora: null },
  { nome: "Snag list",                                    fase: true,  famiglia: "construction", ancora: null },
];

/** Template BDC (DESIGN+CONSTRUCTION) — da Grand Vespucci + xlsx greco. */
const TEMPLATE_BDC: TemplateRiga[] = [
  { nome: "Concept design + review",                      fase: true,  famiglia: "design",       ancora: null },
  { nome: "Developed design (RIBA st.3) + review",        fase: true,  famiglia: "design",       ancora: "progetto_definitivo", nota: "fine = design freeze" },
  { nome: "Detailed design (RIBA st.4) + review",         fase: true,  famiglia: "design",       ancora: null },
  { nome: "Permessi: submission → approvazione",          fase: true,  famiglia: "permitting",   ancora: "lancio_gara", nota: "SCIA / building permit / ambientali" },
  { nome: "Iter terze parti (soprintendenza, municipalità, enti)", fase: true, famiglia: "terze_parti", ancora: null },
  { nome: "Tender / D&B tendering",                       fase: true,  famiglia: "design",       ancora: "aggiudicazione_gc", nota: "aggiudicazione" },
  { nome: "Long-lead procurement",                        fase: true,  famiglia: "construction", ancora: null },
  { nome: "Mobilisation / consegna aree",                 fase: false, famiglia: "construction", ancora: null },
  { nome: "Construction start",                           fase: false, famiglia: "construction", ancora: "construction_start" },
  { nome: "Strutture / involucro",                        fase: true,  famiglia: "construction", ancora: "involucro_chiuso" },
  { nome: "Impianti",                                     fase: true,  famiglia: "construction", ancora: "impianti_pronti", nota: "fine = impianti pronti per test" },
  { nome: "Finiture",                                     fase: true,  famiglia: "construction", ancora: "sito_pronto_test", nota: "fine = sito pronto per test" },
  { nome: "Commissioning",                                fase: true,  famiglia: "construction", ancora: null },
  { nome: "Consegna lavori / Handover",                   fase: false, famiglia: "construction", ancora: "handover", nota: "da Quotation" },
];

/**
 * Template CONSTRUCTION — da Metro Pontedera. Sottoinsieme del BDC: da
 * consegna aree a consegna lavori, senza Design e Permitting.
 */
const TEMPLATE_CONSTRUCTION: TemplateRiga[] = TEMPLATE_BDC.filter(
  (r) => r.famiglia === "construction"
);

export const TEMPLATES: Record<Exclude<ProjectTipo, "existing">, TemplateRiga[]> = {
  design_construction: TEMPLATE_BDC,
  construction: TEMPLATE_CONSTRUCTION,
};

/** Il fit-out retail ha un suo template: piu' corto, con le fasi SD/DD/CD. */
export const TEMPLATE_RETAIL_IDC = TEMPLATE_IDC;

export type TemplateKey = "idc" | "bdc" | "construction";

export const TEMPLATE_BY_KEY: Record<TemplateKey, { label: string; righe: TemplateRiga[] }> = {
  idc:          { label: "IDC · retail fit-out",     righe: TEMPLATE_IDC },
  bdc:          { label: "BDC · design+construction", righe: TEMPLATE_BDC },
  construction: { label: "Construction · solo cantiere", righe: TEMPLATE_CONSTRUCTION },
};

/**
 * Cosa proporre per una certificazione, dal suo catalogo.
 *
 * E' una proposta, mai una decisione: il PM la cambia dal selettore. La regola
 * segue la tabella della v1.1 §2 — O+M, In-Use, EB e HSR sono EXISTING; GC
 * Support e Commissioning sono consulenze al cantiere di altri; ID+C e' il
 * fit-out; il resto del cantiere e' design+construction.
 */
export function proponiTipo(certType: string | null, certRating: string | null): {
  tipo: ProjectTipo;
  template: TemplateKey | null;
} {
  const t = `${certType ?? ""} ${certRating ?? ""}`.toLowerCase();

  if (/o\+m|in-use|in use|\beb\b|existing|hsr|occupier/.test(t)) {
    return { tipo: "existing", template: null };
  }
  if (/gc support|commissioning|\bcx\b|pta/.test(t)) {
    return { tipo: "construction", template: "construction" };
  }
  if (/id\+c|idc|interior|retail/.test(t)) {
    return { tipo: "design_construction", template: "idc" };
  }
  return { tipo: "design_construction", template: "bdc" };
}

// ── Il lessico delle ancore ────────────────────────────────────────────────
//
// Serve in due punti: al template (per marcare le righe) e all'import (per
// proporre il mapping quando riconosce i nomi). Multilingua IT/EN, tollerante
// alle varianti: «Consegna lavori», «Handover» e «Construction end» sono lo
// stesso evento scritto da tre imprese diverse.
const LESSICO: Array<{ ancora: CronoAncora; pattern: RegExp }> = [
  { ancora: "handover",            pattern: /handover|consegna (dei )?lavori|fine (dei )?lavori|construction end|delivery|end of works|completion/i },
  // «Consegna aree» resta fuori apposta: in un cantiere e' il giorno in cui il
  // committente consegna il terreno, non l'inizio dei lavori — e nel Metro
  // sono due righe diverse a tre giorni di distanza. Confonderle darebbe al
  // construction start la data sbagliata.
  { ancora: "construction_start",  pattern: /construction start|cantierizzazione|inizio (dei )?lavori|site handover to gc|mobilisation|mobilitazione|start of works|apertura cantiere/i },
  { ancora: "aggiudicazione_gc",   pattern: /aggiudicazion|tender award|award|contract sign|appalto assegnato|d&b tender/i },
  { ancora: "lancio_gara",         pattern: /lancio gara|tender(ing)? (launch|start)|gara d.appalto|invito a offrire|permess|permit|scia\b|building permit/i },
  { ancora: "progetto_definitivo", pattern: /progetto definitivo|developed design|design freeze|construction documents|detailed design|riba st(age)? ?[34]/i },
  { ancora: "impianti_pronti",     pattern: /impianti pronti|systems? ready|mep complet|impianti complet/i },
  { ancora: "involucro_chiuso",    pattern: /involucro|envelope|weathertight|strutture complet|shell complet/i },
  { ancora: "sito_pronto_test",    pattern: /sito pronto|site ready|finiture complet|finish(es)? complet|ready for (performance )?test/i },
];

/** L'ancora FGB che un nome di attivita' fa venire in mente, se ne fa venire in mente una. */
export function riconosciAncora(nome: string): CronoAncora | null {
  for (const { ancora, pattern } of LESSICO) {
    if (pattern.test(nome)) return ancora;
  }
  return null;
}
