# Collaudo — SPECIFICA_TIMELINE §11

Esito dichiarato criterio per criterio, al 16 settembre 2026.
**238 test verdi, typecheck, lint e build puliti.**

Legenda: **✅ verde** = verificato da un test automatico · **🖐 da provare** = implementato, ma la verifica richiede il browser · **⚠️ deviazione** = non conforme di proposito, con la ragione.

---

## I criteri

| # | Criterio §11 | Esito | Dove si verifica |
|---|---|---|---|
| 1 | Vista vuota: stato vuoto visibile; con UNA data appare il primo badge con animazione | ✅ / 🖐 l'animazione | `timelineLive.test.tsx` → «stato vuoto» |
| 2 | Attività conclusa nel passato → `100% · completata` | ✅ | `timelineDerivazione.test.tsx`, `timelineLive.test.tsx` |
| 3 | Attività a cavallo di oggi → % coerente (±1%), `in corso`, marcatore OGGI | ✅ | idem + «marcatore OGGI» |
| 4 | Attività futura → `0% · pianificata` | ✅ | `timelineDerivazione.test.tsx` |
| 5 | Cambio della `Fine` → % e barre ricalcolate senza reload | ✅ | «spostare la fine ricalcola subito» |
| 6 | Passo ancorato: data = punto àncora + offset, curva verso l'attività, chip `calcolata` | ✅ | `timelineLive.test.tsx`, `timelineCards.test.tsx` |
| 7 | Override → chip `manuale`, `↺` presente e funzionante | ✅ | «il ↺ compare solo sul passo manuale» |
| 8 | % passo modificabile solo a mano, anello la riflette, default 0 | ✅ | `timelineCards.test.tsx` (3 test) |
| 9 | Durate sui segmenti = differenza fra date effettive consecutive | ✅ | «le durate compaiono sui segmenti» |
| 10 | Dipendenza: archetto ambra, **nessun vincolo rigido**, niente cicli | ⚠️ **deviazione** | vedi sotto |
| 11 | Import XLSX: date aggiornate, toast con conteggio, righe non riconosciute segnalate, override e dipendenze intatti | ✅ | `importAttivita.test.ts` (20 test) |
| 12 | Autosave con indicatore; refresh → dati persistiti | 🖐 | serve il browser |
| 13 | Due colonne SEMPRE distinte; regge 0..12+ voci con scroll interno | ✅ | `timelineLive.test.tsx` (3 test) |
| 14 | Responsive, dark mode, `prefers-reduced-motion`, label ARIA | 🖐 parziale | vedi sotto |

---

## ⚠️ Criterio 10 — la deviazione, e perché

La spec §6.5 dice: *«Nessun auto-scheduling in v1: la dipendenza è informativa + suggerimento»*.

**Il PO ha deciso il contrario**, con queste parole: *«è giusto che questo motore resti, se il progetto è in ritardo tutte le date e le attività connesse al ritardo si spostano in avanti»*.

Quindi la dipendenza **sposta davvero le date**:

- finish-to-start; con più madri l'inizio è la **più tarda** delle fini, più l'offset;
- la durata dell'attività **si conserva**: slitta tutta, non si comprime contro una fine rimasta ferma;
- i cicli restano impediti su due livelli — spenti nel menu con il motivo scritto, e rifiutati dal database con un'eccezione.

Lo segnalo qui perché, rileggendo la spec fra sei mesi, §6.5 non corrisponderà al codice. **Il codice è giusto, la spec è superata su quel punto.**

Anche §10.2 («dipendenze multiple: servono subito?») è deciso: **sì**, per la stessa richiesta del PO. Implementate con una tabella ponte, `crono_dipendenze`.

---

## 🖐 Criterio 14 — cosa è fatto e cosa va guardato

**Fatto e verificabile leggendo il codice:**

- **Breakpoint a 1120px**, non l'`xl` di Tailwind (1280): su un portatile da 13 pollici la schermata resterebbe in colonna singola proprio dove serve vedere form e disegno insieme. È lo screen `tl` in `tailwind.config.ts`.
- **Dark mode**: nessun colore fisso nei componenti nuovi tranne il viola delle note, che ha la sua variante scura. La colonna PROGETTO prende `--foreground` e non più `PIETRA.inchiostro`, che è tarato sul fondo avorio e in dark mode sarebbe sparito.
- **Mobile**: timeline sopra con altezza limitata a 70vh e scroll interno, form sotto; cadono le colonne `#` (sotto 640px) e `Natura` (sotto 768px). La natura resta comunque leggibile dal campo data, tratteggiato quando è calcolata.
- **`prefers-reduced-motion`**: il micro-pop è dentro `@media (prefers-reduced-motion: no-preference)`; le transizioni delle barre usano `motion-safe:`.
- **ARIA**: `aria-label` su ogni campo data, percentuale, spunta e selettore; `role="img"` con etichetta sull'SVG; focus visibile su tutti i comandi, selettori e bottoni compresi.
- **Colore mai da solo**: gli stati sono scritti (`completata`, `in corso`, `pianificata`, `manca la fine`), non solo colorati.

**Da guardare in browser, perché un test in jsdom non lo dimostra:** il contrasto AA reale delle due tinte sopra i due fondi, la resa del pannello sticky su schermi bassi, e il comportamento del wrapping dei nomi lunghi nell'SVG a larghezze intermedie.

---

## 🖐 Criterio 12 — autosave

Implementato con **debounce per campo, non globale**: due campi toccati nello stesso secondo salvano entrambi, invece che solo l'ultimo. «Salva e chiudi» svuota la coda invece di aspettarla. L'indicatore ha tre stati e un ritardo prima di tornare a riposo, così «Tutto salvato» resta leggibile invece di lampeggiare a ogni tasto.

Quello che serve provare davvero: scrivere una data, contare fino a due, ricaricare la pagina, vedere se c'è ancora.

---

## Due cose che cambiano rispetto alla spec, e che non sono bug

**L'import crea, non solo aggiorna.** §8 dice che l'import aggiorna le attività riconosciute e delle altre fa un log. Preso alla lettera, su una timeline vuota **non farebbe niente**, perché non c'è nulla da riconoscere. Le righe non abbinate sono quindi proposte come nuove attività, con il destino modificabile riga per riga nella revisione.

**L'import passa da una revisione.** §4.2 descrive una card che applica e mostra un toast. Il PO ha chiesto la revisione, e la ragione è che l'abbinamento dei nomi è un'ipotesi: un'ipotesi che scrive date da sola produce l'errore peggiore possibile — la data giusta sulla riga sbagliata, che nessuno nota per mesi.

---

## La rete di sicurezza

La vista precedente resta su **`/projects/:id/cronoprogramma-legacy`**. Non è un secondo prodotto: è il paracadute finché i due criteri 🖐 non sono stati provati a mano. Quando lo saranno, va tolta.
