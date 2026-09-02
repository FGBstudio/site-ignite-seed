/**
 * Lo stato di un progetto come lo legge chi guarda i report.
 *
 * Prima ogni card se lo calcolava per conto suo: il grafico "Status Breakdown"
 * elencava Late / On Hold / In Progress / To Configure / Quotation / Certified,
 * la card "Legend" un elenco simile ma non identico, e i colori erano scelti
 * separatamente. Due riquadri affiancati che dicevano cose diverse sugli stessi
 * progetti.
 *
 * Qui c'e' un elenco solo, nell'ordine in cui va mostrato, con un colore fisso
 * per stato. Grafico e legenda leggono da qui, quindi non possono divergere.
 *
 * L'elenco segue l'avanzamento reale del lavoro — offerta, progetto, cantiere,
 * certificazione, certificato — con "On Hold" in testa perche' e' l'eccezione
 * che va vista per prima, non una fase.
 */

export type ProjectStatus =
  | "on_hold"
  | "quotation_phase"
  | "design_phase"
  | "construction_phase"
  | "certification_in_progress"
  | "certified";

/**
 * Colori espliciti e non token del tema: il requisito e' che lo stesso stato
 * abbia lo stesso colore ovunque, e i token semantici (primary, warning,
 * success) sono troppo pochi per sei stati e cambiano significato a seconda
 * del contesto in cui vengono usati.
 */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; color: string }
> = {
  on_hold:                  { label: "On Hold",                   color: "#DC2626" },
  quotation_phase:          { label: "Quotation Phase",           color: "#94A3B8" },
  design_phase:             { label: "Design Phase",              color: "#0EA5E9" },
  construction_phase:       { label: "Construction Phase",        color: "#F59E0B" },
  certification_in_progress:{ label: "Certification in Progress", color: "#7C3AED" },
  certified:                { label: "Certified",                 color: "#16A34A" },
};

/** L'ordine di visualizzazione, uguale nel grafico e nella legenda. */
export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "on_hold",
  "quotation_phase",
  "design_phase",
  "construction_phase",
  "certification_in_progress",
  "certified",
];

/** Il minimo che serve per classificare: funziona sia per Operations sia per il PM. */
export interface ClassifiableProject {
  on_hold?: boolean | null;
  setup_status?: string | null;
  issued_date?: string | null;
  macro_phase?: string | null;
}

/**
 * Un progetto di monitoraggio che trasmette.
 *
 * Energy e Air non si certificano: si accendono. "Online" e' il loro
 * traguardo — l'equivalente del certificato per una LEED — ed e' un fatto
 * compiuto, non una scadenza che incombe. Da qui la riga in tinta e la data di
 * consegna che smette di essere un allarme.
 *
 * Il colore e' il verde acqua del marchio invece del verde del certificato:
 * accanto si distinguono, ma si capisce che dicono la stessa cosa.
 */
export const ONLINE_COLOR = "#009193";

export function isMonitoringOnline(p: {
  cert_type?: string | null;
  cert_level?: string | null;
}): boolean {
  const scheme = (p.cert_type ?? "").toLowerCase();
  if (scheme !== "energy" && scheme !== "air") return false;
  return (p.cert_level ?? "").trim().toLowerCase() === "online";
}

/**
 * Un progetto sta in uno stato solo.
 *
 * L'ordine dei controlli e' la regola: certificato vince su tutto perche' e' un
 * fatto compiuto, poi l'on hold perche' e' un'eccezione che sospende la fase, e
 * solo dopo si guarda a che punto e' il lavoro.
 */
export function classifyProjectStatus(p: ClassifiableProject): ProjectStatus {
  // "online" e' il capolinea dei progetti di monitoraggio e conta fra i lavori
  // arrivati: nei sei stati del report non ha una voce sua, e lasciarlo cadere
  // nel ripiego lo farebbe comparire fra quelli ancora in progettazione.
  if (p.setup_status === "certificato" || p.setup_status === "online" || p.issued_date) return "certified";
  if (p.on_hold) return "on_hold";

  // Prima che il progetto sia approvato non c'e' ancora una fase di lavoro:
  // c'e' un'offerta, e basta.
  if (
    p.setup_status === "potential" ||
    p.setup_status === "quotation" ||
    p.setup_status === "quotation_approved"
  ) {
    return "quotation_phase";
  }

  switch (p.macro_phase) {
    case "Certified":     return "certified";
    case "Certification": return "certification_in_progress";
    case "Construction":  return "construction_phase";
    default:              return "design_phase";
  }
}

/** Conta i progetti per stato, restituendo sempre tutte e sei le voci. */
export function countByProjectStatus(
  projects: ClassifiableProject[],
): Record<ProjectStatus, number> {
  const counts = {
    on_hold: 0,
    quotation_phase: 0,
    design_phase: 0,
    construction_phase: 0,
    certification_in_progress: 0,
    certified: 0,
  } as Record<ProjectStatus, number>;
  for (const p of projects) counts[classifyProjectStatus(p)] += 1;
  return counts;
}
