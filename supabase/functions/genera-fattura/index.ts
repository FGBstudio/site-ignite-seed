/**
 * Genera il documento della fattura — in Word, non in PDF.
 *
 * Stesso percorso collaudato per le offerte: il lavoro lo fa il servizio Python
 * su Render, che ha LibreOffice e i template. Questa funzione sta in mezzo per la
 * chiave, che in una SPA statica su GitHub Pages finirebbe nel bundle pubblico.
 *
 * Due cose la distinguono da `genera-offerta`.
 *
 * **Ci si ferma al .docx.** Il servizio sa convertire, ma qui il Word è il
 * prodotto: è quello che l'amministrazione deve poter ritoccare prima di mandarlo.
 *
 * **Il contenuto non arriva dal browser.** `genera-offerta` riceve il payload già
 * composto; qui arriva solo `invoice_id` e il resto si legge dal database. Una
 * fattura è un documento contabile: quello che c'è scritto dev'essere quello che è
 * registrato, e un payload che passa dal browser è un payload che si può
 * modificare per strada.
 *
 * ── Cosa manca, e non sta qui ────────────────────────────────────────────────
 * Il servizio su Render deve avere l'endpoint `/fattura` e il template .docx
 * della fattura (quello di Bottega Veneta 2.946). Finché non ci sono, questa
 * funzione risponde 503 dicendolo: è il solo modo perché l'errore mandi nel posto
 * giusto invece che a cercare nel codice.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errore(messaggio: string, stato: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ errore: messaggio, ...extra }), {
    status: stato,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * La data come la scrive il template: «February 27th, 2026».
 *
 * Il formato inglese con l'ordinale è quello dei documenti veri, e va composto
 * qui: chiederlo al servizio vorrebbe dire due posti che decidono come si scrive
 * una data.
 */
function dataInglese(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const mesi = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const g = d.getUTCDate();
  // 11th, 12th, 13th sono le eccezioni che la regola del «1st/2nd/3rd» sbaglia.
  const suffisso =
    g % 100 >= 11 && g % 100 <= 13
      ? "th"
      : g % 10 === 1
        ? "st"
        : g % 10 === 2
          ? "nd"
          : g % 10 === 3
            ? "rd"
            : "th";
  return `${mesi[d.getUTCMonth()]} ${g}${suffisso}, ${d.getUTCFullYear()}`;
}

/**
 * L'importo come lo scrive il documento: «8.750,00 Euro».
 *
 * Nell'archivio la valuta è scritta per esteso in 304 righe su 305 — «Euro», non
 * «EUR». Si scrive come la scrivete voi.
 */
const NOME_VALUTA: Record<string, string> = {
  EUR: "Euro",
  GBP: "Pounds",
  USD: "Dollars",
  CNY: "RMB",
};

