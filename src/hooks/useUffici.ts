import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nomePersona } from "@/lib/nomePersona";

/**
 * Gli uffici e chi ci lavora.
 *
 * La struttura esisteva già — `hr_offices` con Milano, Loano, Montecarlo, Los
 * Angeles e Shanghai, più `profiles.office_id` — ma **nessuna riga era
 * assegnata e nessuna schermata la leggeva**. Uno schema senza dati e senza
 * interfaccia non è una funzionalità a metà: è una funzionalità che non c'è,
 * ed è il motivo per cui lato admin non si vedeva niente.
 *
 * Il fuso non è un ornamento della scheda ufficio. Shanghai è avanti di sei ore
 * su Milano e Los Angeles indietro di nove: un'entrata timbrata alle 9:00 a
 * Shanghai, letta sull'ora di Milano, diventa le 3:00 di notte. Finché tutti
 * stavano in Italia non si vedeva; con cinque uffici su tre continenti è la
 * differenza fra una presenza e un errore.
 */

export interface Ufficio {
  id: string;
  name: string;
  country: string | null;
  timezone: string;
  is_active: boolean;
}

export interface PersonaUfficio {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  office_id: string | null;
  nome: string;
}

export function useUffici() {
  return useQuery({
    queryKey: ["uffici"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_offices")
        .select("id, name, country, timezone, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Ufficio[];
    },
  });
}

/** Le persone con il loro ufficio. Il nome è già risolto: una regola sola. */
export function usePersoneConUfficio() {
  return useQuery({
    queryKey: ["uffici", "persone"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, display_name, email, office_id");
      if (error) throw error;
      return ((data ?? []) as PersonaUfficio[])
        .map((p) => ({ ...p, nome: nomePersona(p) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    },
  });
}

export function useAssegnaUfficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { personaId: string; ufficioId: string | null }) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ office_id: i.ufficioId })
        .eq("id", i.personaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uffici"] });
      // Le viste HR mostrano il nome dell'ufficio accanto alle persone.
      qc.invalidateQueries({ queryKey: ["hr"] });
    },
  });
}

// ── Il fuso ───────────────────────────────────────────────────────────────

/**
 * Che ore sono adesso in un ufficio.
 *
 * Si passa da `Intl` e non da uno scarto in ore scritto a mano: l'ora legale
 * non cambia insieme nei tre continenti — l'Europa la sposta l'ultima domenica
 * di marzo, gli Stati Uniti la seconda di marzo, e la Cina non ce l'ha
 * affatto. Per due settimane l'anno uno scarto fisso sbaglia di un'ora, ed è
 * il tipo di errore che nessuno associa mai alla causa.
 */
export function oraLocale(timezone: string, quando: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(quando);
  } catch {
    // Un fuso scritto male non deve far sparire la riga: si degrada all'ora
    // locale di chi guarda, che è comunque un'informazione.
    return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(quando);
  }
}

/** Lo scarto in ore rispetto a chi guarda: «+6h», «−9h», «stessa ora». */
export function scartoOre(timezone: string, quando: Date = new Date()): string {
  try {
    const qui = new Date(quando.toLocaleString("en-US"));
    const la = new Date(quando.toLocaleString("en-US", { timeZone: timezone }));
    const ore = Math.round((la.getTime() - qui.getTime()) / 3_600_000);
    if (ore === 0) return "stessa ora";
    return ore > 0 ? `+${ore}h` : `${ore}h`;
  } catch {
    return "";
  }
}

/** Il giorno lì, quando qui è un altro: a Shanghai può essere già domani. */
export function stessoGiorno(timezone: string, quando: Date = new Date()): boolean {
  try {
    const f = (tz?: string) =>
      new Intl.DateTimeFormat("en-CA", tz ? { timeZone: tz } : {}).format(quando);
    return f(timezone) === f();
  } catch {
    return true;
  }
}
