-- ═══════════════════════════════════════════════════════════════════════════
-- Cappagh, Tolstoj, Ballygunner e DiMar hanno una commessa loro
--
-- Sono progetti d'aria a se' stanti, come Greentech, Kering Eyewear o Viale
-- Richard: un sito, un cliente, un contratto. Finora comparivano solo come
-- etichetta sulle quote FoSensor, e la timeline li raccoglieva sotto «Non
-- attribuite» — che e' il posto dove finisce cio' che non ha un nome, non
-- cio' che ne ha uno proprio.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.commesse (nome, categoria, servizio, valuta, cambio_budget, termini_giorni, stato, note)
select v.nome, 'Air', 'air', 'EUR', 1, 31, 'aperta',
       'Commessa a progetto singolo. Creata separando le quote FoSensor che finivano fra le non attribuite.'
  from (values
    ('Cappagh Ratoath Road'),
    ('Tolstoj'),
    ('Ballygunner Nursing Home'),
    ('Insediamento DiMar Group')
  ) as v(nome)
 where not exists (select 1 from public.commesse k where k.nome = v.nome);

insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, c.id
  from public.commesse k
  join public.certifications c on c.name = k.nome
 where k.nome in ('Cappagh Ratoath Road','Tolstoj','Ballygunner Nursing Home','Insediamento DiMar Group')
   and not exists (
     select 1 from public.commessa_progetti cp where cp.certification_id = c.id
   );

-- Le uscite che gia' puntavano al progetto ora sanno anche a quale commessa.
update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is null;
