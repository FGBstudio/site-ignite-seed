/**
 * I modelli di project timeline, ricavati da cronoprogrammi reali.
 *
 * Non sono elenchi inventati né traduzioni di una norma: ciascuno viene da un
 * file che qualcuno ha davvero usato per costruire qualcosa. È la differenza
 * fra una proposta che il PM corregge in due minuti e una che cancella in
 * blocco perché non somiglia al suo lavoro.
 *
 *  · **IDC** — Boucheron Almaty, dal planning Store Planning del cliente.
 *  · **BDC completo** — il Γ.Χ. greco (progetto logistico, 26 attività con
 *    durate in mesi e quattro famiglie: design, permitting, construction,
 *    terze parti).
 *  · **BDC cantiere** — Metro Pontedera, gantt LCP: solo esecuzione, fasi
 *    F1..F4 fra due consegne.
 *
 * Le durate sono in giorni e servono a **proporre** la data di fine quando il
 * PM mette l'inizio. Sono stime prese dai file originali, non impegni: la
 * prima cosa che il PM fa è correggerle, ed è giusto così. Il valore non è la
 * precisione del numero — è non partire da una griglia vuota.
 */

export type FamigliaModello = "design" | "permitting" | "construction" | "terze_parti";

export interface VoceModello {
  nome: string;
  /** Giorni di durata proposti. 0 = milestone, un istante. */
  giorni: number;
  famiglia: FamigliaModello;
  /** Da quale voce precedente parte, per indice. NULL = dall'inizio. */
  dopo?: number;
  /** Il ruolo letto dal motore, sulle tre voci che ne hanno uno. */
  ancora?: "lancio_gara" | "construction_start" | "handover";
  nota?: string;
}

export interface ModelloTimeline {
  chiave: "idc" | "bdc" | "cantiere";
  nome: string;
  descrizione: string;
  /** Da dove viene: si mostra al PM, perché sapere la provenienza aiuta. */
  origine: string;
  voci: VoceModello[];
}

const g = (mesi: number) => Math.round(mesi * 30.4);

/**
 * IDC — retail fit-out. Da Boucheron Almaty (EMEA 2026).
 *
 * Le fasi di progettazione sono quelle del cliente (SD, DD, CD), non le
 * nostre: su un fit-out di lusso il calendario lo detta lo store planning del
 * marchio, e usare altri nomi costringe il PM a tradurre a ogni riunione.
 */
const IDC: VoceModello[] = [
  { nome: "Criteria Package", giorni: 26, famiglia: "design" },
  { nome: "Store Committee Kick-off", giorni: 0, famiglia: "design", dopo: 0 },
  { nome: "Schematic Design (SD)", giorni: 56, famiglia: "design", dopo: 1 },
  { nome: "Design Development (DD)", giorni: 45, famiglia: "design", dopo: 2 },
  { nome: "Construction Documents (CD)", giorni: 60, famiglia: "design", dopo: 3 },
  { nome: "Tender", giorni: 45, famiglia: "design", dopo: 4, ancora: "lancio_gara",
    nota: "la chiusura della gara apre i vincoli di precedenza delle scalette" },
  { nome: "Construction Preparation (GC, MW, FC)", giorni: 21, famiglia: "construction", dopo: 5 },
  { nome: "Production (MW, FC)", giorni: 14, famiglia: "construction", dopo: 6 },
  { nome: "Transport (MW, FC)", giorni: 14, famiglia: "construction", dopo: 7 },
  { nome: "Construction start", giorni: 0, famiglia: "construction", dopo: 8, ancora: "construction_start" },
  { nome: "Mid-Construction", giorni: 28, famiglia: "construction", dopo: 9 },
  { nome: "Construction end", giorni: 35, famiglia: "construction", dopo: 10 },
  { nome: "Handover", giorni: 0, famiglia: "construction", dopo: 11, ancora: "handover",
    nota: "la data arriva dalla Quotation: è contrattuale" },
  { nome: "Opening", giorni: 0, famiglia: "construction", dopo: 12 },
  { nome: "Snag list", giorni: 5, famiglia: "construction", dopo: 13 },
];

/**
 * BDC completo — dal Γ.Χ. greco, progetto logistico.
 *
 * È il modello più lungo, e la ragione sta tutta nel permitting: otto mesi per
 * l'approvazione ambientale, quattro per l'allaccio viario. Sono tempi di enti
 * terzi, non nostri, e il PM che li vede proposti capisce subito perché il
 * progetto dura tre anni invece di uno.
 */
