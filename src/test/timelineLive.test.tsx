import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineLive } from "@/components/timeline/TimelineLive";
import {
  derivaAttivita,
  derivaPassi,
  type AttivitaProgetto,
  type PassoServizio,
} from "@/lib/timelineDerivazione";

/**
 * Il pannello — SPECIFICA_TIMELINE §4.1 e i criteri §11 che si verificano
 * sul disegno.
 *
 * Non si controlla come sono belle le curve: si controlla che ci sia quello
 * che deve esserci e che manchi quello che non deve. Le due cose che questo
 * file protegge davvero sono la separazione delle colonne (§11: «due colonne
 * SEMPRE distinte») e il fatto che la spaziatura NON dipenda dal tempo, che è
 * la scelta su cui tutto il redesign si regge.
 */

const OGGI = "2026-06-15";

const att = (p: Partial<AttivitaProgetto> & { id: string }): AttivitaProgetto => ({
  nome: p.id,
  inizio: null,
  fine: null,
  ordine: 0,
  ...p,
});

const passo = (p: Partial<PassoServizio> & { id: string }): PassoServizio => ({
  nome: p.id,
  ordine: 0,
  ancora: null,
  dataForzata: null,
  avanzamento: 0,
  ...p,
});

function disegna(attivita: AttivitaProgetto[], passi: PassoServizio[]) {
  const a = derivaAttivita(attivita, OGGI);
  const p = derivaPassi(passi, attivita);
  const { container } = render(
    <TimelineLive attivita={a} passi={p} servizio="LEED BD+C" oggiISO={OGGI} />
  );
  return container;
}

describe("stato vuoto (§11)", () => {
  it("senza nessuna data mostra l'invito, non un SVG vuoto", () => {
    disegna([att({ id: "a" })], [passo({ id: "p" })]);
    expect(screen.getByText("Le timeline nascono qui")).toBeInTheDocument();
  });

  it("basta UNA data perché il disegno compaia", () => {
    const c = disegna([att({ id: "a", nome: "Concept", inizio: "2026-03-01" })], []);
    expect(screen.queryByText("Le timeline nascono qui")).not.toBeInTheDocument();
    expect(c.querySelector("svg")).toBeTruthy();
  });
});

describe("le due colonne restano distinte (§11)", () => {
  it("entrambe le intestazioni ci sono, e c'è la hairline che le separa", () => {
    const c = disegna(
      [att({ id: "a", nome: "Concept", inizio: "2026-03-01", fine: "2026-05-01" })],
      [passo({ id: "p", nome: "Pre-assessment", dataForzata: "2026-04-01" })]
    );
    expect(screen.getByText("PROGETTO")).toBeInTheDocument();
    expect(screen.getByText("CERTIFICAZIONE")).toBeInTheDocument();

    // La hairline centrale: x1 = x2 = metà della tela.
    const linee = Array.from(c.querySelectorAll("line"));
    const centrale = linee.find(
      (l) => l.getAttribute("x1") === "280" && l.getAttribute("x2") === "280"
    );
    expect(centrale).toBeTruthy();
  });

  it("una colonna vuota lo dichiara invece di sparire", () => {
    disegna([att({ id: "a", nome: "Concept", inizio: "2026-03-01" })], []);
    expect(screen.getByText("in attesa di date…")).toBeInTheDocument();
  });
});

describe("la spaziatura NON è una scala temporale (§4.1)", () => {
  it("due tappe vicine e due lontane occupano lo stesso spazio", () => {
    const vicine = disegna(
      [
        att({ id: "a", nome: "A", inizio: "2026-03-01", ordine: 1 }),
        att({ id: "b", nome: "B", inizio: "2026-03-02", ordine: 2 }),
      ],
      []
    );
    const lontane = disegna(
      [
        att({ id: "a", nome: "A", inizio: "2026-03-01", ordine: 1 }),
        att({ id: "b", nome: "B", inizio: "2030-03-01", ordine: 2 }),
      ],
      []
    );

    const altezza = (c: Element) => c.querySelector("svg")!.getAttribute("height");
    expect(altezza(vicine)).toBe(altezza(lontane));
  });

  it("l'altezza cresce col NUMERO di tappe, non con la loro distanza", () => {
    const una = disegna([att({ id: "a", nome: "A", inizio: "2026-03-01" })], []);
    const sei = disegna(
      Array.from({ length: 6 }, (_, i) =>
        att({ id: `a${i}`, nome: `A${i}`, inizio: `2026-0${i + 1}-01`, ordine: i })
      ),
      []
    );
    const h = (c: Element) => Number(c.querySelector("svg")!.getAttribute("height"));
    expect(h(sei)).toBeGreaterThan(h(una));
  });
});

describe("colonna progetto", () => {
  it("attività conclusa: 100% e la data di fine scritta accanto", () => {
    disegna([att({ id: "a", nome: "Concept", inizio: "2026-01-01", fine: "2026-03-01" })], []);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/fino al 1 mar 26/)).toBeInTheDocument();
  });

  it("senza la fine lo dice, invece di mostrare 0%", () => {
    disegna([att({ id: "a", nome: "Concept", inizio: "2026-01-01" })], []);
    expect(screen.getByText("manca la fine")).toBeInTheDocument();
  });

  it("il nome lungo va a capo e non esce dalla colonna", () => {
    disegna(
      [att({ id: "a", nome: "Preparazione e sottomissione del building permit file", inizio: "2026-01-01" })],
      []
    );
    // Due righe: la seconda con l'ellissi. Il <title> del tooltip porta il
    // nome intero, quindi si guarda il testo disegnato, non tutto l'SVG.
    const righe = screen.getAllByText(/…$/).filter((n) => n.tagName.toLowerCase() === "text");
    expect(righe.length).toBeGreaterThan(0);
  });
});

