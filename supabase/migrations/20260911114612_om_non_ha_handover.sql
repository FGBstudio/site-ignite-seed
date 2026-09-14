-- Una certificazione O+M non ha una consegna.
--
-- Il vincolo pretendeva una handover_date da ogni certificazione che non fosse
-- gia' certificata, annullata o ancora potenziale. Regge per gli schemi legati
-- a un cantiere — BD+C, ID+C — dove la consegna dei lavori esiste davvero.
--
-- O+M certifica un edificio gia' in esercizio: non c'e' nessun cantiere da
-- consegnare, e la data non esiste. All'importazione degli 89 progetti O+M in
-- corso il vincolo li ha respinti, e l'alternativa sarebbe stata inventare 89
-- date di consegna per far passare un controllo: un dato falso messo li' per
-- non discutere con una regola sbagliata.
--
-- Si corregge la regola. Il vincolo continua a valere dove ha senso.

alter table public.certifications
  drop constraint if exists certifications_handover_date_required_by_status_chk;

alter table public.certifications
  add constraint certifications_handover_date_required_by_status_chk
  check (
    handover_date is not null
    or lower(coalesce(status, '')) = any (array['certificato', 'cancelled', 'canceled', 'pending', 'potential'])
    or cert_rating = 'O+M'
  );
