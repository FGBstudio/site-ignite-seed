# Servizio offerte

Compila `template_offerta.docx` con i dati della quotazione e restituisce il PDF.

Sta fuori dall'applicazione perché non poteva starci dentro: il frontend è una
SPA statica su GitHub Pages e le Edge Function sono Deno. Python e LibreOffice
hanno bisogno di un processo vero.

---

## I font, prima di tutto

Il template usa **Futura** e **Futura Medium**. Vanno messi qui:

```
servizio-offerte/fonts/
    Futura.ttf
    FuturaMedium.ttf      (i nomi dei file non contano, l'estensione sì)
```

**Non sono in git**: sono licenziati, e un repository non è il posto dove
distribuirli. `.gitignore` li esclude.

Senza, LibreOffice sostituisce e le metriche cambiano — si nota sul titolo
centrale e sulla tabella firme.

Su Render, che costruisce dal repository, i font vanno quindi aggiunti in uno
di questi modi:

- committarli in un repository privato separato da cui Render costruisce, oppure
- toglierli dal `.gitignore` **solo** se questo repository è privato e la
  licenza lo consente.

---

## Deploy su Render

1. Metti i font in `fonts/`.
2. Render → **New → Blueprint**, punta a questo repository. Legge `render.yaml`.
3. A fine deploy, in **Environment**, copia il valore generato di
   `OFFERTE_API_KEY`.
4. Quella chiave va messa nei segreti di Supabase, **non nel frontend**:

```bash
supabase secrets set OFFERTE_API_KEY=<la chiave>
supabase secrets set OFFERTE_URL=https://fgb-offerte.onrender.com
```

Controlla che sia vivo:

```bash
curl https://fgb-offerte.onrender.com/salute
# {"ok":true,"libreoffice":true,"template":true}
```

Se `libreoffice` è `false` l'immagine è costruita male; se `template` è `false`
manca il docx.

---

## Perché il browser non chiama questo servizio

Una chiave dentro una SPA statica non è un segreto: il bundle è pubblico su
GitHub Pages e chiunque la legge da devtools. Metterla lì avrebbe significato
lasciare a chiunque la possibilità di stampare carta intestata FGB.

La catena è quindi:

```
browser  →  Edge Function "genera-offerta"  →  questo servizio  →  PDF
           (autentica l'utente col JWT)      (tiene la chiave)
```

L'Edge Function sa già chi è l'utente e se può stare lì; la chiave resta nei
segreti di Supabase. Questo servizio non parla mai direttamente col browser, e
infatti non ha CORS: non gli serve.

---

## Provarlo in locale

```bash
cd servizio-offerte
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

OFFERTE_API_KEY=prova python app.py

curl -X POST http://localhost:8000/genera \
     -H "X-API-Key: prova" -H "Content-Type: application/json" \
     -d @dati_esempio.json --output offerta.pdf
```

Serve LibreOffice installato e `soffice` nel PATH.

La libreria si usa anche da sola, senza servizio:

```bash
python genera_offerta.py dati_esempio.json -o offerta.pdf
```

---

## Contratto

`POST /genera` — header `X-API-Key`, corpo JSON come `dati_esempio.json`.

| Esito | Quando |
|---|---|
| `200` + `application/pdf` | fatto |
| `401` | chiave assente o sbagliata |
| `422` + `{errore, campi}` | campi obbligatori mancanti, o `righe` non è una lista di stringhe |
| `500` | conversione fallita, timeout, template irraggiungibile |

Obbligatori: `data`, `cliente_ragione_sociale`, `cliente_indirizzo`,
`cliente_cap_citta`, `cliente_piva`, `titolo_riga1`, `titolo_riga2`, `oggetto`,
`righe`, `prezzo_finale`, `cliente_breve`.
Opzionali: `prezzo_listino` (vuoto = niente prezzo barrato), `termini_giorni`
(default `30`).

---

## Due scelte che vale la pena conoscere

**Una conversione per volta.** LibreOffice headless con due istanze sullo stesso
profilo utente trova il proprio lock e restituisce un PDF vuoto. Un `Lock` nel
processo le mette in fila: una conversione dura un paio di secondi, e la coda
costa meno che moltiplicare i profili su disco. Per questo il servizio gira con
**un worker solo** — aggiungerne significherebbe perdere la serializzazione.

**Il primo avvio è lento.** LibreOffice crea il profilo utente alla prima
esecuzione. Il Dockerfile lo fa in fase di build, così la prima offerta vera non
aspetta. Sul piano gratuito di Render resta comunque il risveglio dopo 15
minuti di inattività: mezzo minuto scarso.

---

## Se serve cambiare la grafica

Si modifica **`template_offerta.docx`** in Word e si rimettono i segnaposto
`{{ nome_campo }}`. Non si tocca l'XML da codice e non si ricostruisce il
layout altrove: il docx è la fonte di verità grafica, tutto il resto è un
tubo che ci passa i dati dentro.
