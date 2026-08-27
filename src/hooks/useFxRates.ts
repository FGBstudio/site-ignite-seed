import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_LOOK, PRIMARY_CURRENCIES, currencyLabel, currencySymbol } from "@/lib/currency";

export interface FxOption {
  code: string;
  label: string;
  symbol: string;
  /** Quanti euro vale UNA unita' di questa valuta. */
  rateToEur: number;
  fetchedAt: string | null;
}

/**
 * Le valute selezionabili, con il cambio di oggi.
 *
 * Legge `fx_rates`, che la edge function `fx-rates-refresh` aggiorna ogni
 * mattina alle 6. La tabella tiene il verso EUR -> valuta; qui si restituisce
 * il reciproco, che e' quello con cui si ragiona ovunque nell'applicazione.
 *
 * Se la tabella non risponde resta almeno l'euro: una tendina vuota
 * impedirebbe di salvare un'offerta, e la stragrande maggioranza e' in euro.
 */
export function useFxRates() {
  return useQuery({
    queryKey: ["fx-rates"],
    // I cambi si muovono una volta al giorno: rileggerli a ogni montaggio del
    // form e' traffico sprecato.
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<FxOption[]> => {
      const { data, error } = await supabase
        .from("fx_rates" as any)
        .select("base, quote, rate, fetched_at")
        .eq("base", "EUR");

      if (error) throw error;

      const options: FxOption[] = [];
      for (const row of (data || []) as any[]) {
        const code = String(row.quote || "").toUpperCase();
        const rate = Number(row.rate);
        if (!code || !Number.isFinite(rate) || rate <= 0) continue;
        options.push({
          code,
          label: currencyLabel(code),
          symbol: currencySymbol(code),
          rateToEur: code === "EUR" ? 1 : 1 / rate,
          fetchedAt: row.fetched_at ?? null,
        });
      }

      if (!options.some((o) => o.code === "EUR")) {
        options.push({ code: "EUR", label: currencyLabel("EUR"), symbol: "€", rateToEur: 1, fetchedAt: null });
      }

      // Le quattro che si usano davvero in cima, il resto in ordine alfabetico.
      // Fuori da CURRENCY_LOOK non c'e' un nome da mostrare, solo il codice:
      // meglio in fondo che in mezzo alle altre.
      return options.sort((a, b) => {
        const ia = PRIMARY_CURRENCIES.indexOf(a.code);
        const ib = PRIMARY_CURRENCIES.indexOf(b.code);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        const ka = a.code in CURRENCY_LOOK ? 0 : 1;
        const kb = b.code in CURRENCY_LOOK ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return a.code.localeCompare(b.code);
      });
    },
  });
}
