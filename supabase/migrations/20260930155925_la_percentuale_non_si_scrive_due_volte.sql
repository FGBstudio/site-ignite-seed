-- ═══════════════════════════════════════════════════════════════════════════
-- La percentuale non si scrive due volte
--
-- Il travaso componeva la descrizione come «percentuale + nome della tranche»,
-- ma i nomi delle tranche la percentuale ce l'hanno gia' dentro: ne usciva
-- «60% 60% all'ordine hardware». Su una fattura vera, stampato.
--
-- Si antepone solo quando il nome non comincia gia' con un numero seguito dal
-- segno di percento. E' una regola stupida, ma e' esattamente quella che
-- l'occhio applica leggendo.
-- ═══════════════════════════════════════════════════════════════════════════

update public.invoice_righe r
   set descrizione = btrim(
         case
           when nullif(m.name, '') ~ '^\s*\d+([.,]\d+)?\s*%' then m.name
           when m.tranche_pct is not null
             then m.tranche_pct::text || '% ' || coalesce(nullif(m.name, ''), c.name, 'Prestazione')
           else coalesce(nullif(m.name, ''), c.name, 'Prestazione')
         end)
  from public.invoices i
  left join public.cert_payment_milestones m on m.id = i.tranche_id
  left join public.certifications c on c.id = i.certification_id
 where r.invoice_id = i.id
   and i.tranche_id is not null;