import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Riempire un modello Word, nel browser.
 *
 * Il PDF dell'offerta lo compone un servizio a parte con LibreOffice, perche'
 * convertire un .docx in PDF mantenendo l'impaginazione richiede un motore di
 * impaginazione vero, e in JavaScript non esiste. Ma quel servizio fa due cose,
 * e solo la seconda ha bisogno di un server: riempire il modello e convertirlo.
 *
 * Riempirlo e' manipolare uno zip di XML, e si fa benissimo qui. Il risultato e'
 * un .docx identico al modello con dentro i dati: chi lo riceve lo apre in Word,
 * ritocca quello che deve — su un'offerta capita spesso — e fa «Salva con nome
 * → PDF». Un passaggio in piu' rispetto al PDF diretto, in cambio di zero
 * infrastruttura da creare e mantenere.
 *
 * Importante: il modello resta `template_offerta.docx`, lo stesso file che usa
 * il servizio Python. Non c'e' un secondo layout scritto in codice che prima o
 * poi divergerebbe da quello approvato — qui si sostituisce del testo dentro il
 * documento, l'impaginazione e' e resta quella del Word.
 *
 * Si parla la stessa sintassi di `docxtpl`, limitata a cio' che i modelli
 * usano davvero:
 *
 *     {{ nome }}              un valore
 *     {{ voce.importo }}      un valore dentro un oggetto
 *     {%p for v in voci %}    ripete i paragrafi fino a endfor
 *     {%p endfor %}
 *     {%p if scadenza %}      tiene i paragrafi solo se il valore c'e'
 *     {%p endif %}
 *
 * Il suffisso `p` vuol dire «paragrafo»: la riga che contiene il comando
 * sparisce dal documento, non lascia un vuoto.
 */

export type Contesto = Record<string, unknown>;

/** Le parti del documento dove cercare i segnaposto. */
const PARTI = /^word\/(document|header\d*|footer\d*)\.xml$/;

/**
 * Un paragrafo per volta.
 *
 * `<w:p>` non si annida mai in un documento Word, quindi cercarlo con una
 * espressione non avida e' sicuro: ogni risultato e' un paragrafo intero.
 */
const PARAGRAFO = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;

