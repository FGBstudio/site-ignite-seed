-- ═══════════════════════════════════════════════════════════════════════════
-- La dicitura del servizio, con la sua medaglia
--
-- `cert_catalog.dicitura_fattura` porta un segnaposto: «LEED ID+C {medaglia}
-- consultancy». La medaglia non sta nel catalogo — sta sulla certificazione,
-- perché è il risultato di *quel* progetto, non una proprietà dello schema.
--
-- Questa vista le mette insieme, una riga per progetto. Serve al dialogo di
-- emissione, che così propone «50% LEED ID+C GOLD consultancy» invece del nome
-- interno della tranche («60% all'ordine hardware») — che dice *quando* si
-- fattura, non *cosa*.
--
-- Il nome della tranche resta: sulle fatture dell'archivio compare anche lui
-- («30% at the beginning»), e chi emette sceglie. Quello che non deve succedere
-- è che si scriva a mano.
--
-- `cert_level` è la medaglia, e su 112 certificazioni ci è finita in `level`
-- invece: si guardano entrambe, perché una dicitura senza medaglia — «LEED ID+C
--  consultancy» con due spazi — è peggio di una scritta a mano.
-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_dicitura_progetto as
select
  c.id as certification_id,
  c.cert_type,
  c.cert_rating,
  c.cert_level,
  c.project_subtype,
  cat.dicitura_fattura as modello,
  cat.third_party_fee_label as dicitura_fee_terzi,
  -- La medaglia sostituita, e gli spazi doppi richiusi quando non c'è.
  btrim(regexp_replace(
    replace(
      coalesce(cat.dicitura_fattura, c.cert_type),
      '{medaglia}',
      coalesce(nullif(btrim(c.cert_level), ''), '')
    ),
    '\s+', ' ', 'g'
  )) as dicitura
from public.certifications c
left join lateral (
  select cc.dicitura_fattura, cc.third_party_fee_label
    from public.cert_catalog cc
   where cc.scheme = c.cert_type
     -- Si va dal più specifico al più generico: la riga che combacia anche sulla
     -- tipologia vince su quella che combacia solo sullo schema.
     and (cc.rating_system is null or cc.rating_system = c.cert_rating)
     and (cc.typology is null or cc.typology = c.project_subtype)
   order by
     (cc.rating_system is not null and cc.rating_system = c.cert_rating) desc,
     (cc.typology is not null and cc.typology = c.project_subtype) desc,
     cc.order_index nulls last
   limit 1
) cat on true;

comment on view public.v_dicitura_progetto is
  'Come il servizio di un progetto si chiama su una fattura: il modello del catalogo con la medaglia di questa certificazione dentro.';

grant select on public.v_dicitura_progetto to authenticated;
