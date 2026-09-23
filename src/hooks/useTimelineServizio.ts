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
 * Il passo che uno schema preimpostato propone, sulla timeline che c'è.
 *
 * Gli schemi parlano una lingua generica — firma, fine design, fine
 * costruzione, sottomissione — e ogni servizio la traduce a modo suo. Una
 * fornitura hardware non ha una fine cantiere, ma ha il momento in cui i
 * sensori cominciano a trasmettere, e quello è il suo equivalente: il lavoro
 * è consegnato.
 *
 * Su una timeline non vuota **propone sempre**. Lasciare la tranche scoperta
 * perché il nome non combacia vorrebbe dire decidere al posto di chi quota che
 * quel momento non esiste, quando invece esiste e si chiama diversamente. La
 * proposta è un punto di partenza: chi quota conferma o sposta, e ha davanti
 * tutti i passi.
 */
export function proponiPasso(
  passi: PassoTimeline[],
  momento: "firma" | "design" | "costruzione" | "sottomissione",
): number | null {
  if (passi.length === 0) return null;

  const cerca = (re: RegExp) => passi.find((p) => re.test(p.requirement))?.order_index ?? null;
  const primo = passi[0].order_index;
  const ultimo = passi[passi.length - 1].order_index;

  /**
   * Il momento in cui il lavoro è consegnato, comunque si chiami.
   *
   * Nelle certificazioni è la consegna del cantiere; nelle forniture di
   * monitoraggio è il primo dato che arriva, che è quando il servizio comincia
   * davvero a esistere per il cliente.
   */
  // L'ordine delle alternative conta. Su Energy il passo 7 si chiama
  // «Configurazione bridge e messa in rete» e precede il passo 8 «Primo dato
  // ricevuto»: cercare prima «messa in rete» pescherebbe la configurazione,
  // che è lavoro nostro, non il dato che arriva — ed è il dato che il cliente
  // paga.
  const consegna =
    cerca(/construction end|handover|fine costruzione/i) ??
    cerca(/primo dato|first data/i) ??
    cerca(/messa in rete/i) ??
    cerca(/installazion|installation/i) ??
    ultimo;

  // La firma non è un passo della timeline: è il momento in cui la timeline
  // comincia. Su una fornitura però l'impegno vero è l'ordine dell'hardware,
  // ed è lì che la prima tranche matura.
  const avvio = cerca(/ordine hardware|hardware order|conferma d'ordine/i) ?? primo;

  switch (momento) {
    case "firma":
      return avvio;

    case "design":
      return (
        cerca(/design guidelines|design review|design phase|fine design/i) ??
        // Senza una fase di design, il momento a metà strada fra l'avvio e la
        // consegna: su Energy cade sull'installazione elettrica, che è
        // esattamente dove una rata di mezzo ha senso.
        intermedio(passi, avvio, consegna)
      );

    case "costruzione":
      return consegna;

    case "sottomissione":
      return cerca(/submission|sottomissione|deposito/i) ?? consegna;
  }
}

/**
 * Il passo a metà strada fra l'avvio e la consegna.
 *
 * Si misura dall'avvio, non dall'inizio della timeline: i passi che precedono
 * l'impegno — sopralluoghi, definizione dei circuiti — non sono lavoro da
 * fatturare a stato avanzamento, e contarli sposterebbe la rata di mezzo
 * indietro, verso cose che al cliente non sono ancora costate niente.
 */
function intermedio(passi: PassoTimeline[], avvio: number, consegna: number): number {
  const dentro = passi.filter((p) => p.order_index >= avvio && p.order_index <= consegna);
  const lista = dentro.length > 1 ? dentro : passi;
  return lista[Math.floor((lista.length - 1) / 2)].order_index;
}
