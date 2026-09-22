-- ═══════════════════════════════════════════════════════════════════════════
-- Le commesse che conosciamo al 21 settembre 2026.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.commesse
  (nome, brand_id, servizio, anno, valore_dichiarato, contratto_cliente, stato, note)
values
  ('Fendi Energy 2024',
   (select id from public.brands where name = 'FENDI'),
   'energy', 2024, 355150.00, '60/40', 'aperta',
   'Valore dal foglio del 21/09/2026: 337.150 sul lotto principale piu 18.000 sul lotto Fendi Red (ZLAN).'),

  ('Boucheron Energy 2025',
   (select id from public.brands where name = 'BOUCHERON'),
   'energy', 2025, 34900.00, '50/50', 'aperta',
   'Quattro progetti fatturabili. Old Bond Street e Shanghai Bund 18 dentro la commessa ma ferme: non concorrono al valore.'),

  ('Lucan Lodge',
   null, 'air', 2026, 13800.00, null, 'aperta',
   '60 monitor CO2. In database il sito esiste in due copie che restano separate fino al merge: la certificazione pero e una sola.'),

  ('Viale Richard 1',
   null, 'air', 2026, null, null, 'aperta',
   'Valore da completare: in database risultano i soli 60 CO2 per 13.800, mancano i 42 CO-CO2. Incassati 17.000, quindi il valore vero e almeno quello.')
on conflict (nome) do nothing;

-- ── I progetti dentro le commesse ──────────────────────────────────────────
-- Fendi: tutte le certificazioni Energy del brand che hanno tranche, meno
-- Palazzo della Civilta, che appartiene a un'altra commessa.
insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Fendi Energy 2024'), c.id
from public.certifications c
join public.sites si on si.id = c.site_id
join public.brands b on b.id = si.brand_id
where b.name = 'FENDI'
  and c.cert_type = 'Energy'
  and c.name not ilike 'Rome%Civilt%'
  and exists (select 1 from public.cert_payment_milestones m where m.certification_id = c.id)
on conflict do nothing;

-- Boucheron: tutte e sei, comprese le due ferme.
insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Boucheron Energy 2025'), c.id
from public.certifications c
join public.sites si on si.id = c.site_id
join public.brands b on b.id = si.brand_id
where b.name = 'BOUCHERON' and c.cert_type = 'Energy'
on conflict do nothing;

insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Lucan Lodge'),
       '0f7fc48b-89a3-4c07-af3c-d3047e4a0bf5'
on conflict do nothing;

insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Viale Richard 1'), c.id
from public.certifications c where c.name = 'Viale Richard 1'
on conflict do nothing;

-- ── Le uscite che hanno una commessa sola ──────────────────────────────────
update public.uscite_previste u
   set commessa_id = (select id from public.commesse where nome = 'Fendi Energy 2024')
 where u.commessa_etichetta = 'Fendi Energy 2024';

-- Le altre restano senza commessa, e con la loro etichetta come promemoria:
--   Richard/Lucan Lodge · una fattura FoSensor che serve due commesse
--   LEED/WELL           · un perimetro che non e ancora una commessa
--   KEYE, Energy monitor· sviluppo e stampi, non legati a un cliente
--
-- Verifica dopo il caricamento — dichiarato contro somma delle tranche:
--   Boucheron Energy 2025 ·  34.900 =  34.900 · quadra
--   Fendi Energy 2024     · 355.150 vs 347.100 · scarto 8.050, cioe Bicester
--                           (6.550) piu Fendi Red Milano Galleria (1.500)
--   Lucan Lodge           ·  13.800 vs   9.600 incassati
--   Viale Richard 1       ·  da dichiarare, 17.000 gia incassati
