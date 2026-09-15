/**
 * Il sistema colore unico per servizio — v1.2 §1.
 *
 * Un'unica mappa di token, definita qui e usata da tutto il prodotto: tag
 * nelle tabelle, corsie del drill-down, timeline verticale, chip, legende.
 * Nessun componente sceglie colori per conto proprio.
 *
 * Le regole vincolanti:
 *  1. ogni servizio ha una tinta propria, riconoscibile ovunque ricompaia;
 *  2. la project timeline e' neutra — scala di pietra, mai una tinta di
 *     servizio: sfondo neutro, servizi colorati, ed e' cio' che rende
 *     leggibile l'innesto;
 *  3. i servizi di supporto ereditano la tinta della certificazione madre in
 *     variante tratteggiata: dichiara la parentela senza esplodere le tinte;
 *  4. l'ambra e' riservata agli avvisi — mai come tinta di servizio o fase;
 *  5. il colore non e' mai l'unico portatore d'informazione: l'etichetta
 *     testuale c'e' sempre.
 */

export interface TintaServizio {
  /** Testo, tacche, bordi. */
  strong: string;
  /** Riempimento di barre e pill. */
  bg: string;
  /** Stati intermedi. */
  mid: string;
  /** Vero per i servizi di supporto: si rende col bordo tratteggiato. */
  dashed?: boolean;
}

/** La scala di pietra della project timeline: Design → Construction → Certification. */
export const PIETRA = {
  design: "#E7E5DC",
  construction: "#CFCBBD",
  certification: "#A8A47F",
  /** Il quarto stato: certificato. Inchiostro scuro, testo chiaro. */
  certified: "#3A3E35",
  /** Bordo/testo leggibile sulla scala. */
  inchiostro: "#5F5E5A",
} as const;

const FAMIGLIE: Record<string, TintaServizio> = {
  leed:       { strong: "#2F7A4E", bg: "#E3F0E8", mid: "#7FB598" },
  well:       { strong: "#1673B1", bg: "#E2EFF8", mid: "#7AAFD3" },
  breeam:     { strong: "#6E7A1F", bg: "#EFF2DF", mid: "#A9B36A" },
  wiredscore: { strong: "#C0453C", bg: "#FAE7E5", mid: "#DE9A94" },
  tassonomia: { strong: "#5348B8", bg: "#ECEAF9", mid: "#9C93DD" },
  energy:     { strong: "#C25E1D", bg: "#FAEBDE", mid: "#DFA377" },
  air:        { strong: "#147F8C", bg: "#DFF1F3", mid: "#6FB7BF" },
  neutro:     { strong: "#6E6C63", bg: "#EFEEE7", mid: "#A3A199" },
};

/**
 * La tinta di un servizio, dal suo nome o tipo.
 *
 * I supporti (GC Support, Commissioning, PTA) cercano prima la certificazione
 * servita dentro il proprio nome — "LEED GC Support" e' LEED tratteggiato —
 * e ripiegano sul neutro quando sono venduti da soli.
 */
export function tintaServizio(nomeOTipo: string | null | undefined): TintaServizio {
  const t = (nomeOTipo ?? "").toLowerCase();
  const supporto = /gc support|commissioning|\bcx\b|pta|mep|envelope/.test(t);

  let base: TintaServizio;
  if (/leed/.test(t)) base = FAMIGLIE.leed;
  else if (/well/.test(t)) base = FAMIGLIE.well;
  else if (/breeam/.test(t)) base = FAMIGLIE.breeam;
  else if (/wiredscore|wired score/.test(t)) base = FAMIGLIE.wiredscore;
  else if (/tassonomia|taxonomy|csrd|\besg\b|gresb/.test(t)) base = FAMIGLIE.tassonomia;
  else if (/energy|greeny/.test(t)) base = FAMIGLIE.energy;
  else if (/\bair\b|clair|iaq/.test(t)) base = FAMIGLIE.air;
  else base = FAMIGLIE.neutro;

  return supporto ? { ...base, dashed: true } : base;
}

/** Lo stile inline di una pill di servizio: stessa coppia strong/bg ovunque. */
export function stilePill(nomeOTipo: string | null | undefined): React.CSSProperties {
  const c = tintaServizio(nomeOTipo);
  return {
    color: c.strong,
    background: c.bg,
    borderColor: c.strong,
    borderStyle: c.dashed ? "dashed" : "solid",
  };
}
