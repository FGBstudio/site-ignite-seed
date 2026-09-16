/**
 * Estrae la project timeline da un cronoprogramma vero.
 *
 * Il parser locale (`src/lib/importTimeline.ts`) legge i PDF per coordinate e
 * se la cava bene sui gantt tabellari puliti. Ma un gantt vero e' spesso
 * un'altra cosa: barre disegnate senza date scritte accanto, tabelle ruotate,
 * scansioni storte, colonne «Inizio/Fine» con intestazioni in tre lingue,
 * righe di riepilogo mescolate alle attivita'. Su quelli il parser prende
 * poco, e il poco che prende va controllato riga per riga — che e' l'opposto
 * di un acceleratore.
 *
 * Qui il file lo guarda un modello multimodale, che vede la pagina come la
 * vede una persona. Il contratto e' stretto apposta: deve restituire nomi e
 * DATE, non un riassunto. Una riga senza date non serve a niente e viene
 * scartata a monte — la specifica e' esplicita: «l'estrazione che non popola
 * le date e' un difetto, non un comportamento accettabile».
 *
 * Perche' una edge function e non una chiamata dal browser: la chiave. Il
 * frontend e' una SPA statica su GitHub Pages, qualunque segreto nel bundle e'
 * pubblico. Qui la chiave vive nei segreti di Supabase e il browser non la
 * vede mai. In cambio questa funzione sa chi sta chiedendo, e verifica che sia
 * ADMIN o PM prima di spendere un token.
 *
 * Non scrive niente sul database. Restituisce candidate: decide il PM nel
 * wizard, come prima.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Due modelli, in ordine, e non per ridondanza generica.
 *
 * Il primo e' quello che `analyze-bill` usa da mesi per estrarre dati
 * strutturati da PDF: sappiamo che regge il formato. Il secondo e' piu' forte
 * sul ragionamento visivo, che qui serve nel caso difficile — leggere dove
 * cade una barra contro la scala dei mesi.
 *
 * Si passa al secondo in due casi: il gateway rifiuta il primo (nome del
 * modello cambiato, quota sul modello), oppure il primo restituisce righe ma
 * SENZA DATE. Il secondo caso e' il motivo vero: una lista di nomi senza date
 * non e' una mezza risposta, e' il difetto che questa funzione esiste per
 * togliere. Meglio spendere una seconda chiamata che consegnare al PM la
 * stessa tabella vuota di prima.
 */
const MODELLI = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"];

/** 12 MB in base64 ≈ 9 MB di file: oltre, il gateway rifiuta comunque. */
const MAX_BASE64 = 12 * 1024 * 1024;

const RUOLI_AMMESSI = ["ADMIN", "PM", "admin", "pm"];

function risposta(corpo: unknown, stato = 200) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SISTEMA = `Sei un analista di cronoprogrammi di cantiere (construction schedules, gantt).
Ricevi UN documento: un gantt, una tabella di fasi, un programma lavori. Puo' essere
in italiano, inglese, francese, greco o altre lingue. Puo' essere una tabella, un
diagramma a barre, una scansione, o un export ruotato di MS Project.

Il tuo compito e' restituire le ATTIVITA' con le loro DATE.

Regole, in ordine di importanza:

1. LE DATE SONO IL PUNTO. Un'attivita' senza data non serve. Se il documento
   mostra solo barre e la scala temporale sta in testata (mesi, settimane,
   trimestri), LEGGI LA POSIZIONE DELLE BARRE contro quella scala e deduci le
   date. Dichiara che l'hai fatto mettendo "dedotta_da_barra": true su quelle
   righe. Meglio una data dedotta e dichiarata che nessuna data.

2. ANNI. I gantt spesso scrivono solo giorno e mese. Usa la scala temporale del
   documento per capire l'anno, e non inventare: se un'attivita' cade dopo
   dicembre, e' l'anno dopo. Non usare mai l'anno corrente per default.

3. COSA NON E' UN'ATTIVITA'. Scarta: intestazioni di colonna, numeri di riga,
   durate ("31 g", "4 mesi", "12 wks"), codici di predecessori ("14FI+10 g",
   "23SS"), tacche della scala temporale ("Tri 3", "Q2", "gen", "W12"),
   legende, note a pie' di pagina, il cartiglio, il nome dello studio.

4. FASI E MILESTONE. Una riga con inizio e fine diversi e' una FASE
   ("tipo": "fase"). Una riga con una data sola, o inizio uguale a fine, e' una
   MILESTONE ("tipo": "milestone"): consegne, approvazioni, inizio e fine
   lavori.

5. RIGHE DI RIEPILOGO. Se il documento ha una gerarchia (una fase padre che
   contiene sotto-attivita'), restituisci il livello che porta informazione
   utile: di norma il padre se i figli sono di dettaglio operativo. Non
   restituire entrambi lo stesso intervallo due volte.

6. NOMI. Riporta il nome come sta scritto nel documento, ripulito da numeri di
   riga e codici WBS iniziali. Non tradurre, non riformulare, non abbreviare.

7. DURATE SENZA DATE. Se il documento parla SOLO per durate relative (mese 1,
   mese 2, "M+3") e non esiste nessuna data assoluta da nessuna parte, lascia
   inizio e fine null e compila "durata_mesi". Il PM fornira' la data di
   partenza. Ma prima cerca davvero: una data di inizio lavori o di consegna
   c'e' quasi sempre, anche solo nel cartiglio.

8. NON INVENTARE. Se una riga e' illeggibile, saltala. Se il documento non e'
   un cronoprogramma, restituisci una lista vuota e spiegalo in "diario".

Le date escono sempre in formato YYYY-MM-DD.`;

