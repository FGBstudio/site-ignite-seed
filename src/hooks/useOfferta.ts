import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Contact } from "@/types/contacts";

/**
 * L'offerta in PDF.
 *
 * Il PDF non si costruisce qui: lo fa un servizio a parte che ha LibreOffice e
 * il template Word aziendale. Questo modulo mette insieme i dati e chiama la
 * Edge Function, che a sua volta tiene la chiave — in una SPA statica un
 * segreto nel bundle non e' un segreto.
 */

/** Le societa' fatturabili di un brand. */
export function useSocietaDelBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["offerta", "societa", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("brand_id", brandId!)
        .eq("kind", "client")
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

export interface DatiOfferta {
  data: string;
  cliente_ragione_sociale: string;
  cliente_indirizzo: string;
  cliente_cap_citta: string;
  cliente_piva: string;
  titolo_riga1: string;
  titolo_riga2: string;
  oggetto: string;
  righe: string[];
  prezzo_listino?: string;
  prezzo_finale: string;
  cliente_breve: string;
  termini_giorni?: string;
}

/**
 * Quello che si sa gia' della societa', scritto come lo vuole il template.
 *
 * L'indirizzo di fatturazione e' una riga sola nel PDF ma tre campi in
 * anagrafica, e il CAP sta prima della citta': comporlo in un punto solo evita
 * che due schermate lo scrivano in due modi.
 */
export function datiDaSocieta(c: Contact | null | undefined) {
  if (!c) return null;
  const capCitta = [c.postal_code, c.city].filter(Boolean).join(" ");
  // La riga fiscale e' testo libero nel template: si mostra la partita IVA, e
  // se manca si ripiega sul codice fiscale invece di lasciare il vuoto.
  const fiscale = c.vat_number
    ? `P.IVA ${c.vat_number}`
    : c.tax_code
    ? `C.F. ${c.tax_code}`
    : "";
  return {
    ragioneSociale: c.company_name ?? "",
    indirizzo: c.address ?? "",
    capCitta,
    fiscale,
    /** Cosa manca perché l'offerta sia intestabile. */
    mancanti: [
      !c.address && "indirizzo",
      !capCitta && "CAP e città",
      !fiscale && "partita IVA",
    ].filter(Boolean) as string[],
  };
}

/**
 * Genera il PDF.
 *
 * La Edge Function risponde con il PDF oppure con un JSON di errore: si guarda
 * il tipo di contenuto, perche' trattare un messaggio d'errore come un PDF
 * produce un file che si scarica e non si apre — e nessuno capisce perche'.
 */
export function useGeneraOfferta() {
  return useMutation({
    mutationFn: async (dati: DatiOfferta) => {
      const { data: sessione } = await supabase.auth.getSession();
      const token = sessione.session?.access_token;
      if (!token) throw new Error("Sessione scaduta: rientra e riprova.");

      const url = `${(supabase as any).supabaseUrl}/functions/v1/genera-offerta`;
      const risposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(dati),
      });

      const tipo = risposta.headers.get("Content-Type") ?? "";
      if (!risposta.ok || !tipo.includes("application/pdf")) {
        let messaggio = `Generazione fallita (${risposta.status})`;
        try {
          const j = await risposta.json();
          messaggio = j.campi?.length
            ? `Campi mancanti: ${j.campi.join(", ")}`
            : j.errore ?? messaggio;
        } catch {
          /* la risposta non era JSON: resta il messaggio generico */
        }
        throw new Error(messaggio);
      }

      const blob = await risposta.blob();
      const nome =
        risposta.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] ??
        "Offerta.pdf";
      return { blob, nome };
    },
  });
}

/** Fa partire il download senza lasciare l'URL temporaneo in memoria. */
export function scarica(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Salva sulla certificazione cio' che si e' deciso emettendo l'offerta.
 *
 * Non e' un effetto collaterale: la societa' a cui si intesta e le voci
 * vendute servono anche dopo — alla fatturazione, e alla prossima offerta
 * sullo stesso cliente, che cosi' parte gia' compilata.
 */
export function useSalvaDatiOfferta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      certification_id: string;
      billing_contact_id: string | null;
      quotation_line_items: string[];
      quotation_list_price: number | null;
    }) => {
      const { certification_id, ...campi } = input;
      const { error } = await (supabase as any)
        .from("certifications")
        .update(campi)
        .eq("id", certification_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
