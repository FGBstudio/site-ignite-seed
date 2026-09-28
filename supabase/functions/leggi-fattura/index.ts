/**
 * Legge una fattura gia' emessa e ne restituisce i dati, senza scrivere nulla.
 *
 * Serve a far entrare nel registro le fatture di prima: esistono come PDF in
 * una cartella, e ribattere a mano numero, date, imponibile, IVA, totale,
 * partita IVA del cliente e indirizzo per qualche decina di documenti e' il
 * genere di lavoro che si comincia e non si finisce.
 *
 * Il file lo guarda un modello multimodale, che vede la pagina come la vede
 * una persona: intestazione, tabella, totali, piede. Non si fa OCR "cieco" e
 * poi si cerca di indovinare quale numero e' il totale — glielo si chiede.
 *
 * ── COSA NON FA ───────────────────────────────────────────────────────────
 * Non salva, non crea anagrafiche, non tocca il registro. Restituisce una
 * lettura, e la lettura la conferma una persona: una cifra sbagliata qui
 * diventa un fatturato sbagliato per sempre, e nessun modello e' abbastanza
 * bravo da meritare l'ultima parola su un dato contabile.
 *
 * ── PERCHÉ UNA EDGE FUNCTION ──────────────────────────────────────────────
 * La chiave. Il frontend e' una SPA statica su GitHub Pages: qualunque segreto
 * nel bundle e' pubblico. Qui la chiave vive nei segreti di Supabase e il
 * browser non la vede mai. In cambio questa funzione sa chi sta chiedendo, e
 * le fatture sono dell'amministrazione: verifica che sia ADMIN prima di
 * spendere un token.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Due modelli, in ordine. Il primo e' quello che le altre estrazioni di
 * questo progetto usano da mesi su PDF strutturati. Al secondo si passa se il
 * gateway rifiuta il primo o se il primo torna senza il totale — che su una
 * fattura non e' una mezza risposta, e' nessuna risposta.
 */
const MODELLI = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];

/** 12 MB in base64 ≈ 9 MB di file: oltre, il gateway rifiuta comunque. */
const MAX_BASE64 = 12 * 1024 * 1024;

/** Le fatture sono dell'amministrazione: un PM non le importa. */
const RUOLI_AMMESSI = ["ADMIN", "admin", "superuser"];

function risposta(corpo: unknown, stato = 200) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SISTEMA = `Sei un contabile che legge fatture emesse da uno studio di consulenza e ne estrae i dati.

REGOLE NON NEGOZIABILI:
- Riporta quello che c'e' scritto sul documento. Non calcolare, non correggere, non completare.
- Se un dato non e' leggibile lascialo null. Un campo vuoto e' un problema che si vede; un campo inventato e' un problema che non si vede.
- L'EMITTENTE e' chi ha emesso la fattura (in alto, con la sua partita IVA e il suo IBAN). Il CLIENTE e' l'intestatario, quello che paga. Non confonderli: se sbagli verso, il registro attribuisce il fatturato alla societa' sbagliata.
- Gli importi sono numeri puri: 1234.56, mai "1.234,56 €". Attento alla notazione italiana, dove il punto separa le migliaia e la virgola i decimali.
- Il TOTALE e' il totale documento, IVA inclusa. L'IMPONIBILE e' la base. L'IVA e' l'imposta. Se sul documento c'e' solo il totale, gli altri due restano null.
- Le date in formato YYYY-MM-DD. Se l'anno e' scritto con due cifre, ragiona sul contesto e non inventare un secolo.
- I termini di pagamento in giorni (30, 60, 90). Se c'e' solo la data di scadenza, riportala e lascia i giorni null.
- La valuta in codice ISO: EUR, USD, GBP, CNY.

Dell'emittente e del cliente riporta anche partita IVA, indirizzo, citta', CAP e paese, se stanno sul documento: servono a tenere le anagrafiche allineate a quello che e' stato fatturato davvero.`;

