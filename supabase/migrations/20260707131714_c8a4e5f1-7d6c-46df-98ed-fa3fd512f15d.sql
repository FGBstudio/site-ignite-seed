UPDATE public.certifications
SET name = trim(regexp_replace(name, '^' || client || '\s+', '', 'i'))
WHERE client IS NOT NULL
  AND client <> ''
  AND name ILIKE client || ' %';