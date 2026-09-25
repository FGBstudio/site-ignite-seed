import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Il vocabolario delle certificazioni, letto dal database.
 *
 * Prima stava scritto in quattro posti che non concordavano — il vincolo CHECK,
 * la TAXONOMY di ratingSubtypes.ts, il registro di certificationTemplates.ts e
 * le liste dei tipi nel wizard e nel form — con l'esito che cert_rating e
 * project_subtype erano di fatto testo libero. Adesso la fonte è una sola, ed è
 * la stessa che il database usa per rifiutare i valori inventati: quello che il
 * menu non offre, il database non accetta.
 */

export type OutcomeModel = "score_band" | "level_only" | "gates" | "none";

export interface CatalogEntry {
  id: string;
  scheme: string;
  rating_system: string | null;
  typology: string | null;
  version: string | null;
  delivery_context: string | null;
  display_label: string;
  outcome_model: OutcomeModel;
  score_unit: "points" | "percent" | null;
  timeline_key: string | null;
  /**
   * Come si chiamano le fee dell'ente certificatore per questo schema.
   *
   * «GBCI fees» solo per il LEED, perché il GBCI è il suo ente; «Third entity
   * fees» per gli altri schemi certificati. Nullo dove un ente non c'è —
   * monitoraggio, diagnosi, servizi di supporto — e lì il campo non si mostra
   * invece di restare vuoto a chiedere un numero che non esiste.
   */
  third_party_fee_label: string | null;
  is_sellable: boolean;
  order_index: number;
}

export interface CatalogLevel {
  catalog_id: string;
  level: string;
  order_index: number;
  score_min: number | null;
  score_max: number | null;
}

const dedupe = (values: Array<string | null>): string[] =>
  Array.from(new Set(values.filter((v): v is string => !!v)));

/**
 * La voce di catalogo esatta.
 *
 * Fuori dal hook perché è la regola che decide quali medaglie si possono
 * promettere in offerta, e una regola del genere va provata senza montare un
 * componente.
 *
 * `version` è opzionale perché non tutti i chiamanti la conoscono, ma quando la
 * conoscono deve contare: su (LEED, BD+C, Core & Shell) ci sono due righe —
 * v4.0 e v4.1 — e senza la versione si prendeva la prima per ordine di
 * caricamento.
 */
export function trovaVoce(
  rows: CatalogEntry[],
  scheme: string,
  rating?: string | null,
  typology?: string | null,
  context?: string | null,
  version?: string | null,
): CatalogEntry | null {
  return (
    rows.find(
      (r) =>
        r.scheme === scheme &&
        (r.rating_system ?? null) === (rating || null) &&
        (r.typology ?? null) === (typology || null) &&
        (r.delivery_context ?? null) === (context || null) &&
        (!version || (r.version ?? null) === version),
    ) ?? null
  );
}

/**
 * Le medaglie ammesse da una combinazione.
 *
 * Dipendono dalla voce, non dallo schema: il Bronze di WELL esiste solo sul v2
 * Pilot, e WiredScore Home ha il solo Certified. Senza una combinazione precisa
 * si mostra l'unione dei livelli dello schema, così la tendina non resta vuota
 * mentre l'utente sta ancora scegliendo.
 */
export function livelliDi(
  rows: CatalogEntry[],
  levelRows: CatalogLevel[],
  scheme: string,
  rating?: string | null,
  typology?: string | null,
  context?: string | null,
  version?: string | null,
): CatalogLevel[] {
  const entry = trovaVoce(rows, scheme, rating, typology, context, version);
  if (entry) {
    return levelRows
      .filter((l) => l.catalog_id === entry.id)
      .sort((a, b) => a.order_index - b.order_index);
  }
  const ids = new Set(rows.filter((r) => r.scheme === scheme).map((r) => r.id));
  const seen = new Map<string, CatalogLevel>();
  for (const l of levelRows) {
    if (ids.has(l.catalog_id) && !seen.has(l.level)) seen.set(l.level, l);
  }
  return Array.from(seen.values()).sort((a, b) => a.order_index - b.order_index);
}

/**
 * Le versioni disponibili per una combinazione.
 *
 * Non sono informative: sono una dimensione del catalogo. LEED esiste in v4.0 e
 * v4.1, BREEAM in 2015, 2016, 2021 e v6, WELL in v2 e v2 Pilot — voci distinte,
 * con medaglie proprie. Ignorarle vuol dire far scegliere fra due righe
 * indistinguibili e prenderne una a caso.
 */
export function versioniDi(
  rows: CatalogEntry[],
  scheme: string,
  rating?: string | null,
  typology?: string | null,
): string[] {
  return dedupe(
    rows
      .filter(
        (r) =>
          r.scheme === scheme &&
          (!rating || r.rating_system === rating) &&
          (!typology || r.typology === typology),
      )
      .map((r) => r.version),
  );
}

