# Il servizio che trasforma il template Word aziendale in PDF.
#
# Pesa piu' del solito perche' porta dentro LibreOffice: e' il prezzo per avere
# esattamente il layout approvato invece di una sua imitazione in HTML.

FROM python:3.12-slim

# `libreoffice-writer` basta: non serve l'intera suite, e togliere Calc e
# Impress fa risparmiare qualche centinaio di megabyte.
# `fonts-liberation` e' il ripiego metrico se un font dovesse mancare.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        libreoffice-core \
        fonts-liberation \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

# ── I font ────────────────────────────────────────────────────────────────
# Futura e Futura Medium vanno messi in `fonts/` prima di costruire l'immagine.
# Senza, LibreOffice sostituisce e le metriche cambiano: il titolo centrale e
# la tabella firme sono i punti dove si nota.
#
# I file dei font NON stanno in git — sono licenziati. Vedi README.
COPY fonts/ /usr/share/fonts/truetype/fgb/
RUN fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY genera_offerta.py app.py template_offerta.docx ./

# Una prima conversione a vuoto in fase di build: LibreOffice al primo avvio
# crea il profilo utente e ci mette diversi secondi. Farlo qui significa che la
# prima offerta vera non aspetta.
RUN soffice --headless --terminate_after_init || true

ENV PORT=8000
EXPOSE 8000

# Un worker solo, di proposito: le conversioni sono gia' serializzate da un
# lock nel processo, e piu' worker vorrebbero piu' profili LibreOffice.
# Il timeout copre i 120 s della conversione piu' il margine.
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 180 app:app
