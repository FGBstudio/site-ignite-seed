/**
 * Mette l'emittente nei template Word.
 *
 * I due template avevano i dati della società UK scritti dentro il documento:
 * il piede di pagina in tutti e due, e nella fattura anche le coordinate
 * bancarie nel corpo. Finché la società era una sola funzionava. Con due, ogni
 * documento esce intestato alla UK qualunque cosa abbia scelto chi lo emette —
 * e su una fattura non è un dettaglio grafico: è la partita IVA di un'altra
 * società sopra un documento fiscale, e un IBAN che non è quello su cui il
 * cliente deve pagare.
 *
 * Qui quei pezzi diventano segnaposto Jinja, che `docxtpl` riempie con la
 * società scelta.
 *
 * Perché uno script e non una modifica a mano: Word spezza il testo a ogni
 * cambio di formato, e la divisione non segue nessuna logica leggibile. «FGB
 * studio * Zmyrna limited» sono tre pezzi nell'offerta e tre *diversi* nella
 * fattura; «London E18 1BD» è spezzato dopo la «B». Qualunque sostituzione
 * fatta cercando il testo intero fallirebbe in silenzio. Questo script ricuce i
 * pezzi, sostituisce, e ridivide.
 *
 * È idempotente: su un template già fatto non tocca niente.
 *
 * Uso:  node servizio-offerte/strumenti/emittente_nel_template.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const QUI = dirname(fileURLToPath(import.meta.url));
const CARTELLA = join(QUI, "..");

const FOOTER = /^word\/footer\d*\.xml$/;
const CORPO = /^word\/document\.xml$/;

/**
 * Cosa sostituire, template per template.
 *
 * Il testo cercato è scritto com'è nel documento, non com'è ragionevole che
 * sia: nella fattura il piede finisce con un trattino lungo (–) e nel
 * corpo «Limited» è maiuscolo mentre nel piede è minuscolo. Normalizzare qui
 * vorrebbe dire non trovare niente.
 */
const RICETTE = [
  {
    file: "template_offerta.docx",
    parti: [
      {
        dove: FOOTER,
        coppie: [
          ["FGB studio * Zmyrna limited", "{{ emittente_ragione_sociale }}"],
          ["3 The Shrubberies - George Lane - London E18 1BD - UK", "{{ emittente_indirizzo }}"],
          // «VAT » era un prefisso fisso prima del numero, e con una società
          // italiana sarebbe sbagliato: la sigla giusta arriva dentro il valore.
          ["VAT GB 215421643", "{{ emittente_piva }}"],
        ],
      },
    ],
  },
  {
    file: "template_fattura_uk.docx",
    parti: [
      {
        dove: FOOTER,
        coppie: [
          ["FGB studio * Zmyrna limited", "{{ emittente_ragione_sociale }}"],
          [
            "The Shrubberies - George Lane - London E18 1BD – UK",
            "{{ emittente_indirizzo }}",
          ],
          ["VAT GB 215421643", "{{ emittente_piva }}"],
        ],
      },
      {
        // Le coordinate bancarie. Le etichette («Bank», «Iban», «Bic») restano
        // dove sono: fanno parte del modulo, non del dato. Si sostituiscono
        // solo i valori.
        dove: CORPO,
        coppie: [
          ["HSBC London Bridge Branch", "{{ emittente_banca }}"],
          // L'intestatario del conto è la società che emette: stesso dato del
          // piede, stesso segnaposto.
          ["FGB studio * Zmyrna Limited", "{{ emittente_ragione_sociale }}"],
          ["76185988", "{{ emittente_conto }}"],
          ["GB52 HBUK 4012 7676 1859 88", "{{ emittente_iban }}"],
          ["HBUKGB4B", "{{ emittente_bic }}"],
        ],
      },
    ],
  },
];

/**
 * Sostituisce un testo dentro un XML Word, attraversando i run.
 *
 * Lavora un paragrafo per volta — fuori da un `<w:p>` il testo non è contiguo e
 * ricucirlo non vorrebbe dire niente. Dentro il paragrafo concatena i `<w:t>`,
 * cerca il testo sull'intero, e poi riscrive solo i run che lo coprono: il
 * primo prende il segnaposto (più quello che c'era prima e dopo nello stesso
 * run), gli altri perdono la parte coperta.
 *
 * I run si svuotano invece di sparire: togliere un `<w:r>` significa toccare la
 * struttura del paragrafo, e un file che si apre vale più di un file pulito.
 */
function sostituisci(xml, cerca, segnaposto) {
  const paragrafi = xml.split(/(<\/w:p>)/);
  let fatte = 0;

  for (let i = 0; i < paragrafi.length; i++) {
    const p = paragrafi[i];
    if (!p.includes("<w:t")) continue;

    const run = [...p.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
    if (run.length === 0) continue;

    const intero = run.map((m) => m[2]).join("");
    const da = intero.indexOf(cerca);
    if (da < 0) continue;
    const a = da + cerca.length;

    // Dove comincia ciascun run dentro il testo ricucito.
    let cursore = 0;
    const nuovi = run.map((m) => {
      const testo = m[2];
      const inizio = cursore;
      const fine = cursore + testo.length;
      cursore = fine;

      if (fine <= da || inizio >= a) return testo; // fuori dal tratto coperto

      const prima = inizio < da ? testo.slice(0, da - inizio) : "";
      const dopo = fine > a ? testo.slice(a - inizio) : "";
      // Il segnaposto va tutto nel primo run coperto, mai spezzato: docxtpl
      // cerca `{{ … }}` dentro un singolo run e un segnaposto diviso a metà
      // resterebbe stampato così com'è sul documento.
      const nucleo = inizio <= da ? segnaposto : "";
      return prima + nucleo + dopo;
    });

    let k = 0;
    paragrafi[i] = p.replace(
      /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
      (_, apre, __, chiude) => `${apre}${nuovi[k++]}${chiude}`,
    );
    fatte++;
  }

  return { xml: paragrafi.join(""), fatte };
}

function lavora(ricetta) {
  const percorso = join(CARTELLA, ricetta.file);
  if (!existsSync(percorso)) {
    console.log(`${ricetta.file}: non c'è, saltato.`);
    return;
  }

  const zip = unzipSync(readFileSync(percorso));
  let cambiato = false;
  const esito = [];

  for (const parte of ricetta.parti) {
    const nomi = Object.keys(zip).filter((k) => parte.dove.test(k));
    if (nomi.length === 0) {
      console.warn(`${ricetta.file}: nessun file per ${parte.dove}`);
      continue;
    }

    for (const nome of nomi) {
      let xml = strFromU8(zip[nome]);
      if (xml.includes("{{ emittente_")) {
        esito.push(`${nome}: già fatto`);
        continue;
      }

      let quante = 0;
      for (const [cerca, segnaposto] of parte.coppie) {
        const r = sostituisci(xml, cerca, segnaposto);
        if (r.fatte === 0) {
          console.warn(`  ${nome}: non trovato ${JSON.stringify(cerca)}`);
          continue;
        }
        xml = r.xml;
        quante += r.fatte;
      }

      if (quante > 0) {
        zip[nome] = strToU8(xml);
        cambiato = true;
      }
      esito.push(`${nome}: ${quante}/${parte.coppie.length}`);
    }
  }

  if (cambiato) writeFileSync(percorso, Buffer.from(zipSync(zip)));
  console.log(`${ricetta.file} — ${esito.join(" | ")}${cambiato ? "" : " (nessuna modifica)"}`);
}

for (const r of RICETTE) lavora(r);
