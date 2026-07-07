## Diagnosi

**Non esiste alcuna regola nel codice** che concateni `client`/`brand` con il `name` della certificazione nella tabella Quotations. La cella "Project" in `src/pages/Quotations.tsx` (riga 334) renderizza solo `{r.name}`, identica a quella di Operations (`Projects.tsx`).

La differenza fra le due schermate è nei **dati**, non nel render:

| Client | `certifications.name` in DB |
|---|---|
| MICHAEL KORS | `Fashion Outlet`, `Malaga`, `Meadowhall` … (pulito) |
| BRIONI | `BRIONI Palm beach`, `BRIONI Ginza`, `BRIONI SKP` … (prefissato) |

I record BRIONI sono stati salvati con il brand già scritto dentro `name` (probabilmente digitato a mano nel wizard, che precompila `projectName` dal Site Name). Operations sembra "pulita" solo perché quei progetti non hanno il prefisso in DB.

## Cosa propongo

**1. Cleanup dati (una tantum)** — migration SQL che rimuove il prefisso `<client>` iniziale da `certifications.name` quando presente, per tutti i record:

```sql
UPDATE public.certifications
SET name = trim(regexp_replace(name, '^' || client || '\s+', '', 'i'))
WHERE name ILIKE client || ' %';
```

Esempi risultato:
- `BRIONI Palm beach` → `Palm beach`
- `BRIONI SKP` → `SKP`
- `Fashion Outlet` (MK) → invariato

**2. Nessuna modifica al rendering** — Quotations e Operations continueranno a mostrare solo `r.name`, e dopo il cleanup risulteranno coerenti (client nella colonna Client, project pulito nella colonna Project).

**3. Nessun cambiamento al wizard** — l'utente resta libero di scrivere il nome che preferisce; se in futuro dovesse ridigitare "BRIONI xxx" a mano, resterà così (il cleanup è puntuale sui dati attuali). Se vuoi, in un secondo giro posso aggiungere un warning nel wizard se il nome inizia col client, ma non è incluso qui per non alterare la UX.

## File toccati

- Nuova migration Supabase (solo `UPDATE`, nessun cambio schema)
- Nessun file frontend modificato

## Rischi

- L'UPDATE è idempotente e case-insensitive, ma rimuove SOLO il prefisso esatto `<client> ` (client + spazio). Nomi come `BRIONI-Palm` (senza spazio) non verrebbero toccati.
- Nessun impatto su relazioni/foreign key: `name` è un campo testuale libero.