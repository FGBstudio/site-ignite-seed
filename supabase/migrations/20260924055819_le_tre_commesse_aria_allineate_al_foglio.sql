-- ═══════════════════════════════════════════════════════════════════════════
-- Le tre commesse Aria dove foglio e database non dicevano lo stesso
--
-- Confronto col planning settimanale: Lucan Lodge e Casing Kering tornavano
-- da sole, tre no. Decisioni prese una per una, perche' la ragione sta da
-- parti diverse.
--
-- RICHARD — incasso dal foglio, costi dal database.
--   Il database registrava 17.000 con una nota che ammetteva di non sapere:
--   «valore da completare, incassati 17.000, quindi il valore vero e' almeno
--   quello». Erano 19.900. L'importo lo sa l'amministrazione, non il
--   database, e questa e' la volta in cui il foglio vince.
--   I costi restano i 6.299,79 del database: sono le sei condizioni di due
--   ordini FoSensor, tre gia' fatturate e ricevute (250902FS01, 250924FS01,
--   260105FS01) e tre dell'ordine 260901FS. Il foglio si fermava a 4.174,23
--   perche' non portava l'ordine del 2025 e contava invece 632,91 di R&D —
--   che sono i 5.000 CNY residui di PO-8, soldi veri ma di nessun progetto:
--   restano dove sono, non allocati.
--
-- CASING CAMPIONI KERING — 12.000 certi nell'importo, ignoti nella data.
--   Erano gia' senza data e ci restano. Lo scrivo nella nota perche' una
--   tranche senza scadenza sembra una dimenticanza, e il prossimo che passa
--   e' tentato di inventarne una: finirebbe in una settimana a caso e
--   sposterebbe un saldo cumulato di 12.000 euro.
--
-- RIPA89 — vale il database.
--   Il foglio si fermava al 70% (acconto + pre-spedizione). L'impegno col
--   fornitore e' del 100%: il 30% finale, 142,40, e' dovuto anche se non e'
--   ancora scaduto. Un costo non scade quando fa comodo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Richard: l'incasso vero ────────────────────────────────────────────────
update public.cert_payment_milestones t
   set amount = 19900.00
 where t.amount = 17000.00
   and t.certification_id in (
     select cp.certification_id
       from public.commessa_progetti cp
       join public.commesse cm on cm.id = cp.commessa_id
      where cm.nome = 'Viale Richard 1'
   );

update public.commesse
   set valore_dichiarato = 19900.00,
       note = 'Monitor CO2 e CO-CO2. Valore 19.900, incassati in un colpo il 03/08/2026: '
           || 'cifra confermata dall amministrazione, non ricostruita dal database. '
           || 'Passivo: due ordini FoSensor, il 2025 (tre condizioni gia pagate) e '
           || 'il 260901FS (tre condizioni). I 632,91 di R&D del planning sono i '
           || '5.000 CNY residui di PO-8 e restano non allocati.'
 where nome = 'Viale Richard 1';

-- ── Kering: senza data per scelta ──────────────────────────────────────────
update public.commesse
   set note = 'Offices HQ Padova, certificazioni LEED e WELL. Attivo 12.000: importo '
           || 'concordato, data no. La tranche resta senza scadenza finche il cliente '
           || 'non la fissa — non inventarne una, finirebbe in una settimana a caso '
           || 'del planning. Passivo: la sola offerta FoSensor da 600 RMB finora.'
 where nome = 'Kering Eyewear office';

-- ── Ripa89: l'impegno e' intero ────────────────────────────────────────────
update public.commesse
   set note = 'Monitor WELL. 10 unita dall ordine FoSensor del 17/04/2026. Passivo 474,67, '
           || 'tutte e tre le condizioni: il 30% finale da 142,40 e dovuto anche se '
           || 'non e ancora scaduto.'
 where nome = 'Ripa89 WELL';
