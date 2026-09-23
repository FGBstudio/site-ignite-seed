import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogEntry } from "@/hooks/useCertCatalog";

/**
 * I passi della timeline del servizio che si sta quotando.
 *
 * Serve a rispondere a una domanda sola: «a quale attività è agganciata questa
 * tranche?». Finché la risposta veniva pescata da un elenco generico — firma,
 * fine design, fine costruzione — l'avanzamento della fatturazione e
 * l'avanzamento dei lavori erano due storie che non si incontravano: il PM
 * chiudeva «Construction End (Handover)» e la tranche legata a un
 * «Construction End» che non esisteva da nessuna parte restava ferma.
 *
 * Qui la risposta è la timeline vera del servizio, quella che il PM vedrà. La
 * catena è: cert_catalog dice quale timeline, cert_timeline_steps dice quali
 * passi, e `cert_payment_milestones.step_id` è il punto in cui le due si
 * toccano. Senza quello `step_id` nessun trigger può sbloccare niente.
 */

export interface PassoTimeline {
  id: string;
  timeline_key: string;
  order_index: number;
  requirement: string;
  optional: boolean | null;
}

/**
 * Quale timeline vale per una certificazione non ancora creata.
 *
 * Il gemello SQL `fn_timeline_key_for_cert` fa lo stesso lavoro partendo da una
 * certificazione che esiste già. In fase di offerta la certificazione non c'è
 * ancora — la si sta per creare — e la chiave va risolta dagli stessi quattro
 * campi che l'utente ha appena scelto.
 */
export function chiaveTimeline(
  catalogo: CatalogEntry[],
  scelta: {
    scheme: string;
    rating?: string | null;
    typology?: string | null;
    delivery?: string | null;
  },
): string | null {
  const pulisci = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  const rating = pulisci(scelta.rating);
  const typology = pulisci(scelta.typology);
  const delivery = pulisci(scelta.delivery);

  // Prima la corrispondenza esatta sui quattro campi, come fa il database.
  const esatta = catalogo.find(
    (e) =>
      e.scheme === scelta.scheme &&
      pulisci(e.rating_system) === rating &&
      pulisci(e.typology) === typology &&
      pulisci(e.delivery_context) === delivery,
  );
  if (esatta?.timeline_key) return esatta.timeline_key;

  // Poi il ripiego sullo schema e il rating: in offerta la tipologia può non
  // essere ancora decisa, e una timeline approssimata per difetto è comunque
  // quella giusta — LEED BD+C Retail e LEED BD+C Schools condividono i passi.
  const parziale = catalogo.find(
    (e) => e.scheme === scelta.scheme && pulisci(e.rating_system) === rating && e.timeline_key,
  );
  if (parziale?.timeline_key) return parziale.timeline_key;

  const soloSchema = catalogo.find((e) => e.scheme === scelta.scheme && e.timeline_key);
  return soloSchema?.timeline_key ?? null;
}

/** I passi di una o più timeline, in un colpo solo. */
export function usePassiTimeline(chiavi: string[]) {
  const uniche = Array.from(new Set(chiavi.filter(Boolean))).sort();

  return useQuery({
    queryKey: ["timeline-steps", uniche.join("|")],
    enabled: uniche.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Map<string, PassoTimeline[]>> => {
      const { data, error } = await supabase
        .from("cert_timeline_steps" as never)
        .select("id, timeline_key, order_index, requirement, optional")
        .in("timeline_key", uniche)
        .order("order_index");
      if (error) throw error;

      const out = new Map<string, PassoTimeline[]>();
      for (const p of (data ?? []) as unknown as PassoTimeline[]) {
        out.set(p.timeline_key, [...(out.get(p.timeline_key) ?? []), p]);
      }
      return out;
    },
  });
}

/**
 * Il passo che un incasso «alla firma» dovrebbe agganciare.
 *
 * Gli schemi preimpostati parlano una lingua generica — firma, fine design,
 * fine costruzione, sottomissione — e ogni timeline la scrive a modo suo.
 * Qui si prova a indovinare, e quando non si riesce si lascia vuoto: una
 * tranche senza passo si vede e si corregge, una agganciata al passo sbagliato
 * no.
 */
export function proponiPasso(
  passi: PassoTimeline[],
  momento: "firma" | "design" | "costruzione" | "sottomissione",
): number | null {
  const cerca = (re: RegExp) =>
    passi.find((p) => re.test(p.requirement))?.order_index ?? null;

  switch (momento) {
    // La firma non è un passo della timeline: è il momento in cui la timeline
    // comincia. Il primo passo è il suo sostituto onesto.
    case "firma":
      return passi[0]?.order_index ?? null;
    case "design":
      return cerca(/design guidelines|design review|design phase|fine design/i);
    case "costruzione":
      return cerca(/construction end|handover|fine costruzione/i);
    case "sottomissione":
      return cerca(/submission|sottomissione|deposito/i);
  }
}
