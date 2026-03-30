-- Backfill: insert missing certifications for projects that have cert_type but no matching certification
INSERT INTO certifications (site_id, cert_type, level, status, score)
SELECT p.site_id, p.cert_type, p.cert_rating, 'in_progress', 0
FROM projects p
WHERE p.cert_type IS NOT NULL
  AND p.site_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM certifications c
    WHERE c.site_id = p.site_id
      AND c.cert_type = p.cert_type
  )