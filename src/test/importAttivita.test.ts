import { describe, expect, it } from "vitest";
import {
  abbina,
  dataDaCella,
  normalizza,
  righeDaMatrice,
  somiglianza,
  SOGLIA,
} from "@/lib/importAttivita";

/**
 * L'import — SPECIFICA_TIMELINE §8 e i criteri §11.
 *
 * Il test che conta davvero non è «riconosce i nomi simili»: è **non abbina
 * quelli diversi**. Un abbinamento sbagliato scrive una data vera sulla riga
 * sbagliata, e nessuno se ne accorge finché non è tardi. Per questo qui i casi
 * negativi sono più dei positivi.
 */

describe("normalizza", () => {
  it("toglie maiuscole, accenti e punteggiatura", () => {
    expect(normalizza("Concept Design (CD)")).toBe("concept design cd");
    expect(normalizza("Attività — preliminare!")).toBe("attivita preliminare");
    expect(normalizza("  doppi   spazi  ")).toBe("doppi spazi");
  });

  it("tiene i numeri: sono quelli che distinguono le fasi", () => {
    // Buttandoli, «RIBA st.3» e «RIBA st.4» diventerebbero lo stesso testo.
    expect(normalizza("RIBA st.3")).not.toBe(normalizza("RIBA st.4"));
    expect(normalizza("RIBA st.3")).toBe("riba st 3");
  });
});

describe("somiglianza", () => {
  it("riconosce lo stesso nome scritto in due modi", () => {
    expect(somiglianza("Concept Design (CD)", "Concept design + review")).toBeGreaterThanOrEqual(SOGLIA);
    expect(somiglianza("Construction start", "CONSTRUCTION START")).toBe(1);
    expect(somiglianza("Handover", "Handover (fine cantiere)")).toBeGreaterThanOrEqual(SOGLIA);
  });

  it("NON abbina fasi diverse che si somigliano", () => {
    expect(somiglianza("RIBA st.3 - Project", "RIBA st.4 / Structural")).toBeLessThan(SOGLIA);
    expect(somiglianza("Review & approval CD", "Review & approval RIBA 3")).toBeLessThan(SOGLIA);
    expect(somiglianza("Concept design", "Detailed design")).toBeLessThan(SOGLIA);
  });

  it("le parole di servizio non creano somiglianza dal nulla", () => {
    // Due nomi che condividono solo «fase di» non sono lo stesso lavoro.
    expect(somiglianza("Fase di scavo", "Fase di collaudo")).toBeLessThan(SOGLIA);
  });

  it("nomi vuoti o inconfrontabili valgono zero", () => {
    expect(somiglianza("", "Construction")).toBe(0);
    expect(somiglianza("di del la", "Construction")).toBe(0);
  });
});

describe("abbina", () => {
  const attivita = [
    { id: "a1", nome: "Concept design + review" },
    { id: "a2", nome: "Construction start" },
    { id: "a3", nome: "Handover (fine cantiere)" },
  ];

  it("propone l'attività giusta per ogni riga riconosciuta", () => {
    const out = abbina(
      [
        { nome: "Concept Design (CD)", inizio: "2026-01-01", fine: "2026-02-01" },
        { nome: "Handover", inizio: "2027-03-15", fine: null },
      ],
      attivita
    );
    expect(out[0].attivitaId).toBe("a1");
    expect(out[1].attivitaId).toBe("a3");
  });

  it("una riga che non somiglia a niente resta senza abbinamento", () => {
    const out = abbina([{ nome: "Sgombero neve piazzale", inizio: "2026-01-01", fine: null }], attivita);
    expect(out[0].attivitaId).toBeNull();
    expect(out[0].punteggio).toBe(0);
  });

  it("la stessa attività non si fa prendere due volte", () => {
    // Senza questa regola entrambe scriverebbero su «Construction start» e
    // l'ultima vincerebbe a caso.
    const out = abbina(
      [
        { nome: "Construction start", inizio: "2026-06-01", fine: null },
        { nome: "Construction", inizio: "2026-07-01", fine: null },
      ],
      attivita
    );
    const presi = out.filter((o) => o.attivitaId === "a2");
    expect(presi.length).toBe(1);
    // Vince quella che somiglia di più, non la prima incontrata.
    expect(presi[0].riga.nome).toBe("Construction start");
  });

  it("senza attività da abbinare non esplode", () => {
    const out = abbina([{ nome: "Qualcosa", inizio: "2026-01-01", fine: null }], []);
    expect(out[0].attivitaId).toBeNull();
  });
});

describe("dataDaCella", () => {
  it("legge i Date veri dei fogli di calcolo", () => {
    expect(dataDaCella(new Date(2026, 2, 15, 12))).toBe("2026-03-15");
  });

  it("legge il testo all'italiana: giorno prima del mese", () => {
    expect(dataDaCella("15/03/2026")).toBe("2026-03-15");
    expect(dataDaCella("15-3-26")).toBe("2026-03-15");
    expect(dataDaCella("1.12.2027")).toBe("2027-12-01");
  });

  it("accetta l'ISO com'è", () => {
    expect(dataDaCella("2026-03-15")).toBe("2026-03-15");
  });

  it("rifiuta quello che non è una data", () => {
    expect(dataDaCella("")).toBeNull();
    expect(dataDaCella(null)).toBeNull();
    expect(dataDaCella("da definire")).toBeNull();
    expect(dataDaCella("31/02/2026")).toBeNull(); // il 31 febbraio non esiste
    expect(dataDaCella("15/13/2026")).toBeNull();
  });
});

describe("righeDaMatrice", () => {
  it("prima cella il nome, prime due date inizio e fine", () => {
    const out = righeDaMatrice([["Concept design", "01/01/2026", "28/02/2026"]]);
    expect(out).toEqual([{ nome: "Concept design", inizio: "2026-01-01", fine: "2026-02-28" }]);
  });

  it("scarta l'intestazione del foglio", () => {
    const out = righeDaMatrice([
      ["Attività", "Inizio", "Fine"],
      ["Concept design", "01/01/2026", "28/02/2026"],
    ]);
    expect(out.length).toBe(1);
    expect(out[0].nome).toBe("Concept design");
  });

  it("scarta le righe senza date: non porterebbero niente", () => {
    const out = righeDaMatrice([
      ["Attività da definire", "", ""],
      ["Concept design", "01/01/2026"],
    ]);
    expect(out.length).toBe(1);
    expect(out[0].fine).toBeNull();
  });

  it("raddrizza le date invertite", () => {
    const out = righeDaMatrice([["Fase", "28/02/2026", "01/01/2026"]]);
    expect(out[0].inizio).toBe("2026-01-01");
    expect(out[0].fine).toBe("2026-02-28");
  });

  it("fine uguale a inizio è una milestone, non una durata", () => {
    const out = righeDaMatrice([["Handover", "15/03/2027", "15/03/2027"]]);
    expect(out[0].inizio).toBe("2027-03-15");
    expect(out[0].fine).toBeNull();
  });

  it("ignora le celle che non sono righe", () => {
    expect(righeDaMatrice([[], ["x"], ["Concept design", "01/01/2026"]]).length).toBe(1);
  });
});
