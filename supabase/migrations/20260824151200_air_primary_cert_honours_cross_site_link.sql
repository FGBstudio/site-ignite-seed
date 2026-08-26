-- La certification "principale" di un sito serve ad attribuire i dispositivi
-- alla riga aria giusta. La versione precedente guardava solo alle
-- certification del sito stesso, e per i siti che non ne hanno restituiva NULL:
-- gli agganci fatti a mano da un sito all'altro sparivano.
--
-- Il COALESCE finale recupera quel caso: se il sito non ha certification
-- proprie ma porta una sola riga aria gia' agganciata a una certification
-- altrove, quella e' la sua.
CREATE OR REPLACE FUNCTION public.fn_air_primary_cert(p_site_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT c.id
      FROM public.certifications c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n_air
        FROM public.project_allocations pa
        LEFT JOIN public.products p ON p.id = pa.product_id
        WHERE pa.certification_id = c.id
          AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
          AND (
            pa.category = 'AIR' OR p.category = 'AIR'
            OR pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
            OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'
          )
      ) alloc ON true
      WHERE c.site_id = p_site_id
        AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
      ORDER BY
        (alloc.n_air > 0) DESC,
        COALESCE(c.has_iaq_monitoring, false) DESC,
        (COALESCE(btrim(c.name), '') <> '') DESC,
        c.created_at DESC
      LIMIT 1
    ),
    (
      SELECT x.certification_id
      FROM (
        SELECT r.certification_id, COUNT(*) OVER () AS n
        FROM public.site_air_records r
        WHERE r.site_id = p_site_id
          AND r.certification_id IS NOT NULL
      ) x
      WHERE x.n = 1
    )
  );
$function$;
