-- Il Monitor Hub mostra il nome della CERTIFICATION (useAirRows: cert.name || site.name).
-- Dopo la deduplica il progetto appariva come "Diamon Tower" (refuso incluso):
-- si allinea al nome del sito, come richiesto.
UPDATE public.certifications
   SET name = 'Boucheron Taiwan Diamond Tower', updated_at = now()
 WHERE id = '428552aa-f739-40bd-a3c3-d2f39b9e6313'
   AND name = 'Diamon Tower';
