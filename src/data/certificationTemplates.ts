/**
 * Certification Templates Configuration
 *
 * Elastic system: given a cert_type + rating + optional subtype,
 * returns the correct timeline steps and scorecard categories.
 */

// ─── Shared Types ───

export type TimelineEntryType = "manual_input" | "calculated_deadline";

export interface TimelineStep {
  name: string;
  order_index: number;
  type: TimelineEntryType;
  assigned_to_role: string;
  offset_days?: number;
  description?: string;
}

export interface ScorecardCategory {
  category: string;
  requirement: string;
  max_score: number;
}

export interface CertificationTemplate {
  scorecard: ScorecardCategory[];
  timeline: TimelineStep[];
  label: string;
}

// ─── Helper: convert JSON tasks to TimelineStep[] ───
function toTimeline(
  tasks: Array<{
    order: number;
    task_name: string;
    type: string;
    assigned_to_role: string;
    offset_days?: number;
    description?: string;
  }>
): TimelineStep[] {
  return tasks.map((t) => ({
    name: t.task_name,
    order_index: t.order - 1,
    type: t.type as TimelineEntryType,
    assigned_to_role: t.assigned_to_role,
    ...(t.offset_days != null ? { offset_days: t.offset_days } : {}),
    ...(t.description ? { description: t.description } : {}),
  }));
}

// ─── Helper: convert scorecard JSON entries ───
function toScorecard(
  items: Array<{ category_code: string; requirement_label: string; max_score: number; order_index: number }>
): ScorecardCategory[] {
  return items.map((i) => ({
    category: i.category_code,
    requirement: i.requirement_label,
    max_score: i.max_score,
  }));
}

// ═══════════════════════════════════════════
// TIMELINES
// ═══════════════════════════════════════════

const LEED_BDC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Inserisci la data in cui prevedi di effettuare la prima analisi preliminare del progetto per identificare i crediti LEED perseguibili e il livello target." },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM", description: "Indica quando verranno consegnate le linee guida di progettazione FGB al team di design, includendo i requisiti specifici LEED da integrare nel progetto." },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM", description: "Data di consegna dei requisiti FGB per il capitolato d'appalto, con le specifiche LEED che il General Contractor dovrà rispettare." },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM", description: "Data di inizio della fase di costruzione. Da questo momento il GC dovrà raccogliere tutta la documentazione richiesta per i crediti LEED." },
  { order: 5, task_name: "LEED GC training", type: "manual_input", assigned_to_role: "PM", description: "Sessione di formazione al General Contractor sui requisiti LEED: gestione rifiuti, qualità dell'aria durante la costruzione, documentazione fotografica." },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM", description: "Data prevista per la fine dei lavori e consegna dell'edificio. Questo è il punto di riferimento per le scadenze successive." },
  { order: 7, task_name: "GC Provides Documentation", type: "calculated_deadline", offset_days: 60, assigned_to_role: "GC", description: "Scadenza calcolata automaticamente: il GC ha 60 giorni dall'Handover per fornire tutta la documentazione di cantiere richiesta per la submission LEED." },
  { order: 8, task_name: "LEED Project Submission", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM", description: "Scadenza calcolata automaticamente: 90 giorni dall'Handover per completare e inviare la submission finale a GBCI per la review." },
  { order: 9, task_name: "LEED Certification Attainment", type: "manual_input", offset_days: 180, assigned_to_role: "PM", description: "Data stimata per l'ottenimento della certificazione LEED. Dipende dai tempi di review di GBCI (tipicamente 20-25 giorni lavorativi per round)." },
]);

