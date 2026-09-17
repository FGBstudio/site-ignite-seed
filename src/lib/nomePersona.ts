/**
 * Come si chiama una persona, in un posto solo.
 *
 * Il difetto che questo file chiude: in giro per l'app c'erano diciannove
 * varianti di `full_name || email`, che **saltano `display_name`**. Risultato
 * visibile: Shikha Gadru compare col suo nome perché ha `full_name`
 * valorizzato, Matteo Martignoni compare come `m.martignoni@fgb-studio.com`
 * perché il suo nome sta in `display_name` e quella colonna nessuno la
 * guardava. Non è un dato mancante — è un dato che c'è e che non veniva letto.
 *
 * Tredici profili su ventotto sono in quella condizione.
 *
 * L'ordine qui sotto è il solo ammesso, e la ragione di ciascun gradino:
 *
 *  1. `full_name` — il nome anagrafico, quello che una persona userebbe per
 *     firmare;
 *  2. `display_name` — come si è presentata lei, o come l'ha registrata chi
 *     l'ha invitata. Meno formale, ma è pur sempre un nome;
 *  3. la parte locale dell'email, ripulita — `m.martignoni` diventa
 *     «M. Martignoni». Peggiore delle prime due, ma resta leggibile in una
 *     lista e non costringe l'occhio a scavalcare un dominio;
 *  4. l'email intera, come ultima difesa.
 *
 * Non si restituisce mai una stringa vuota: una riga senza nome in una tabella
 * è peggio di una riga con un nome brutto, perché sembra un errore di
 * caricamento.
 */

export interface PersonaConNome {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

const pieno = (v: string | null | undefined): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Da `m.martignoni` a «M. Martignoni».
 *
 * Si tocca solo quello che è chiaramente un nome di casella: separatori noti
 * (punto, trattino, underscore) e nient'altro. Un indirizzo come `monitoring`
 * o `info` resta com'è — maiuscolare «Monitoring» è corretto, inventarci un
 * cognome no.
 */
function daCasella(email: string): string | null {
  const locale = email.split("@")[0]?.trim();
  if (!locale) return null;

  // Caselle di servizio con numeri o sigle: meglio l'email intera, che almeno
  // è inequivocabile.
  if (/\d{3,}/.test(locale)) return null;

  const pezzi = locale
    .split(/[._-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (pezzi.length === 0) return null;

  return pezzi
    .map((p) => (p.length === 1 ? `${p.toUpperCase()}.` : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Il nome di una persona. Mai vuoto. */
export function nomePersona(p: PersonaConNome | null | undefined, ripiego = "—"): string {
  if (!p) return ripiego;
  if (pieno(p.full_name)) return p.full_name.trim();
  if (pieno(p.display_name)) return p.display_name.trim();
  if (pieno(p.email)) return daCasella(p.email) ?? p.email.trim();
  return ripiego;
}

/**
 * Le iniziali per un avatar.
 *
 * Passa dal nome risolto, non dall'email grezza: altrimenti un avatar mostra
 * «MM» e quello accanto «m.», per due persone registrate in modo diverso.
 */
export function inizialiPersona(p: PersonaConNome | null | undefined): string {
  const nome = nomePersona(p, "");
  if (!nome) return "?";

  const pezzi = nome
    .replace(/[^\p{L}\s.]/gu, " ")
    .split(/[\s.]+/)
    .filter(Boolean);

  if (pezzi.length === 0) return "?";
  if (pezzi.length === 1) return pezzi[0].slice(0, 2).toUpperCase();
  return (pezzi[0][0] + pezzi[pezzi.length - 1][0]).toUpperCase();
}

/** «M. Rossi» da «Marco Rossi»: per le colonne strette. */
export function nomePuntato(p: PersonaConNome | null | undefined, ripiego = "—"): string {
  const nome = nomePersona(p, ripiego);
  const pezzi = nome.split(/\s+/).filter(Boolean);
  if (pezzi.length < 2) return nome;
  return `${pezzi[0][0].toUpperCase()}. ${pezzi.slice(1).join(" ")}`;
}
