import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, eurEquivalent } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";

/**
 * Un importo con, sotto, l'equivalente in euro.
 *
 * Lo "specchietto" compare solo quando serve davvero: su un'offerta gia' in
 * euro sarebbe la stessa cifra scritta due volte.
 */
export function Money({
  amount,
  currency,
  rateToEur,
  className,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  rateToEur?: number | null;
  className?: string;
}) {
  const eur = eurEquivalent(amount, currency, rateToEur);
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className="tabular-nums">{formatMoney(amount, currency)}</span>
      {eur && <span className="text-[11px] text-muted-foreground tabular-nums">{eur}</span>}
    </span>
  );
}

/**
 * La tendina delle valute.
 *
 * L'elenco viene da fx_rates, cioe' da cio' che il refresh giornaliero sa
 * convertire: offrire una valuta di cui non abbiamo il cambio significherebbe
 * accettare un'offerta che non sappiamo riportare in euro.
 */
export function CurrencySelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { data: rates = [] } = useFxRates();
  return (
    <Select value={value || "EUR"} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-28", className)}>
        <SelectValue placeholder="EUR" />
      </SelectTrigger>
      <SelectContent>
        {rates.map((r) => (
          <SelectItem key={r.code} value={r.code}>
            <span className="tabular-nums">{r.symbol}</span>
            <span className="ml-2">{r.code}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * La riga sotto al campo importo: quanto fa in euro, e a che cambio.
 *
 * Il cambio si scrive per esteso perche' e' il numero che resta inciso
 * sull'offerta al salvataggio: fra sei mesi, davanti a un importo che non
 * torna, e' l'unica cosa che spiega perche'.
 */
export function EurHint({
  amount,
  currency,
  rateToEur,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  rateToEur?: number | null;
}) {
  const eur = eurEquivalent(amount, currency, rateToEur);
  if (!eur) return null;
  const code = (currency || "EUR").toUpperCase();
  return (
    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
      {eur}
      <span className="ml-2 opacity-70">
        (1 {code} = {Number(rateToEur).toFixed(4)} EUR)
      </span>
    </p>
  );
}
