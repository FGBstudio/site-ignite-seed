-- Due marcatori per lo stesso fatto, e non erano d'accordo: alcune tranche
-- avevano una data di emissione fattura ma risultavano ancora «pending».
-- Se una fattura e' stata emessa, la tranche e' fatturata — il campo data dice
-- quando, non se. Allineati, cosi' il conteggio del fatturato non dipende piu'
-- da quale dei due si guarda.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

update public.cert_payment_milestones
   set tranche_state = 'invoiced'
 where invoice_sent_date is not null
   and tranche_state <> 'invoiced';

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;
