import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Wallet } from "lucide-react";
import { useCreditiApertiDelBrand } from "@/hooks/useCreditiCliente";
import { importo } from "@/lib/payments/aggregati";

/**
 * Il credito che il cliente ha già, ricordato mentre si scrive l'offerta.
 *
 * «Louis Vuitton cancella il progetto a metà strada. Questi 6.750 mi rimangono a
 * credito e lui mi dice: li useremo per un progetto futuro.» Diciotto mesi dopo
 * quella promessa è in una mail che nessuno riapre — e il cliente, invece, se la
 * ricorda benissimo.
 *
 * Sta in cima al wizard perché è un'informazione che cambia l'offerta: leggerla
 * dopo aver scritto il totale è leggerla troppo tardi.
 *
 * **Non scala niente.** Tenerne conto segna il collegamento; l'importo lo scrive
 * chi tratta. Un automatismo qui deciderebbe uno sconto al posto di una persona,
 * e uno sconto è una trattativa.
 */
export function FasciaCredito({
  brandId,
  scelti,
  onCambia,
}: {
  brandId: string | null | undefined;
  /** I crediti che si è scelto di tenere in conto. */
  scelti: string[];
  onCambia: (ids: string[]) => void;
}) {
  const { data: crediti = [] } = useCreditiApertiDelBrand(brandId);

  if (crediti.length === 0) return null;

  const totale = crediti.reduce((s, c) => s + Number(c.importo), 0);
  const valuta = crediti[0].valuta;

  return (
    <div className="mt-3 rounded-[10px] border border-amber-300 bg-amber-50 p-3 text-amber-950">
      <div className="flex items-start gap-2">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">
            {crediti[0].cliente} ha un credito aperto di {importo(totale, valuta)}
            {crediti.length > 1 && ` su ${crediti.length} voci`}
          </p>

          <ul className="mt-2 space-y-1.5">
            {crediti.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={scelti.includes(c.id)}
                    onChange={() =>
                      onCambia(
                        scelti.includes(c.id)
                          ? scelti.filter((x) => x !== c.id)
                          : [...scelti, c.id],
                      )
                    }
                    className="h-3.5 w-3.5 accent-amber-700"
                  />
                  <span className="font-semibold tabular-nums">
                    {importo(Number(c.importo), c.valuta)}
                  </span>
                </label>
                <span className="opacity-80">
                  {c.motivo}
                  {c.progetto_origine && ` — da «${c.progetto_origine}»`}
                  {c.data && ` (${format(parseISO(c.data), "d MMM yyyy", { locale: it })})`}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[11px] opacity-80">
            {scelti.length > 0 ? (
              <>
                {scelti.length === 1 ? "Un credito" : `${scelti.length} crediti`} verranno segnati
                come usati su questa offerta al salvataggio.{" "}
                <b>L'importo dell'offerta resta quello che scrivi tu</b>: quanto riconoscergliene è
                una trattativa.
              </>
            ) : (
              <>Spunta quelli di cui vuoi tenere conto, o lascia stare: restano aperti.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
