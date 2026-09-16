/**
 * L'estrazione col modello: la strada principale, col parser locale dietro.
 *
 * Il parser per coordinate di `importTimeline.ts` funziona quando il gantt e'
 * una tabella pulita con le date scritte. Non funziona — e non puo' funzionare
 * — quando le date non sono scritte da nessuna parte e stanno solo nella
 * posizione delle barre contro la scala dei mesi in testata. Quello e' il caso
 * piu' comune dei gantt veri, ed e' esattamente il caso in cui il PM ha in
 * mano il file giusto e l'import gli restituisce una tabella di nomi senza
 * date, cioe' niente.
 *
 * Qui il documento lo guarda un modello multimodale. La chiave sta in una edge
 * function, non nel bundle: il frontend e' pubblico su GitHub Pages.
 *
 * L'ordine e' AI prima, parser locale dopo, e mai il contrario — ma il
 * ripiego e' automatico e silenzioso solo nel meccanismo, non nel racconto: il
 * diario dice sempre da dove vengono le righe, perche' «date dedotte dalla
 * posizione delle barre» e «date lette nel testo» meritano due livelli di
 * controllo diversi da parte del PM.
 */

import { supabase } from "@/integrations/supabase/client";
import { estraiTimeline, type AttivitaCandidata, type EsitoEstrazione } from "@/lib/importTimeline";

export type MotoreEstrazione = "ai" | "locale";

/** La forma che la edge function promette. Nuova, quindi tipizzata. */
interface RigaDalModello {
  nome: string;
  inizio: string | null;
  fine: string | null;
  durata_mesi: number | null;
  dedotta: boolean;
  tipo: "fase" | "milestone";
}

interface RispostaEstrazione {
  attivita?: RigaDalModello[];
  ancoraggio_suggerito?: string | null;
  richiede_ancoraggio?: boolean;
  lingua?: string | null;
  diario?: string;
  errore?: string;
}

export interface EsitoEstrazioneAI extends EsitoEstrazione {
  motore: MotoreEstrazione;
  /** Quante righe hanno date dedotte dalla posizione della barra, non lette. */
  dedotte: number;
}

/** ~9 MB: oltre, il gateway rifiuta e non ha senso fare il viaggio. */
const MAX_BYTE = 9 * 1024 * 1024;

const base64Di = async (file: File): Promise<string> => {
  const buf = new Uint8Array(await file.arrayBuffer());
  // A pezzi: String.fromCharCode(...buf) su qualche MB fa saltare lo stack.
  let s = "";
  const PEZZO = 8192;
  for (let i = 0; i < buf.length; i += PEZZO) {
    s += String.fromCharCode(...buf.subarray(i, i + PEZZO));
  }
  return btoa(s);
};

/** Un xlsx non si manda come immagine: si converte in testo tabellare qui. */
async function testoDaXlsx(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return wb.SheetNames.slice(0, 4)
    .map((n) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { dateNF: "yyyy-mm-dd" });
      return `### Foglio: ${n}\n${csv}`;
    })
    .join("\n\n");
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Prova il modello; se non e' disponibile o non produce nulla di utile, torna
 * al parser locale. Un fallimento dell'AI non e' mai un fallimento dell'import.
 */
export async function estraiTimelineIntelligente(
  file: File,
  onStato?: (s: string) => void
): Promise<EsitoEstrazioneAI> {
  const est = file.name.split(".").pop()?.toLowerCase() ?? "";
  const xlsx = est === "xlsx" || est === "xls";

  if (!MIME[est] && !xlsx) {
    const locale = await estraiTimeline(file);
    return { ...locale, motore: "locale", dedotte: 0 };
  }

  if (file.size > MAX_BYTE) {
    onStato?.("File grande: uso il lettore locale");
    const locale = await estraiTimeline(file);
    return {
      ...locale,
      motore: "locale",
      dedotte: 0,
      diario: `${locale.diario} (file oltre 9 MB: analisi AI saltata)`,
    };
  }

  try {
    onStato?.(xlsx ? "Leggo il foglio…" : "Analizzo il documento…");
    const corpo = xlsx
      ? { testo: await testoDaXlsx(file), nomeFile: file.name }
      : { base64: await base64Di(file), mime: MIME[est], nomeFile: file.name };

    onStato?.("Estrazione in corso — il modello sta leggendo le date…");
    const { data, error } = await supabase.functions.invoke<RispostaEstrazione>(
      "estrai-cronoprogramma",
      { body: corpo }
    );
    if (error) throw error;
    if (!data || data.errore) throw new Error(data?.errore ?? "risposta vuota");

    const righe = data.attivita ?? [];
    const attivita: AttivitaCandidata[] = righe.map((a) => ({
      nome: a.nome,
      inizio: a.inizio ?? null,
      fine: a.fine ?? null,
      durata_mesi: a.durata_mesi ?? null,
      // Il ruolo NON si indovina dal nome.
      //
      // Il lessico marcava `lancio_gara` tutto cio' che conteneva «permit», e
      // su un gantt greco questo significava cinque righe diverse —
      // «Submission for Permit», «Review & approval for Building Permit»,
      // «Pre-Approval File», «Submission of Building Permit» — tutte
      // etichettate «Lancio gara d'appalto». Che oltre a essere falso e'
      // impossibile: l'ancora e' unica per cronoprogramma.
      //
      // I ruoli sono tre e si assegnano una volta sola, non riga per riga.
      ancora_proposta: null,
    }));

    if (attivita.length === 0) throw new Error("nessuna attività riconosciuta");

    return {
      attivita,
      richiedeAncoraggio: !!data.richiede_ancoraggio,
      ancoraggioSuggerito: data.ancoraggio_suggerito ?? null,
      diario: data.diario ?? `${attivita.length} attività estratte.`,
      motore: "ai",
      dedotte: righe.filter((a) => a.dedotta).length,
    };
  } catch (err: unknown) {
    // Il ripiego. Non si dice «errore»: per il PM non e' cambiato niente,
    // tranne che le date potrebbero essere meno complete.
    onStato?.("Passo al lettore locale…");
    const locale = await estraiTimeline(file);
    const perche = (err instanceof Error ? err.message : String(err ?? "")).slice(0, 120);
    return {
      ...locale,
      motore: "locale",
      dedotte: 0,
      diario: `${locale.diario} · lettura locale${perche ? ` (analisi AI non disponibile: ${perche})` : ""}`,
    };
  }
}
