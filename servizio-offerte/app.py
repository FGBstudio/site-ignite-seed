"""
Servizio di generazione offerte FGB.

Riceve i dati del form, compila il template Word aziendale e restituisce il PDF.

Il layout non vive qui: vive in `template_offerta.docx`. Questo file mette
insieme tre cose — una chiave che tiene fuori gli estranei, una coda che
impedisce a due conversioni di pestarsi i piedi, e una pulizia che non lascia
docx in giro.
"""

from __future__ import annotations

import os
import re
import tempfile
import threading
import unicodedata
from pathlib import Path

from flask import Flask, jsonify, request, send_file

from genera_offerta import CAMPI_OBBLIGATORI, genera_offerta

app = Flask(__name__)

CHIAVE = os.environ.get("OFFERTE_API_KEY", "")
TEMPLATE = Path(__file__).parent / "template_offerta.docx"

# LibreOffice headless non gradisce due istanze sullo stesso profilo utente:
# la seconda trova il lock della prima e restituisce un PDF vuoto o niente.
# Con un servizio piccolo la coda e' piu' onesta di un profilo per richiesta:
# una conversione dura un paio di secondi, e serializzare costa meno che
# moltiplicare i profili su disco.
_conversione = threading.Lock()


def _nome_file(cliente: str, data: str) -> str:
    """Un nome di file che sopravvive a Windows, macOS e alle email."""
    grezzo = f"Offerta_{cliente}_{data}"
    # Gli accenti diventano lettere semplici invece di sparire.
    piatto = unicodedata.normalize("NFKD", grezzo).encode("ascii", "ignore").decode()
    pulito = re.sub(r"[^A-Za-z0-9._-]+", "_", piatto).strip("_")
    return (pulito or "Offerta")[:120] + ".pdf"


@app.get("/salute")
def salute():
    """Render lo interroga per sapere se il servizio e' vivo."""
    from shutil import which

    return jsonify(
        {
            "ok": True,
            "libreoffice": bool(which("soffice") or which("libreoffice")),
            "template": TEMPLATE.exists(),
        }
    )


@app.post("/genera")
def genera():
    # La chiave non e' una difesa forte, ma e' cio' che impedisce a chiunque
    # conosca l'indirizzo di stampare carta intestata FGB.
    if not CHIAVE:
        return jsonify({"errore": "Servizio non configurato: manca OFFERTE_API_KEY"}), 500
    if request.headers.get("X-API-Key") != CHIAVE:
        return jsonify({"errore": "Chiave non valida"}), 401

    dati = request.get_json(silent=True)
    if not isinstance(dati, dict):
        return jsonify({"errore": "Il corpo della richiesta deve essere un oggetto JSON"}), 400

    mancanti = [c for c in CAMPI_OBBLIGATORI if not dati.get(c)]
    if mancanti:
        # 422 e non 400: la richiesta e' ben formata, sono i dati a essere
        # incompleti — e l'elenco serve al form per dire quali campi.
        return jsonify({"errore": "Campi mancanti", "campi": mancanti}), 422

    if not isinstance(dati.get("righe"), list) or not all(
        isinstance(r, str) for r in dati["righe"]
    ):
        return jsonify({"errore": '"righe" deve essere una lista di stringhe'}), 422

    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "offerta.pdf"
        try:
            with _conversione:
                genera_offerta(dati, pdf, TEMPLATE)
        except ValueError as e:
            return jsonify({"errore": str(e)}), 422
        except Exception as e:  # conversione fallita, timeout, template rotto
            app.logger.exception("generazione fallita")
            return jsonify({"errore": f"Generazione fallita: {e}"}), 500

        # Si legge in memoria prima che la directory temporanea svanisca:
        # send_file su un percorso gia' cancellato e' un errore silenzioso.
        contenuto = pdf.read_bytes()

    from io import BytesIO

    return send_file(
        BytesIO(contenuto),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=_nome_file(
            str(dati.get("cliente_breve", "")), str(dati.get("data", ""))
        ),
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