const SCHEMA = {
  type: "object",
  properties: {
    attivita: {
      type: "array",
      description: "Le attivita' estratte, nell'ordine in cui compaiono nel documento",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome dell'attivita', come scritto nel documento" },
          inizio: { type: "string", description: "Data di inizio YYYY-MM-DD, oppure stringa vuota se assente" },
          fine: { type: "string", description: "Data di fine YYYY-MM-DD, vuota per le milestone" },
          tipo: { type: "string", enum: ["fase", "milestone"] },
          durata_mesi: { type: "number", description: "Solo se il documento parla per durate e non per date; 0 altrimenti" },
          dedotta_da_barra: { type: "boolean", description: "true se le date vengono dalla posizione della barra e non da un testo" },
        },
        required: ["nome", "inizio", "fine", "tipo"],
        additionalProperties: false,
      },
    },
    ancoraggio_suggerito: {
      type: "string",
      description: "La data di partenza del cantiere se il documento la dichiara, YYYY-MM-DD; vuota altrimenti",
    },
    lingua: { type: "string", description: "Lingua prevalente del documento" },
    diario: {
      type: "string",
      description:
        "Una o due frasi per il PM: quante attivita', da dove vengono le date, e cosa NON sei riuscito a leggere. In italiano.",
    },
  },
  required: ["attivita", "diario"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return risposta({ errore: "Metodo non ammesso" }, 405);

  const chiave = Deno.env.get("LOVABLE_API_KEY");
  if (!chiave) {
    // Detto chiaro: il frontend deve poter ripiegare sul parser locale senza
    // far credere al PM che il suo file fosse illeggibile.
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
  const { data: ruoli } = await servizio
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const ammesso = (ruoli ?? []).some((r: { role: string }) => RUOLI_AMMESSI.includes(r.role));
  if (!ammesso) return risposta({ errore: "Serve il ruolo ADMIN o PM" }, 403);

  // ── Il file ────────────────────────────────────────────────────────────
  let corpo: { base64?: string; mime?: string; nomeFile?: string; testo?: string };
  try {
    corpo = await req.json();
  } catch {
    return risposta({ errore: "Corpo non leggibile" }, 400);
  }

  const { base64, mime, nomeFile, testo } = corpo;
  if (!base64 && !testo) return risposta({ errore: "Serve base64 oppure testo" }, 400);
  if (base64 && base64.length > MAX_BASE64) {
    return risposta({ errore: "File troppo grande: oltre ~9 MB", ripiega: true }, 413);
  }

  // Un xlsx non si manda come immagine: arriva gia' convertito in testo
  // tabellare dal frontend, che la libreria ce l'ha in casa.
  const contenuto: unknown[] = [
    {
      type: "text",
      text: testo
        ? `Questo e' il contenuto tabellare del file "${nomeFile ?? "cronoprogramma"}", convertito in testo. Estrai le attivita' con le loro date.\n\n${testo.slice(0, 120_000)}`
        : `Analizza questo cronoprogramma ("${nomeFile ?? "documento"}") ed estrai le attivita' con le loro date.`,
    },
  ];
  if (base64) {
    contenuto.push({
      type: "image_url",
      image_url: { url: `data:${mime ?? "application/pdf"};base64,${base64}` },
    });
  }

  // ── Il modello ─────────────────────────────────────────────────────────

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
                name: "estrai_cronoprogramma",
                description: "Restituisce le attivita' del cronoprogramma con le loro date",
                parameters: SCHEMA,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "estrai_cronoprogramma" } },
        }),
      });
    } catch (e) {
      console.error(`[${modello}] gateway irraggiungibile:`, e);
      return { ok: false, stato: 502, messaggio: "Servizio di estrazione irraggiungibile", riprovabile: false };
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
            : "Estrazione AI non riuscita";
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

  /** Quante righe hanno davvero una data: e' il metro di «ha funzionato». */
  const datate = (d: Record<string, unknown>) =>
    (Array.isArray(d?.attivita) ? (d.attivita as Array<{ inizio?: unknown }>) : []).filter(
      (a) => typeof a?.inizio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.inizio)
    ).length;

  let grezzo: Record<string, unknown> | null = null;
  let modelloUsato = "";
  let ultimoErrore: { stato: number; messaggio: string } | null = null;

  for (let i = 0; i < MODELLI.length; i++) {
    const m = MODELLI[i];
    const esito = await chiedi(m);

    if (!esito.ok) {
      ultimoErrore = { stato: esito.stato, messaggio: esito.messaggio };
      if (!esito.riprovabile) break;
      continue;
    }

    grezzo = esito.dati;
    modelloUsato = m;

    // Righe senza date non sono una mezza risposta: sono il difetto che
    // questa funzione esiste per togliere. Se c'e' un modello piu' forte da
    // provare, si prova.
    const n = datate(esito.dati);
    if (n > 0 || i === MODELLI.length - 1) break;
    console.log(`[${m}] zero righe datate: riprovo col modello successivo`);
  }

  if (!grezzo) {
    return risposta(
      { errore: ultimoErrore?.messaggio ?? "Estrazione AI non riuscita", ripiega: true },
      ultimoErrore?.stato ?? 502
    );
  }

  // ── La pulizia ─────────────────────────────────────────────────────────
  //
  // Il modello va controllato come si controlla un parser: gentile con lui,
  // severo col risultato. Qui cadono le date impossibili, i nomi vuoti, i
  // duplicati e le righe che non hanno ne' date ne' durata — cioe' le righe
  // che non portano niente al PM.
  const iso = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    const anno = Number(s.slice(0, 4));
    // Un cronoprogramma di cantiere sta in questa finestra. Fuori, e' un
    // errore di lettura dell'anno — il difetto classico dei gantt che
    // scrivono solo giorno e mese.
    if (anno < 2000 || anno > 2100) return null;
    return s;
  };

  const viste = new Set<string>();
  const attivita = (Array.isArray(grezzo.attivita) ? grezzo.attivita : [])
    .map((a: any) => {
      const nome = String(a?.nome ?? "").trim().replace(/\s+/g, " ");
      let inizio = iso(a?.inizio);
      let fine = iso(a?.fine);
      // Invertite: capita quando la tabella ha le colonne in ordine inatteso.
      if (inizio && fine && fine < inizio) [inizio, fine] = [fine, inizio];
      // Una milestone e' un istante: fine uguale a inizio non e' una durata.
      if (fine && fine === inizio) fine = null;
      const durata = Number(a?.durata_mesi);
      return {
        nome,
        inizio,
        fine,
        durata_mesi: Number.isFinite(durata) && durata > 0 ? durata : null,
        dedotta: a?.dedotta_da_barra === true,
        tipo: a?.tipo === "fase" ? "fase" : "milestone",
      };
    })
    .filter((a: any) => {
      if (a.nome.length < 3 || a.nome.length > 160) return false;
      if (!a.inizio && !a.durata_mesi) return false;
      const chiaveRiga = `${a.nome.toLowerCase()}|${a.inizio ?? ""}|${a.fine ?? ""}`;
      if (viste.has(chiaveRiga)) return false;
      viste.add(chiaveRiga);
      return true;
    });

  const dedotte = attivita.filter((a: any) => a.dedotta && a.inizio).length;
  const conDate = attivita.filter((a: any) => a.inizio).length;

  const diario = [
    String(grezzo.diario ?? "").trim() || `${attivita.length} attività estratte.`,
    dedotte > 0 ? `${dedotte} con date dedotte dalla posizione delle barre: controllale.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  console.log(
    `[${modelloUsato}] estratte ${attivita.length} righe (${conDate} datate, ${dedotte} dedotte) da ${nomeFile ?? "?"}`
  );

  return risposta({
    attivita,
    ancoraggio_suggerito: iso(grezzo.ancoraggio_suggerito),
    richiede_ancoraggio: conDate === 0 && attivita.length > 0,
    lingua: typeof grezzo.lingua === "string" ? grezzo.lingua : null,
    diario,
    motore: "ai",
    modello: modelloUsato,
  });
});
