-- ═══════════════════════════════════════════════════════════════════════════
-- Un progetto, un nome, uguale ovunque: CLIENTE CITTA Progetto
--
-- «Macau Galaxy» qui si chiamava «Taipa, Galaxy», «Shanghai - ICC - IAPM» si
-- chiamava «Shanghai, IAPM Mall». Due nomi per la stessa cosa costano tempo
-- ogni volta che si incrocia un foglio con il sistema, e prima o poi costano
-- un errore.
--
-- Il nome canonico non si scrive in colonna: si deriva dalle stesse tre
-- fonti che il Monitor gia' usa per CLIENT | CITY | PROJECT — brand, sito,
-- certificazione. Copiarlo dentro `certifications.name` lo farebbe invecchiare
-- al primo sito che cambia brand o citta', e sarebbe una bugia scritta.
--
-- Quando il nome del progetto ripete gia' la citta' («Milan, Galleria») il
-- prefisso si toglie: il risultato e' «FENDI MILAN Galleria», non
-- «FENDI MILAN Milan, Galleria».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.nome_canonico(
  p_cliente  text,
  p_citta    text,
  p_progetto text
)
returns text
language sql
immutable
as $$
  with pulito as (
    select
      nullif(btrim(p_cliente), '')  as cliente,
      nullif(btrim(p_citta), '')    as citta,
      nullif(btrim(p_progetto), '') as progetto
  ),
  senza_prefisso as (
    select cliente, citta,
      case
        when citta is not null
         and progetto ilike btrim(split_part(citta, ',', 1)) || ', %'
          then btrim(substring(progetto from length(btrim(split_part(citta, ',', 1))) + 3))
        else progetto
      end as progetto
      from pulito
  )
  select nullif(btrim(concat_ws(' ', upper(cliente), upper(citta), progetto)), '')
    from senza_prefisso;
$$;

comment on function public.nome_canonico(text, text, text) is
  'Nome univoco del progetto: CLIENTE CITTA Progetto. Derivato da brands + sites + certifications, mai memorizzato.';

-- La vista di cassa lo porta accanto al nome grezzo: il grezzo serve ancora
-- per gli abbinamenti, il canonico e' quello che si legge.
create or replace view public.v_cash_events as
 SELECT t.id,
    'entrata'::text AS verso,
    'cliente'::text AS corsia,
    'Ciclo attivo'::text AS gruppo,
    t.data_prevista AS data,
    date_trunc('week'::text, t.data_prevista::timestamp with time zone)::date AS settimana,
    t.data_evento,
    t.invoice_sent_date AS data_documento,
    t.amount AS importo_eur,
    t.amount AS importo_valuta,
    'EUR'::text AS valuta,
    1::numeric AS cambio,
        CASE t.data_prevista_fonte
            WHEN 'incasso'::text THEN 'reale'::text
            WHEN 'scadenza_fattura'::text THEN 'contrattuale'::text
            WHEN 'pagamento_previsto'::text THEN 'contrattuale'::text
            WHEN 'fattura_emessa'::text THEN 'contrattuale'::text
            WHEN 'da_evento'::text THEN 'prevista'::text
            WHEN 'da_evento_stimato'::text THEN 'stimata'::text
            ELSE NULL::text
        END AS certezza,
    t.data_prevista_fonte AS fonte,
    t.data_evento_fonte AS fonte_evento,
    'cassa'::text AS natura,
    COALESCE(k.categoria, 'Non attribuite'::text) AS categoria,
    k.id AS commessa_id,
    COALESCE(k.nome, c.name) AS commessa,
    c.id AS certification_id,
    c.name AS progetto,
    b.name AS brand,
    b.name AS brand_progetto,
    si.city AS citta,
    t.name AS etichetta,
    NULL::text AS riferimento,
    t.tranche_state AS stato,
    t.tranche_order AS ordine_tranche,
    'tranche'::text AS origine,
    cp.sottogruppo,
    public.nome_canonico(b.name, si.city, c.name) AS progetto_canonico
   FROM cert_payment_milestones t
     JOIN certifications c ON c.id = t.certification_id
     LEFT JOIN sites si ON si.id = c.site_id
     LEFT JOIN brands b ON b.id = si.brand_id
     LEFT JOIN commessa_progetti cp ON cp.certification_id = c.id
     LEFT JOIN commesse k ON k.id = cp.commessa_id
UNION ALL
 SELECT u.id,
    'uscita'::text AS verso,
        CASE u.corsia
            WHEN 'installazione'::text THEN 'installatore'::text
            ELSE 'fornitore'::text
        END AS corsia,
        CASE u.corsia
            WHEN 'installazione'::text THEN 'Installatori'::text
            WHEN 'servizi'::text THEN 'Servizi'::text
            ELSE 'Acquisto materiali'::text
        END AS gruppo,
    u.data_prevista AS data,
    date_trunc('week'::text, u.data_prevista::timestamp with time zone)::date AS settimana,
    u.data_evento,
    u.data_documento,
    - u.importo_eur AS importo_eur,
    - u.importo AS importo_valuta,
    u.valuta,
    u.cambio,
        CASE
            WHEN u.stato = 'pagata'::text THEN 'reale'::text
            WHEN u.data_prevista_fonte = 'contratto'::text THEN 'contrattuale'::text
            WHEN u.data_prevista_fonte = 'evento'::text THEN 'prevista'::text
            WHEN u.data_prevista_fonte = 'stima'::text THEN 'stimata'::text
            ELSE NULL::text
        END AS certezza,
    u.data_prevista_fonte AS fonte,
    u.evento_innesco AS fonte_evento,
    u.natura,
    COALESCE(k.categoria, 'Non attribuite'::text) AS categoria,
    u.commessa_id,
    COALESCE(k.nome, uc.name, 'Non attribuite · '::text || COALESCE(u.commessa_etichetta, 'varie'::text)) AS commessa,
    u.certification_id,
    COALESCE(uc.name, u.commessa_etichetta) AS progetto,
    s.name AS brand,
    ub.name AS brand_progetto,
    usi.city AS citta,
    (s.name || ' · '::text) || u.descrizione AS etichetta,
    u.riferimento,
    u.stato,
    NULL::integer AS ordine_tranche,
    'uscita'::text AS origine,
    ucp.sottogruppo,
    COALESCE(public.nome_canonico(ub.name, usi.city, uc.name), u.commessa_etichetta) AS progetto_canonico
   FROM uscite_previste u
     JOIN suppliers s ON s.id = u.supplier_id
     LEFT JOIN commesse k ON k.id = u.commessa_id
     LEFT JOIN certifications uc ON uc.id = u.certification_id
     LEFT JOIN sites usi ON usi.id = uc.site_id
     LEFT JOIN brands ub ON ub.id = usi.brand_id
     LEFT JOIN commessa_progetti ucp ON ucp.certification_id = u.certification_id;
