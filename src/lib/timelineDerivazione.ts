/**
 * Il modulo di derivazione della vista Timeline — SPECIFICA_TIMELINE §5.
 *
 * Qui non si legge il database e non si disegna niente. Entrano attività di
 * progetto e passi di servizio, escono le grandezze che la vista mostra: date
 * effettive, percentuali, stati, durate. È l'unico posto in cui quelle regole
 * esistono — il pannello SVG e le due card di compilazione le leggono da qui,
 * non le ricalcolano.
 *
 * Il motivo per cui è un modulo a parte e non una manciata di `useMemo` dentro
 * la pagina: sono le uniche funzioni del redesign che si possono verificare
 * senza aprire il browser, e sono anche quelle in cui un errore non si vede.
 * Una percentuale sbagliata del 3% nessuno la nota; una data effettiva
 * calcolata dall'estremo sbagliato di una fase di otto mesi sposta una
 * consegna di otto mesi e la si scopre dal cliente.
 *
 * Convenzioni:
 *  - le date viaggiano come stringhe ISO `yyyy-MM-dd`, mai come `Date`, perché
 *    un `Date` porta con sé un fuso e qui il fuso non esiste: il 15 marzo è il
 *    15 marzo a Milano come a Taipei;
 *  - `null` significa «non si può dire», e non viene mai sostituito da zero.
 */

import { differenceInCalendarDays, parseISO } from "date-fns";

// ── Ingressi ──────────────────────────────────────────────────────────────

export interface AttivitaProgetto {
  id: string;
  nome: string;
  inizio: string | null;
  fine: string | null;
  ordine: number;
  /** Le attività da cui questa dipende. Facoltative, 0..n (spec §5). */
  dipendeDa?: string[];
}

export type PuntoAncora = "start" | "end";

export interface AncoraPasso {
  attivitaId: string;
  punto: PuntoAncora;
  /** Può essere negativo: «60 gg prima dell'inizio di…». */
  offsetGiorni: number;
}

export interface PassoServizio {
  id: string;
  nome: string;
  ordine: number;
  ancora: AncoraPasso | null;
  /** Se valorizzata vince sull'àncora → natura «manuale». */
  dataForzata: string | null;
  /** 0..100, solo manuale, default 0 (spec §6.7). */
  avanzamento: number;
}

// ── Uscite ────────────────────────────────────────────────────────────────

export type StatoAttivita = "pianificata" | "in corso" | "completata";
export type NaturaPasso = "calcolata" | "manuale" | "in attesa";

export interface AttivitaDerivata extends AttivitaProgetto {
  /** % di tempo trascorso fra inizio e fine. `null` se manca una delle due. */
  avanzamento: number | null;
  stato: StatoAttivita | null;
}

export interface PassoDerivato extends PassoServizio {
  /** `dataForzata` se c'è, altrimenti la data calcolata dall'àncora. */
  dataEffettiva: string | null;
  natura: NaturaPasso;
  /**
   * Giorni fino al passo successivo **in ordine di data**, non di elenco.
   * `null` sull'ultimo, e sui passi senza data.
   */
  durataGiorni: number | null;
}

// ── Aiuti ─────────────────────────────────────────────────────────────────

const GIORNO = 86_400_000;

/** Somma giorni a una data ISO restando in ISO. Mezzogiorno: niente DST. */
export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + giorni);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

const valida = (iso: string | null | undefined): iso is string =>
  typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso);

// ── Attività di progetto ──────────────────────────────────────────────────

/**
 * L'avanzamento di un'attività di progetto è **il tempo trascorso**, mai un
 * numero dichiarato (spec §6.2).
 *
 * Conseguenza da tenere a mente leggendo questa funzione: un'attività di
 * progetto non può risultare «in ritardo». Il giorno della fine segna 100%,
 * che il lavoro sia finito o no. Il ritardo esiste solo quando qualcuno
 * sposta la fine in avanti — ed è una decisione del PO, non una svista.
 */
