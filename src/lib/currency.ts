/**
 * Le valute in cui si emette un'offerta.
 *
 * L'elenco vero e' `public.fx_rates`, che la edge function `fx-rates-refresh`
 * riempie ogni mattina alle 6. Qui c'e' solo come si scrivono: simbolo e nome,
 * che un tasso di cambio non sa.
 *
 * Attenzione al verso, perche' sbagliarlo non da' errore, da' numeri
 * plausibili: `fx_rates` dice quanto vale UN EURO nella valuta quotata
 * (EUR -> GBP = 0,856), mentre `fx_rate_to_eur` sulla certificazione dice
 * quanti euro vale UNA unita' di quella valuta (1 GBP = 1,168 EUR). Sono l'uno
 * il reciproco dell'altro, e in tutta l'applicazione si usa il secondo.
 */

export interface CurrencyLook {
  /** Il simbolo, dove esiste; per le altre il codice stesso. */
  symbol: string;
  label: string;
  /** Alcune valute si scrivono senza decimali. */
  decimals: number;
}

export const CURRENCY_LOOK: Record<string, CurrencyLook> = {
  EUR: { symbol: "€",    label: "Euro",            decimals: 0 },
  GBP: { symbol: "£",    label: "Pound sterling",  decimals: 0 },
  USD: { symbol: "$",    label: "US dollar",       decimals: 0 },
  CNY: { symbol: "¥",    label: "Renminbi",        decimals: 0 },
  CHF: { symbol: "CHF",  label: "Swiss franc",     decimals: 0 },
  JPY: { symbol: "¥",    label: "Japanese yen",    decimals: 0 },
  AUD: { symbol: "A$",   label: "Australian dollar", decimals: 0 },
  CAD: { symbol: "C$",   label: "Canadian dollar", decimals: 0 },
  HKD: { symbol: "HK$",  label: "Hong Kong dollar", decimals: 0 },
  SGD: { symbol: "S$",   label: "Singapore dollar", decimals: 0 },
  DKK: { symbol: "kr",   label: "Danish krone",    decimals: 0 },
  NOK: { symbol: "kr",   label: "Norwegian krone", decimals: 0 },
  SEK: { symbol: "kr",   label: "Swedish krona",   decimals: 0 },
  PLN: { symbol: "zł",   label: "Polish złoty",    decimals: 0 },
};

/** Le tre che il commerciale usa davvero, in cima alla tendina. */
export const PRIMARY_CURRENCIES = ["EUR", "GBP", "USD", "CNY"];

export function currencySymbol(code: string | null | undefined): string {
  const c = (code || "EUR").toUpperCase();
  return CURRENCY_LOOK[c]?.symbol ?? c;
}

export function currencyLabel(code: string | null | undefined): string {
  const c = (code || "EUR").toUpperCase();
  return CURRENCY_LOOK[c]?.label ?? c;
}

/**
 * "£12,000". Il simbolo davanti anche dove la lingua locale lo metterebbe
 * dietro: in una colonna di numeri il simbolo a sinistra si legge a colpo
 * d'occhio, e questa e' una tabella, non un documento per il cliente.
 */
export function formatMoney(
  amount: number | null | undefined,
  code: string | null | undefined = "EUR",
): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const c = (code || "EUR").toUpperCase();
  const decimals = CURRENCY_LOOK[c]?.decimals ?? 0;
  const n = Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sym = currencySymbol(c);
  // I codici usati come simbolo (CHF) vogliono uno spazio, i simboli veri no.
  return sym.length > 2 ? `${sym} ${n}` : `${sym}${n}`;
}

/**
 * Lo "specchietto": l'equivalente in euro, da mostrare accanto all'importo.
 *
 * Restituisce null quando non c'e' niente da dire — importo mancante, o offerta
 * gia' in euro — cosi' chi lo usa non deve ripetere la condizione.
 */
export function eurEquivalent(
  amount: number | null | undefined,
  code: string | null | undefined,
  rateToEur: number | null | undefined,
): string | null {
  if (amount === null || amount === undefined) return null;
  const c = (code || "EUR").toUpperCase();
  if (c === "EUR") return null;
  const rate = Number(rateToEur);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return `≈ ${formatMoney(Number(amount) * rate, "EUR")}`;
}
