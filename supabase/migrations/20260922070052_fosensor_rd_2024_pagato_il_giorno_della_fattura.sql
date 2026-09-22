-- Il foglio non riportava la data di pagamento della fee R&D e stampi del
-- primo ordine, e l'avevo lasciata in previsione. Confermato: pagata il
-- 21/10/2024, lo stesso giorno della fattura. Diventa cassa reale.
update public.uscite_previste
   set stato = 'pagata',
       data_prevista_fonte = 'reale',
       note = 'Cambio CNY/EUR fissato a 0,129 in mancanza del cambio di giornata. Pagata il giorno della fattura.'
 where riferimento = '241021FS01'
   and descrizione = 'Fattura 241021FS01 · R&D e stampi';
