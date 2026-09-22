import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import type {
  Contenuto,
  Formato,
  ModoValuta,
  OpzioniExport,
  Perimetro,
} from "@/lib/payments/scadenzario";

/**
 * Il pulsante Esporta della WBS di cassa.
 *
 * Tre scelte, non una finestra di configurazione: *fin dove*, *cosa*, *in che
 * formato*. Ognuna ha un default che copre il caso normale — quello che sto
 * guardando, solo le cose da fare, in Excel — così chi vuole il foglio e basta
 * fa due clic e chi ha un caso particolare lo trova senza cercarlo.
 *
 * Il popover è lo stesso del filtro commesse, di proposito: due controlli
 * adiacenti che si aprono in due modi diversi costringono a impararli due
 * volte.
 */

interface Props {
  /** Quanti movimenti finirebbero nel foglio con le opzioni correnti. */
  conteggio: (o: OpzioniExport) => { righe: number; senzaData: number };
  onEsporta: (o: OpzioniExport) => Promise<void>;
}

const PERIMETRI: Array<{ id: Perimetro; nome: string; sotto: string }> = [
  { id: "selezione", nome: "Selezione corrente", sotto: "le commesse accese e la finestra a schermo" },
  { id: "quattro_settimane", nome: "Prossime 4 settimane", sotto: "cosa va fatto adesso" },
  { id: "tutto", nome: "Tutto", sotto: "storico e previsto, senza limiti di data" },
];

const CONTENUTI: Array<{ id: Contenuto; nome: string; sotto: string }> = [
  { id: "da_fare", nome: "Solo da fare", sotto: "esclude quello che è già stato pagato o incassato" },
  { id: "tutto", nome: "Tutto incluso lo storico", sotto: "anche i movimenti già avvenuti" },
];

const VALUTE: Array<{ id: ModoValuta; nome: string; sotto: string }> = [
  { id: "euro", nome: "Tutto in euro", sotto: "convertito: si somma e si confronta" },
  {
    id: "originale",
    nome: "Valuta del contratto",
    sotto: "uscite in RMB o $, incassi in euro — i totali restano in euro",
  },
];

const FORMATI: Array<{ id: Formato; nome: string; sotto: string; spento?: boolean }> = [
  { id: "xlsx", nome: "Excel", sotto: "quattro fogli, totali in formula" },
  { id: "csv", nome: "CSV", sotto: "la sola agenda, separatore punto e virgola" },
  // Offrire una scelta che non fa niente è peggio che non offrirla: resta
  // visibile, spenta, e dice quando arriva.
  { id: "pdf", nome: "PDF", sotto: "da girare in approvazione — non ancora pronto", spento: true },
];

export default function EsportaScadenzario({ conteggio, onEsporta }: Props) {
  const [aperto, setAperto] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [opzioni, setOpzioni] = useState<OpzioniExport>({
    perimetro: "selezione",
    contenuto: "da_fare",
    formato: "xlsx",
    valuta: "euro",
  });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAperto(false);
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  const quanti = conteggio(opzioni);

  const vai = async () => {
    setOccupato(true);
    try {
      await onEsporta(opzioni);
      setAperto(false);
    } finally {
      setOccupato(false);
    }
  };

  return (
    <div className="fwrap" ref={box}>
      <button
        type="button"
        className="fbtn"
        aria-haspopup="dialog"
        aria-expanded={aperto}
        onClick={() => setAperto((v) => !v)}
      >
        <Download className="h-4 w-4" />
        <span className="fl">Esporta</span>
        <span className="fv">scadenzario</span>
        <ChevronDown className="chev h-3.5 w-3.5" />
      </button>

      {aperto && (
        <div className="fpop exp" role="dialog" aria-label="Esporta lo scadenzario">
          <Gruppo titolo="Perimetro">
            {PERIMETRI.map((o) => (
              <Scelta
                key={o.id}
                nome="perimetro"
                voce={o}
                attiva={opzioni.perimetro === o.id}
                onScegli={() => setOpzioni((v) => ({ ...v, perimetro: o.id }))}
              />
            ))}
          </Gruppo>

          <Gruppo titolo="Contenuto">
            {CONTENUTI.map((o) => (
              <Scelta
                key={o.id}
                nome="contenuto"
                voce={o}
                attiva={opzioni.contenuto === o.id}
                onScegli={() => setOpzioni((v) => ({ ...v, contenuto: o.id }))}
              />
            ))}
          </Gruppo>

          <Gruppo titolo="Importi">
            {VALUTE.map((o) => (
              <Scelta
                key={o.id}
                nome="valuta"
                voce={o}
                attiva={opzioni.valuta === o.id}
                onScegli={() => setOpzioni((v) => ({ ...v, valuta: o.id }))}
              />
            ))}
          </Gruppo>

          <Gruppo titolo="Formato">
            {FORMATI.map((o) => (
              <Scelta
                key={o.id}
                nome="formato"
                voce={o}
                attiva={opzioni.formato === o.id}
                onScegli={() => setOpzioni((v) => ({ ...v, formato: o.id }))}
              />
            ))}
          </Gruppo>

          {/* Quanto si sta per esportare, prima di farlo: un foglio vuoto o da
              quattrocento righe sono due errori diversi, e si vedono qui. */}
          <div className="ffoot">
            <span>
              <b className="num">{quanti.righe}</b> movimenti in agenda
              {quanti.senzaData > 0 && (
                <>
                  {" · "}
                  <b className="num">{quanti.senzaData}</b> senza data
                </>
              )}
            </span>
            <button type="button" className="primary" onClick={vai} disabled={occupato}>
              {occupato ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {occupato ? "Sto scrivendo…" : "Scarica"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Gruppo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="egrp">
      <p className="etit">{titolo}</p>
      {children}
    </div>
  );
}

function Scelta({
  nome,
  voce,
  attiva,
  onScegli,
}: {
  nome: string;
  voce: { id: string; nome: string; sotto: string; spento?: boolean };
  attiva: boolean;
  onScegli: () => void;
}) {
  return (
    <label className={`eopt${attiva ? " on" : ""}${voce.spento ? " off" : ""}`}>
      <input
        type="radio"
        name={nome}
        checked={attiva}
        disabled={voce.spento}
        onChange={onScegli}
      />
      <span>
        {voce.nome}
        <small>{voce.sotto}</small>
      </span>
    </label>
  );
}