export function useCertCatalog() {
  const entries = useQuery({
    queryKey: ["cert-catalog"],
    staleTime: Infinity,
    queryFn: async (): Promise<CatalogEntry[]> => {
      const { data, error } = await supabase
        .from("cert_catalog" as never)
        .select("*")
        .order("scheme")
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as CatalogEntry[];
    },
  });

  const levels = useQuery({
    queryKey: ["cert-catalog-levels"],
    staleTime: Infinity,
    queryFn: async (): Promise<CatalogLevel[]> => {
      const { data, error } = await supabase
        .from("cert_catalog_levels" as never)
        .select("catalog_id, level, order_index, score_min, score_max")
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as unknown as CatalogLevel[];
    },
  });

  const rows = entries.data ?? [];
  const levelRows = levels.data ?? [];

  return useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));

    /** Gli schemi, in ordine: prima le certificazioni, poi i servizi. */
    const schemes = Array.from(
      rows.reduce((acc, r) => {
        if (!acc.has(r.scheme)) acc.set(r.scheme, r);
        return acc;
      }, new Map<string, CatalogEntry>()),
    )
      .map(([scheme, first]) => ({
        scheme,
        label: first.outcome_model === "none" ? first.display_label : scheme,
        isService: first.outcome_model === "none",
        isSellable: rows.some((r) => r.scheme === scheme && r.is_sellable),
      }))
      .sort((a, b) => Number(a.isService) - Number(b.isService) || a.scheme.localeCompare(b.scheme));

    /** I rating system di uno schema. Vuoto quando lo schema non ne ha — WELL, WiredScore. */
    const ratingsOf = (scheme: string) =>
      dedupe(rows.filter((r) => r.scheme === scheme).map((r) => r.rating_system));

    /** Le tipologie di uno schema, ristrette al rating quando esiste. */
    const typologiesOf = (scheme: string, rating?: string | null) =>
      dedupe(
        rows
          .filter((r) => r.scheme === scheme && (!rating || r.rating_system === rating))
          .map((r) => r.typology),
      );

    const versionsOf = (scheme: string, rating?: string | null, typology?: string | null) =>
      versioniDi(rows, scheme, rating, typology);

    const find = (
      scheme: string,
      rating?: string | null,
      typology?: string | null,
      context?: string | null,
      version?: string | null,
    ) => trovaVoce(rows, scheme, rating, typology, context, version);

    /**
     * Le medaglie ammesse. Dipendono dalla combinazione, non dallo schema: il
     * Bronze di WELL esiste solo sul v2 Pilot, e WiredScore Home ha il solo
     * Certified.
     */
    const levelsOf = (
      scheme: string,
      rating?: string | null,
      typology?: string | null,
      context?: string | null,
      version?: string | null,
    ): CatalogLevel[] => {
      const entry = find(scheme, rating, typology, context, version);
      if (entry) {
        return levelRows
          .filter((l) => l.catalog_id === entry.id)
          .sort((a, b) => a.order_index - b.order_index);
      }
      // Senza una combinazione precisa si mostra l'unione dei livelli dello
      // schema, così la tendina non resta vuota mentre l'utente sta scegliendo.
      const ids = new Set(rows.filter((r) => r.scheme === scheme).map((r) => r.id));
      const seen = new Map<string, CatalogLevel>();
      for (const l of levelRows) {
        if (ids.has(l.catalog_id) && !seen.has(l.level)) seen.set(l.level, l);
      }
      return Array.from(seen.values()).sort((a, b) => a.order_index - b.order_index);
    };

    /**
     * Che natura ha uno schema: se ha un esito da raggiungere, e se c'è un
     * ente a cui si versano delle fee.
     *
     * Serve a non chiedere in offerta cose che per quel servizio non esistono:
     * un Target Level a Greeny, che non certifica niente, o le «GBCI fees» a
     * un WELL, che di GBCI non ne ha.
     */
    const naturaDi = (scheme: string) => {
      const prima = rows.find((r) => r.scheme === scheme);
      return {
        outcome: prima?.outcome_model ?? "none",
        /** Nullo quando il servizio non ha fee di terzi: il campo non si mostra. */
        etichettaFeeTerzi: prima?.third_party_fee_label ?? null,
        /** Senza un esito non c'è un livello da puntare. */
        haTargetLevel: (prima?.outcome_model ?? "none") !== "none",
      };
    };

    return {
      isLoading: entries.isLoading || levels.isLoading,
      error: entries.error ?? levels.error,
      rows,
      byId,
      schemes,
      ratingsOf,
      typologiesOf,
      versionsOf,
      levelsOf,
      naturaDi,
      find,
    };
  }, [rows, levelRows, entries.isLoading, levels.isLoading, entries.error, levels.error]);
}
