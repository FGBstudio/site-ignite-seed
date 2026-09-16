import { Badge } from "@/components/ui/badge";

/**
 * La testata delle card — il linguaggio visivo già in uso nel prodotto:
 * pallino nero numerato, titolo maiuscolo, chip, e sotto la nota in viola.
 *
 * Il viola non è decorazione: nel prodotto FGB distingue «questo è il
 * significato della sezione» dal testo operativo grigio. Averlo uguale
 * dappertutto è ciò che rende riconoscibile una schermata nuova.
 */
export function IntestazioneCard({
  numero,
  titolo,
  chip,
  pill,
  nota,
}: {
  numero?: number;
  titolo: string;
  chip?: string;
  pill?: string;
  nota?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {numero !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
            {numero}
          </span>
        )}
        <h2 className="text-sm font-medium uppercase tracking-wide">{titolo}</h2>
        {chip && (
          <Badge variant="secondary" className="text-[10px]">
            {chip}
          </Badge>
        )}
        {pill && (
          <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {pill}
          </span>
        )}
      </div>
      {nota && (
        <p className="mt-1.5 max-w-[78ch] text-xs text-[#8A7CE0] dark:text-[#A79BF0]">{nota}</p>
      )}
    </div>
  );
}