const LEED_IDC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Analisi preliminare degli spazi interni per identificare i crediti LEED ID+C perseguibili e il livello target di certificazione." },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM", description: "Consegna delle linee guida FGB per il design degli interni, con focus su illuminazione, qualità dell'aria e materiali a basse emissioni." },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM", description: "Requisiti FGB per il capitolato degli interni: specifiche su materiali, arredi, finiture e sistemi MEP conformi a LEED." },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM", description: "Inizio dei lavori di fit-out. Il contractor deve seguire il piano di gestione IAQ e documentare tutti i materiali installati." },
  { order: 5, task_name: "LEED GC training", type: "manual_input", assigned_to_role: "PM", description: "Formazione al contractor sui requisiti specifici LEED per interni: gestione IAQ, VOC dei materiali, waste management." },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM", description: "Fine lavori e consegna degli spazi. Punto di riferimento per le scadenze di documentazione successive." },
  { order: 7, task_name: "GC Provides Documentation", type: "calculated_deadline", offset_days: 30, assigned_to_role: "GC", description: "Il contractor ha 30 giorni dall'Handover per consegnare tutta la documentazione: schede tecniche materiali, report IAQ, certificati." },
  { order: 8, task_name: "LEED Project Submission", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM", description: "60 giorni dall'Handover per completare la submission a GBCI. Include la compilazione di tutti i form online e upload documenti." },
  { order: 9, task_name: "LEED Certification Attainment", type: "manual_input", offset_days: 150, assigned_to_role: "PM", description: "Data stimata per l'ottenimento della certificazione. I tempi di review GBCI sono tipicamente 20-25 giorni lavorativi per round." },
]);

const LEED_OM_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Valutazione preliminare delle performance operative dell'edificio esistente: consumi energetici, idrici, gestione rifiuti e trasporti." },
  { order: 2, task_name: "Reference period", type: "manual_input", assigned_to_role: "PM", description: "Definizione del periodo di riferimento (minimo 12 mesi) per la raccolta dati di performance: bollette energetiche, consumi idrici, dati di occupazione." },
  { order: 3, task_name: "On-site visit", type: "manual_input", assigned_to_role: "PM", description: "Sopralluogo in sito per verificare le condizioni operative, lo stato degli impianti e raccogliere documentazione fotografica." },
  { order: 4, task_name: "LEED Project Submission", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM", description: "60 giorni dalla visita per completare la submission con tutti i dati di performance e la documentazione raccolta." },
  { order: 5, task_name: "LEED Certification Attainment", type: "manual_input", offset_days: 150, assigned_to_role: "PM", description: "Data stimata per l'ottenimento della certificazione O+M. Il processo include la review GBCI e eventuali round di revisione." },
]);

const BREEAM_NC_REFURB_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Analisi preliminare del progetto secondo lo schema BREEAM: identificazione dei crediti obbligatori e opzionali perseguibili." },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM", description: "Consegna delle linee guida FGB al team di progettazione con i requisiti BREEAM da integrare nelle specifiche di design." },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM", description: "Requisiti FGB per il capitolato d'appalto BREEAM: specifiche su materiali responsabili, gestione cantiere, commissioning." },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM", description: "Inizio della fase di costruzione. Il GC deve implementare il Site Waste Management Plan e il Construction Environmental Management Plan." },
  { order: 5, task_name: "BREEAM GC training", type: "manual_input", assigned_to_role: "PM", description: "Formazione al GC sui requisiti BREEAM di cantiere: gestione rifiuti, inquinamento, considerate design, responsible sourcing." },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM", description: "Fine lavori e consegna. L'Assessor dovrà effettuare la visita in sito prima o subito dopo questa data." },
  { order: 7, task_name: "Assessor site visit", type: "manual_input", assigned_to_role: "Assessor", description: "Visita dell'Assessor BREEAM in cantiere per verificare la conformità ai requisiti. Deve avvenire durante o subito dopo la costruzione." },
  { order: 8, task_name: "GC Provides Documentation", type: "calculated_deadline", offset_days: 60, assigned_to_role: "GC", description: "Il GC ha 60 giorni dall'Handover per fornire tutta la documentazione: certificati EPD, report commissioning, waste records." },
  { order: 9, task_name: "Submission to BRE", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM", description: "90 giorni dall'Handover per completare il report dell'Assessor e inviare la submission a BRE per la Quality Assurance." },
  { order: 10, task_name: "BREEAM Certification Attainment", type: "manual_input", offset_days: 150, assigned_to_role: "PM", description: "Data stimata per il rilascio del certificato BREEAM da parte di BRE. I tempi di QA sono tipicamente 4-6 settimane." },
]);

