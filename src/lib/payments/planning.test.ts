import { describe, expect, it } from "vitest";
import {
  asseDi,
  colonnaPlanning,
  costruisciPlanning,
  settimanaIso,
  DOPO,
  PRIMA,
  SENZA_DATA,
} from "./planning";
import type { Settimana } from "./wbs";
import type { CashEvent, ProgettoTempi } from "@/types/payments";

/**
 * Il planning settimanale.
 *
 * Qui si prova la matematica, non il foglio: le due cose che questo calcolo può
 * sbagliare in modo invisibile sono mettere un movimento nella settimana
 * sbagliata e sommare fra loro grandezze che non si sommano. La prima si vede
 * solo confrontando col calendario, la seconda non si vede mai — finché un
 * previsionale non promette soldi che non esistono.
 */

const SETTIMANE: Settimana[] = [
  { inizio: null, chiave: "pregresso", etichetta: "Pregresso", sotto: "prima", pregresso: true, senzaData: false, corrente: false },
  { inizio: "2026-09-07", chiave: "2026-09-07", etichetta: "S37", sotto: "7 set", pregresso: false, senzaData: false, corrente: false },
  { inizio: "2026-09-14", chiave: "2026-09-14", etichetta: "S38", sotto: "14 set", pregresso: false, senzaData: false, corrente: true },
  { inizio: "2026-09-21", chiave: "2026-09-21", etichetta: "S39", sotto: "21 set", pregresso: false, senzaData: false, corrente: false },
  { inizio: null, chiave: "senza_data", etichetta: "Senza data", sotto: "da definire", pregresso: false, senzaData: true, corrente: false },
];

const ASSE = asseDi(SETTIMANE);

let n = 0;
function ev(p: Partial<CashEvent>): CashEvent {
  n += 1;
  return {
    id: `e${n}`,
    verso: "entrata",
    corsia: "cliente",
    gruppo: "Ciclo attivo",
    data: null,
    settimana: null,
    data_evento: null,
    data_documento: null,
    importo_eur: 0,
    importo_valuta: null,
    valuta: "EUR",
    cambio: 1,
    certezza: null,
    fonte: "senza_data",
    fonte_evento: null,
    natura: "cassa",
    categoria: "Energy",
    commessa_id: null,
    commessa: "Fendi Energy 2024",
    certification_id: null,
    progetto: null,
    brand: null,
    brand_progetto: null,
    citta: null,
    etichetta: null,
    riferimento: null,
    stato: null,
    ordine_tranche: null,
    origine: "tranche",
    sottogruppo: null,
    progetto_canonico: null,
    ...p,
  } as CashEvent;
}

function tempi(p: Partial<ProgettoTempi> & { certification_id: string }): ProgettoTempi {
  return {
    commessa_id: null,
    progetto: "Progetto",
    citta: null,
    data_materiali: null,
    data_installazione: null,
    installazione_prevista: null,
    primo_incasso: null,
    ultimo_incasso: null,
    tranche_totali: 0,
    tranche_incassate: 0,
    ...p,
  };
}

const inviluppo = (p: ReturnType<typeof costruisciPlanning>) => p.blocchi[0];
const misura = (b: ReturnType<typeof inviluppo>, genere: string) =>
  [...b.attivo, ...b.passivo, b.saldo, ...(b.cumulato ? [b.cumulato] : [])]
    .find((m) => m.genere === genere)!;

describe("l'asse del planning", () => {
  it("ha tre raccoglitori: prima, dopo, senza data", () => {
    expect(ASSE[0].chiave).toBe(PRIMA);
    expect(ASSE[ASSE.length - 2].chiave).toBe(DOPO);
    expect(ASSE[ASSE.length - 1].chiave).toBe(SENZA_DATA);
    // Tre settimane vere fra i raccoglitori.
    expect(ASSE.filter((c) => !c.coda)).toHaveLength(3);
  });

  it("nomina le settimane come le nomina l'amministrazione", () => {
    expect(ASSE[1].etichetta).toBe("Sett. 37");
    expect(ASSE[3].etichetta).toBe("Sett. 39");
  });

  it("riporta quale settimana è quella corrente", () => {
    expect(ASSE.filter((c) => c.corrente).map((c) => c.etichetta)).toEqual(["Sett. 38"]);
  });
});

