import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * YearInput — Editor for a "certification year" stored as a DB DATE.
 *
 * Convention: when the user only knows the year, we persist YYYY-01-01.
 * The presence of any non-null issued_date marks the certification as "certified".
 * A full date (with month/day) is still valid — this input only edits the YEAR part.
 */
interface YearInputProps {
  /** Stored ISO date string (YYYY-MM-DD) or null. */
  value: string | null | undefined;
  /** Called with a new YYYY-01-01 string when the year changes, or null to clear. */
  onChange: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function YearInput({ value, onChange, placeholder = "e.g. 2026", disabled, className, id }: YearInputProps) {
  const year = value ? value.slice(0, 4) : "";

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={1900}
      max={2100}
      step={1}
      value={year}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("w-28", className)}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) {
          onChange(null);
          return;
        }
        // Only propagate when we have a plausible 4-digit year
        if (/^\d{4}$/.test(raw)) {
          onChange(`${raw}-01-01`);
        }
      }}
    />
  );
}
