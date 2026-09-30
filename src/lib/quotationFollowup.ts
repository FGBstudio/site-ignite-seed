/**
 * Quali offerte vanno sollecitate, e quali sono probabilmente perse.
 *
 * «Trentatré offerte pendenti, di cui non so quali siano state approvate.» Il
 * problema non è contarle — quello lo fa già la scheda Pending — è che un elenco
 * di trentatré righe tutte uguali non dice su quale telefonare oggi.
 *
 * La differenza la fanno i giorni dall'invio, e una quarta categoria che i dati
 * hanno mostrato: **le offerte di cui non si sa se sono uscite**. Su 33 pendenti,
 * 17 non hanno una data di invio. Quelle non si sollecitano — si guarda se sono
 * state mandate.
 *
 * Nessun dato nuovo: sono domande sulle date che ci sono già.
 */

/**
 * Dopo quanti giorni dall'invio un'offerta senza risposta va sollecitata.
 *
 * Due settimane: il tempo in cui un cliente che voleva rispondere ha risposto, e
 * prima del quale telefonare è mettere fretta. Sta qui, in una costante sola,
 * perché la domanda «dopo quanti giorni?» non ha una risposta oggettiva e
 * cambiarla dev'essere una riga.
 */
export const GIORNI_PRIMO_SOLLECITO = 14;

/**
 * Dopo quanti giorni un'offerta si considera ferma.
 *
 * Due mesi di silenzio non sono un'offerta in attesa: sono un'offerta persa che
 * nessuno ha chiuso. Tenerla fra le pendenti gonfia il valore aperto con soldi
 * che non arriveranno — nei dati sono 5 offerte su 33.
 */
export const GIORNI_FERMA = 60;

export type FasciaOfferta = "mai_inviata" | "fresca" | "da_sollecitare" | "ferma";

export interface OffertaInAttesa {
  id: string;
  name: string;
  client: string | null;
  quotation_sent_date: string | null;
  /** In euro quando si sa: serve per sommare offerte in valute diverse. */
  total_fees_eur?: number | null;
  total_fees?: number | null;
  currency?: string | null;
  status: string;
}

/** I giorni dall'invio, o null quando non si sa quando è uscita. */
export function giorniDallInvio(
  inviata: string | null | undefined,
  oggi: string,
): number | null {
  if (!inviata) return null;
  const a = new Date(`${inviata}T00:00:00Z`).getTime();
  const b = new Date(`${oggi}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * In quale fascia cade un'offerta.
 *
 * «Mai inviata» non è uno stato peggiore di «da sollecitare»: è un'altra cosa.
 * Una si risolve telefonando al cliente, l'altra guardando nella posta inviata.
 */
export function fasciaOfferta(
  inviata: string | null | undefined,
  oggi: string,
): FasciaOfferta {
  const g = giorniDallInvio(inviata, oggi);
  if (g === null) return "mai_inviata";
  // Una data nel futuro è un errore di digitazione, non un'offerta da
  // sollecitare fra tre mesi: si tratta come fresca.
  if (g < GIORNI_PRIMO_SOLLECITO) return "fresca";
  if (g < GIORNI_FERMA) return "da_sollecitare";
  return "ferma";
}

/** Il valore di un'offerta in euro, quando si sa. Zero non è «non si sa». */
export function valoreInEuro(o: OffertaInAttesa): number {
  const v = o.total_fees_eur ?? (o.currency === "EUR" ? o.total_fees : null);
  return Number(v ?? 0);
}

export interface RiepilogoOfferte {
  in_attesa: number;
  mai_inviate: OffertaInAttesa[];
  fresche: OffertaInAttesa[];
  da_sollecitare: OffertaInAttesa[];
  ferme: OffertaInAttesa[];
  /** Il valore aperto: solo di quello che ha un importo. */
  valore_aperto: number;
  /**
   * Quante offerte non hanno un importo.
   *
   * Sta accanto al valore aperto perché lo spiega: «417.000 su 33 offerte» e
   * «417.000 su 24 offerte, 9 senza importo» sono due frasi diverse, e solo la
   * seconda è vera.
   */
  senza_importo: number;
}

/**
 * Le offerte in attesa, divise per quello che c'è da farne.
 *
 * `oggi` si passa: una funzione che legge l'orologio da sola non si può provare,
 * e questa decide cosa compare in un elenco di solleciti.
 */
export function riepilogoOfferte(
  offerte: OffertaInAttesa[],
  oggi: string,
): RiepilogoOfferte {
  const per: Record<FasciaOfferta, OffertaInAttesa[]> = {
    mai_inviata: [],
    fresca: [],
    da_sollecitare: [],
    ferma: [],
  };
  for (const o of offerte) per[fasciaOfferta(o.quotation_sent_date, oggi)].push(o);

  // Le più vecchie prima: è l'ordine in cui si telefona.
  const perAnzianita = (a: OffertaInAttesa, b: OffertaInAttesa) =>
    (a.quotation_sent_date ?? "9999").localeCompare(b.quotation_sent_date ?? "9999");

  return {
    in_attesa: offerte.length,
    mai_inviate: per.mai_inviata,
    fresche: per.fresca,
    da_sollecitare: [...per.da_sollecitare].sort(perAnzianita),
    ferme: [...per.ferma].sort(perAnzianita),
    valore_aperto:
      Math.round(offerte.reduce((s, o) => s + valoreInEuro(o), 0) * 100) / 100,
    senza_importo: offerte.filter((o) => valoreInEuro(o) === 0).length,
  };
}