export function avanzamentoAttivita(
  a: Pick<AttivitaProgetto, "inizio" | "fine">,
  oggiISO?: string
): number | null {
  if (!valida(a.inizio) || !valida(a.fine)) return null;

  const inizio = new Date(`${a.inizio}T12:00:00`).getTime();
  const fine = new Date(`${a.fine}T12:00:00`).getTime();
  const oggi = valida(oggiISO) ? new Date(`${oggiISO}T12:00:00`).getTime() : Date.now();

  // L'ordine dei due controlli non è arbitrario, ed è quello della spec §5 e
  // del prototipo approvato: su un'attività che inizia e finisce lo stesso
  // giorno vince lo zero, cioè non è completata finché quel giorno non è
  // passato. Invertirli la darebbe per chiusa la mattina in cui comincia.
  if (oggi <= inizio) return 0;
  if (oggi >= fine) return 100;

  // Qui inizio < oggi < fine, quindi fine > inizio: la divisione è sicura.
  return Math.round(((oggi - inizio) / (fine - inizio)) * 100);
}

export function statoAttivita(pct: number | null): StatoAttivita | null {
  if (pct === null) return null;
  if (pct >= 100) return "completata";
  if (pct > 0) return "in corso";
  return "pianificata";
}

export function derivaAttivita(
  attivita: AttivitaProgetto[],
  oggiISO?: string
): AttivitaDerivata[] {
  return attivita.map((a) => {
    const avanzamento = avanzamentoAttivita(a, oggiISO);
    return { ...a, avanzamento, stato: statoAttivita(avanzamento) };
  });
}

// ── Passi di servizio ─────────────────────────────────────────────────────

/**
 * La data che l'àncora produce.
 *
 * `punto` è la parte che prima non si poteva esprimere: «30 gg dopo
 * Construction» su una fase di otto mesi vuol dire due date diverse a seconda
 * che si conti dall'inizio o dalla fine. Su una milestone — che una fine non
 * ce l'ha — `end` ricade sull'inizio, che è l'unica data che esiste.
 */
export function dataDaAncora(
  ancora: AncoraPasso | null,
  attivita: Map<string, AttivitaProgetto>
): string | null {
  if (!ancora) return null;
  const a = attivita.get(ancora.attivitaId);
  if (!a) return null;

  const base = ancora.punto === "start" ? a.inizio : a.fine ?? a.inizio;
  if (!valida(base)) return null;

  return aggiungiGiorni(base, ancora.offsetGiorni);
}

export function dataEffettiva(
  p: Pick<PassoServizio, "ancora" | "dataForzata">,
  attivita: Map<string, AttivitaProgetto>
): string | null {
  if (valida(p.dataForzata)) return p.dataForzata;
  return dataDaAncora(p.ancora, attivita);
}

export function naturaPasso(
  p: Pick<PassoServizio, "dataForzata">,
  effettiva: string | null
): NaturaPasso {
  if (valida(p.dataForzata)) return "manuale";
  return effettiva ? "calcolata" : "in attesa";
}

/**
 * Deriva i passi, durate comprese.
 *
 * **Le durate si misurano sull'ordine cronologico, non sull'ordine di
 * elenco.** È la differenza fra una durata e un numero negativo: nei dati
 * reali ci sono passi il cui `ordine` non segue le date — su 75 coppie
 * consecutive datate, 5 hanno il successivo per elenco che cade *prima*.
 * Ordinando per data il problema non esiste per costruzione.
 *
 * L'array torna nell'ordine di elenco, perché è quello che le tabelle di
 * compilazione mostrano (spec §6.6): a cambiare è solo come si calcola la
 * durata, non come si legge la lista.
 */
export function derivaPassi(
  passi: PassoServizio[],
  attivita: AttivitaProgetto[]
): PassoDerivato[] {
  const indice = new Map(attivita.map((a) => [a.id, a]));

  const conData = passi.map((p) => {
    const effettiva = dataEffettiva(p, indice);
    return { p, effettiva, natura: naturaPasso(p, effettiva) };
  });

  // L'ordine cronologico serve solo a misurare le distanze.
  const cronologico = conData
    .filter((x) => x.effettiva !== null)
    .sort((a, b) => (a.effettiva! < b.effettiva! ? -1 : a.effettiva! > b.effettiva! ? 1 : a.p.ordine - b.p.ordine));

  const durate = new Map<string, number | null>();
  cronologico.forEach((x, i) => {
    const succ = cronologico[i + 1];
    durate.set(
      x.p.id,
      succ ? differenceInCalendarDays(parseISO(succ.effettiva!), parseISO(x.effettiva!)) : null
    );
  });

  return conData.map(({ p, effettiva, natura }) => ({
    ...p,
    dataEffettiva: effettiva,
    natura,
    durataGiorni: durate.get(p.id) ?? null,
  }));
}

