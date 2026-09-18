#!/usr/bin/env python3
"""
Genera un PDF di offerta a partire dal template Word aziendale (template_offerta.docx).

Uso da CLI:
    python genera_offerta.py dati.json -o offerta.pdf
    cat dati.json | python genera_offerta.py - -o offerta.pdf

Uso come libreria:
    from genera_offerta import genera_offerta
    pdf_path = genera_offerta(dati_dict, output_pdf="offerta.pdf")

Dipendenze: docxtpl (pip install docxtpl) + LibreOffice (soffice) nel PATH.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TEMPLATE = Path(__file__).parent / "template_offerta.docx"

# Campi attesi dal template (tutti stringhe salvo "righe" che è una lista di stringhe)
CAMPI_OBBLIGATORI = [
    "data",                      # es. "11 Settembre 2026"
    # L'intestazione: le quattro righe in testa al documento.
    "cliente_ragione_sociale",   # es. "Banca Agricola Popolare di Sicilia"
    "cliente_indirizzo",         # es. "Via Europa 65"
    "cliente_cap_citta",         # es. "97100 Ragusa"
    "cliente_piva",              # es. "P.IVA 00026870881" (testo libero: anche CF)
    "titolo_riga1",              # riga 1 del titolo centrale, es. "BAPS"
    "titolo_riga2",              # riga 2 del titolo centrale, es. "Flagship Store Milano"
    "oggetto",                   # es. "CLAIR – FGB Air Quality Monitoring System"
    "righe",                     # lista voci offerta, es. ["N. 4 Sensori ...", "Spedizione"]
    "prezzo_finale",             # es. "2.500"  (senza "Euro": lo aggiunge il template)
    "cliente_breve",             # nome nella colonna firme, es. "ACME"
]
CAMPI_OPZIONALI = {
    "prezzo_listino": "",        # es. "4.000" -> mostrato barrato; vuoto = non mostrato
    "termini_giorni": "30",      # giorni di pagamento

    # Chi emette l'offerta, stampato nel piede del documento.
    #
    # Sono opzionali con un default, non obbligatori, per una ragione precisa:
    # finché le società erano una sola questi dati stavano scritti dentro il
    # template, e ogni offerta usciva intestata alla UK. Rendendoli obbligatori,
    # ogni chiamata già in giro che non li manda smetterebbe di funzionare da
    # un momento all'altro; con il default, chi non sceglie ottiene esattamente
    # il documento di prima, e chi sceglie ottiene la società giusta.
    #
    # I valori qui sotto sono copiati alla lettera dal piede che c'era nel
    # template: è quello il comportamento che non deve cambiare.
    "emittente_ragione_sociale": "FGB studio * Zmyrna limited",
    "emittente_indirizzo": "3 The Shrubberies - George Lane - London E18 1BD - UK",
    # La sigla fa parte del valore: «VAT» per la UK, «P.IVA» per l'Italia. Il
    # template non la mette più da sé, perché da sé la metterebbe sbagliata.
    "emittente_piva": "VAT GB 215421643",
}


def _valida(dati: dict) -> dict:
    mancanti = [c for c in CAMPI_OBBLIGATORI if not dati.get(c)]
    if mancanti:
        raise ValueError(f"Campi mancanti: {', '.join(mancanti)}")
    if not isinstance(dati["righe"], list) or not all(isinstance(r, str) for r in dati["righe"]):
        raise ValueError('"righe" deve essere una lista di stringhe')
    ctx = {**{k: str(dati[k]) for k in CAMPI_OBBLIGATORI if k != "righe"},
           "righe": dati["righe"]}
    for k, default in CAMPI_OPZIONALI.items():
        # Assente, None o stringa vuota valgono tutti «non me l'hanno detto»:
        # un campo emittente vuoto che passasse com'è lascerebbe il piede in
        # bianco, che è peggio del dato di ripiego.
        ctx[k] = str(dati.get(k) or default)
    # Il listino barrato è opzionale: se vuoto non compare nulla
    ctx["prezzo_listino_txt"] = f"{ctx.pop('prezzo_listino')} Euro" if ctx.get("prezzo_listino") else ""
    return ctx


def _docx_to_pdf(docx: Path, outdir: Path) -> Path:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise RuntimeError("LibreOffice (soffice) non trovato nel PATH")
    subprocess.run(
        [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(outdir), str(docx)],
        check=True, capture_output=True, timeout=120,
    )
    pdf = outdir / (docx.stem + ".pdf")
    if not pdf.exists():
        raise RuntimeError("Conversione PDF fallita")
    return pdf


def genera_offerta(dati: dict, output_pdf: str | Path, template: Path = TEMPLATE) -> Path:
    from docxtpl import DocxTemplate

    ctx = _valida(dati)
    output_pdf = Path(output_pdf)
    output_pdf.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        docx_out = tmp / "offerta.docx"
        tpl = DocxTemplate(str(template))
        tpl.render(ctx)
        tpl.save(str(docx_out))
        pdf = _docx_to_pdf(docx_out, tmp)
        shutil.move(str(pdf), str(output_pdf))
    return output_pdf


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description="Genera PDF offerta dal template aziendale")
    ap.add_argument("input", help="File JSON con i dati, oppure '-' per stdin")
    ap.add_argument("-o", "--output", default="offerta.pdf", help="Percorso PDF di output")
    ap.add_argument("-t", "--template", default=str(TEMPLATE), help="Percorso template .docx")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
    dati = json.loads(raw)
    pdf = genera_offerta(dati, args.output, Path(args.template))
    print(f"Creato: {pdf}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
