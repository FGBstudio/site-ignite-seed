-- ═══════════════════════════════════════════════════════════════════════════
-- La targa LEED non è una fattura del monitoraggio
--
-- Nel file degli abbinamenti, su SCANDICCI – LEED Brass Plaque, Matteo ha
-- scritto: «da impostare: LEED BD+C · Platinum; + monitoraggio energia; progetto
-- da aggiornare nel database». L'import l'ha letta come una conferma di
-- abbinamento e si è fermato lì — ma era un'istruzione, e non è stata eseguita.
--
-- Il risultato: la 3.000, che paga «LEED Brass Plaque 40mm, black burnished», è
-- attaccata al **progetto di monitoraggio energia**, l'unico che esisteva su quel
-- sito. Mille euro di una certificazione LEED finiti nel conto del monitoraggio:
-- esattamente l'errore che su tutti gli altri gruppi ho evitato lasciando il
-- progetto vuoto.
--
-- Qui il progetto LEED nasce, e la fattura si sposta su di lui (nella migrazione
-- successiva: vedi la nota lì sotto, perché questa parte non ha funzionato). Il
-- monitoraggio energia resta dov'è, come progetto suo: Matteo ha nominato due
-- cose, non una.
--
-- **La tipologia è una mia scelta, e va controllata.** So schema, rating e
-- medaglia; il catalogo non accetta la combinazione senza tipologia. Ho preso New
-- Construction e non Core & Shell perché è l'immobile che il marchio usa, non uno
-- da mettere a reddito. Sta scritto nelle note del progetto.
-- ═══════════════════════════════════════════════════════════════════════════

with sito as (
  select s.id, c.client, c.region
    from public.sites s
    join public.brands b on b.id = s.brand_id
    left join public.certifications c on c.site_id = s.id and c.cert_type = 'Energy'
   where lower(s.name) = lower('Scandicci, Office') and b.name = 'JIMMY CHOO'
   limit 1
),
nato as (
  insert into public.certifications (
    site_id, cert_type, cert_rating, project_subtype, cert_level,
    name, client, status, region, quotation_notes
  )
  select s.id, 'LEED', 'BD+C', 'New Construction', 'Platinum',
         'Scandicci, Office — LEED BD+C Platinum',
         s.client, 'certificato', coalesce(s.region, 'Europe'),
         'Progetto creato dalla revisione dell''import ENTRATE su indicazione di Matteo '
         '(«da impostare: LEED BD+C · Platinum»). Tipologia scelta dall''import perché il '
         'catalogo non accetta una combinazione incompleta: da controllare.'
    from sito s
   where not exists (
     select 1 from public.certifications c
      where c.site_id = s.id and c.cert_type = 'LEED'
   )
  returning id
)
update public.invoices f
   set certification_id = (
     select c.id from public.certifications c
      join public.sites s on s.id = c.site_id
      join public.brands b on b.id = s.brand_id
     where lower(s.name) = lower('Scandicci, Office')
       and b.name = 'JIMMY CHOO' and c.cert_type = 'LEED'
     limit 1
   )
 where f.number = '3.000'
   and exists (select 1 from nato);
