/**
 * Il cronoprogramma: l'asse temporale su cui si innestano le certificazioni.
 *
 * Si chiama cosi' e non "cantiere" perche' contiene anche eventi che il
 * cantiere lo precedono — la gara e l'aggiudicazione avvengono prima che il
 * cantiere esista, e le loro date non stanno nel gantt del GC ma dal
 * committente.
 */

export type CronoAncora =
  | "lancio_gara"
  | "aggiudicazione_gc"
  | "progetto_definitivo"
  | "construction_start"
  | "impianti_pronti"
  | "involucro_chiuso"
  | "sito_pronto_test"
  | "handover";

export type CronoFase = "pre" | "cantiere";
export type CronoStato = "inserita" | "da_confermare" | "confermata";

/**
 * Le otto ancore canoniche, nell'ordine in cui accadono.
 *
 * Sono le stesse in un fit-out e in una nuova costruzione: "gara lanciata" e
 * "impianti pronti per il test" significano la stessa cosa nei due casi. E'
 * il motivo per cui il cronoprogramma non ha un campo `tipo`.
 */
export const ANCORE: ReadonlyArray<{
  ancora: CronoAncora;
  nome: string;
  fase: CronoFase;
  fonteTipica: string;
}> = [
  { ancora: "lancio_gara",         nome: "Lancio gara d'appalto",           fase: "pre",      fonteTipica: "Manuale · DL" },
  { ancora: "aggiudicazione_gc",   nome: "Aggiudicazione GC",               fase: "pre",      fonteTipica: "Manuale · DL" },
  { ancora: "progetto_definitivo", nome: "Progetto definitivo consegnato",  fase: "pre",      fonteTipica: "Manuale · committente" },
  { ancora: "construction_start",  nome: "Construction start",              fase: "cantiere", fonteTipica: "Gantt GC" },
  { ancora: "impianti_pronti",     nome: "Impianti pronti per test",        fase: "cantiere", fonteTipica: "Gantt GC" },
  { ancora: "involucro_chiuso",    nome: "Involucro chiuso",                fase: "cantiere", fonteTipica: "Gantt GC" },
  { ancora: "sito_pronto_test",    nome: "Sito pronto per test",            fase: "cantiere", fonteTipica: "Gantt GC" },
  { ancora: "handover",            nome: "Handover (fine cantiere)",        fase: "cantiere", fonteTipica: "Quotazione (contrattuale)" },
] as const;

export const ANCORA_NOME: Record<CronoAncora, string> = Object.fromEntries(
  ANCORE.map((a) => [a.ancora, a.nome])
) as Record<CronoAncora, string>;

/**
 * Le fonti ricorrenti, offerte come suggerimento e non come vincolo.
 *
 * La fonte e' obbligatoria — il database rifiuta una data senza — ma non e'
 * un elenco chiuso: "gantt rev. 8 del 12 marzo" dice piu' di qualunque voce
 * predefinita, ed e' esattamente il tipo di precisione che serve quando due PM
 * hanno parlato con interlocutori diversi.
 */
export const FONTI_SUGGERITE = [
  "Gantt GC",
  "Manuale · DL",
  "Manuale · committente",
  "Quotazione (contrattuale)",
  "Comunicazione GC",
] as const;

export interface Cronoprogramma {
  id: string;
  site_id: string;
  nome: string | null;
  stato: "attivo" | "chiuso";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CronoEvento {
  id: string;
  cronoprogramma_id: string;
  /** NULL per gli eventi liberi che il PM aggiunge oltre le otto canoniche. */
  ancora: CronoAncora | null;
  nome: string;
  ordine: number;
  /** La previsione: e' questa a guidare il ricalcolo. */
  data_pianificata: string | null;
  /** Il fatto: si scrive una volta sola, a cose avvenute. */
  data_effettiva: string | null;
  fonte: string | null;
  stato: CronoStato;
  aggiornata_il: string | null;
  aggiornata_da: string | null;
}

export interface CronoRegistroVoce {
  id: string;
  cronoprogramma_id: string;
  evento_id: string | null;
  chi: string;
  quando: string;
  data_precedente: string | null;
  data_nuova: string | null;
  fonte: string;
  scostamento_giorni: number | null;
  scostamento_baseline_giorni: number | null;
  fine_stimata: string | null;
  scadenza_contratto: string | null;
  report_contrattuali: number | null;
  report_proiettati: number | null;
  note: string | null;
}

/** Perche' la timeline di certificazione non e' ancora compilabile. */
export interface CertGate {
  bloccata: boolean;
  motivo: string | null;
}

/** Un vincolo di precedenza rotto. Non produce date: produce un avviso. */
export interface Violazione {
  order_index: number;
  requirement: string;
  operatore: "prima_di" | "dopo_di";
  ancora: CronoAncora;
  data_passo: string;
  data_ancora: string;
  giorni: number;
  messaggio: string | null;
}

export interface SerieAnteprima {
  step_order: number;
  totale_ora: number;
  totale_dopo: number;
  da_creare: number;
  da_rimuovere: number;
  /** Occorrenze gia' emesse oltre il nuovo limite. Non si cancellano mai. */
  emessi_in_eccesso: number;
}

export interface SerieConteggi {
  step_order: number;
  inizio: string | null;
  fine_baseline: string | null;
  fine_corrente: string | null;
  contrattuali: number;
  proiettati: number;
}

/** Una milestone materializzata, come la legge il flusso PM. */
export interface TimelineMilestone {
  id: string;
  certification_id: string;
  requirement: string;
  order_index: number | null;
  status: string | null;
  due_date: string | null;
  actual_date: string | null;
  completed_date: string | null;
  anchor_order: number | null;
  offset_days: number | null;
  derived_from: string | null;
  edit_locked_for_pm: boolean;
  optional: boolean;
  not_applicable: boolean;
  series_step_order: number | null;
  series_index: number | null;
}

/**
 * Che natura ha un passo, dal punto di vista di chi lo guarda.
 *
 * E' la distinzione che regge tutto il flusso: cosa il PM decide, cosa
 * subisce, e cosa non tocca nessuno perche' lo calcola il motore.
 */
export type NaturaPasso = "pm" | "ereditato" | "calcolato" | "serie" | "auto";

export function naturaPasso(m: TimelineMilestone): NaturaPasso {
  if (m.series_step_order !== null) return "serie";
  if (m.derived_from === "handover" || m.derived_from === "crono_construction_start") return "ereditato";
  if (m.derived_from) return "auto";
  if (m.anchor_order !== null && m.offset_days !== null) return "calcolato";
  return "pm";
}

export const NATURA_ETICHETTA: Record<NaturaPasso, string> = {
  pm: "PM",
  ereditato: "ereditata",
  calcolato: "calcolata",
  serie: "serie",
  auto: "auto",
};
