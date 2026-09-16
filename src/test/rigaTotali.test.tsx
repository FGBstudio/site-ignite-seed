import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RigaTotali } from "@/components/common/RigaTotali";

/**
 * La riga dei totali.
 *
 * Il test che conta e' quello sul troncamento: una tabella che disegna 200
 * righe su 800 senza dirlo fa credere di aver visto tutto, ed e' il modo piu'
 * facile di prendere una decisione su dati parziali.
 */

describe("RigaTotali", () => {
  it("mostra il conteggio di quello che si sta guardando", () => {
    render(<RigaTotali totale={42} nome="progetti" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("progetti")).toBeInTheDocument();
  });

  it("senza filtri non ripete lo stesso numero due volte", () => {
    render(<RigaTotali totale={42} suTotale={42} nome="progetti" />);
    expect(screen.queryByText(/filtrati da/)).not.toBeInTheDocument();
  });

  it("con un filtro attivo dice da quanti si e' partiti", () => {
    const { container } = render(<RigaTotali totale={12} suTotale={1304} nome="progetti" />);
    expect(screen.getByText(/filtrati da/)).toBeInTheDocument();
    // Il separatore delle migliaia lo mette Intl, e Node qui ha dati locale
    // ridotti rispetto al browser: si confronta col risultato dello stesso
    // formattatore, non con una stringa scritta a mano.
    const atteso = new Intl.NumberFormat("it-IT").format(1304);
    expect(container.textContent).toContain(atteso);
  });

  it("dichiara il troncamento quando la tabella non le disegna tutte", () => {
    render(<RigaTotali totale={800} mostrate={200} nome="siti" />);
    expect(screen.getByText(/ne vedi/)).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("se le disegna tutte non parla di troncamento", () => {
    render(<RigaTotali totale={150} mostrate={150} nome="siti" />);
    expect(screen.queryByText(/ne vedi/)).not.toBeInTheDocument();
  });

  it("le voci a zero non occupano spazio", () => {
    render(
      <RigaTotali
        totale={10}
        nome="siti"
        voci={[
          { label: "Certified", valore: 3 },
          { label: "On Hold", valore: 0 },
        ]}
      />
    );
    expect(screen.getByText("Certified")).toBeInTheDocument();
    expect(screen.queryByText("On Hold")).not.toBeInTheDocument();
  });

  it("il conteggio si annuncia a chi non lo vede cambiare", () => {
    const { container } = render(<RigaTotali totale={7} nome="siti" />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