const BREEAM_IU_P1_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Valutazione preliminare dell'asset esistente secondo BREEAM In-Use Part 1: analisi delle caratteristiche fisiche dell'edificio." },
  { order: 2, task_name: "Implementation phase (se dovuta)", type: "manual_input", assigned_to_role: "PM", description: "Fase di implementazione di eventuali miglioramenti all'asset identificati nel pre-assessment. Può essere saltata se non necessaria." },
  { order: 3, task_name: "Implementation end", type: "manual_input", assigned_to_role: "PM", description: "Fine della fase di implementazione. Da questo punto si procede con la raccolta documentale finale." },
  { order: 4, task_name: "On-site visit", type: "manual_input", assigned_to_role: "PM", description: "Sopralluogo per verificare le caratteristiche fisiche dell'edificio e raccogliere evidenze fotografiche per la submission." },
  { order: 5, task_name: "GC Provides Documentation", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client", description: "Il Cliente ha 30 giorni per fornire la documentazione tecnica dell'edificio: planimetrie, specifiche impianti, certificati energetici." },
  { order: 6, task_name: "Submission to BRE", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM", description: "60 giorni per completare la submission sulla piattaforma BREEAM In-Use e inviarla a BRE per la validazione." },
  { order: 10, task_name: "BREEAM Certification Attainment", type: "manual_input", offset_days: 150, assigned_to_role: "PM", description: "Data stimata per il rilascio del certificato BREEAM In-Use Part 1 da parte di BRE." },
]);

const BREEAM_IU_P2_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Valutazione preliminare della gestione operativa dell'edificio secondo BREEAM In-Use Part 2: politiche, procedure e pratiche." },
  { order: 2, task_name: "Docs provided by Client", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client", description: "Il Cliente ha 30 giorni per fornire tutta la documentazione gestionale: politiche ambientali, piani di manutenzione, procedure operative." },
  { order: 3, task_name: "Review docs by FGB", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM", description: "60 giorni per la revisione completa della documentazione gestionale e identificazione di eventuali gap da colmare." },
  { order: 4, task_name: "Implementation phase (se dovuta)", type: "manual_input", assigned_to_role: "PM", description: "Implementazione di miglioramenti alle procedure gestionali identificati nella fase di review. Può essere saltata se non necessaria." },
  { order: 5, task_name: "Closeout documentation", type: "manual_input", assigned_to_role: "PM", description: "Raccolta e finalizzazione di tutta la documentazione necessaria per la submission: evidenze, report, dichiarazioni." },
  { order: 6, task_name: "Submission to BRE", type: "calculated_deadline", offset_days: 30, assigned_to_role: "PM", description: "30 giorni dalla chiusura documentale per completare la submission sulla piattaforma BREEAM In-Use." },
  { order: 10, task_name: "BREEAM Certification Attainment", type: "manual_input", offset_days: 150, assigned_to_role: "PM", description: "Data stimata per il rilascio del certificato BREEAM In-Use Part 2 da parte di BRE." },
]);

const WELL_NC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Analisi preliminare del progetto secondo WELL v2: identificazione delle feature obbligatorie e opzionali per il livello target." },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM", description: "Consegna delle linee guida FGB con i requisiti WELL da integrare nel design: qualità dell'aria, illuminazione, comfort acustico, materiali." },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM", description: "Requisiti FGB per il capitolato: specifiche su sistemi di ventilazione, filtrazione, illuminazione circadiana e materiali a basse emissioni." },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM", description: "Inizio costruzione. Focus sulla corretta installazione dei sistemi che impattano il benessere: HVAC, illuminazione, acustica." },
  { order: 5, task_name: "WELL GC training", type: "manual_input", assigned_to_role: "PM", description: "Formazione al GC sui requisiti WELL durante la costruzione: gestione IAQ, protezione materiali, pulizia pre-occupazione." },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM", description: "Fine lavori e consegna. Devono essere programmati i test di performance (aria, acqua, acustica, illuminazione) post-costruzione." },
  { order: 7, task_name: "GC Provides Documentation", type: "calculated_deadline", offset_days: 30, assigned_to_role: "GC", description: "Il GC ha 30 giorni per fornire la documentazione: schede tecniche, report di commissioning, risultati test di performance." },
  { order: 8, task_name: "WELL Project Submission", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM", description: "90 giorni dall'Handover per completare la submission sulla piattaforma WELL Online e richiedere la Performance Verification." },
  { order: 9, task_name: "Certification Attainment WELL", type: "manual_input", offset_days: 180, assigned_to_role: "PM", description: "Data stimata per l'ottenimento della certificazione WELL. Include il Performance Verification Agent (PVA) site visit e la review IWBI." },
]);

