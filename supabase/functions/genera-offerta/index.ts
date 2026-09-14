/**
 * Genera l'offerta in PDF.
 *
 * Non fa il lavoro: lo fa il servizio Python su Render, che ha LibreOffice e
 * il template Word. Questa funzione sta in mezzo per una ragione sola — la
 * chiave.
 *
 * Il frontend e' una SPA statica servita da GitHub Pages: qualunque segreto
 * messo li' dentro finisce nel bundle pubblico, leggibile da devtools. Una
 * chiave cosi' non chiude niente. Qui invece vive nei segreti di Supabase, e
 * il browser non la vede mai.
 *
 * In cambio questa funzione fa l'unica cosa che il servizio Python non puo'
 * fare: sa chi sta chiedendo, perche' il gateway ha gia' verificato il JWT.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OBBLIGATORI = [
  "data",
  "cliente_ragione_sociale",
  "cliente_indirizzo",
  "cliente_cap_citta",
  "cliente_piva",
  "titolo_riga1",
  "titolo_riga2",
  "oggetto",
  "righe",
  "prezzo_finale",
  "cliente_breve",
] as const;

function errore(messaggio: string, stato: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ errore: messaggio, ...extra }), {
    status: stato,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return errore("Metodo non ammesso", 405);

  const url = Deno.env.get("OFFERTE_URL");
  const chiave = Deno.env.get("OFFERTE_API_KEY");
  if (!url || !chiave) {
    // Detto per esteso: e' l'errore che si incontra al primo deploy, e
    // "500" da solo manderebbe a cercare nel posto sbagliato.
    return errore(
      "Servizio offerte non configurato: mancano i segreti OFFERTE_URL e OFFERTE_API_KEY",
      503,
    );
  }

  // Chi sta chiedendo. Il gateway verifica gia' il JWT — qui serve sapere
  // *chi* e', per non lasciare che un profilo cliente stampi carta intestata.
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

  const ammesso = (ruoli ?? []).some((r: { role: string }) =>
    ["ADMIN", "PM"].includes(String(r.role).toUpperCase()),
  );
  if (!ammesso) return errore("Solo ADMIN e PM possono emettere offerte", 403);

  let dati: Record<string, unknown>;
  try {
    dati = await req.json();
  } catch {
    return errore("Corpo della richiesta non è JSON valido", 400);
  }

  const mancanti = OBBLIGATORI.filter((c) => {
    const v = dati[c];
    return v === undefined || v === null || v === "" ||
      (Array.isArray(v) && v.length === 0);
  });
  // Si valida anche qui, non per sfiducia nel servizio, ma perche' cosi' il
  // form riceve l'elenco dei campi senza aspettare il viaggio fino a Render.
  if (mancanti.length > 0) {
    return errore("Campi mancanti", 422, { campi: mancanti });
  }

  let risposta: Response;
  try {
    risposta = await fetch(`${url.replace(/\/$/, "")}/genera`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": chiave },
      body: JSON.stringify(dati),
      // Il servizio puo' dormire: sul piano Render il risveglio da solo
      // mangia una trentina di secondi, prima ancora di convertire.
      signal: AbortSignal.timeout(150_000),
    });
  } catch (e) {
    return errore(
      e instanceof DOMException && e.name === "TimeoutError"
        ? "Il servizio offerte non ha risposto in tempo. Se era fermo da un po', riprova: il primo risveglio è lento."
        : `Servizio offerte irraggiungibile: ${e}`,
      504,
    );
  }

  if (!risposta.ok) {
    const testo = await risposta.text();
    return new Response(testo, {
      status: risposta.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Il PDF si rigira così com'è, compreso il nome del file che il servizio ha
  // già sanificato: due punti dove si decide come si chiama un file sono due
  // punti che prima o poi diranno cose diverse.
  return new Response(risposta.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition":
        risposta.headers.get("Content-Disposition") ?? 'attachment; filename="Offerta.pdf"',
    },
  });
});
