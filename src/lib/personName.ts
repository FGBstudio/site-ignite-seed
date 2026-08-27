/**
 * I nomi delle persone si scrivono "Cognome Nome".
 *
 * In anagrafica sono registrati come "Nome Cognome", che e' l'ordine con cui li
 * si dice a voce; negli elenchi pero' serve l'ordine opposto, altrimenti
 * l'ordinamento alfabetico mette insieme tutte le Anna e tutti i Marco invece
 * dei cognomi. Le tendine e le tabelle passano di qui, cosi' la conversione e'
 * una sola e non tre leggermente diverse.
 */

/**
 * Le particelle fanno parte del cognome, non del nome: senza questo elenco
 * "Micaela De Carlo" diventerebbe "Carlo Micaela De".
 */
const PARTICELLE = new Set([
  "de", "del", "della", "dello", "dei", "degli", "delle",
  "di", "da", "dal", "dalla", "der", "den", "dos", "das",
  "la", "le", "lo", "van", "von", "mac", "mc", "st", "san", "santa",
]);

/**
 * "Laura Braghieri" -> "Braghieri Laura", "Micaela De Carlo" -> "De Carlo Micaela".
 *
 * Un nome di una parola sola resta com'e': non c'e' un cognome da spostare.
 */
export function surnameFirst(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join(" ");

  // Si parte dall'ultima parola e si risale finche' si incontrano particelle.
  let start = parts.length - 1;
  while (start > 1 && PARTICELLE.has(parts[start - 1].toLowerCase())) start -= 1;

  const cognome = parts.slice(start).join(" ");
  const nome = parts.slice(0, start).join(" ");
  return nome ? `${cognome} ${nome}` : cognome;
}

/**
 * Come si chiama chi non ha un nome in anagrafica.
 *
 * Le utenze funzionali e gli account dei PM che non lavorano piu' qui hanno
 * `full_name` vuoto, e finora comparivano nelle tendine come "g.denegri@..." o
 * come un uuid. Meglio l'indirizzo ripulito che un identificatore: resta
 * riconoscibile, e si vede a colpo d'occhio che quell'anagrafica va sistemata.
 */
export function displayPersonName(
  fullName: string | null | undefined,
  email?: string | null,
): string {
  const formatted = surnameFirst(fullName);
  if (formatted) return formatted;
  const local = (email ?? "").split("@")[0];
  return local || "—";
}

/** Ordinamento alfabetico sul nome gia' in forma "Cognome Nome". */
export function byPersonName(a: string, b: string): number {
  return a.localeCompare(b, "it", { sensitivity: "base" });
}
