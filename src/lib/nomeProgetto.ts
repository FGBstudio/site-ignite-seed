/**
 * Il nome univoco di un progetto: CLIENTE CITTÀ Progetto.
 *
 * «BOUCHERON MONACO Monaco One». Serve perché lo stesso negozio girava con
 * due nomi — «Macau Galaxy» sui fogli, «Taipa, Galaxy» a sistema — e ogni
 * incrocio fra le due versioni costa tempo, finché un giorno costa un errore.
 *
 * Non è una colonna e non deve diventarlo: si compone da brand, sito e
 * certificazione, le stesse tre fonti che il Monitor usa per CLIENT | CITY |
 * PROJECT. Scritto dentro `certifications.name` invecchierebbe al primo sito
 * che cambia brand, e sarebbe una bugia già stampata ovunque.
 *
 * Il gemello SQL è `public.nome_canonico(cliente, citta, progetto)`, che le
 * viste usano per esporre `progetto_canonico`: preferisci quello quando il
 * dato arriva già da una vista, questo quando componi lato client.
 */

/**
 * Quando il nome del progetto ripete già la città come prefisso — la
 * convenzione «Milan, Galleria» che percorre metà anagrafica — il prefisso
 * si toglie. Altrimenti si otterrebbe «FENDI MILAN Milan, Galleria».
 *
 * Il confronto usa il primo segmento della città, perché alcune sono scritte
 * con il distretto: «TAIPA, MACAO» deve comunque ripulire «Taipa, Galaxy».
 */
function senzaPrefissoCitta(progetto: string, citta: string | null): string {
  if (!citta) return progetto;
  const primo = citta.split(",")[0].trim();
  if (!primo) return progetto;
  const atteso = `${primo.toLowerCase()}, `;
  return progetto.toLowerCase().startsWith(atteso)
    ? progetto.slice(atteso.length).trim()
    : progetto;
}

export function nomeCanonico(
  cliente: string | null | undefined,
  citta: string | null | undefined,
  progetto: string | null | undefined,
): string | null {
  const c = cliente?.trim() || null;
  const t = citta?.trim() || null;
  const p = progetto?.trim() || null;

  const parti = [
    c?.toUpperCase(),
    t?.toUpperCase(),
    p ? senzaPrefissoCitta(p, t) : null,
  ].filter(Boolean);

  return parti.length ? parti.join(" ") : null;
}
