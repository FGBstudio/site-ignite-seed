-- Diamond Towers stava su due siti: «Taipei, Diamond Towers» con il progetto
-- Energy e il record di monitoraggio, e «Fendi Diamonds Towers» con la sola
-- certificazione LEED. Stesso negozio, scritto in due modi.
--
-- Vince il primo, perche' e' quello a cui si appoggiano i dati: il progetto
-- Energy da 5.250 EUR e il record energia. Il LEED trasloca, il sito vuoto
-- sparisce.
update public.certifications
   set site_id = '6beecc28-2e13-485b-97f8-18d236080a32'
 where site_id = 'a74430c8-2105-4347-a999-8ba8eddc3648';

delete from public.sites
 where id = 'a74430c8-2105-4347-a999-8ba8eddc3648'
   and not exists (select 1 from public.certifications c where c.site_id = sites.id);
