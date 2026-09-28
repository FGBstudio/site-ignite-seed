/**
 * Quello che si ricava da una fattura letta, prima che una persona confermi.
 *
 * Il modello legge il PDF e restituisce campi; qui si decide cosa farne: quale
 * anagrafica gia' esistente corrisponde, quali campi mancano, e come si
 * presenta la bozza a chi deve rivedere. Nessun accesso al database, nessun
 * React: e' la parte che si puo' mettere alla prova, e va messa alla prova
 * perche' un numero sbagliato qui diventa un fatturato sbagliato per sempre.
 */

/** La lettura grezza che torna dalla edge function `leggi-fattura`. */
export interface LetturaFattura {
  numero: string | null;
  data_emissione: string | null;
  data_scadenza: string | null;
  termini_giorni: number | null;
  valuta: string | null;
  imponibile: number | null;
  iva: number | null;
  totale: number | null;
  emittente: AnagraficaLetta;
  cliente: AnagraficaLetta;
  descrizione?: string | null;
  diario?: string;
  modello?: string;
}

export interface AnagraficaLetta {
  ragione_sociale: string | null;
  partita_iva?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  paese?: string | null;
  iban?: string | null;
}

/** Un'anagrafica gia' a sistema, ridotta a quello che serve per abbinare. */
export interface ContattoNoto {
  id: string;
  company_name: string;
  vat_number?: string | null;
}

export const VALUTE_AMMESSE = ["EUR", "GBP", "CNY", "USD"] as const;
export type ValutaAmmessa = (typeof VALUTE_AMMESSE)[number];

/**
 * La partita IVA ridotta a cio' che la identifica.
 *
 * Sulla carta la stessa azienda e' «IT 048 4689 0285», «IT04846890285» e
 * «04846890285» a seconda di chi ha impaginato: confrontarle come stringhe
 * vuol dire creare tre anagrafiche per una societa' sola. Si tolgono spazi e
 * punteggiatura, si porta in maiuscolo, e si toglie il prefisso di due lettere
 * del paese — che e' un'informazione vera ma non distingue nessuno all'interno
 * dello stesso paese.
 */
export function chiavePartitaIva(v: string | null | undefined): string | null {
  const pulito = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!pulito) return null;
  const senzaPaese = /^[A-Z]{2}\d/.test(pulito) ? pulito.slice(2) : pulito;
  return senzaPaese.length >= 5 ? senzaPaese : null;
}

/**
 * Il nome ridotto a cio' che lo identifica.
 *
 * «FGB studio S.r.l.», «FGB STUDIO srl» e «Fgb Studio S.R.L.» sono la stessa
 * societa'. Si abbassa tutto, si tolgono punteggiatura e forme societarie, e
 * si comprimono gli spazi. Non e' un confronto infallibile — per quello c'e'
 * la partita IVA — ma e' quello che permette di proporre un abbinamento
 * quando la partita IVA sul documento non c'e'.
 */
const FORME = /\b(srls|srl|spa|sas|snc|spa|ltd|limited|llc|inc|gmbh|bv|plc)\b/g;

