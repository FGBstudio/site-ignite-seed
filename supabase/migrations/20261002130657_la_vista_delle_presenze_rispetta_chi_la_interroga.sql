-- ═══════════════════════════════════════════════════════════════════════════
-- La vista delle presenze rispetta chi la interroga
--
-- `v_hr_giornata_effettiva` è nata senza `security_invoker`, e una vista senza
-- quell'opzione legge con i privilegi di chi l'ha creata: `postgres`, che le RLS
-- non le vede. Significava che chiunque, compreso `anon`, poteva leggere le
-- presenze e le disponibilità di tutti passando dalla vista invece che dalle
-- tabelle — che sono protette.
--
-- `v_hr_giornate` ce l'ha da sempre. Questa è la stessa cosa e deve comportarsi
-- allo stesso modo: chi interroga vede quello che le sue policy gli permettono di
-- vedere, e il perimetro resta deciso dal database in un punto solo.
-- ═══════════════════════════════════════════════════════════════════════════

alter view public.v_hr_giornata_effettiva set (security_invoker = on);
