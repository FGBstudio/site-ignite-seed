/**
 * Le settimane dell'anno, come le chiamano in cantiere.
 *
 * «La W40» è un'unità di tempo reale per chi gestisce progetti: le consegne si
 * concordano a settimane, non a giorni. Il diagramma però era graduato in
 * giorni, e su un progetto lungo un anno quella scala costringeva a scorrere
 * trecentosessantacinque colonne per arrivare in fondo.
 *
 * Qui si calcola la settimana **ISO**, che è quella che si usa in Europa: comincia
 * di lunedì, e la settimana 1 è quella che contiene il primo giovedì dell'anno.
 * La differenza non è un dettaglio — col conteggio americano, che comincia di
 * domenica, metà delle date cadrebbe in una settimana diversa da quella che il
 * cliente ha in mente.
 *
 * Niente React e niente database: è aritmetica di calendario, e va messa alla
 * prova perché gli anni a cavallo sono il posto dove questi conti sbagliano.
 */

/** Il lunedì della settimana che contiene questa data. */
export function lunediDellaSettimana(d: Date): Date {
  const g = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay(): 0 è domenica. Per l'ISO la domenica è il settimo giorno.
  const giorno = (g.getUTCDay() + 6) % 7;
  g.setUTCDate(g.getUTCDate() - giorno);
  return g;
}

/**
 * Anno e numero della settimana ISO.
 *
 * L'anno non è sempre quello della data: il 1° gennaio 2027 cade nella settimana
 * 53 del 2026, e scriverlo «2027-W53» indicherebbe una settimana che non esiste.
 */
export function settimanaIso(d: Date): { anno: number; settimana: number } {
  // Il giovedì della stessa settimana decide a quale anno appartiene: è la
  // definizione ISO, e usarla evita tutti i casi limite di fine dicembre.
  const giovedi = lunediDellaSettimana(d);
  giovedi.setUTCDate(giovedi.getUTCDate() + 3);

  const anno = giovedi.getUTCFullYear();
  const primoGennaio = new Date(Date.UTC(anno, 0, 1));
  const giorni = Math.round((giovedi.getTime() - primoGennaio.getTime()) / 86_400_000);
  return { anno, settimana: Math.floor(giorni / 7) + 1 };
}

/** «2026-W40»: una chiave che ordina come il calendario. */
export function chiaveSettimana(d: Date): string {
  const { anno, settimana } = settimanaIso(d);
  return `${anno}-W${String(settimana).padStart(2, "0")}`;
}

export interface Settimana {
  /** «2026-W40». */
  chiave: string;
  /** Il lunedì, in ISO. */
  inizio: string;
  /** La domenica, in ISO. */
  fine: string;
  /** Il numero ISO, per l'etichetta. */
  numero: number;
  anno: number;
  /** Quanti giorni dall'inizio dell'asse: serve a posizionarla nel diagramma. */
  offset: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Le settimane che coprono un intervallo, in fila.
 *
 * `offset` è in giorni dall'inizio dell'asse, non dal lunedì della prima
 * settimana: il diagramma posiziona tutto in giorni, e restituire una misura
 * diversa costringerebbe chi disegna a rifare la conversione — che è il punto
 * in cui le barre si disallineano dalle colonne.
 */
export function settimaneFra(daIso: string, aIso: string, origine?: string): Settimana[] {
  const da = new Date(`${daIso}T00:00:00Z`);
  const a = new Date(`${aIso}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || a < da) return [];

  const zero = new Date(`${origine ?? daIso}T00:00:00Z`);
  const fuori: Settimana[] = [];

  let cur = lunediDellaSettimana(da);
  // Un anno di settimane sono 53 righe; il limite ferma un intervallo assurdo
  // invece di far girare il ciclo per sempre su una data sbagliata.
  for (let i = 0; i < 1200 && cur <= a; i++) {
    const fine = new Date(cur);
    fine.setUTCDate(fine.getUTCDate() + 6);
    const { anno, settimana } = settimanaIso(cur);
    fuori.push({
      chiave: `${anno}-W${String(settimana).padStart(2, "0")}`,
      inizio: iso(cur),
      fine: iso(fine),
      numero: settimana,
      anno,
      offset: Math.round((cur.getTime() - zero.getTime()) / 86_400_000),
    });
    cur = new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return fuori;
}

/**
 * In quale settimana cade una data, fra quelle date.
 *
 * Serve a mettere un appunto nella sua casella: l'appunto porta una data, la
 * griglia porta settimane, e il legame è questo.
 */
export function settimanaDi(settimane: Settimana[], dataIso: string): Settimana | null {
  const k = chiaveSettimana(new Date(`${dataIso}T00:00:00Z`));
  return settimane.find((s) => s.chiave === k) ?? null;
}

/**
 * Il giorno a cui si attacca un appunto creato cliccando su una settimana.
 *
 * Il mercoledì, non il lunedì: un appunto che cade di lunedì sembra una scadenza
 * di inizio settimana, e chi lo rilegge ci crede. Il mercoledì si legge per
 * quello che è — «in quella settimana».
 */
export function giornoDellaSettimana(s: Settimana): string {
  const d = new Date(`${s.inizio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 2);
  return iso(d);
}

/** «W40» o «W40 · 2027» quando l'anno non è quello che si sta guardando. */
export function etichettaSettimana(s: Settimana, annoCorrente?: number): string {
  return annoCorrente != null && s.anno !== annoCorrente
    ? `W${s.numero} · ${s.anno}`
    : `W${s.numero}`;
}
