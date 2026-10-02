/**
 * I CSV che Payments consegna, con i numeri che Excel italiano sa sommare.
 *
 * Le tre esportazioni — registro fatture, registro clienti, follow-up — scrivevano
 * ognuna la propria riga di `join(";")` con `String(valore)`. Il separatore di
 * colonna `;` è quello giusto per Excel italiano, ma `String(1234.5)` dà
 * `"1234.5"`: in un foglio italiano il separatore decimale è la virgola, quindi
 * quella cella entra come **testo**. Si vede solo quando qualcuno prova a sommare
 * la colonna e il totale viene zero — e a quel punto il foglio è già stato mandato.
 *
 * Qui il numero esce con la virgola e senza separatore di migliaia, che è la forma
 * che Excel riconosce senza chiedere niente. Le date restano ISO, perché una data
 * ISO la capiscono sia Excel sia chi legge il file a mano.
 */

/** Una cella: il numero si formatta, tutto il resto diventa testo. */
export type Cella = string | number | null | undefined;

/**
 * Il numero che arriva dal database come stringa.
 *
 * PostgREST restituisce `numeric` come `"1000.00"`, e in una cella serve il
 * numero. Il passaggio è esplicito e sta qui perché **non si può indovinare**:
 * «3.000» è il numero della fattura tremila, non il numero tre. Una conversione
 * automatica di tutte le stringhe che sembrano numeri avrebbe trasformato ogni
 * numero di fattura del registro in una cifra singola — e l'esportazione sarebbe
 * stata inutilizzabile senza mai dare errore.
 */
export function cifra(v: string | number | null | undefined): number | string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : "";
}

/**
 * Il numero come lo scrive un foglio italiano: virgola decimale, nessun punto di
 * migliaia (il punto, lì, trasformerebbe la cella in testo a sua volta).
 */
export function numeroPerExcel(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

/**
 * Una riga di CSV.
 *
 * Le celle vanno tutte fra apici: un cliente che si chiama «Rossi; Bianchi srl»
 * altrimenti spezza la riga in due colonne. L'apice dentro il testo si raddoppia,
 * che è come il CSV lo scrive da sempre.
 *
 * Le celle numeriche no: fra apici Excel le leggerebbe come testo anche con la
 * virgola, e il problema tornerebbe da un'altra porta.
 */
function riga(celle: Cella[]): string {
  return celle
    .map((c) => {
      if (typeof c === "number") return numeroPerExcel(c);
      return `"${String(c ?? "").replace(/"/g, '""')}"`;
    })
    .join(";");
}

/** Il foglio intero, testa compresa. */
export function componiCsv(righe: Cella[][]): string {
  return righe.map(riga).join("\r\n");
}

/**
 * Il file che parte verso il disco.
 *
 * Il BOM serve a Excel per capire che è UTF-8: senza, «Società» diventa
 * «SocietÃ ». L'ancora va attaccata al documento prima del click — su un elemento
 * staccato Firefox non scarica niente, e il bottone sembra rotto senza dire
 * perché. E l'URL si libera dopo, non nello stesso istante: revocarlo subito
 * annulla il download che è appena partito.
 */
export function scaricaCsv(nome: string, righe: Cella[][]): void {
  const blob = new Blob(["﻿" + componiCsv(righe)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** La data di oggi per il nome del file: `registro-fatture-2026-10-02.csv`. */
export function oggiIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
