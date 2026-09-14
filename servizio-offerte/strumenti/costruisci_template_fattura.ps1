# Costruisce template_fattura_uk.docx a partire da MASTER FATTURE.docx.
#
# Il master e' il foglio che l'ufficio usa davvero: stessa grafica, stessi font,
# stesso piè di pagina bancario. Qui non si ridisegna niente — si sostituisce il
# testo variabile con i segnaposto di docxtpl, lasciando intatto tutto il resto
# del pacchetto Word (immagini, stili, intestazione, note).
#
# Due paragrafi vengono ricostruiti invece che modificati: le righe degli
# importi. Nel master l'allineamento a destra e' ottenuto con spazi battuti a
# mano piu' tre tabulazioni — funziona finche' qualcuno aggiusta a occhio, ma
# una descrizione piu' lunga sposta l'importo. Al loro posto una tabulazione
# sola, con una fermata allineata a destra sul margine: l'importo cade sempre
# nella stessa colonna, qualunque cosa ci sia scritto a sinistra.
#
# Uso:  powershell -File costruisci_template_fattura.ps1 -Master <path> -Out <path>

param(
  [string]$Master = "$PSScriptRoot\..\MASTER FATTURE.docx",
  [string]$Out    = "$PSScriptRoot\..\template_fattura_uk.docx"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference = 'Stop'

# La fermata di tabulazione: larghezza testo A4 meno i rientri del paragrafo.
# 11906 - 1134 - 1134 = 9638 di testo, meno 849 di rientro destro.
$TAB_DESTRA = 8789

function Get-Paragrafi([string]$xml) {
  [regex]::Matches($xml, '<w:p\b[^>]*>.*?</w:p>')
}

# Riscrive il testo di un paragrafo senza toccarne la struttura: il primo
# <w:t> prende il valore nuovo, gli altri si svuotano. Le tabulazioni restano.
# E' il modo sicuro: non rimuove run, non tocca rPr, non rompe le caselle di
# testo in cui Word tiene la data.
function Set-TestoParagrafo([string]$p, [string]$testo) {
  $esc = [System.Security.SecurityElement]::Escape($testo)
  $ts = [regex]::Matches($p, '<w:t[^>]*>[^<]*</w:t>')

  if ($ts.Count -eq 0) {
    # Paragrafo vuoto: non c'e' nessun testo da sostituire, va inserito un run.
    # Capita sui paragrafi che ospitano i marcatori di ciclo e di condizione,
    # che nel master sono righe bianche.
    if ($testo -eq '') { return $p }
    $run = '<w:r><w:t xml:space="preserve">' + $esc + '</w:t></w:r>'
    return [regex]::Replace($p, '</w:p>$', ($run + '</w:p>'))
  }

  # Il primo <w:t> prende il valore, gli altri si svuotano. Si procede dal
  # fondo perche' ogni sostituzione cambia la lunghezza della stringa.
  for ($k = $ts.Count - 1; $k -ge 0; $k--) {
    $nuovo = if ($k -eq 0) {
      '<w:t xml:space="preserve">' + $esc + '</w:t>'
    } else {
      '<w:t xml:space="preserve"></w:t>'
    }
    $p = $p.Substring(0, $ts[$k].Index) + $nuovo + $p.Substring($ts[$k].Index + $ts[$k].Length)
  }
  return $p
}

# Estrae le proprieta' di un run per riusarne la formattazione.
function Get-Rpr([string]$p, [int]$indice) {
  $runs = [regex]::Matches($p, '<w:r\b[^>]*>.*?</w:r>')
  if ($indice -ge $runs.Count) { return '' }
  if ($runs[$indice].Value -match '<w:rPr>.*?</w:rPr>') { return $matches[0] }
  return ''
}

# Ricostruisce una riga "etichetta <tab> importo Euro" con la tabulazione a
# destra. Prende pPr dal paragrafo originale e vi inserisce la fermata.
function New-RigaImporto([string]$p, [int]$runEtichetta, [int]$runImporto, [string]$etichetta, [string]$importo) {
  $pPr = ''
  if ($p -match '<w:pPr>.*?</w:pPr>') { $pPr = $matches[0] }
  # <w:tabs> precede <w:ind> nell'ordine previsto dallo schema OOXML.
  $tabs = '<w:tabs><w:tab w:val="right" w:pos="' + $TAB_DESTRA + '" /></w:tabs>'
  if ($pPr -ne '') {
    $pPr = $pPr -replace '^<w:pPr>', ('<w:pPr>' + $tabs)
  } else {
    $pPr = '<w:pPr>' + $tabs + '</w:pPr>'
  }
  $rprEt = Get-Rpr $p $runEtichetta
  $rprIm = Get-Rpr $p $runImporto
  $e = [System.Security.SecurityElement]::Escape($etichetta)
  $i = [System.Security.SecurityElement]::Escape($importo)
  '<w:p>' + $pPr +
    '<w:r>' + $rprEt + '<w:t xml:space="preserve">' + $e + '</w:t></w:r>' +
    '<w:r>' + $rprEt + '<w:tab /></w:r>' +
    '<w:r>' + $rprIm + '<w:t xml:space="preserve">' + $i + ' Euro</w:t></w:r>' +
  '</w:p>'
}

# ── lettura del master ───────────────────────────────────────────────────────
$zip = [System.IO.Compression.ZipFile]::OpenRead($Master)
$parti = @{}
foreach ($e in $zip.Entries) {
  $ms = New-Object System.IO.MemoryStream
  $s = $e.Open(); $s.CopyTo($ms); $s.Close()
  $parti[$e.FullName] = $ms.ToArray()
}
$zip.Dispose()

$utf8 = New-Object System.Text.UTF8Encoding($false)
$xml = $utf8.GetString($parti['word/document.xml'])

# ── che cosa diventa ogni paragrafo ──────────────────────────────────────────
# Gli indici vengono dalla lettura del master: vedi README.
$testi = @{
   0 = '{{ data }}'                                    #  data, nella casella di testo
   1 = '{{ data }}'                                    #  data, copia di ripiego
   2 = '{{ cliente_ragione_sociale }}'
   3 = '{%p for riga in cliente_indirizzo %}'
   4 = '{{ riga }}'
   5 = '{%p endfor %}'
   6 = ''                                              #  la riga fiscale entra nell'indirizzo
   9 = '{{ brand }}'
  10 = '{{ sito }}'
  14 = 'Invoice No. {{ numero }}'
  15 = '{%p if po %}'
  16 = 'PO: {{ po }}'
  17 = '{%p endif %}'
  19 = 'Description of service provided: {{ oggetto }}'
  22 = '{%p for v in voci %}'
  24 = '{%p endfor %}'
  27 = '{%p for t in totali %}'
  29 = '{%p endfor %}'
  32 = 'Payment Terms: {{ termini }}'
  33 = '{%p if scadenza %}'
  34 = 'Due by: {{ scadenza }}'
  35 = '{%p endif %}'
}

# Si procede dal fondo: sostituendo dall'inizio, gli offset dei paragrafi
# successivi slitterebbero a ogni modifica.
$ps = Get-Paragrafi $xml
$indici = @(23, 28) + $testi.Keys
$indici = $indici | Sort-Object -Descending -Unique

foreach ($i in $indici) {
  if ($i -ge $ps.Count) { throw "Il master non ha un paragrafo ${i}: e' cambiato." }
  $vecchio = $ps[$i].Value
  if ($i -eq 23) {
    $nuovo = New-RigaImporto $vecchio 0 6 '{{ v.descrizione }}' '{{ v.importo }}'
  } elseif ($i -eq 28) {
    $nuovo = New-RigaImporto $vecchio 5 17 '{{ t.etichetta }}' '{{ t.importo }}'
  } else {
    $script:primo = $true
    $nuovo = Set-TestoParagrafo $vecchio $testi[$i]
  }
  $xml = $xml.Substring(0, $ps[$i].Index) + $nuovo + $xml.Substring($ps[$i].Index + $ps[$i].Length)
}

$parti['word/document.xml'] = $utf8.GetBytes($xml)

# ── scrittura ────────────────────────────────────────────────────────────────
if (Test-Path $Out) { Remove-Item $Out }
$fs = [System.IO.File]::Open($Out, [System.IO.FileMode]::CreateNew)
$za = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($nome in $parti.Keys) {
  $voce = $za.CreateEntry($nome, [System.IO.Compression.CompressionLevel]::Optimal)
  $s = $voce.Open(); $s.Write($parti[$nome], 0, $parti[$nome].Length); $s.Close()
}
$za.Dispose(); $fs.Close()

"Scritto: $Out ($((Get-Item $Out).Length) byte)"
