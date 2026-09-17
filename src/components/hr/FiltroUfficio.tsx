import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { oraLocale, scartoOre, useUffici } from "@/hooks/useUffici";

/**
 * Il filtro per ufficio, condiviso dalle viste HR.
 *
 * Porta con sé l'ora locale di ciascun ufficio, e non è un vezzo: chi guarda
 * le presenze di Shanghai da Milano deve sapere che lì sono le 16:00 e non le
 * 10:00, altrimenti legge «nessuno ha ancora timbrato» come un problema
 * invece che come «la giornata è finita da un pezzo».
 *
 * Quando nessuno è ancora assegnato a un ufficio il filtro non compare. Un
 * filtro che restituisce liste vuote qualunque cosa si scelga non è
 * un'opzione: è una trappola.
 */
export function FiltroUfficio({
  scelto,
  onScegli,
  conteggi,
  className,
}: {
  scelto: string | null;
  onScegli: (id: string | null) => void;
  /** Quante persone per ufficio: se è tutto zero, il filtro si nasconde. */
  conteggi?: Map<string, number>;
  className?: string;
}) {
  const { data: uffici = [] } = useUffici();
  const adesso = new Date();

  const assegnate = conteggi
    ? Array.from(conteggi.values()).reduce((a, b) => a + b, 0)
    : null;
  if (uffici.length === 0 || assegnate === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => onScegli(null)}
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          scelto === null ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
        )}
      >
        Tutti gli uffici
      </button>

      {uffici.map((u) => {
        const n = conteggi?.get(u.id);
        const acceso = scelto === u.id;
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onScegli(acceso ? null : u.id)}
            title={`${u.name} · ora locale ${oraLocale(u.timezone, adesso)} (${scartoOre(u.timezone, adesso)})`}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              acceso ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
              n === 0 && "opacity-45"
            )}
          >
            {u.name}
            <span className="tabular-nums text-muted-foreground">
              {oraLocale(u.timezone, adesso)}
            </span>
            {n !== undefined && n > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[9.5px] tabular-nums">
                {n}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
