-- Sulla 260901FS02 la nota lasciava scoperti 3.108,50 RMB e avevo dedotto che
-- fossero di Richard, scalando la sua quota del 30% sul 40%. La tabella
-- consolidata dice altro: Richard resta a 9.325,50 e la differenza e' non
-- allocata, come sull'ordine del 17/04. Vince il foglio.
update public.uscite_previste
   set importo = 9325.50,
       note = 'Quanto di quella fattura compete a questo progetto. Quota dichiarata dal foglio, non proporzionale al 40%: la differenza e non allocata.'
 where riferimento = '260901FS02'
   and descrizione like 'Quota %'
   and commessa_etichetta = 'Viale Richard 1';

insert into public.uscite_previste
  (supplier_id, corsia, natura, commessa_etichetta,
   riferimento, descrizione, importo, valuta, cambio,
   data_prevista, data_prevista_fonte, stato, note)
select
  (select id from public.suppliers where name = 'FoSensor'),
  'merce', 'cassa', 'Non allocato',
  '260901FS02', 'Quota 260901FS02 · 40% prima della spedizione',
  3108.50, 'CNY', 0.129,
  date '2026-10-10', 'stima', 'prevista',
  'Parte della fattura non attribuita a nessun progetto.'
where not exists (
  select 1 from public.uscite_previste u
   where u.riferimento = '260901FS02' and u.commessa_etichetta = 'Non allocato'
);
