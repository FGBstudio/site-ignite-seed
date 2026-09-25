/**
 * La firma del badge, al minuto.
 *
 * Questa e' la meta' cliente di un accordo: il telefono firma il minuto col
 * segreto del proprio badge, il database rifa' lo stesso conto e confronta
 * (`hr_timbra`, con `extensions.hmac`). Se le due meta' divergono di un
 * carattere nessuno timbra piu', quindi il calcolo sta qui, da solo, senza
 * React e senza Supabase intorno — dove lo si puo' mettere alla prova contro
 * un HMAC calcolato da qualcun altro.
 *
 * Nel QR non entra mai il segreto: entrano l'identificativo del badge, il
 * minuto, e la firma. E' questo che rende inutile uno screenshot un minuto
 * dopo.
 */

/** Il minuto corrente: l'unita' di tempo su cui si firma. */
export function minutoCorrente(): number {
  return Math.floor(Date.now() / 60000);
}

/**
 * Dieci caratteri di HMAC-SHA256 sul numero del minuto.
 *
 * Dieci e non sessantaquattro: indovinarli a caso resta senza speranza nei
 * sessanta secondi in cui varrebbero, e il QR resta abbastanza grosso da
 * leggersi sullo schermo di un telefono, che e' la ragione per cui esiste.
 */
export async function firmaBadge(segreto: string, minuto: number): Promise<string> {
  const enc = new TextEncoder();
  const chiave = await crypto.subtle.importKey(
    "raw", enc.encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", chiave, enc.encode(String(minuto)));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 10);
}

/** Il contenuto del QR in questo momento: `hr1.<badge>.<minuto>.<firma>`. */
export async function codiceBadge(
  badge: { id: string; segreto: string },
  minuto: number,
): Promise<string> {
  return `hr1.${badge.id}.${minuto}.${await firmaBadge(badge.segreto, minuto)}`;
}

/** La forma che il varco accetta. Il gemello SQL sta dentro `hr_timbra`. */
export const FORMA_BADGE = /^hr1\.[0-9a-f]{32}\.[0-9]+\.[0-9a-f]{10}$/;
