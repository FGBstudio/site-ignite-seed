import { describe, expect, it } from "vitest";
import { oraLocale, scartoOre, stessoGiorno } from "@/hooks/useUffici";

/**
 * I fusi degli uffici.
 *
 * Il difetto che questi test bloccano non si vede guardando lo schermo: un
 * turno di Shanghai letto sull'ora di Milano finisce sul giorno sbagliato, e
 * l'unico segnale e' un'assenza che nessuno spiega. Qui si fissa un istante
 * noto e si controlla cosa dicono i cinque uffici.
 */

// 15 giugno 2026, 12:00 UTC. Scelta apposta in giugno: e' il periodo in cui
// Europa e Stati Uniti sono in ora legale e la Cina no — cioe' quando uno
// scarto fisso scritto a mano sbaglierebbe.
const ISTANTE = new Date("2026-06-15T12:00:00Z");

describe("oraLocale", () => {
  it("legge l'ora giusta in ogni ufficio", () => {
    expect(oraLocale("Europe/Rome", ISTANTE)).toBe("14:00");      // UTC+2
    expect(oraLocale("Europe/Monaco", ISTANTE)).toBe("14:00");
    expect(oraLocale("Asia/Shanghai", ISTANTE)).toBe("20:00");    // UTC+8, niente ora legale
    expect(oraLocale("America/Los_Angeles", ISTANTE)).toBe("05:00"); // UTC-7
  });

  it("un fuso scritto male non fa sparire la riga", () => {
    // Degrada all'ora di chi guarda invece di lanciare: una tabella che si
    // svuota per un dato anagrafico sbagliato e' peggio di un'ora imprecisa.
    expect(oraLocale("Non/Esiste", ISTANTE)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("scartoOre", () => {
  it("dice di quanto si e' avanti o indietro", () => {
    const shanghai = scartoOre("Asia/Shanghai", ISTANTE);
    const losAngeles = scartoOre("America/Los_Angeles", ISTANTE);
    expect(shanghai.startsWith("+")).toBe(true);
    expect(losAngeles.startsWith("-")).toBe(true);
  });

  it("l'ora legale non si applica ovunque nello stesso giorno", () => {
    // A marzo l'Europa e' gia' passata all'ora legale e la Cina no, quindi lo
    // scarto Milano-Shanghai cambia fra gennaio e giugno. Uno scarto fisso
    // scritto a mano sbaglierebbe di un'ora per settimane.
    const gennaio = scartoOre("Asia/Shanghai", new Date("2026-01-15T12:00:00Z"));
    const giugno = scartoOre("Asia/Shanghai", new Date("2026-06-15T12:00:00Z"));
    expect(gennaio).not.toBe(giugno);
  });
});

describe("stessoGiorno", () => {
  it("a Shanghai puo' essere gia' domani", () => {
    // Il confronto e' col fuso di CHI GUARDA, non con UTC: un test che fissa
    // un'ora sola passerebbe a Milano e fallirebbe su una macchina in un
    // altro fuso. Si verifica la proprieta' — esiste un momento della
    // giornata in cui i due giorni non coincidono — provando le 24 ore.
    const ore = Array.from({ length: 24 }, (_, h) =>
      stessoGiorno("Asia/Shanghai", new Date(`2026-06-15T${String(h).padStart(2, "0")}:30:00Z`))
    );
    expect(ore).toContain(false);
    expect(ore).toContain(true);
  });

  it("a mezzogiorno UTC l'Europa e' nello stesso giorno", () => {
    expect(stessoGiorno("Europe/Rome", ISTANTE)).toBe(true);
  });
});
