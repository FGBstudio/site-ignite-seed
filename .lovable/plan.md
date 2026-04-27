# Restyling Login + nuova Home Hub stile Gestionale

## Obiettivo

Riprodurre il flusso del mockup `Gestionale_v8.html`:

1. **Login** (`/login`) → card centrata "FGB MANAGEMENT TOOL" con pittogramma teal sopra al brand.
2. Dopo l'accesso → **Home Hub** (`/`) con saluto dinamico ("Good Morning/ Good Afternoon/ Good Evening"), titolo "FGB MANAGEMENT TOOL" e griglia di 5 pittogrammi colorati.
3. **Pittogramma PROGETTI** (teal) → entra nell'attuale ecosistema (CEO Dashboard, Projects, Tasks, Hardwares, Orders, Reports, Contacts, Settings, PM Portal, My Tasks).
4. **UFFICIO / HR / MONITOR / FATTURAZIONE** → pagine "Coming Soon" con pittogramma colorato + claim "Coming Soon — prossima versione".

Nessuna logica funzionale esistente viene toccata: tutto ciò che è già stato sviluppato resta identico, semplicemente raggiunto passando dal nuovo Hub.

---

## 1) Login restyling

File: `src/pages/Login.tsx`

Layout (riferimento immagine 1):

- Sfondo `#f5f4f0` (avorio Gestionale).
- Card bianca centrata, max-width 360px, border-radius 18px, shadow soft.
- Top: pittogramma `green.png` 56×56 + brand `FGB GESTIONALE` (Futura uppercase, letter-spacing 0.12em) + sottotitolo `Accedi con le tue credenziali` (small, t3 grey).
- Form: label Futura uppercase 10px (`EMAIL`, `PASSWORD`); input con sfondo `--bg`, border 0.5px, focus border teal.
- Bottone `ACCEDI` full-width teal (`#009193`, hover `#006367`), Futura uppercase 12px.
- Errore inline "Credenziali non valide" sopra il bottone.
- Si mantiene la validazione attuale del dominio `@fgb-studio.com`.

---

## 2) Nuova Home Hub

Nuova pagina: `src/pages/Home.tsx`

- Route `/` → mostrata ad **ADMIN e PM**.
- Operativi (document_manager, specialist, energy_modeler, cxa) continuano a essere reindirizzati a `/my-tasks` (comportamento attuale `getDefaultRoute`).

Layout (riferimento immagine 2):

- TopNavbar minimale: solo logo "FGB" + breadcrumb `Home`, pill ruolo, email, bottone Esci. Nessun tab funzionale (i tab compaiono solo dentro PROGETTI).
- Hero centrato (max-width 1000px, padding 3.5rem):
  - Saluto dinamico orario "BUON POMERIGGIO" (Futura uppercase 11px, t3).
  - Titolo "MANAGEMENT" + nuova riga "FGB" (Futura, ~42px, "FGB STUDIO" colorato teal).
- Grid pittogrammi (flex-wrap, gap 2.5rem 3rem, justify-center):
  - 5 card cliccabili con: pittogramma 130×130 colorato + nome (Futura uppercase 12px) + descrizione (11px t3).
  - Per i colori si usa `green.png` con un filtro CSS (sepia + hue-rotate) per ottenere ciascuna tinta, replicando la mappa `getFilterLight` del mockup.
  - Hover: rotazione 18° + scale 1.13 + glow color-coded.
  - Per PM: visibile solo PROGETTI e HR (le altre 3 nascoste).


| #   | Sezione  | Colore             | Stato       | Destinazione click        |
| --- | -------- | ------------------ | ----------- | ------------------------- |
| 1   | PROJECTS | `#009193` teal     | LIVE        | `/projects-hub` (vedi §3) |
| 2   | OFFICE   | `#911140` burgundy | Coming Soon | `/ufficio`                |
| 3   | HR       | `#f8cbcc` rosa     | Coming Soon | `/hr`                     |
| 4   | MONITOR  | `#a0d5d6` teal-l   | Coming Soon | `/monitor`                |
| 5   | INVOICE  | `#e63f26` orange   | Coming Soon | `/fatturazione`           |


Animazione al click (transizione "ptrans"): cerchio del colore della sezione che esplode dal centro prima della navigazione (effetto stesso del mockup, ~500ms).

---

## 3) Sezione PROGETTI = ecosistema esistente

Concettualmente PROGETTI raggruppa tutto ciò che esiste oggi. Nessun rebuild.