const BDC: VoceModello[] = [
  { nome: "Concept Design (CD)", giorni: g(2), famiglia: "design" },
  { nome: "Review & approval CD", giorni: g(0.5), famiglia: "design", dopo: 0 },
  { nome: "PM Mobilisation", giorni: g(0.5), famiglia: "design", dopo: 1 },
  { nome: "Tendering of D&B", giorni: g(2.5), famiglia: "design", dopo: 2, ancora: "lancio_gara" },

  { nome: "RIBA st. 3 — Submission for Permit", giorni: g(1.5), famiglia: "permitting", dopo: 1 },
  { nome: "Review & approval — Building Permit issuance", giorni: g(0.5), famiglia: "permitting", dopo: 4 },
  { nome: "RIBA st. 3 — Project", giorni: g(1.5), famiglia: "design", dopo: 1 },
  { nome: "Review & approval RIBA 3 — Project", giorni: g(0.5), famiglia: "design", dopo: 6 },

  { nome: "Preparation of Environmental Impact Study (EIS)", giorni: g(2.5), famiglia: "permitting" },
  { nome: "Issuance of Environmental Terms Approval (AEΠΟ)", giorni: g(8), famiglia: "terze_parti", dopo: 8,
    nota: "otto mesi di ente terzo: non è tempo nostro" },
  { nome: "Submission and Issuance of Installation Approval", giorni: g(3), famiglia: "terze_parti", dopo: 9 },
  { nome: "Obtaining other Approvals (Aviation, Archaeology…)", giorni: g(3), famiglia: "terze_parti", dopo: 8 },
  { nome: "Approval of Traffic Connection", giorni: g(4), famiglia: "terze_parti", dopo: 8 },
  { nome: "Submission of Pre-Approval File for Building Permit", giorni: g(2), famiglia: "permitting", dopo: 11 },
  { nome: "Preparation/Submission of Building Permit File", giorni: g(2), famiglia: "permitting", dopo: 13 },

  { nome: "Preparation of RIBA st.4 / Structural — Foundations", giorni: g(1), famiglia: "design", dopo: 7 },
  { nome: "Review & approval RIBA st.4 / Structural", giorni: g(0.5), famiglia: "design", dopo: 15 },
  { nome: "Preparation of RIBA st.4 / Project", giorni: g(3), famiglia: "design", dopo: 16 },
  { nome: "Review & approval of RIBA st.4 / Project", giorni: g(0.5), famiglia: "design", dopo: 17 },

  { nome: "Long lead Material Procurement", giorni: g(4), famiglia: "construction", dopo: 3 },
  { nome: "Mobilisation 1 / Earthworks", giorni: g(0.5), famiglia: "construction", dopo: 14 },
  { nome: "Earthworks", giorni: g(2), famiglia: "construction", dopo: 20, ancora: "construction_start" },
  { nome: "Mobilisation 2 / Project Team", giorni: g(0.5), famiglia: "construction", dopo: 21 },
  { nome: "Construction of the Project", giorni: g(11.5), famiglia: "construction", dopo: 22 },
  { nome: "Installation of Racking System", giorni: g(2), famiglia: "construction", dopo: 23 },
  { nome: "Commissioning", giorni: g(0.5), famiglia: "construction", dopo: 24 },
  { nome: "Consegna lavori / Handover", giorni: 0, famiglia: "construction", dopo: 25, ancora: "handover" },
];

/**
 * BDC cantiere — Metro Pontedera, gantt LCP.
 *
 * Solo esecuzione: si apre con la consegna delle aree e si chiude con la
 * consegna dei lavori. Niente design, niente permitting — quando FGB entra a
 * cantiere aperto quelle fasi sono già successe, e proporle significherebbe
 * chiedere al PM date che nessuno gli darà mai.
 *
 * Le fasi F1..F4 restano nei nomi perché è così che le chiama l'impresa nelle
 * riunioni di cantiere.
 */