describe("colonna certificazione", () => {
  it("passo ancorato: natura calcolata e curva verso l'attività (§11)", () => {
    const c = disegna(
      [att({ id: "handover", nome: "Handover", inizio: "2026-09-01", fine: "2026-09-01" })],
      [
        passo({
          id: "p",
          nome: "GC closeout",
          ancora: { attivitaId: "handover", punto: "end", offsetGiorni: 30 },
        }),
      ]
    );
    expect(screen.getAllByText(/calcolata/).some((n) => n.tagName.toLowerCase() === "tspan")).toBe(true);
    // La curva dell'ancora è l'unico `path` tratteggiato disegnato.
    const curve = Array.from(c.querySelectorAll("path")).filter(
      (p) => p.getAttribute("stroke-dasharray") === "3 5"
    );
    expect(curve.length).toBe(1);
  });

  it("data forzata: natura manuale", () => {
    disegna([], [passo({ id: "p", nome: "Submittal", dataForzata: "2026-07-01" })]);
    expect(screen.getAllByText(/manuale/).some((n) => n.tagName.toLowerCase() === "tspan")).toBe(true);
  });

  it("le durate compaiono sui segmenti fra un passo e il successivo", () => {
    disegna(
      [],
      [
        passo({ id: "p1", nome: "Uno", ordine: 1, dataForzata: "2026-03-01" }),
        passo({ id: "p2", nome: "Due", ordine: 2, dataForzata: "2026-04-17" }),
      ]
    );
    expect(screen.getByText("47 gg")).toBeInTheDocument();
  });

  it("oltre i due mesi la durata si legge in mesi", () => {
    disegna(
      [],
      [
        passo({ id: "p1", nome: "Uno", ordine: 1, dataForzata: "2026-01-01" }),
        passo({ id: "p2", nome: "Due", ordine: 2, dataForzata: "2026-07-01" }),
      ]
    );
    expect(screen.getByText("6 mesi")).toBeInTheDocument();
  });
});

describe("marcatore OGGI (§4.1)", () => {
  it("compare quando oggi cade fra due tappe", () => {
    disegna(
      [
        att({ id: "a", nome: "A", inizio: "2026-05-01", ordine: 1 }),
        att({ id: "b", nome: "B", inizio: "2026-08-01", ordine: 2 }),
      ],
      []
    );
    expect(screen.getByText("OGGI")).toBeInTheDocument();
  });

  it("non compare se tutte le tappe sono nel futuro", () => {
    disegna(
      [
        att({ id: "a", nome: "A", inizio: "2027-05-01", ordine: 1 }),
        att({ id: "b", nome: "B", inizio: "2027-08-01", ordine: 2 }),
      ],
      []
    );
    expect(screen.queryByText("OGGI")).not.toBeInTheDocument();
  });
});

describe("dipendenze (§11: archetto, nessun vincolo rigido)", () => {
  it("disegna un archetto per ogni madre", () => {
    const c = disegna(
      [
        att({ id: "a", nome: "A", inizio: "2026-01-01", fine: "2026-02-01", ordine: 1 }),
        att({ id: "b", nome: "B", inizio: "2026-02-01", fine: "2026-03-01", ordine: 2 }),
        att({ id: "c", nome: "C", inizio: "2026-03-01", ordine: 3, dipendeDa: ["a", "b"] }),
      ],
      []
    );
    const archi = Array.from(c.querySelectorAll("path")).filter(
      (p) => p.getAttribute("stroke-dasharray") === "3 5"
    );
    expect(archi.length).toBe(2);
  });

  it("una dipendenza verso un'attività senza data non disegna niente", () => {
    const c = disegna(
      [
        att({ id: "a", nome: "A" }),
        att({ id: "b", nome: "B", inizio: "2026-03-01", dipendeDa: ["a"] }),
      ],
      []
    );
    expect(c.querySelectorAll("path[stroke-dasharray='3 5']").length).toBe(0);
  });
});

describe("regge il carico (§11: 0..12+ voci per colonna)", () => {
  it("dodici attività e dodici passi non rompono il disegno", () => {
    const c = disegna(
      Array.from({ length: 12 }, (_, i) =>
        att({
          id: `a${i}`,
          nome: `Attività ${i}`,
          inizio: `2026-${String(i + 1).padStart(2, "0")}-01`,
          fine: `2026-${String(i + 1).padStart(2, "0")}-20`,
          ordine: i,
        })
      ),
      Array.from({ length: 12 }, (_, i) =>
        passo({
          id: `p${i}`,
          nome: `Passo ${i}`,
          ordine: i,
          dataForzata: `2027-${String(i + 1).padStart(2, "0")}-01`,
        })
      )
    );
    const svg = c.querySelector("svg")!;
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(1000);
    expect(screen.getByText("PROGETTO")).toBeInTheDocument();
    expect(screen.getByText("CERTIFICAZIONE")).toBeInTheDocument();
  });
});