/** Il testo che si legge in un paragrafo, ricucito dai suoi pezzi. */
function testoDi(paragrafo: string): string {
  return [...paragrafo.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

/**
 * Il valore dietro un nome, anche con il punto.
 *
 * `voce.importo` scende dentro l'oggetto. Quello che non esiste diventa stringa
 * vuota e non «undefined»: un buco nel documento e' meno grave di una parola
 * inglese in mezzo a un'offerta.
 */
function valore(ctx: Contesto, percorso: string): unknown {
  return percorso
    .trim()
    .split(".")
    .reduce<unknown>(
      (dentro, passo) =>
        dentro && typeof dentro === "object" ? (dentro as Contesto)[passo] : undefined,
      ctx,
    );
}

function comeTesto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** XML non ammette questi caratteri nudi: un cliente che si chiama «Rossi & C.» romperebbe il file. */
function perXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sostituisce un testo dentro un paragrafo, attraversando i pezzi.
 *
 * Word spezza il testo a ogni cambio di formato, e in punti che non seguono
 * nessuna logica leggibile: `{{ prezzo_finale }}` puo' benissimo essere diviso
 * dopo la prima graffa. Cercare il segnaposto dentro un singolo `<w:t>` non lo
 * troverebbe quasi mai.
 *
 * Quindi si ricuce il testo del paragrafo, si cerca li', e si riscrivono solo i
 * pezzi coperti: il primo prende il valore, gli altri perdono la loro parte. Il
 * valore eredita cosi' il formato del segnaposto, che e' esattamente il formato
 * che gli aveva dato chi ha disegnato il modello.
 *
 * I pezzi si svuotano invece di sparire: togliere un `<w:r>` significa toccare
 * la struttura del paragrafo, e un file che si apre vale piu' di un file pulito.
 */
function sostituisci(paragrafo: string, cerca: string, sostituto: string): string {
  const pezzi = [...paragrafo.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
  if (pezzi.length === 0) return paragrafo;

  const intero = pezzi.map((m) => m[2]).join("");
  const da = intero.indexOf(cerca);
  if (da < 0) return paragrafo;
  const a = da + cerca.length;

  let cursore = 0;
  const nuovi = pezzi.map((m) => {
    const testo = m[2];
    const inizio = cursore;
    const fine = cursore + testo.length;
    cursore = fine;
    if (fine <= da || inizio >= a) return testo;

    const prima = inizio < da ? testo.slice(0, da - inizio) : "";
    const dopo = fine > a ? testo.slice(a - inizio) : "";
    return prima + (inizio <= da ? sostituto : "") + dopo;
  });

  let k = 0;
  return paragrafo.replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (_, apre: string, __: string, chiude: string) => {
      const t = nuovi[k++];
      // `xml:space="preserve"` serve appena il testo comincia o finisce con uno
      // spazio: senza, Word lo mangia e «TOTAL.   1.500» perde l'allineamento.
      const apreConSpazio = /xml:space=/.test(apre)
        ? apre
        : apre.replace(/>$/, ' xml:space="preserve">');
      return `${t !== t.trim() ? apreConSpazio : apre}${t}${chiude}`;
    },
  );
}

/** Tutti i `{{ … }}` di un paragrafo, risolti. */
function riempi(paragrafo: string, ctx: Contesto): string {
  let fatto = paragrafo;
  // Si rifa' la ricerca a ogni giro invece di ciclare su una lista: dopo una
  // sostituzione le posizioni cambiano, e un paragrafo puo' contenerne piu' di
  // uno — «TOTAL. {{ prezzo_listino_txt }} {{ prezzo_finale }} Euro».
  for (let giro = 0; giro < 100; giro++) {
    const m = testoDi(fatto).match(/\{\{\s*([\w.]+)\s*\}\}/);
    if (!m) break;
    fatto = sostituisci(fatto, m[0], perXml(comeTesto(valore(ctx, m[1]))));
  }
  return fatto;
}

type Comando =
  | { tipo: "for"; variabile: string; lista: string }
  | { tipo: "if"; condizione: string }
  | { tipo: "endfor" }
  | { tipo: "endif" }
  | null;

function comandoDi(paragrafo: string): Comando {
  const t = testoDi(paragrafo);
  const m = t.match(/\{%p?\s*(for|if|endfor|endif)\b\s*([^%]*?)\s*%\}/);
  if (!m) return null;
  if (m[1] === "endfor") return { tipo: "endfor" };
  if (m[1] === "endif") return { tipo: "endif" };
  if (m[1] === "if") return { tipo: "if", condizione: m[2] };
  const f = m[2].match(/^(\w+)\s+in\s+([\w.]+)$/);
  return f ? { tipo: "for", variabile: f[1], lista: f[2] } : null;
}

/** Dove si trova ciascun paragrafo dentro l'XML. */
interface Trovato {
  xml: string;
  da: number;
  a: number;
}

function paragrafiDi(xml: string): Trovato[] {
  return [...xml.matchAll(new RegExp(PARAGRAFO.source, "g"))].map((m) => ({
    xml: m[0],
    da: m.index,
    a: m.index + m[0].length,
  }));
}

/** I segnaposto di ogni paragrafo, lasciando intatto tutto il resto dell'XML. */
function riempiTutti(xml: string, ctx: Contesto): string {
  return xml.replace(new RegExp(PARAGRAFO.source, "g"), (p) => riempi(p, ctx));
}

/**
 * Elabora un pezzo di documento: cicli, condizioni e segnaposto.
 *
 * Lavora su intervalli della stringa XML, non su una lista di paragrafi
 * staccati. La differenza non è stilistica: fra un paragrafo e il successivo
 * c'è l'XML che apre e chiude tabelle, righe e celle, e un ciclo che da un
 * paragrafo ne produce dieci cambia il numero dei paragrafi ma non quello dei
 * contorni. Ricomponendo per elenco, quei contorni si perdono e il file non si
 * apre più. Tenendo gli intervalli, tutto ciò che sta intorno resta dov'era.
 */
function elaboraXml(xml: string, ctx: Contesto): string {
  const par = paragrafiDi(xml);

  // Il primo comando di questo livello.
  const i = par.findIndex((p) => comandoDi(p.xml) !== null);
  if (i < 0) return riempiTutti(xml, ctx);

  const comando = comandoDi(par[i].xml)!;

  // endfor/endif spaiati: la loro riga sparisce e si tira dritto. Un modello
  // rotto non deve impedire di produrre il documento — una riga mancante si
  // vede, un'eccezione lascerebbe davanti a un pulsante che non fa niente.
  if (comando.tipo === "endfor" || comando.tipo === "endif") {
    return (
      riempiTutti(xml.slice(0, par[i].da), ctx) + elaboraXml(xml.slice(par[i].a), ctx)
    );
  }

  const chiude = comando.tipo === "for" ? "endfor" : "endif";
  let livello = 0;
  let fine = -1;
  for (let j = i + 1; j < par.length; j++) {
    const c = comandoDi(par[j].xml);
    if (!c) continue;
    if (c.tipo === comando.tipo) livello++;
    else if (c.tipo === chiude) {
      if (livello === 0) {
        fine = j;
        break;
      }
      livello--;
    }
  }
  if (fine < 0) {
    // Apertura senza chiusura: si butta via il comando e si continua.
    return (
      riempiTutti(xml.slice(0, par[i].da), ctx) + elaboraXml(xml.slice(par[i].a), ctx)
    );
  }

  const prima = riempiTutti(xml.slice(0, par[i].da), ctx);
  const corpo = xml.slice(par[i].a, par[fine].da);
  const dopo = elaboraXml(xml.slice(par[fine].a), ctx);

  if (comando.tipo === "for") {
    const lista = valore(ctx, comando.lista);
    const ripetuto = (Array.isArray(lista) ? lista : [])
      .map((elemento) => elaboraXml(corpo, { ...ctx, [comando.variabile]: elemento }))
      .join("");
    return prima + ripetuto + dopo;
  }

  const v = valore(ctx, comando.condizione);
  // Vuoto, zero, assente: tutti «no». È la regola di Jinja, ed è quella che il
  // modello si aspetta — `{%p if po %}` deve sparire quando il PO manca.
  const vero = Array.isArray(v) ? v.length > 0 : Boolean(v) && v !== "";
  return prima + (vero ? elaboraXml(corpo, ctx) : "") + dopo;
}

/**
 * Riempie un modello .docx e restituisce il documento finito.
 *
 * @param modello i byte del file .docx
 * @param ctx     i valori dei segnaposto
 */
export function compilaDocx(modello: Uint8Array, ctx: Contesto): Uint8Array {
  const zip = unzipSync(modello);

  /**
   * I byte del testo, in una forma che chi ricomprime riconosce come file.
   *
   * `strToU8` passa da `TextEncoder`, e dove convivono piu' contesti di
   * esecuzione — jsdom sotto i test — l'array che ne esce non risulta un
   * `Uint8Array` per la libreria, che lo scambia per una cartella e trasforma
   * ogni singolo byte in una voce dello zip: da 41 file a 47.000, e il
   * documento non si apre piu'.
   *
   * Si riusa quindi il costruttore degli array usciti dalla lettura dello zip,
   * che per definizione e' quello giusto.
   */
  const campione = Object.values(zip)[0];
  const byte = (testo: string): Uint8Array => {
    const u = strToU8(testo);
    const C = campione?.constructor as Uint8ArrayConstructor | undefined;
    return C && C !== u.constructor ? new C(u) : u;
  };

  for (const nome of Object.keys(zip)) {
    if (!PARTI.test(nome)) continue;
    const xml = strFromU8(zip[nome]);
    // Niente segnaposto, niente da fare: si evita di riscrivere parti grosse
    // (l'intestazione con il logo) senza motivo.
    if (!xml.includes("{{") && !xml.includes("{%")) continue;
    zip[nome] = byte(elaboraXml(xml, ctx));
  }

  return zipSync(zip);
}

export const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Un nome di file che Windows accetta: niente `\ / : * ? " < > |`. */
export function nomeFileSicuro(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}