Approccio:

- Rotta entry `/projects-hub` → reindirizza a:
  - `/ceo-dashboard` se ADMIN
  - `/projects` se PM
- Le rotte già esistenti restano invariate:
  - ADMIN: `/ceo-dashboard`, `/projects`, `/contacts`, `/admin-tasks`, `/hardwares`, `/supplier-orders`, `/reports`, `/settings`
  - PM: `/projects`, `/pm-portal`, `/contacts`, `/my-tasks`
- TopNavbar mostra i tab funzionali esistenti **solo** quando si è dentro una rotta della sezione PROGETTI.
  - Breadcrumb diventa `Home / Progetti / [pagina corrente]`.
  - Click sul logo "FGB" o su "Home" del breadcrumb → torna alla Home Hub `/`.

---

## 4) Pagine Coming Soon

Nuovo componente generico: `src/pages/ComingSoon.tsx`

- Riceve `section`, `color`, `description` come prop (o letti dalla route).
- Layout: TopNavbar con breadcrumb `Home / [Sezione]`, area centrata con pittogramma 96×96 (filtrato col colore della sezione, opacità 0.5), titolo Futura uppercase, sottotitolo "In sviluppo — prossima versione".

Rotte create (tutte protette ADMIN+PM):

- `/ufficio` → ComingSoon UFFICIO (burgundy)
- `/hr` → ComingSoon HR (rosa)
- `/monitor` → ComingSoon MONITOR (teal chiaro)
- `/fatturazione` → ComingSoon FATTURAZIONE (orange)

---

## 5) Routing & redirect post-login

Modifiche a `src/components/ProtectedRoute.tsx`:

```ts
function getDefaultRoute(role) {
  if (role === "ADMIN" || role === "PM") return "/";   // ← Hub
  if (role è operativo)                  return "/my-tasks";
  return "/login";
}
```

Modifiche a `src/App.tsx`:

- `/` → `Home` (ADMIN + PM), non più `Index/Dashboard`.
- Nuove rotte: `/projects-hub`, `/ufficio`, `/hr`, `/monitor`, `/fatturazione`.
- `Index.tsx` non più usata come landing (può essere rimossa o lasciata come riferimento).

---

## 6) TopNavbar contestuale

File: `src/components/layout/TopNavbar.tsx`

- Determina se la rotta corrente appartiene alla "sezione PROGETTI" (whitelist di path).
- Se **sì** → mostra i tab funzionali attuali + breadcrumb `Home / Progetti / Tab`.
- Se **no** (Home Hub o pagine Coming Soon) → nasconde i tab, mostra solo logo + breadcrumb `Home / [Sezione opzionale]`.
- Click sul logo → sempre verso `/` (Home Hub).

---

## File interessati

**Nuovi:**

- `src/pages/Home.tsx` (Hub con i 5 pittogrammi)
- `src/pages/ComingSoon.tsx` (placeholder riusabile)
- `src/components/home/PittoCard.tsx` (card pittogramma con filtri colore)

**Modificati:**

- `src/pages/Login.tsx` (restyling card + brand "FGB GESTIONALE")
- `src/App.tsx` (nuove rotte + `/` → Home)
- `src/components/ProtectedRoute.tsx` (`getDefaultRoute` → `/` per ADMIN/PM)
- `src/components/layout/TopNavbar.tsx` (tab visibili solo in sezione PROGETTI, breadcrumb dinamico)

**Invariati:** tutte le pagine esistenti (CEO Dashboard, Projects, Tasks, Hardwares, ecc.) e tutta la logica funzionale, RLS, hook, edge functions email.

---

## Note tecniche

- Asset pittogramma: si riusa `/public/green.png` con CSS `filter: sepia() saturate() hue-rotate()` per produrre i 4 colori varianti (mappa già definita nel mockup `getFilterLight`).
- Font: già caricato `DM Sans` in `index.html`; Futura usa fallback locale (Century Gothic / Trebuchet MS) come oggi.
- Saluto orario: utility `getGreeting()` basata su `new Date().getHours()`.
- Animazione "ptrans": semplice `<div>` overlay con transform scale, attivata al click sulla card prima del `navigate()`.
- Colori già presenti nel design system (teal, burgundy, ecc.), nessuna modifica a `index.css` o `tailwind.config.ts` necessaria.

Una volta approvato, passo in modalità build e implemento nell'ordine: Home + ComingSoon + PittoCard → Login restyling → routing/ProtectedRoute → TopNavbar contestuale.