-- ═══════════════════════════════════════════════════════════════════════════
-- La quota «hardware non agganciato» si deriva, non si scrive
--
-- L'avevo calcolata una volta sola, come differenza fra il totale hardware di
-- commessa e quanto era gia' finito in cassa. Due difetti, tutti e due miei:
--
--  · il numero restava fermo mentre la cassa cresceva. Su Fendi Energy 2024 la
--    riga diceva 17.459 quando il conto giusto era 17.377, e la somma col
--    contante dava 44.979 invece dei 44.993 veri;
--  · sottraeva due importi in euro convertiti con cambi diversi — la tabella
--    energia usa 0,8498, le uscite il cambio del singolo ordine — e la
--    differenza fra due conversioni diverse degli stessi dollari non e' un
--    residuo, e' rumore. Su Boucheron veniva addirittura negativa.
--
-- La definizione giusta e' diretta e non sottrae niente: il residuo e'
-- l'hardware dei progetti che non hanno ancora un `po_number`. Va a zero da
-- solo quando ogni progetto sa da quale ordine e' uscito.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_allinea_quote_hardware_energy()
returns table(commessa text, progetti_senza_po integer, residuo_eur numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centrica uuid;
begin
  select id into v_centrica from public.suppliers where name = 'Centrica';

  -- Si rifanno solo le righe che ha scritto questa funzione, riconoscibili
  -- dal riferimento. Nulla di battuto a mano viene toccato.
  delete from public.uscite_previste
   where natura = 'quota'
     and riferimento in ('Ordini Centrica', 'Hardware senza PO');

  insert into public.uscite_previste (
    supplier_id, corsia, commessa_id, commessa_etichetta, riferimento,
    descrizione, importo, valuta, cambio, natura, stato,
    data_prevista, data_prevista_fonte, note
  )
  select
    v_centrica, 'merce', k.id, k.nome, 'Hardware senza PO',
    'Hardware energy non ancora agganciato a un ordine',
    -round(sum(e.total_package_cost_eur), 2),
    'EUR', 1, 'quota', 'prevista',
    coalesce(
      (select max(x.data_prevista) from public.uscite_previste x
        where x.commessa_id = k.id and x.note like 'Ripartizione da tabella energy%'),
      current_date),
    'stima',
    'Derivata: somma del costo hardware dei progetti di questa commessa che non dichiarano un PO. '
      || 'Va a zero quando ogni progetto sa da quale ordine e'' uscito. Il fornitore e'' indicativo: '
      || 'questa riga e'' una quota, non la fattura di nessuno.'
    from public.commesse k
    join public.commessa_progetti cp on cp.commessa_id = k.id
    join public.site_energy_records e on e.certification_id = cp.certification_id
   where e.po_number is null
     and coalesce(e.total_package_cost_eur, 0) > 0
   group by k.id, k.nome
  having round(sum(e.total_package_cost_eur), 2) > 0;

  return query
  select k.nome,
         count(*) filter (where e.po_number is null and coalesce(e.total_package_cost_eur,0) > 0)::integer,
         round(coalesce(sum(e.total_package_cost_eur) filter (where e.po_number is null), 0), 2)
    from public.commesse k
    join public.commessa_progetti cp on cp.commessa_id = k.id
    join public.site_energy_records e on e.certification_id = cp.certification_id
   group by k.id, k.nome
  having round(coalesce(sum(e.total_package_cost_eur) filter (where e.po_number is null), 0), 2) > 0
   order by 3 desc;
end;
$$;

comment on function public.fn_allinea_quote_hardware_energy() is
  'Rifa'' le quote «hardware senza PO»: una per commessa, pari al costo dei progetti che non dichiarano un ordine.';

select public.fn_allinea_quote_hardware_energy();