/** «47 gg» sotto i due mesi, poi «2 mesi»: come il prototipo approvato. */
export function etichettaDurata(giorni: number | null): string | null {
  if (giorni === null) return null;
  if (giorni < 60) return `${giorni} gg`;
  return `${Math.round(giorni / 30)} mesi`;
}

// ── Intervallo complessivo, per la riga meta del pannello ─────────────────

export interface Intervallo {
  min: string;
  max: string;
  mesi: number;
}

export function intervallo(
  attivita: AttivitaDerivata[],
  passi: PassoDerivato[]
): Intervallo | null {
  const date = [
    ...attivita.flatMap((a) => [a.inizio, a.fine]),
    ...passi.map((p) => p.dataEffettiva),
  ].filter(valida);

  if (date.length === 0) return null;
  date.sort();

  const min = date[0];
  const max = date[date.length - 1];
  return {
    min,
    max,
    mesi: Math.max(1, Math.round(differenceInCalendarDays(parseISO(max), parseISO(min)) / 30)),
  };
}

/**
 * Dove cade oggi fra due tappe consecutive, 0..1.
 *
 * Serve al marcatore OGGI del pannello (spec §4.1), che non sta su una scala
 * temporale: si posiziona proporzionalmente sul segmento fra le due tappe che
 * lo contengono. `null` quando oggi sta fuori da tutte.
 */
export function posizioneOggi(
  dateOrdinate: string[],
  oggiISO?: string
): { indice: number; frazione: number } | null {
  const valide = dateOrdinate.filter(valida);
  if (valide.length < 2) return null;

  const oggi = valida(oggiISO) ? oggiISO : new Date().toISOString().slice(0, 10);

  for (let i = 0; i < valide.length - 1; i++) {
    const a = valide[i];
    const b = valide[i + 1];
    if (oggi >= a && oggi <= b) {
      const totale = new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
      if (totale <= 0) return { indice: i, frazione: 0 };
      const passati = new Date(`${oggi}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime();
      return { indice: i, frazione: Math.max(0, Math.min(1, passati / totale)) };
    }
  }
  return null;
}

// ── Dipendenze ────────────────────────────────────────────────────────────

/**
 * L'inizio proposto da una dipendenza: la **più tarda** delle fini delle
 * madri (finish-to-start con più predecessori).
 *
 * Con due madri si parte quando l'ultima ha finito, non quando la prima ha
 * finito — altrimenti la dipendenza non dichiara un vincolo, dichiara un
 * augurio. È la stessa regola di `fn_crono_ricalcola` lato database: qui c'è
 * per proporre il valore nel form senza fare un giro sul server.
 */
export function inizioDaDipendenze(
  dipendeDa: string[] | undefined,
  attivita: Map<string, AttivitaProgetto>
): string | null {
  if (!dipendeDa?.length) return null;

  const fini = dipendeDa
    .map((id) => attivita.get(id))
    .map((a) => (a ? a.fine ?? a.inizio : null))
    .filter(valida);

  if (fini.length === 0) return null;
  fini.sort();
  return fini[fini.length - 1];
}

/**
 * Un ciclo renderebbe il ricalcolo infinito, e il database lo rifiuta con
 * un'eccezione. Saperlo prima significa poter spegnere l'opzione nel menu
 * invece di far scegliere al PM una cosa che poi esplode.
 */
export function creaCiclo(
  figlia: string,
  nuovaMadre: string,
  attivita: AttivitaProgetto[]
): boolean {
  if (figlia === nuovaMadre) return true;

  const madri = new Map(attivita.map((a) => [a.id, a.dipendeDa ?? []]));
  const visti = new Set<string>();
  const coda = [nuovaMadre];

  while (coda.length) {
    const nodo = coda.pop()!;
    if (nodo === figlia) return true;
    if (visti.has(nodo)) continue;
    visti.add(nodo);
    coda.push(...(madri.get(nodo) ?? []));
  }
  return false;
}

export const _interno = { GIORNO };
