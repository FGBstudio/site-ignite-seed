import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";

/**
 * Il pulsante del planning settimanale.
 *
 * Un pulsante a sé e non un formato dentro Esporta, perché non è lo stesso
 * documento in un'altra veste: lo scadenzario elenca scadenze per chi deve
 * agire, il planning è la griglia di misure per chi deve chiudere il mese.
 * Metterlo fra i formati direbbe che sono la stessa cosa in due file diversi.
 *
 * E nessuna opzione: la finestra e le commesse sono quelle a schermo, come per
 * l'altro export. Un pannello di scelte su un documento che ha una sola forma
 * sarebbe un pannello da attraversare ogni volta per arrivare al default.
 */
export default function EsportaPlanning({
  onEsporta,
}: {
  onEsporta: () => Promise<void>;
}) {
  const [occupato, setOccupato] = useState(false);

  return (
    <button
      type="button"
      className="fbtn"
      disabled={occupato}
      title="Planning settimanale: incassi, installazioni e costi settimana per settimana"
      onClick={async () => {
        setOccupato(true);
        try {
          await onEsporta();
        } finally {
          setOccupato(false);
        }
      }}
    >
      {occupato ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CalendarRange className="h-4 w-4" />
      )}
      <span className="fl">Planning</span>
    </button>
  );
}
