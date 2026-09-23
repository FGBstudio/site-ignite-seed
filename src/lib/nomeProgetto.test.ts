import { describe, expect, it } from "vitest";
import { nomeCanonico } from "./nomeProgetto";

/**
 * Il nome canonico deve dare lo stesso risultato del gemello SQL
 * `public.nome_canonico`, perché metà del sistema legge dalla vista e metà
 * compone lato client: due regole diverse riporterebbero il problema che
 * questa funzione esiste per chiudere.
 */
describe("nomeCanonico", () => {
  it("compone CLIENTE CITTÀ Progetto", () => {
    expect(nomeCanonico("Boucheron", "Monaco", "Monaco One")).toBe(
      "BOUCHERON MONACO Monaco One",
    );
  });

  it("mette cliente e città in maiuscolo, il progetto no", () => {
    expect(nomeCanonico("fendi", "bangkok", "Emporium")).toBe("FENDI BANGKOK Emporium");
  });

  it("toglie la città quando il progetto la ripete come prefisso", () => {
    expect(nomeCanonico("Fendi", "MILAN", "Milan, Galleria")).toBe("FENDI MILAN Galleria");
    expect(nomeCanonico("Fendi", "SHANGHAI", "Shanghai, IAPM Mall")).toBe(
      "FENDI SHANGHAI IAPM Mall",
    );
  });

  it("riconosce il prefisso anche quando la città porta il distretto", () => {
    // «TAIPA, MACAO» deve comunque ripulire «Taipa, Galaxy».
    expect(nomeCanonico("Fendi", "TAIPA, MACAO", "Taipa, Galaxy")).toBe(
      "FENDI TAIPA, MACAO Galaxy",
    );
  });

  it("non tocca il progetto quando la ripetizione non è un prefisso con virgola", () => {
    // «Monaco One» non diventa «One»: la regola toglie una convenzione di
    // scrittura, non ogni parola che somigli al nome della città.
    expect(nomeCanonico("Boucheron", "MONACO", "Monaco One")).toBe(
      "BOUCHERON MONACO Monaco One",
    );
  });

  it("salta i pezzi che mancano invece di lasciare spazi vuoti", () => {
    expect(nomeCanonico(null, "MILAN", "Galleria")).toBe("MILAN Galleria");
    expect(nomeCanonico("Fendi", null, "Emporium")).toBe("FENDI Emporium");
    expect(nomeCanonico("Fendi", "MILAN", null)).toBe("FENDI MILAN");
  });

  it("restituisce null quando non c'è niente da comporre", () => {
    expect(nomeCanonico(null, null, null)).toBeNull();
    expect(nomeCanonico("  ", "", undefined)).toBeNull();
  });
});
