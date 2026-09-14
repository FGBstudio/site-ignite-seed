import { createClient } from "@supabase/supabase-js";

/*
  Il secondo client punta allo stesso progetto del primo, con la chiave nel
  formato nuovo. Segue quindi lo stesso bersaglio: se restasse cablato, con
  l'app puntata al database locale una parte del codice continuerebbe a parlare
  con la produzione — ed e' esattamente il tipo di svista che non si vede
  finche' non ha gia' scritto qualcosa.

  La chiave invece non si eredita: lo stack locale non conosce il formato
  `sb_publishable_`. Quando c'e' un URL locale si usa la chiave locale.
*/
const EXTERNAL_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://vejqfpznzcohtbggkfhr.supabase.co";
const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_URL
  ? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "")
  : "sb_publishable_U50PEA4-VFDpQ_qS3DubBw_K0U680v8";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(EXTERNAL_SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});