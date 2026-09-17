import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CardProjectTimeline } from "@/components/timeline/CardProjectTimeline";
import { CardCertTimeline } from "@/components/timeline/CardCertTimeline";
import {
  derivaAttivita,
  derivaPassi,
  type AttivitaProgetto,
  type PassoServizio,
} from "@/lib/timelineDerivazione";

/**
 * Le card di compilazione — i criteri §11 che si verificano sui comandi.
 *
 * Qui si controlla chi può toccare cosa. È la parte che, sbagliata, non dà
 * errori: dà semplicemente al PM la possibilità di scrivere un numero che il
 * sistema poi ignora, o di non trovare il comando che gli serve.
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

describe("Card 1 · Project timeline", () => {
  const attivita = [
    att({ id: "a1", nome: "Concept design", inizio: "2026-01-01", fine: "2026-03-01", ordine: 1 }),
    att({ id: "a2", nome: "Construction", inizio: "2026-06-01", fine: "2026-07-01", ordine: 2 }),
    att({ id: "a3", nome: "Handover", ordine: 3 }),
  ];

  const monta = (over: Partial<Parameters<typeof CardProjectTimeline>[0]> = {}) => {
    const onData = vi.fn();
    const onDipendenze = vi.fn();
    const onProponiInizio = vi.fn();
    render(
      <CardProjectTimeline
        attivita={derivaAttivita(attivita, OGGI)}
        modificabile
        evidenziata={null}
        onData={onData}
        onDipendenze={onDipendenze}
        onProponiInizio={onProponiInizio}
        {...over}
      />
    );
    return { onData, onDipendenze, onProponiInizio };
  };

  it("§11 — l'avanzamento è in sola lettura: nessun campo editabile", () => {
    monta();
    // Gli unici input della card sono le date e le spunte delle dipendenze.
    const numerici = screen.queryAllByRole("spinbutton");
    expect(numerici.length).toBe(0);
  });

  it("gli stati sono scritti, non solo colorati (§9 accessibilità)", () => {
    monta();
    expect(screen.getByText(/completed/)).toBeInTheDocument();
    expect(screen.getByText(/in progress/)).toBeInTheDocument();
    expect(screen.getByText("end date missing")).toBeInTheDocument();
  });

  it("§11 — scegliere una dipendenza la salva e propone l'inizio se manca", () => {
    const { onDipendenze, onProponiInizio } = monta();
    // Tre attività senza dipendenze mostrano tre volte lo stesso testo:
    // si apre quella di «Handover», la terza.
    fireEvent.click(screen.getAllByText(/depends on: none/i, { selector: "button" })[2]);
    fireEvent.click(screen.getByText("Concept design", { selector: "span" }));

    expect(onDipendenze).toHaveBeenCalledWith("a3", ["a1"]);
    // a3 non ha inizio: si propone la fine della madre.
    expect(onProponiInizio).toHaveBeenCalledWith("a3", "2026-03-01");
  });

  it("§11 — le dipendenze che creerebbero un ciclo non si possono scegliere", () => {
    const conCiclo = [
      att({ id: "a1", nome: "Prima", inizio: "2026-01-01", ordine: 1 }),
      att({ id: "a2", nome: "Seconda", inizio: "2026-02-01", ordine: 2, dipendeDa: ["a1"] }),
    ];
    render(
      <CardProjectTimeline
        attivita={derivaAttivita(conCiclo, OGGI)}
        modificabile
        evidenziata={null}
        onData={vi.fn()}
        onDipendenze={vi.fn()}
        onProponiInizio={vi.fn()}
      />
    );
    // «Prima» non può dipendere da «Seconda»: sarebbe un anello.
    fireEvent.click(screen.getAllByText(/depends on/i, { selector: "button" })[0]);
    expect(screen.getByText("circular")).toBeInTheDocument();
    const spunta = screen.getByTitle("This would create a circular dependency").querySelector("input")!;
    expect(spunta).toBeDisabled();
  });

  it("in sola lettura non compare nessun comando", () => {
    monta({ modificabile: false });
    expect(screen.queryByText(/depends on: none/i)).not.toBeInTheDocument();
  });
});

describe("Card 2 · HQ FGB timeline", () => {
  const attivita = [att({ id: "h", nome: "Handover", inizio: "2027-03-15", fine: "2027-03-15" })];

  const passi = [
    passo({
      id: "p1",
      nome: "GC closeout",
      ordine: 1,
      ancora: { attivitaId: "h", punto: "end", offsetGiorni: 30 },
    }),
    passo({ id: "p2", nome: "Submittal", ordine: 2, dataForzata: "2027-08-01", avanzamento: 40 }),
    passo({ id: "p3", nome: "Senza riferimento", ordine: 3 }),
  ];

  const monta = (over: Record<string, unknown> = {}) => {
    const onData = vi.fn();
    const onAvanzamento = vi.fn();
    render(
      <CardCertTimeline
        passi={derivaPassi(passi, attivita)}
        attivita={derivaAttivita(attivita, OGGI)}
        servizio="LEED BD+C"
        nomeServizio="Palazzo Aurora — LEED BD+C"
        modificabile
        evidenziato={null}
        onData={onData}
        onAvanzamento={onAvanzamento}
        {...over}
      />
    );
    return { onData, onAvanzamento };
  };

  it("§11 — le tre nature si distinguono", () => {
    monta();
    expect(screen.getByText("calculated")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  it("§11 — il ↺ compare solo sul passo manuale e riporta al calcolo", () => {
    const { onData } = monta();
    const bottoni = screen.getAllByLabelText(/Recalculate the date/);
    expect(bottoni.length).toBe(1); // solo «Submittal», che è forzato

    fireEvent.click(bottoni[0]);
    // `null` è il gesto che toglie l'override.
    expect(onData).toHaveBeenCalledWith("p2", null);
  });

  it("l'àncora dice da dove viene la data, estremo compreso", () => {
    monta();
    // Tre informazioni in una frase: quanti giorni, da quale estremo, di
    // quale attività. Si controlla il testo della card e non un elemento
    // preciso, perché l'àncora si presenta in due forme — comando quando è
    // modificabile, etichetta quando non lo è — e la frase deve dire le
    // stesse tre cose in entrambe.
    const testo = document.body.textContent ?? "";
    expect(testo).toContain("+30d");
    expect(testo).toMatch(/end of\s*:?\s*Handover/);
  });

  it("§11 — l'àncora si può impostare, non solo leggere", () => {
    const onAncoraggio = vi.fn();
    render(
      <CardCertTimeline
        passi={derivaPassi(passi, attivita)}
        attivita={derivaAttivita(attivita, OGGI)}
        servizio="LEED BD+C"
        nomeServizio="Palazzo Aurora — LEED BD+C"
        modificabile
        evidenziato={null}
        onData={vi.fn()}
        onAvanzamento={vi.fn()}
        onAncoraggio={onAncoraggio}
      />
    );
    // Ogni passo salvato ha il comando, anche quelli non ancora agganciati:
    // agganciare è il gesto che rende viva la timeline, e nasconderlo a chi
    // non ha ancora un'àncora vorrebbe dire non farlo scoprire mai.
    expect(screen.getAllByLabelText(/to a project activity/).length).toBeGreaterThan(0);
  });

  it("§11 — la percentuale è modificabile a mano e parte da zero", () => {
    const { onAvanzamento } = monta();
    const campi = screen.getAllByRole("spinbutton");
    expect(campi.length).toBe(3);
    expect((campi[0] as HTMLInputElement).value).toBe("0");

    fireEvent.change(campi[0], { target: { value: "45" } });
    expect(onAvanzamento).toHaveBeenCalledWith("p1", 45);
  });

  it("la percentuale non esce da 0..100 nemmeno se la scrivi a mano", () => {
    const { onAvanzamento } = monta();
    const campo = screen.getAllByRole("spinbutton")[0];

    fireEvent.change(campo, { target: { value: "250" } });
    expect(onAvanzamento).toHaveBeenLastCalledWith("p1", 100);

    fireEvent.change(campo, { target: { value: "-30" } });
    expect(onAvanzamento).toHaveBeenLastCalledWith("p1", 0);
  });

  it("il banner dice che l'avanzamento è manuale, invece di farlo dedurre", () => {
    monta();
    const banner = screen.getByText(/Progress starts at zero/);
    expect(within(banner).getByText("manually")).toBeInTheDocument();
  });

  it("in sola lettura i campi ci sono ma non si toccano", () => {
    monta({ modificabile: false });
    expect(screen.queryAllByLabelText(/Recalculate the date/).length).toBe(0);
    screen.getAllByRole("spinbutton").forEach((c) => expect(c).toBeDisabled());
  });
});

describe("l'ancoraggio alla conclusione di un'attività di progetto", () => {
  const attivita = [
    att({ id: "constr", nome: "Construction", inizio: "2027-01-01", fine: "2027-09-01" }),
  ];

  const monta = (p: Partial<PassoServizio> = {}) => {
    const onAncoraggio = vi.fn();
    render(
      <CardCertTimeline
        passi={derivaPassi([passo({ id: "p1", nome: "GC closeout", ...p })], attivita)}
        attivita={derivaAttivita(attivita, OGGI)}
        servizio="LEED BD+C"
        nomeServizio="Test"
        modificabile
        evidenziato={null}
        onData={vi.fn()}
        onAvanzamento={vi.fn()}
        onAncoraggio={onAncoraggio}
      />
    );
    return { onAncoraggio };
  };

  it("dice a parole che il passo segue la FINE dell'attività", () => {
    monta({ ancora: { attivitaId: "constr", punto: "end", offsetGiorni: 30 } });
    // «30d after Construction ends» si legge di sfuggita; «end of Construction»
    // va decifrato, ed e' la differenza che conta su una riga di passaggio.
    const chip = screen.getByLabelText(/Link GC closeout to a project activity/);
    expect(chip.textContent).toContain("30d after");
    expect(chip.textContent).toContain("ends");
  });

  it("distingue la fine dall'inizio, che su una fase lunga sono mesi", () => {
    monta({ ancora: { attivitaId: "constr", punto: "start", offsetGiorni: 30 } });
    const chip = screen.getByLabelText(/Link GC closeout to a project activity/);
    expect(chip.textContent).toContain("starts");
    expect(chip.textContent).not.toContain("ends");
  });

  it("senza àncora invita ad agganciare invece di stare zitto", () => {
    monta();
    const chip = screen.getByLabelText(/Link GC closeout to a project activity/);
    expect(chip.textContent).toContain("link to a project activity");
  });

  it("la data calcolata usa la FINE quando il punto è end", () => {
    // Construction finisce l'1 set 27: +30 giorni = 1 ott 27. Se leggesse
    // l'inizio uscirebbe il 31 gen 27 — otto mesi di differenza.
    const [p] = derivaPassi(
      [passo({ id: "p1", ancora: { attivitaId: "constr", punto: "end", offsetGiorni: 30 } })],
      attivita
    );
    expect(p.dataEffettiva).toBe("2027-10-01");

    const [q] = derivaPassi(
      [passo({ id: "p2", ancora: { attivitaId: "constr", punto: "start", offsetGiorni: 30 } })],
      attivita
    );
    expect(q.dataEffettiva).toBe("2027-01-31");
  });
});