const WELL_EXISTING_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM", description: "Valutazione preliminare degli spazi esistenti secondo WELL v2: analisi delle condizioni attuali e gap rispetto ai requisiti." },
  { order: 2, task_name: "Policy Review", type: "manual_input", assigned_to_role: "PM", description: "Revisione delle politiche aziendali esistenti relative a salute e benessere: HR policies, facility management, food service." },
  { order: 3, task_name: "On-site Visit + Performance Testing", type: "manual_input", assigned_to_role: "PM", description: "Sopralluogo e test di performance: misurazioni qualità dell'aria, livelli di illuminazione, acustica, qualità dell'acqua." },
  { order: 4, task_name: "Lab/Cliente fornisce documentazione", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client", description: "Il Cliente/Laboratorio ha 30 giorni per fornire i risultati dei test di performance e la documentazione richiesta." },
  { order: 5, task_name: "WELL Project Submission", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM", description: "90 giorni per completare la submission sulla piattaforma WELL Online con tutti i dati di performance e le evidenze." },
  { order: 6, task_name: "Certification Attainment WELL", type: "manual_input", offset_days: 180, assigned_to_role: "PM", description: "Data stimata per l'ottenimento della certificazione WELL per edifici esistenti." },
]);

const GENERIC_TIMELINE: TimelineStep[] = [
  { name: "Registrazione", order_index: 0, type: "manual_input", assigned_to_role: "PM", description: "Registrazione del progetto presso l'ente certificatore. Inserisci la data prevista per l'avvio formale del processo." },
  { name: "Raccolta Documentazione", order_index: 1, type: "manual_input", assigned_to_role: "PM", description: "Fase di raccolta di tutta la documentazione tecnica necessaria per la certificazione." },
  { name: "Fase di Design", order_index: 2, type: "manual_input", assigned_to_role: "PM", description: "Periodo di progettazione in cui integrare i requisiti della certificazione nelle specifiche tecniche." },
  { name: "Construction Phase", order_index: 3, type: "manual_input", assigned_to_role: "PM", description: "Fase di costruzione o implementazione. Il contractor deve seguire le specifiche di certificazione." },
  { name: "Sottomissione Review", order_index: 4, type: "calculated_deadline", offset_days: 30, assigned_to_role: "PM", description: "Scadenza per l'invio della documentazione all'ente certificatore per la review." },
  { name: "Risposta Review", order_index: 5, type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM", description: "Data stimata per la ricezione della risposta dall'ente certificatore dopo la review." },
  { name: "Certificazione", order_index: 6, type: "manual_input", offset_days: 90, assigned_to_role: "PM", description: "Data prevista per il rilascio ufficiale della certificazione." },
];

// ═══════════════════════════════════════════
// SCORECARDS (from scorecard.json)
// ═══════════════════════════════════════════

// --- LEED ---

const LEED_BDC_NC_SCORECARD = toScorecard([
  { category_code: "IP", requirement_label: "Processo Integrativo", max_score: 1, order_index: 1 },
  { category_code: "LT", requirement_label: "Localizzazione e Trasporti", max_score: 16, order_index: 2 },
  { category_code: "SS", requirement_label: "Siti Sostenibili", max_score: 10, order_index: 3 },
  { category_code: "WE", requirement_label: "Efficienza Idrica", max_score: 11, order_index: 4 },
  { category_code: "EA", requirement_label: "Energia e Atmosfera", max_score: 33, order_index: 5 },
  { category_code: "MR", requirement_label: "Materiali e Risorse", max_score: 13, order_index: 6 },
  { category_code: "EQ", requirement_label: "Qualità Ambientale Interna", max_score: 16, order_index: 7 },
  { category_code: "IN", requirement_label: "Innovazione", max_score: 6, order_index: 8 },
  { category_code: "RP", requirement_label: "Priorità Regionale", max_score: 4, order_index: 9 },
]);

const LEED_BDC_CS_SCORECARD = toScorecard([
  { category_code: "IP", requirement_label: "Processo Integrativo", max_score: 1, order_index: 1 },
  { category_code: "LT", requirement_label: "Localizzazione e Trasporti", max_score: 20, order_index: 2 },
  { category_code: "SS", requirement_label: "Siti Sostenibili", max_score: 11, order_index: 3 },
  { category_code: "WE", requirement_label: "Efficienza Idrica", max_score: 11, order_index: 4 },
  { category_code: "EA", requirement_label: "Energia e Atmosfera", max_score: 33, order_index: 5 },
  { category_code: "MR", requirement_label: "Materiali e Risorse", max_score: 14, order_index: 6 },
  { category_code: "EQ", requirement_label: "Qualità Ambientale Interna", max_score: 11, order_index: 7 },
  { category_code: "IN", requirement_label: "Innovazione", max_score: 6, order_index: 8 },
  { category_code: "RP", requirement_label: "Priorità Regionale", max_score: 4, order_index: 9 },
]);

const LEED_BDC_HEALTHCARE_SCORECARD = toScorecard([
  { category_code: "IP", requirement_label: "Processo Integrativo", max_score: 1, order_index: 1 },
  { category_code: "LT", requirement_label: "Localizzazione e Trasporti", max_score: 9, order_index: 2 },
  { category_code: "SS", requirement_label: "Siti Sostenibili", max_score: 9, order_index: 3 },
  { category_code: "WE", requirement_label: "Efficienza Idrica", max_score: 11, order_index: 4 },
  { category_code: "EA", requirement_label: "Energia e Atmosfera", max_score: 35, order_index: 5 },
  { category_code: "MR", requirement_label: "Materiali e Risorse", max_score: 19, order_index: 6 },
  { category_code: "EQ", requirement_label: "Qualità Ambientale Interna", max_score: 16, order_index: 7 },
  { category_code: "IN", requirement_label: "Innovazione", max_score: 6, order_index: 8 },
  { category_code: "RP", requirement_label: "Priorità Regionale", max_score: 4, order_index: 9 },
]);

const LEED_IDC_CI_SCORECARD = toScorecard([
  { category_code: "IP", requirement_label: "Processo Integrativo", max_score: 2, order_index: 1 },
  { category_code: "LT", requirement_label: "Localizzazione e Trasporti", max_score: 18, order_index: 2 },
  { category_code: "WE", requirement_label: "Efficienza Idrica", max_score: 12, order_index: 3 },
  { category_code: "EA", requirement_label: "Energia e Atmosfera", max_score: 38, order_index: 4 },
  { category_code: "MR", requirement_label: "Materiali e Risorse", max_score: 13, order_index: 5 },
  { category_code: "EQ", requirement_label: "Qualità Ambientale Interna", max_score: 17, order_index: 6 },
  { category_code: "IN", requirement_label: "Innovazione", max_score: 6, order_index: 7 },
  { category_code: "RP", requirement_label: "Priorità Regionale", max_score: 4, order_index: 8 },
]);

const LEED_OM_EB_SCORECARD = toScorecard([
  { category_code: "LT", requirement_label: "Localizzazione e Trasporti", max_score: 15, order_index: 1 },
  { category_code: "SS", requirement_label: "Siti Sostenibili", max_score: 10, order_index: 2 },
  { category_code: "WE", requirement_label: "Efficienza Idrica", max_score: 12, order_index: 3 },
  { category_code: "EA", requirement_label: "Energia e Atmosfera", max_score: 38, order_index: 4 },
  { category_code: "MR", requirement_label: "Materiali e Risorse", max_score: 8, order_index: 5 },
  { category_code: "EQ", requirement_label: "Qualità Ambientale Interna", max_score: 17, order_index: 6 },
  { category_code: "IN", requirement_label: "Innovazione", max_score: 6, order_index: 7 },
  { category_code: "RP", requirement_label: "Priorità Regionale", max_score: 4, order_index: 8 },
]);

// --- BREEAM ---

const BREEAM_NC_FULLY_FITTED_SCORECARD = toScorecard([
  { category_code: "Man", requirement_label: "Gestione", max_score: 21, order_index: 1 },
  { category_code: "Hea", requirement_label: "Salute e Benessere", max_score: 22, order_index: 2 },
  { category_code: "Ene", requirement_label: "Energia", max_score: 31, order_index: 3 },
  { category_code: "Tra", requirement_label: "Trasporti", max_score: 12, order_index: 4 },
  { category_code: "Wat", requirement_label: "Acqua", max_score: 10, order_index: 5 },
  { category_code: "Mat", requirement_label: "Materiali", max_score: 14, order_index: 6 },
  { category_code: "Wst", requirement_label: "Rifiuti", max_score: 6, order_index: 7 },
  { category_code: "LE", requirement_label: "Uso del suolo ed Ecologia", max_score: 10, order_index: 8 },
  { category_code: "Pol", requirement_label: "Inquinamento", max_score: 12, order_index: 9 },
  { category_code: "Inn", requirement_label: "Innovazione", max_score: 10, order_index: 10 },
]);

const BREEAM_NC_SIMPLE_SCORECARD = toScorecard([
  { category_code: "Man", requirement_label: "Gestione", max_score: 9, order_index: 1 },
  { category_code: "Hea", requirement_label: "Salute e Benessere", max_score: 15, order_index: 2 },
  { category_code: "Ene", requirement_label: "Energia", max_score: 14, order_index: 3 },
  { category_code: "Tra", requirement_label: "Trasporti", max_score: 11, order_index: 4 },
  { category_code: "Wat", requirement_label: "Acqua", max_score: 7, order_index: 5 },
  { category_code: "Mat", requirement_label: "Materiali", max_score: 9, order_index: 6 },
  { category_code: "Wst", requirement_label: "Rifiuti", max_score: 6, order_index: 7 },
  { category_code: "LE", requirement_label: "Uso del suolo ed Ecologia", max_score: 10, order_index: 8 },
  { category_code: "Pol", requirement_label: "Inquinamento", max_score: 5, order_index: 9 },
  { category_code: "Inn", requirement_label: "Innovazione", max_score: 10, order_index: 10 },
]);

const BREEAM_IU_ASSET_SCORECARD = toScorecard([
  { category_code: "Hea", requirement_label: "Salute e Benessere", max_score: 47, order_index: 1 },
  { category_code: "Ene", requirement_label: "Energia", max_score: 66, order_index: 2 },
  { category_code: "Tra", requirement_label: "Trasporti", max_score: 22, order_index: 3 },
  { category_code: "Wat", requirement_label: "Acqua", max_score: 38, order_index: 4 },
  { category_code: "Rsc", requirement_label: "Risorse", max_score: 23, order_index: 5 },
  { category_code: "Rsl", requirement_label: "Resilienza", max_score: 18, order_index: 6 },
  { category_code: "Lue", requirement_label: "Uso del suolo ed Ecologia", max_score: 6, order_index: 7 },
  { category_code: "Pol", requirement_label: "Inquinamento", max_score: 18, order_index: 8 },
  { category_code: "Exm", requirement_label: "Esemplare", max_score: 12, order_index: 9 },
]);

const BREEAM_IU_MANAGEMENT_SCORECARD = toScorecard([
  { category_code: "Man", requirement_label: "Gestione", max_score: 31, order_index: 1 },
  { category_code: "Hea", requirement_label: "Salute e Benessere", max_score: 19, order_index: 2 },
  { category_code: "Ene", requirement_label: "Energia", max_score: 30, order_index: 3 },
  { category_code: "Wat", requirement_label: "Acqua", max_score: 13, order_index: 4 },
  { category_code: "Rsc", requirement_label: "Risorse", max_score: 10, order_index: 5 },
  { category_code: "Rsl", requirement_label: "Resilienza", max_score: 16, order_index: 6 },
  { category_code: "Lue", requirement_label: "Uso del suolo ed Ecologia", max_score: 5, order_index: 7 },
  { category_code: "Pol", requirement_label: "Inquinamento", max_score: 10, order_index: 8 },
  { category_code: "Exm", requirement_label: "Esemplare", max_score: 11, order_index: 9 },
]);

// --- WELL ---

const WELL_V2_SCORECARD = toScorecard([
  { category_code: "A", requirement_label: "Aria", max_score: 12, order_index: 1 },
  { category_code: "W", requirement_label: "Acqua", max_score: 12, order_index: 2 },
  { category_code: "N", requirement_label: "Alimentazione", max_score: 12, order_index: 3 },
  { category_code: "L", requirement_label: "Luce", max_score: 12, order_index: 4 },
  { category_code: "V", requirement_label: "Movimento", max_score: 12, order_index: 5 },
  { category_code: "T", requirement_label: "Comfort Termico", max_score: 12, order_index: 6 },
  { category_code: "S", requirement_label: "Suono", max_score: 12, order_index: 7 },
  { category_code: "X", requirement_label: "Materiali", max_score: 12, order_index: 8 },
  { category_code: "M", requirement_label: "Mente", max_score: 12, order_index: 9 },
  { category_code: "C", requirement_label: "Comunità", max_score: 12, order_index: 10 },
  { category_code: "I", requirement_label: "Innovazione", max_score: 10, order_index: 11 },
]);

// ═══════════════════════════════════════════
// TEMPLATE REGISTRY
// ═══════════════════════════════════════════
// Key format: "CERT_TYPE|RATING" or "CERT_TYPE|RATING|SUBTYPE"

const TEMPLATE_REGISTRY: Record<string, CertificationTemplate> = {
  // ─── LEED BD+C ───
  "LEED|BD+C": {
    scorecard: LEED_BDC_NC_SCORECARD, // Default = New Construction
    timeline: LEED_BDC_TIMELINE,
    label: "LEED BD+C",
  },
  "LEED|BD+C|New Construction": {
    scorecard: LEED_BDC_NC_SCORECARD,
    timeline: LEED_BDC_TIMELINE,
    label: "LEED BD+C New Construction",
  },
  "LEED|BD+C|Core & Shell": {
    scorecard: LEED_BDC_CS_SCORECARD,
    timeline: LEED_BDC_TIMELINE,
    label: "LEED BD+C Core & Shell",
  },
  "LEED|BD+C|Healthcare": {
    scorecard: LEED_BDC_HEALTHCARE_SCORECARD,
    timeline: LEED_BDC_TIMELINE,
    label: "LEED BD+C Healthcare",
  },

  // ─── LEED ID+C ───
  "LEED|ID+C": {
    scorecard: LEED_IDC_CI_SCORECARD,
    timeline: LEED_IDC_TIMELINE,
    label: "LEED ID+C",
  },

  // ─── LEED O+M ───
  "LEED|O+M": {
    scorecard: LEED_OM_EB_SCORECARD,
    timeline: LEED_OM_TIMELINE,
    label: "LEED O+M",
  },

  // ─── BREEAM ───
  "BREEAM|New Construction": {
    scorecard: BREEAM_NC_FULLY_FITTED_SCORECARD, // Default = Fully Fitted
    timeline: BREEAM_NC_REFURB_TIMELINE,
    label: "BREEAM New Construction",
  },
  "BREEAM|New Construction|Simple Buildings": {
    scorecard: BREEAM_NC_SIMPLE_SCORECARD,
    timeline: BREEAM_NC_REFURB_TIMELINE,
    label: "BREEAM NC Simple Buildings",
  },
  "BREEAM|Refurbishment": {
    scorecard: BREEAM_NC_FULLY_FITTED_SCORECARD,
    timeline: BREEAM_NC_REFURB_TIMELINE,
    label: "BREEAM Refurbishment",
  },
  "BREEAM|In-Use Part 1": {
    scorecard: BREEAM_IU_ASSET_SCORECARD,
    timeline: BREEAM_IU_P1_TIMELINE,
    label: "BREEAM In-Use Part 1",
  },
  "BREEAM|In-Use Part 2": {
    scorecard: BREEAM_IU_MANAGEMENT_SCORECARD,
    timeline: BREEAM_IU_P2_TIMELINE,
    label: "BREEAM In-Use Part 2",
  },

  // ─── WELL (unico template per tutti i rating) ───
  "WELL|New & Existing Buildings": {
    scorecard: WELL_V2_SCORECARD,
    timeline: WELL_NC_TIMELINE,
    label: "WELL New & Existing Buildings",
  },
  "WELL|New & Existing Interiors": {
    scorecard: WELL_V2_SCORECARD,
    timeline: WELL_EXISTING_TIMELINE,
    label: "WELL New & Existing Interiors",
  },
  "WELL|Core": {
    scorecard: WELL_V2_SCORECARD,
    timeline: WELL_NC_TIMELINE,
    label: "WELL Core",
  },
};

// ═══════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════

/**
 * Get template for a given cert_type, rating, and optional subtype.
 * Lookup order: type|rating|subtype → type|rating → fuzzy match → base type fallback → null
 */
export function getCertificationTemplate(
  certType: string | null | undefined,
  rating: string | null | undefined,
  subtype?: string | null
): CertificationTemplate | null {
  if (!certType) return null;

  // Normalizziamo il tipo base in modo da evitare disallineamenti di case
  const cleanType = certType.trim().toUpperCase();

  // LA MAGIA È QUI: Rimuoviamo "v.4", "v4", "v4.1" dal rating. 
  // "ID+C v.4" diventerà pulito: "ID+C"
  const cleanRating = rating 
    ? rating.replace(/v\.?\s*\d+(\.\d+)?/gi, '').trim() 
    : '';

  const cleanSubtype = subtype ? subtype.trim() : '';

  // Array delle chiavi disponibili per fare lookup case-insensitive e fuzzy
  const registryKeys = Object.keys(TEMPLATE_REGISTRY);

  // 1. Tenta il match esatto (type|rating|subtype)
  if (cleanRating && cleanSubtype) {
    const exactKey = `${cleanType}|${cleanRating}|${cleanSubtype}`;
    const match = registryKeys.find(k => k.toLowerCase() === exactKey.toLowerCase());
    if (match) return TEMPLATE_REGISTRY[match];
  }

  // 2. Tenta il match senza subtype (type|rating)
  if (cleanRating) {
    const ratingKey = `${cleanType}|${cleanRating}`;
    const match = registryKeys.find(k => k.toLowerCase() === ratingKey.toLowerCase());
    if (match) return TEMPLATE_REGISTRY[match];

    // 3. Fallback elastico: cerca qualsiasi chiave che contenga la combinazione pulita "TYPE|RATING"
    const fuzzyMatch = registryKeys.find(k => k.toLowerCase().includes(ratingKey.toLowerCase()));
    if (fuzzyMatch) return TEMPLATE_REGISTRY[fuzzyMatch];
  }

  // 4. Fallback estremo per certificazioni generiche (es. pesca il primo template "WELL" se il rating non combacia con nulla)
  const baseMatch = registryKeys.find(k => k.toUpperCase().startsWith(`${cleanType}|`));
  if (baseMatch) return TEMPLATE_REGISTRY[baseMatch];

  return null;
}

/**
 * Get a usable template, falling back to generic if not found.
 */
export function getTemplateOrFallback(
  certType: string | null | undefined,
  rating: string | null | undefined,
  subtype?: string | null
): { template: CertificationTemplate; isGeneric: boolean } {
  const specific = getCertificationTemplate(certType, rating, subtype);
  if (specific) return { template: specific, isGeneric: false };

  return {
    template: {
      scorecard: [],
      timeline: GENERIC_TIMELINE,
      label: certType ? `${certType}${rating ? ` ${rating}` : ""}` : "Generico",
    },
    isGeneric: true,
  };
}

/**
 * Compute the max total score for a given template's scorecard.
 */
export function getMaxTotal(scorecard: ScorecardCategory[]): number {
  return scorecard.reduce((sum, s) => sum + s.max_score, 0);
}

// ─── Available options for UI selects ───

export const CERT_TYPES = ["LEED", "WELL", "BREEAM"] as const;

export const CERT_RATINGS: Record<string, string[]> = {
  LEED: ["BD+C", "ID+C", "O+M"],
  WELL: ["New & Existing Buildings", "New & Existing Interiors", "Core"],
  BREEAM: ["New Construction", "Refurbishment", "In-Use Part 1", "In-Use Part 2"],
};

export const CERT_LEVELS: Record<string, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
};

export const CERT_SUBTYPES: Record<string, string[]> = {
  "LEED|BD+C": ["New Construction", "Core & Shell", "Healthcare"],
  "BREEAM|New Construction": ["Fully Fitted", "Simple Buildings"],
};