const SCHEMA = {
  type: "object",
  properties: {
    numero: { type: ["string", "null"], description: "Il numero della fattura, come e' scritto" },
    data_emissione: { type: ["string", "null"], description: "YYYY-MM-DD" },
    data_scadenza: { type: ["string", "null"], description: "YYYY-MM-DD, se indicata" },
    termini_giorni: { type: ["number", "null"], description: "Giorni di pagamento, se indicati" },
    valuta: { type: ["string", "null"], description: "EUR, USD, GBP, CNY" },
    imponibile: { type: ["number", "null"] },
    iva: { type: ["number", "null"] },
    totale: { type: ["number", "null"], description: "Totale documento, IVA inclusa" },
    emittente: {
      type: "object",
      description: "Chi ha emesso la fattura",
      properties: {
        ragione_sociale: { type: ["string", "null"] },
        partita_iva: { type: ["string", "null"] },
        indirizzo: { type: ["string", "null"] },
        cap: { type: ["string", "null"] },
        citta: { type: ["string", "null"] },
        paese: { type: ["string", "null"] },
        iban: { type: ["string", "null"] },
      },
      required: ["ragione_sociale"],
      additionalProperties: false,
    },
    cliente: {
      type: "object",
      description: "L'intestatario, chi paga",
      properties: {
        ragione_sociale: { type: ["string", "null"] },
        partita_iva: { type: ["string", "null"] },
        indirizzo: { type: ["string", "null"] },
        cap: { type: ["string", "null"] },
        citta: { type: ["string", "null"] },
        paese: { type: ["string", "null"] },
      },
      required: ["ragione_sociale"],
      additionalProperties: false,
    },
    descrizione: {
      type: ["string", "null"],
      description: "L'oggetto della fattura in una riga, come scritto in fattura",
    },
    diario: {
      type: "string",
      description:
        "Una o due frasi in italiano: cosa hai letto con sicurezza e cosa NON sei riuscito a leggere. Chi rivede deve sapere dove guardare per primo.",
    },
  },
  required: ["numero", "data_emissione", "totale", "emittente", "cliente", "diario"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ errore: "Metodo non ammesso" }, 405);

  const chiave = Deno.env.get("LOVABLE_API_KEY");
  if (!chiave) {
    // Detto chiaro, perche' il frontend deve poter offrire l'inserimento a
    // mano invece di far credere che il PDF fosse illeggibile.
    return risposta({ errore: "LOVABLE_API_KEY non configurata", ripiega: true }, 503);
  }

  // ── Chi sta chiedendo ──────────────────────────────────────────────────
  const auth = req.headers.get("Authorization");
  if (!auth) return risposta({ errore: "Non autenticato" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const utente = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });

  const { data: { user }, error: erroreAuth } = await utente.auth.getUser();
  if (erroreAuth || !user) return risposta({ errore: "Non autenticato" }, 401);

  const servizio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ruoli } = await servizio.from("user_roles").select("role").eq("user_id", user.id);
  const ammesso = (ruoli ?? []).some((r: { role: string }) => RUOLI_AMMESSI.includes(r.role));
  if (!ammesso) return risposta({ errore: "Le fatture le importa l'amministrazione" }, 403);

  // ── Il file ────────────────────────────────────────────────────────────
  let corpo: { base64?: string; mime?: string; nomeFile?: string };
  try {
    corpo = await req.json();
  } catch {
    return risposta({ errore: "Corpo non leggibile" }, 400);
  }

  const { base64, mime, nomeFile } = corpo;
  if (!base64) return risposta({ errore: "Serve il file in base64" }, 400);
  if (base64.length > MAX_BASE64) {
    return risposta({ errore: "File troppo grande: oltre ~9 MB", ripiega: true }, 413);
  }

  const contenuto = [
    {
      type: "text",
      text: `Leggi questa fattura ("${nomeFile ?? "documento"}") ed estrai i suoi dati. Ricorda: l'emittente e' chi l'ha emessa, il cliente e' chi paga.`,
    },
    { type: "image_url", image_url: { url: `data:${mime ?? "application/pdf"};base64,${base64}` } },
  ];

  /** Una passata su un modello. Non decide nulla: riferisce cosa e' successo. */
  async function chiedi(modello: string): Promise<
    | { ok: true; dati: Record<string, unknown> }
    | { ok: false; stato: number; messaggio: string; riprovabile: boolean }
  > {
    let risp: Response;
    try {
      risp = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modello,
          messages: [
            { role: "system", content: SISTEMA },
            { role: "user", content: contenuto },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "estrai_fattura",
                description: "Restituisce i dati letti dalla fattura",
                parameters: SCHEMA,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "estrai_fattura" } },
        }),
      });
    } catch (e) {
      console.error(`[${modello}] gateway irraggiungibile:`, e);
      return { ok: false, stato: 502, messaggio: "Servizio di lettura irraggiungibile", riprovabile: false };
    }

    if (!risp.ok) {
      const dettaglio = await risp.text();
      console.error(`[${modello}] gateway ${risp.status}:`, dettaglio.slice(0, 400));
      // 402 e 429 valgono per l'account, non per il modello: cambiare modello
      // non le risolve e riprovare e' solo un secondo addebito.
      const riprovabile = risp.status !== 402 && risp.status !== 429;
      const messaggio =
        risp.status === 429
          ? "Troppe richieste in questo momento"
          : risp.status === 402
            ? "Crediti AI esauriti"
            : "Lettura non riuscita";
      return { ok: false, stato: risp.status === 429 ? 429 : 502, messaggio, riprovabile };
    }

    const corpoRisposta = await risp.json();
    const chiamata = corpoRisposta.choices?.[0]?.message?.tool_calls?.[0];
    if (!chiamata?.function?.arguments) {
      console.error(`[${modello}] nessuna tool call:`, JSON.stringify(corpoRisposta).slice(0, 400));
      return { ok: false, stato: 502, messaggio: "Il modello non ha restituito dati strutturati", riprovabile: true };
    }

    try {
      return { ok: true, dati: JSON.parse(chiamata.function.arguments) };
    } catch {
      console.error(`[${modello}] argomenti illeggibili`);
      return { ok: false, stato: 502, messaggio: "Risposta del modello illeggibile", riprovabile: true };
    }
  }

  /** Il metro di «ha funzionato»: senza totale non c'e' niente da importare. */
  const utile = (d: Record<string, unknown>) => typeof d?.totale === "number" && d.totale > 0;

  let grezzo: Record<string, unknown> | null = null;
  let modelloUsato = "";
  let ultimoErrore: { stato: number; messaggio: string } | null = null;

  for (const m of MODELLI) {
    const esito = await chiedi(m);
    if (!esito.ok) {
      ultimoErrore = { stato: esito.stato, messaggio: esito.messaggio };
      if (!esito.riprovabile) break;
      continue;
    }
    grezzo = esito.dati;
    modelloUsato = m;
    if (utile(esito.dati)) break;
    // Ha risposto ma senza totale: si tiene questa lettura e si prova l'altro
    // modello, che sui documenti storti spesso vede quello che il primo perde.
  }

  if (!grezzo) {
    return risposta(
      { errore: ultimoErrore?.messaggio ?? "Lettura non riuscita", ripiega: true },
      ultimoErrore?.stato ?? 502,
    );
  }

  return risposta({ ...grezzo, modello: modelloUsato });
});