describe("in quale colonna cade una data", () => {
  it("senza data va nell'ultima colonna", () => {
    expect(colonnaPlanning(null, ASSE)).toBe(ASSE.length - 1);
  });

  it("prima della finestra va nel primo raccoglitore", () => {
    expect(colonnaPlanning("2026-08-30", ASSE)).toBe(0);
  });

  it("dentro la settimana giusta, anche negli ultimi giorni", () => {
    expect(ASSE[colonnaPlanning("2026-09-07", ASSE)].etichetta).toBe("Sett. 37");
    expect(ASSE[colonnaPlanning("2026-09-13", ASSE)].etichetta).toBe("Sett. 37");
    expect(ASSE[colonnaPlanning("2026-09-14", ASSE)].etichetta).toBe("Sett. 38");
  });

  it("oltre la finestra va in «Dopo il periodo», non sull'ultima settimana", () => {
    // È la differenza con la griglia a schermo, dove tutto ciò che sta oltre si
    // appoggia sull'ultima colonna visibile: qui l'ultima settimana resterebbe
    // gonfia di denaro che appartiene a marzo.
    const col = colonnaPlanning("2027-03-01", ASSE);
    expect(ASSE[col].chiave).toBe(DOPO);
    expect(ASSE[col].chiave).not.toBe("2026-09-21");
  });

  it("l'ultima settimana copre i suoi sette giorni e non uno di più", () => {
    expect(ASSE[colonnaPlanning("2026-09-27", ASSE)].etichetta).toBe("Sett. 39");
    expect(ASSE[colonnaPlanning("2026-09-28", ASSE)].chiave).toBe(DOPO);
  });
});

describe("la settimana in forma ISO", () => {
  it("scrive anno e numero come il foglio della contabilità", () => {
    expect(settimanaIso("2026-09-07")).toBe("2026-W37");
    expect(settimanaIso("2026-01-05")).toBe("2026-W02");
  });

  it("niente data, niente settimana", () => {
    expect(settimanaIso(null)).toBeNull();
  });
});

