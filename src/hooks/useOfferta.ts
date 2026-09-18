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

/**
 * Le societa' fatturabili di un brand.
 *
 * La chiave sta sotto `contacts` e non sotto `offerta` perche' e' la tabella
 * che questa query legge. Non e' pedanteria: `useContacts` invalida
 * `["contacts"]` dopo ogni salvataggio, e finche' questa query si chiamava
 * `["offerta", …]` quell'invalidazione non la raggiungeva. Il risultato era che
 * creando la societa' dal form dell'offerta — col pulsante che sta li' apposta
 * — l'elenco restava vuoto e «Genera PDF» non si abilitava mai.
 */
export function useSocietaDelBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["contacts", "societa-brand", brandId],
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

/**
 * Le nostre societa' emittenti.
 *
 * Non filtrate per brand: l'emittente siamo noi, e non dipende da chi e' il
 * cliente. E' la ragione per cui non poteva stare nella query qui sopra.
 */
export function useEmittenti() {
  return useQuery({
    // Stessa ragione della query qui sopra: legge `contacts`, sta sotto
    // `contacts`, così un salvataggio la rinfresca da sé.
    queryKey: ["contacts", "emittenti"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("kind", "issuer")
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

/**
 * Quale societa' emette, per una commessa.
 *
 * NULL sulla certificazione non vuol dire «nessuna»: vuol dire «quella di
 * default». Finche' di emittenti ce n'e' uno solo non c'e' niente da
 * scegliere, e chiederlo sarebbe una domanda con una risposta sola. Il giorno
 * che ne esiste un secondo, la scelta diventa obbligatoria da se': questa
 * funzione smette di indovinare e torna NULL.
 */
export function emittentePredefinito(emittenti: Contact[]): Contact | null {
  return emittenti.length === 1 ? emittenti[0] : null;
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
  /** Chi emette, stampato nel piede del PDF. Facoltativi: se mancano, il
   *  servizio ripiega sulla societa' UK, che e' quella che stava scritta nel
   *  template prima che l'emittente diventasse una scelta. */
  emittente_ragione_sociale?: string;
  emittente_indirizzo?: string;
  emittente_piva?: string;
  /** Non compare nell'offerta — il piede ha tre righe e le coordinate bancarie
   *  servono alla fattura, non a un preventivo. Viaggia lo stesso perche' la
   *  fattura nasce da questa stessa scelta. */
  emittente_iban?: string;
}

/**
 * Chi emette, scritto come lo vogliono i template.
 *
 * Le tre righe del piede servono a offerta e fattura; le coordinate bancarie
 * solo alla fattura, che è l'unico documento su cui qualcuno deve pagare.
 *
 * La sigla fiscale la mette qui il codice e non piu' il template. Nel template
 * «VAT » era scritto a mano prima del numero, il che andava bene finche' la
 * societa' era una britannica sola; con una societa' italiana lo stesso
 * template avrebbe stampato «VAT» sopra una partita IVA italiana — una riga
 * fiscale sbagliata su un documento che gira al cliente.
 *
 * La regola guarda il paese e non la lingua dell'interfaccia: e' il paese della
 * societa' che decide come si chiama il suo numero.
 */
export function datiEmittente(c: Contact | null | undefined) {
  if (!c) return null;

  const paese = (c.country ?? "").trim().toLowerCase();
  const italiana = paese === "italia" || paese === "italy" || paese === "it";
  const numero = (c.vat_number ?? "").trim();

  return {
    ragioneSociale: c.company_name ?? "",
    // Una riga sola, come nel piede: via, CAP, citta', paese.
    indirizzo: [c.address, c.postal_code, c.city, c.country].filter(Boolean).join(", "),
    // Se il numero porta gia' la sigla non si raddoppia: qualcuno, prima o poi,
    // scrivera' «VAT GB…» dentro il campo.
    piva: !numero
      ? ""
      : /^(vat|p\.?\s?iva)\b/i.test(numero)
      ? numero
      : `${italiana ? "P.IVA" : "VAT"} ${numero}`,

    // Coordinate bancarie: nella fattura stavano scritte nel corpo del
    // documento. Sono il dato che il cliente usa davvero — un IBAN della
    // società sbagliata manda i soldi altrove, e non è un errore che si
    // recupera ristampando il PDF.
    banca: c.bank_name ?? "",
    conto: c.bank_account ?? "",
    iban: c.iban ?? "",
    bic: c.bic ?? "",
  };
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
    /**
     * Quali righe dell'intestazione usciranno vuote.
     *
     * Non impedisce di emettere: serve a far vedere in anticipo com'è fatto il
     * documento che si sta per mandare. L'unico dato senza cui non si può
     * intestare è la ragione sociale, che in anagrafica è NOT NULL.
     */
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
      issuer_contact_id?: string | null;
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
