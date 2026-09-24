-- ═══════════════════════════════════════════════════════════════════════════
-- I tre contratti Boucheron valgono quanto dice l'amministrazione
--
-- Cannes 12.000, Geneva 7.300, Monaco 8.500. A database valevano 9.000, 6.000
-- e 7.500, e la differenza non era un errore di calcolo: era una supposizione.
-- Le tranche erano state costruite come 50/50 su 6.000 perche' il primo
-- incasso era di 3.000 e 3.000 sembrava la meta' di qualcosa. Non lo era:
-- e' un anticipo fisso, lo stesso su tutte e tre le boutique, e il contratto
-- dietro e' piu' grande.
--
-- Vendome resta 50/50 su 16.900, perche' li' lo e' davvero: primo incasso
-- 8.450, esattamente la meta'.
--
-- Il residuo non lo sommo dentro una tranche esistente. Gonfiare il «saldo al
-- primo dato» da 3.000 a 6.000 farebbe sparire la differenza dentro un numero
-- che sembrerebbe sempre stato quello, e nessuno saprebbe piu' che c'e' una
-- parte di contratto di cui non conosciamo ne' la scadenza ne' il documento.
-- Diventa una riga sua, senza data, che si vede e chiede di essere deciso.
--
-- Nota su quando: il planning dell'amministrazione mette in settimana 41 solo
-- 3.000 per Cannes e 3.000 per Monaco, e parcheggia il resto senza data. Il
-- database invece considera il saldo esigibile perche' la milestone «primo
-- dato» e' chiusa (installazione 09/09/2026, online) e calcola installazione
-- + 30 giorni. Le due letture divergono sulla data, non sull'importo: resta
-- da stabilire quale delle due valga.
--
-- Non toccato: gli incassi. Il foglio dice 3.000 incassati anche su Geneva,
-- il database no, e le date Boucheron a database (19/04/2025 su tre progetti
-- diversi) non sono quattro bonifici. Serve l'estratto conto, non una
-- supposizione in piu'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le percentuali che non sono percentuali ────────────────────────────────
-- 3.000 su 12.000 non e' il 50%, e l'interfaccia scrive il badge «(50%)»
-- accanto all'importo. Meglio nessuna percentuale che una falsa: questi sono
-- importi fissi concordati, non quote di un totale.
update public.cert_payment_milestones t
   set tranche_pct = null,
       name = case t.tranche_order
                when 1 then 'Anticipo all''ordine hardware'
                when 2 then 'Saldo al primo dato'
                else t.name
              end
 where t.certification_id in (
         select id from public.certifications
          where name in ('Cannes, La Croisette','Geneva, Rue du Rhône','Monaco One')
            and cert_type = 'Energy'
       )
   and t.tranche_order in (1, 2);

-- ── Il residuo di contratto, una riga per progetto ────────────────────────
with atteso(progetto, totale) as (values
  ('Cannes, La Croisette', 12000.00),
  ('Geneva, Rue du Rhône',  7300.00),
  ('Monaco One',            8500.00)
), conto as (
  select c.id as cert_id, a.totale,
         coalesce(sum(m.amount), 0) as ora,
         coalesce(max(m.tranche_order), 0) as ultimo
    from atteso a
    join public.certifications c on c.name = a.progetto and c.cert_type = 'Energy'
    left join public.cert_payment_milestones m on m.certification_id = c.id
   group by c.id, a.totale
)
insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state, tranche_pct, tranche_order,
   trigger_event, data_prevista, data_prevista_fonte, data_evento, data_evento_fonte)
select cert_id, 'Residuo di contratto · da pianificare', totale - ora,
       'Pending', 'pending', null, ultimo + 1,
       'manual_sal', null, 'senza_data', null, 'senza_data'
  from conto
 where totale - ora > 0;