describe("le misure", () => {
  it("tiene separati gli incassi avvenuti da quelli previsti", () => {
    const p = costruisciPlanning(
      [
        ev({ data: "2026-09-07", settimana: "2026-09-07", importo_eur: 1000, certezza: "reale" }),
        ev({ data: "2026-09-07", settimana: "2026-09-07", importo_eur: 500, certezza: "prevista" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    const b = inviluppo(p);
    expect(misura(b, "incassi_avvenuti").totale).toBe(1000);
    expect(misura(b, "incassi_previsti").totale).toBe(500);
    expect(misura(b, "totale_incassi").totale).toBe(1500);
    // E nella stessa colonna, che è la settimana 37.
    expect(misura(b, "incassi_avvenuti").serie[1]).toBe(1000);
  });

  it("smista il passivo sulle tre righe secondo il gruppo", () => {
    const p = costruisciPlanning(
      [
        ev({ verso: "uscita", corsia: "fornitore", gruppo: "Acquisto materiali", importo_eur: -300, data: "2026-09-14", settimana: "2026-09-14" }),
        ev({ verso: "uscita", corsia: "installatore", gruppo: "Installatori", importo_eur: -200, data: "2026-09-14", settimana: "2026-09-14" }),
        ev({ verso: "uscita", corsia: "fornitore", gruppo: "Servizi", importo_eur: -50, data: "2026-09-14", settimana: "2026-09-14" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    const b = inviluppo(p);
    expect(misura(b, "materiali").totale).toBe(300);
    expect(misura(b, "installatore").totale).toBe(200);
    expect(misura(b, "servizi").totale).toBe(50);
    expect(misura(b, "totale_passivo").totale).toBe(550);
  });

  it("scrive il passivo positivo, perché il saldo è una sottrazione", () => {
    // Se il passivo restasse negativo, «incassi − passivo» sommerebbe: è lo
    // stesso errore per cui una freccia da 44.979 nasceva da 27.520 di cassa e
    // 17.459 di quote.
    const p = costruisciPlanning(
      [
        ev({ importo_eur: 1000, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
        ev({ verso: "uscita", gruppo: "Acquisto materiali", importo_eur: -400, data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    const b = inviluppo(p);
    expect(misura(b, "materiali").totale).toBe(400);
    expect(misura(b, "saldo").totale).toBe(600);
  });

  it("le quote non entrano da nessuna parte", () => {
    const p = costruisciPlanning(
      [
        ev({ verso: "uscita", gruppo: "Acquisto materiali", importo_eur: -400, natura: "cassa", data: "2026-09-07", settimana: "2026-09-07" }),
        ev({ verso: "uscita", gruppo: "Acquisto materiali", importo_eur: 17459, natura: "quota", data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    const b = inviluppo(p);
    expect(misura(b, "materiali").totale).toBe(400);
    expect(misura(b, "saldo").totale).toBe(-400);
  });

  it("il cumulato è progressivo e sta solo sull'inviluppo", () => {
    const p = costruisciPlanning(
      [
        ev({ importo_eur: 1000, certezza: "reale", data: "2026-08-01" }),
        ev({ importo_eur: 500, certezza: "reale", data: "2026-09-14", settimana: "2026-09-14" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    const b = inviluppo(p);
    expect(b.cumulato!.serie[0]).toBe(1000);
    expect(b.cumulato!.serie[1]).toBe(1000);
    expect(b.cumulato!.serie[2]).toBe(1500);
    expect(p.blocchi[1]?.cumulato).toBeUndefined();
  });

  it("un blocco per commessa, ordinati per saldo decrescente", () => {
    const p = costruisciPlanning(
      [
        ev({ commessa: "Magra", importo_eur: 100, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
        ev({ commessa: "Grassa", importo_eur: 9000, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [],
      SETTIMANE,
      "Totale",
    );
    expect(p.blocchi.map((b) => b.nome)).toEqual(["Totale", "Grassa", "Magra"]);
    expect(p.blocchi[0].inviluppo).toBe(true);
    expect(p.blocchi[1].inviluppo).toBe(false);
  });
});

describe("le installazioni", () => {
  it("si contano nella settimana giusta, prevista o avvenuta", () => {
    const p = costruisciPlanning(
      [
        ev({ certification_id: "c1", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
        ev({ certification_id: "c2", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [
        tempi({ certification_id: "c1", data_installazione: "2026-09-08" }),
        tempi({ certification_id: "c2", installazione_prevista: "2026-09-22" }),
      ],
      SETTIMANE,
      "Totale",
    );
    const inst = misura(inviluppo(p), "installazioni");
    expect(inst.serie[1]).toBe(1);
    expect(inst.serie[3]).toBe(1);
    expect(inst.totale).toBe(2);
  });

  it("quella avvenuta vince sulla prevista: è un fatto contro un piano", () => {
    const p = costruisciPlanning(
      [ev({ certification_id: "c1", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" })],
      [tempi({ certification_id: "c1", data_installazione: "2026-09-08", installazione_prevista: "2026-09-22" })],
      SETTIMANE,
      "Totale",
    );
    const inst = misura(inviluppo(p), "installazioni");
    expect(inst.serie[1]).toBe(1);
    expect(inst.serie[3]).toBe(0);
  });

  it("ignora i progetti di commesse che il filtro ha escluso", () => {
    // I tempi arrivano dal database senza sapere nulla del filtro: senza questo
    // controllo il foglio conterebbe cantieri di commesse che non ha mostrato.
    const p = costruisciPlanning(
      [ev({ certification_id: "c1", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" })],
      [
        tempi({ certification_id: "c1", data_installazione: "2026-09-08" }),
        tempi({ certification_id: "fuori", data_installazione: "2026-09-08" }),
      ],
      SETTIMANE,
      "Totale",
    );
    expect(misura(inviluppo(p), "installazioni").totale).toBe(1);
    expect(p.progetti).toHaveLength(1);
  });
});

describe("il dettaglio per progetto", () => {
  it("porta il rimanente, le settimane e l'ordine per installazione", () => {
    const p = costruisciPlanning(
      [
        ev({ certification_id: "tardi", progetto: "Tardi", commessa: "K", importo_eur: 600, certezza: "prevista", data: "2026-09-21", settimana: "2026-09-21" }),
        ev({ certification_id: "presto", progetto: "Presto", commessa: "K", importo_eur: 300, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [
        tempi({ certification_id: "tardi", progetto: "Tardi", data_installazione: "2026-09-21" }),
        tempi({ certification_id: "presto", progetto: "Presto", data_installazione: "2026-09-07" }),
      ],
      SETTIMANE,
      "Totale",
    );
    expect(p.progetti.map((r) => r.progetto)).toEqual(["Presto", "Tardi"]);

    const tardi = p.progetti.find((r) => r.progetto === "Tardi")!;
    expect(tardi.rimanente).toBe(600);
    expect(tardi.settInstallazione).toBe("2026-W39");
    expect(tardi.settPagPrevisto).toBe("2026-W39");
    expect(tardi.settPagEffettivo).toBeNull();
    expect(tardi.installazioneReale).toBe(true);

    const presto = p.progetti.find((r) => r.progetto === "Presto")!;
    expect(presto.rimanente).toBe(0);
    expect(presto.settPagEffettivo).toBe("2026-W37");
  });

  it("i progetti senza data di installazione vanno in fondo", () => {
    const p = costruisciPlanning(
      [
        ev({ certification_id: "senza", progetto: "Senza", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
        ev({ certification_id: "con", progetto: "Con", importo_eur: 10, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
      ],
      [
        tempi({ certification_id: "senza", progetto: "Senza" }),
        tempi({ certification_id: "con", progetto: "Con", data_installazione: "2026-09-21" }),
      ],
      SETTIMANE,
      "Totale",
    );
    expect(p.progetti.map((r) => r.progetto)).toEqual(["Con", "Senza"]);
    expect(p.progetti[1].colonnaInstallazione).toBeNull();
  });

  it("distingue l'installazione prevista da quella avvenuta", () => {
    const p = costruisciPlanning(
      [ev({ certification_id: "c1", progetto: "P", importo_eur: 10, certezza: "prevista", data: "2026-09-07", settimana: "2026-09-07" })],
      [tempi({ certification_id: "c1", progetto: "P", installazione_prevista: "2026-09-21" })],
      SETTIMANE,
      "Totale",
    );
    expect(p.progetti[0].installazioneReale).toBe(false);
    expect(p.progetti[0].settInstallazione).toBe("2026-W39");
  });
});