export function chiaveNome(v: string | null | undefined): string {
  return (
    (v ?? "")
      .toLowerCase()
      // I punti spariscono invece di diventare spazi, e l'ordine conta: e'
      // quello che fa diventare «S.r.l.» la parola «srl», riconoscibile.
      // Togliendoli come spazi resterebbe «s r l», che non assomiglia a
      // nessuna forma societaria e resterebbe attaccato al nome.
      .replace(/[.'`]/g, "")
      .replace(/[^a-z0-9àèéìòù]/g, " ")
      .replace(/\s+/g, " ")
      .replace(FORME, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export type MotivoAbbinamento = "partita_iva" | "nome" | null;

export interface Abbinamento {
  contatto: ContattoNoto | null;
  motivo: MotivoAbbinamento;
}

/**
 * A quale anagrafica gia' nota corrisponde quella letta sul documento.
 *
 * Prima la partita IVA, che identifica; poi il nome, che assomiglia. L'ordine
 * conta: due societa' dello stesso gruppo possono chiamarsi quasi uguale e
 * avere partite IVA diverse, e in quel caso il nome sbaglierebbe da solo.
 *
 * Restituisce anche PERCHE' ha abbinato, perche' chi rivede deve poter
 * distinguere «è lo stesso codice fiscale» da «si chiama in modo simile».
 */
export function abbinaContatto(
  letta: AnagraficaLetta | null | undefined,
  noti: ContattoNoto[],
): Abbinamento {
  if (!letta) return { contatto: null, motivo: null };

  const piva = chiavePartitaIva(letta.partita_iva);
  if (piva) {
    const perPiva = noti.find((c) => chiavePartitaIva(c.vat_number) === piva);
    if (perPiva) return { contatto: perPiva, motivo: "partita_iva" };
  }

  const nome = chiaveNome(letta.ragione_sociale);
  if (nome.length >= 3) {
    const perNome = noti.find((c) => chiaveNome(c.company_name) === nome);
    if (perNome) return { contatto: perNome, motivo: "nome" };
  }

  return { contatto: null, motivo: null };
}

/** La bozza che si presenta a chi rivede: tutti i campi, tutti modificabili. */
export interface BozzaFattura {
  numero: string;
  dataEmissione: string;
  terminiGiorni: number;
  valuta: ValutaAmmessa;
  imponibile: string;
  iva: string;
  totale: string;
  incassata: boolean;
  dataIncasso: string;
  note: string;
}

/** I giorni di dilazione predefiniti, quando il documento non li dice. */
const TERMINI_PREDEFINITI = 30;

/**
 * Quanti giorni separano emissione e scadenza.
 *
 * Se il documento porta solo la data di scadenza, i giorni si ricavano invece
 * di lasciarli al valore predefinito: scrivere 30 quando sul documento c'e'
 * scritto 90 sposta la scadenza di due mesi, e la scadenza e' quello che fa
 * partire i solleciti.
 */
export function giorniTraDate(emissione: string | null, scadenza: string | null): number | null {
  if (!emissione || !scadenza) return null;
  const a = Date.parse(`${emissione}T00:00:00Z`);
  const b = Date.parse(`${scadenza}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const giorni = Math.round((b - a) / 86_400_000);
  return giorni >= 0 && giorni <= 365 ? giorni : null;
}

/** Un numero come lo scrive un contabile, riportato a numero. */
export function numeroPulito(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/[€$£\s]/g, "");
  if (!t) return null;
  // «1.234,56» all'italiana, «1,234.56» all'inglese: decide l'ultimo separatore.
  const ultimaVirgola = t.lastIndexOf(",");
  const ultimoPunto = t.lastIndexOf(".");
  let normale = t;
  if (ultimaVirgola > ultimoPunto) normale = t.replace(/\./g, "").replace(",", ".");
  else if (ultimoPunto > ultimaVirgola) normale = t.replace(/,/g, "");
  else normale = t.replace(",", ".");
  const n = Number(normale);
  return Number.isFinite(n) ? n : null;
}

/** Da lettura a bozza: nessuna invenzione, solo conversioni e ripieghi dichiarati. */
export function bozzaDaLettura(l: LetturaFattura): BozzaFattura {
  const emissione = l.data_emissione ?? "";
  const termini =
    l.termini_giorni ?? giorniTraDate(l.data_emissione, l.data_scadenza) ?? TERMINI_PREDEFINITI;
  const valuta = (VALUTE_AMMESSE as readonly string[]).includes((l.valuta ?? "").toUpperCase())
    ? ((l.valuta ?? "EUR").toUpperCase() as ValutaAmmessa)
    : "EUR";

  const numero = (v: number | null) => (v == null ? "" : String(v));

  return {
    numero: l.numero?.trim() ?? "",
    dataEmissione: emissione,
    terminiGiorni: termini,
    valuta,
    imponibile: numero(l.imponibile),
    iva: numero(l.iva),
    totale: numero(l.totale),
    // Una fattura di due anni fa e' quasi sempre incassata, ed e' l'ipotesi
    // meno dannosa: entrando aperta finirebbe in Recall domani mattina.
    incassata: true,
    dataIncasso: "",
    note: l.descrizione?.trim() ?? "",
  };
}

export type Avviso = { campo: string; testo: string; grave: boolean };

/**
 * Cosa guardare prima di salvare.
 *
 * Non blocca: segnala. Un avviso grave e' un dato che manca o non torna e che
 * renderebbe la riga falsa; un avviso lieve e' qualcosa che vale la pena
 * controllare ma che puo' essere legittimo.
 */
export function avvisi(b: BozzaFattura, l: LetturaFattura): Avviso[] {
  const out: Avviso[] = [];
  const tot = numeroPulito(b.totale);
  const imp = numeroPulito(b.imponibile);
  const iva = numeroPulito(b.iva);

  if (!b.numero.trim()) {
    out.push({ campo: "numero", testo: "Manca il numero: una fattura importata deve portare il suo", grave: true });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dataEmissione)) {
    out.push({ campo: "dataEmissione", testo: "Manca la data di emissione", grave: true });
  }
  if (tot == null || tot <= 0) {
    out.push({ campo: "totale", testo: "Manca il totale", grave: true });
  }

  // Imponibile + IVA deve fare il totale. Un centesimo di scarto e'
  // arrotondamento; di piu' vuol dire che un numero e' stato letto male.
  if (tot != null && imp != null && iva != null) {
    const scarto = Math.abs(imp + iva - tot);
    if (scarto > 0.01) {
      out.push({
        campo: "totale",
        testo: `Imponibile + IVA fa ${(imp + iva).toFixed(2)}, il totale dice ${tot.toFixed(2)}`,
        grave: true,
      });
    }
  }

  if (b.incassata && b.dataIncasso && b.dataIncasso < b.dataEmissione) {
    out.push({ campo: "dataIncasso", testo: "L'incasso e' prima dell'emissione", grave: true });
  }

  if (!l.cliente?.ragione_sociale) {
    out.push({ campo: "cliente", testo: "Il cliente non e' stato letto: sceglilo a mano", grave: false });
  }
  if (l.totale != null && tot != null && Math.abs(l.totale - tot) > 0.01) {
    out.push({ campo: "totale", testo: "Il totale e' stato corretto a mano rispetto alla lettura", grave: false });
  }

  return out;
}

/** Vero quando non resta niente di grave: solo allora si puo' salvare. */
export function importabile(b: BozzaFattura, l: LetturaFattura): boolean {
  return !avvisi(b, l).some((a) => a.grave);
}

/**
 * I campi da riempire creando un'anagrafica nuova da quello che c'era in
 * fattura. Quello che il documento non dice resta vuoto: meglio un contatto
 * incompleto che uno inventato, perche' questi campi finiscono sull'
 * intestazione delle fatture future.
 */
export function contattoDaLettura(a: AnagraficaLetta, kind: "client" | "issuer") {
  const pulisci = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    kind,
    company_name: (a.ragione_sociale ?? "").trim(),
    vat_number: pulisci(a.partita_iva),
    address: pulisci(a.indirizzo),
    postal_code: pulisci(a.cap),
    city: pulisci(a.citta),
    country: pulisci(a.paese),
    iban: pulisci(a.iban),
    notes: "Anagrafica creata leggendo una fattura gia' emessa.",
  };
}