const CANTIERE: VoceModello[] = [
  { nome: "Consegna aree di cantiere", giorni: 0, famiglia: "construction" },
  { nome: "F1 — Cantierizzazione e inizio lavori", giorni: 5, famiglia: "construction", dopo: 0,
    ancora: "construction_start" },

  { nome: "F2 — Sottoservizi esterni", giorni: 32, famiglia: "construction", dopo: 1 },
  { nome: "F2 — Palificazioni", giorni: 15, famiglia: "construction", dopo: 1 },
  { nome: "F2 — Scavo plinti", giorni: 15, famiglia: "construction", dopo: 3 },
  { nome: "F2 — Carpenterie plinti e travi porta pannello", giorni: 31, famiglia: "construction", dopo: 4 },

  { nome: "F3 — Prefabbricato", giorni: 55, famiglia: "construction", dopo: 5 },
  { nome: "F3 — Copertura", giorni: 15, famiglia: "construction", dopo: 6 },
  { nome: "F3 — Tinteggiature", giorni: 14, famiglia: "construction", dopo: 6 },
  { nome: "F3 — Pavimenti interni", giorni: 12, famiglia: "construction", dopo: 7 },
  { nome: "F3 — Vespaio", giorni: 22, famiglia: "construction", dopo: 6 },
  { nome: "F3 — Portoni e baie di carico", giorni: 30, famiglia: "construction", dopo: 9 },
  { nome: "F3 — Uffici interni", giorni: 60, famiglia: "construction", dopo: 6 },
  { nome: "F3 — Impianto antincendio", giorni: 60, famiglia: "construction", dopo: 6 },
  { nome: "F3 — Impianti elettrici e meccanici", giorni: 90, famiglia: "construction", dopo: 9 },
  { nome: "F3 — Celle frigo", giorni: 42, famiglia: "construction", dopo: 9 },
  { nome: "F3 — Impianti celle", giorni: 60, famiglia: "construction", dopo: 15 },

  { nome: "F4 — Preparazione sottofondi", giorni: 16, famiglia: "construction", dopo: 6 },
  { nome: "F4 — Asfalti", giorni: 10, famiglia: "construction", dopo: 17 },
  { nome: "F4 — Guardiania e recinzioni", giorni: 10, famiglia: "construction", dopo: 18 },
  { nome: "F4 — Aree verdi", giorni: 15, famiglia: "construction", dopo: 18 },

  { nome: "Consegna lavori", giorni: 0, famiglia: "construction", dopo: 20, ancora: "handover" },
];

export const MODELLI: ModelloTimeline[] = [
  {
    chiave: "idc",
    nome: "IDC · retail fit-out",
    descrizione: "Dal criteria package all'apertura del negozio. Fasi di design del marchio (SD, DD, CD), poi produzione, trasporto e cantiere.",
    origine: "Boucheron Almaty — Store Planning EMEA",
    voci: IDC,
  },
  {
    chiave: "bdc",
    nome: "BDC · progetto completo",
    descrizione: "Design, permessi, enti terzi e costruzione. Il più lungo: l'approvazione ambientale da sola vale otto mesi.",
    origine: "Γ.Χ. Έργου — progetto logistico, Grecia",
    voci: BDC,
  },
  {
    chiave: "cantiere",
    nome: "BDC · solo cantiere",
    descrizione: "Quando FGB entra a cantiere aperto: dalla consegna delle aree alla consegna dei lavori, fasi F1–F4.",
    origine: "Metro Pontedera — gantt LCP",
    voci: CANTIERE,
  },
];

/**
 * Le date proposte da un modello, a partire da un giorno.
 *
 * Si applica la catena `dopo`: ogni voce parte quando finisce quella da cui
 * dipende. Non è uno scheduling vero — non guarda i giorni lavorativi né i
 * fermi cantiere — ed è esattamente quanto serve: dà al PM una bozza
 * plausibile da correggere, invece di una colonna di caselle vuote.
 */
export function dateDaModello(
  voci: VoceModello[],
  inizioISO: string
): Array<{ inizio: string; fine: string | null }> {
  const giorniDa = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  };

  const out: Array<{ inizio: string; fine: string | null }> = [];

  voci.forEach((v, i) => {
    // Se dipende da una voce successiva — non dovrebbe succedere, ma un
    // modello si edita a mano — si parte dall'inizio invece di leggere
    // `undefined`.
    const madre = v.dopo !== undefined && v.dopo < i ? out[v.dopo] : null;
    const inizio = madre ? madre.fine ?? madre.inizio : inizioISO;
    out.push({ inizio, fine: v.giorni > 0 ? giorniDa(inizio, v.giorni) : null });
  });

  return out;
}