function importoScritto(v: number, valuta: string): string {
  const n = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
  return `${n} ${NOME_VALUTA[valuta] ?? valuta}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return errore("Metodo non ammesso", 405);

  // Gli stessi segreti delle offerte: è lo stesso servizio, con un endpoint in
  // più. Due coppie di segreti per lo stesso host sarebbero due cose da tenere
  // allineate a mano.
  const url = Deno.env.get("OFFERTE_URL");
  const chiave = Deno.env.get("OFFERTE_API_KEY");
  if (!url || !chiave) {
    return errore(
      "Servizio documenti non configurato: mancano i segreti OFFERTE_URL e OFFERTE_API_KEY",
      503,
    );
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: utente } = await supabase.auth.getUser();
  if (!utente?.user) return errore("Non autenticato", 401);

  const { data: ruoli } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", utente.user.id);

  // Una fattura la stampa l'amministrazione. Un PM può fare un'offerta, non un
  // documento contabile.
  const ammesso = (ruoli ?? []).some((r: { role: string }) =>
    ["ADMIN"].includes(String(r.role).toUpperCase()),
  );
  if (!ammesso) return errore("Solo l'amministrazione può generare una fattura", 403);

  let corpo: { invoice_id?: string };
  try {
    corpo = await req.json();
  } catch {
    return errore("Corpo della richiesta non è JSON valido", 400);
  }
  if (!corpo.invoice_id) return errore("Manca invoice_id", 400);

  // ── Quello che va sul documento, letto dove è registrato ──────────────────
  const { data: fattura, error: errFattura } = await supabase
    .from("v_invoices")
    .select("*")
    .eq("id", corpo.invoice_id)
    .maybeSingle();
  if (errFattura) return errore(`Fattura non leggibile: ${errFattura.message}`, 500);
  if (!fattura) return errore("La fattura indicata non esiste", 404);

  const { data: righe, error: errRighe } = await supabase
    .from("invoice_righe")
    .select("descrizione, importo, ordine")
    .eq("invoice_id", corpo.invoice_id)
    .order("ordine");
  if (errRighe) return errore(`Righe non leggibili: ${errRighe.message}`, 500);
  if (!righe || righe.length === 0) {
    // Le 69 fatture storiche non hanno righe: sono entrate da import col solo
    // totale. Dirlo è meglio che stampare un documento con il corpo vuoto.
    return errore(
      "Questa fattura non ha righe registrate: il documento uscirebbe senza il dettaglio. Aggiungi le righe, o allega il Word originale.",
      422,
    );
  }

  const { data: contatti, error: errContatti } = await supabase
    .from("contacts")
    .select(
      "id, company_name, address, city, postal_code, country, vat_number, tax_code, bank_name, bank_account, iban, bic, entity_code",
    )
    .in(
      "id",
      [fattura.issuer_contact_id, fattura.client_contact_id].filter(Boolean) as string[],
    );
  if (errContatti) return errore(`Anagrafiche non leggibili: ${errContatti.message}`, 500);

  const emittente = (contatti ?? []).find((c) => c.id === fattura.issuer_contact_id);
  const cliente = (contatti ?? []).find((c) => c.id === fattura.client_contact_id);
  if (!emittente) return errore("La società emittente non è in anagrafica", 422);
  if (!cliente) return errore("L'intestatario della fattura non è in anagrafica", 422);

  /**
   * Il marchio e la dicitura del servizio.
   *
   * Nessuno dei due sta su `v_invoices`, e non dovrebbero: il marchio è del sito
   * e la dicitura è del catalogo. Si leggono dove stanno, e solo quando la
   * fattura riguarda un progetto solo — con due progetti non c'è «il» servizio,
   * e le righe lo dicono meglio di un'intestazione.
   */
  let brand = "";
  let descrizioneServizio = "";
  if (fattura.certification_id) {
    const [{ data: progetto }, { data: dicitura }] = await Promise.all([
      supabase
        .from("certifications")
        .select("sites ( brands ( name ) )")
        .eq("id", fattura.certification_id)
        .maybeSingle(),
      supabase
        .from("v_dicitura_progetto")
        .select("dicitura")
        .eq("certification_id", fattura.certification_id)
        .maybeSingle(),
    ]);
    brand =
      (progetto as { sites?: { brands?: { name?: string } } } | null)?.sites?.brands?.name ?? "";
    descrizioneServizio = (dicitura as { dicitura?: string } | null)?.dicitura ?? "";
  }

  const valuta = String(fattura.currency ?? "EUR");

  const dati = {
    // Intestazione
    data: dataInglese(String(fattura.issue_date)),
    cliente_ragione_sociale: cliente.company_name,
    cliente_indirizzo: cliente.address ?? "",
    cliente_cap_citta: [cliente.city, cliente.postal_code].filter(Boolean).join(" "),
    cliente_paese: cliente.country ?? "",
    // Sul documento vero c'è «Tax ID»: la partita IVA quando c'è, altrimenti il
    // codice fiscale — che per i clienti esteri è l'unico dei due.
    cliente_tax_id: cliente.vat_number ?? cliente.tax_code ?? "",

    // Di cosa si parla
    brand,
    progetto: fattura.project_name ?? "",
    numero: fattura.number,
    // Vuoto su tre fatture su quattro, e va bene così: non tutti i clienti lo danno.
    po_riferimento: fattura.po_riferimento ?? "",
    descrizione_servizio: descrizioneServizio,

    // Le righe, già scritte come vanno lette
    righe: righe.map((r) => ({
      descrizione: r.descrizione,
      importo: importoScritto(Number(r.importo), valuta),
      importo_numerico: Number(r.importo),
    })),
    imponibile: importoScritto(Number(fattura.total) - Number(fattura.vat_amount ?? 0), valuta),
    iva: importoScritto(Number(fattura.vat_amount ?? 0), valuta),
    totale: importoScritto(Number(fattura.total), valuta),
    // L'IVA si stampa solo se c'è: sulle fatture UK verso l'estero non esiste, e
    // una riga «IVA 0,00 Euro» fa sembrare che ci si sia dimenticati di metterla.
    con_iva: Number(fattura.vat_amount ?? 0) > 0,

    // Quando
    termini: `${fattura.payment_terms_days} days`,
    scadenza: dataInglese(String(fattura.due_date)),

    // Dove arrivano i soldi. Dell'emittente, non nostri in generale: chi emette
    // incassa sul proprio conto.
    banca_nome: emittente.bank_name ?? "",
    banca_intestatario: emittente.company_name,
    banca_conto: emittente.bank_account ?? "",
    banca_iban: emittente.iban ?? "",
    banca_bic: emittente.bic ?? "",

    // Piè di pagina
    emittente_ragione_sociale: emittente.company_name,
    emittente_indirizzo: [emittente.address, emittente.city, emittente.postal_code, emittente.country]
      .filter(Boolean)
      .join(" - "),
    emittente_piva: emittente.vat_number ?? "",
    entity_code: emittente.entity_code ?? "",
  };

  let risposta: Response;
  try {
    risposta = await fetch(`${url.replace(/\/$/, "")}/fattura`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": chiave },
      body: JSON.stringify(dati),
      // Il servizio può dormire: sul piano Render il risveglio da solo mangia una
      // trentina di secondi.
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e) {
    return errore(
      e instanceof DOMException && e.name === "TimeoutError"
        ? "Il servizio documenti non ha risposto in tempo. Se era fermo da un po', riprova: il primo risveglio è lento."
        : `Servizio documenti irraggiungibile: ${e}`,
      504,
    );
  }

  if (risposta.status === 404) {
    // Detto per esteso perché è l'errore del primo tentativo, e «404» da solo
    // manderebbe a cercare nel codice sbagliato.
    return errore(
      "Il servizio risponde ma non ha l'endpoint /fattura: va aggiunto su Render, con il template .docx della fattura.",
      503,
    );
  }

  if (!risposta.ok) {
    const testo = await risposta.text();
    return new Response(testo, {
      status: risposta.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(risposta.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition":
        risposta.headers.get("Content-Disposition") ??
        `attachment; filename="Invoice ${String(fattura.number).replace(/[^\w.-]/g, "_")}.docx"`,
    },
  });
});
