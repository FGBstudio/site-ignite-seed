-- Disponibilita' 2026 dell'ufficio italiano, dal file "FGB ITA_ Availability 2026.xlsx".
--
-- Legenda del foglio, unificata con quella dichiarata in riga 2:
--   O  Office          -> office
--   S  Smart working   -> smart_working
--   U  Unavailable     -> unavailable
--   T  Business Travel -> travel
--   M  Sick leave      -> sick
--   H  Holidays        -> vacation
--   Pp Personal Permit -> il numero che segue sono le ore. Da mezza giornata in
--                         su (>= 4h) e' un'assenza vera e diventa 'permit', che
--                         nella Saturation Matrix toglie la persona dalla
--                         pianificazione; sotto le 4h la persona lavora comunque,
--                         quindi resta 'office' con le ore annotate.
--
-- Non entrano: Landro Filippo, Matarazzo Luca e De Prisco Cristina, usciti
-- dall'azienda, e la riga "H" del foglio di agosto, che porta i totali di colonna
-- e non e' una persona.
--
-- Le persone si agganciano per email e non per nome: il file scrive "Cognome Nome"
-- mentre l'anagrafica tiene "Nome Cognome".
--
-- Il file copre 253 giorni, gli stessi per tutte e 11 le persone, e coincidono
-- esattamente con i feriali del 2026 meno le otto feste infrasettimanali (le sei
-- nazionali piu' Sant'Ambrogio e l'Immacolata, che a Milano chiudono l'ufficio).
-- Qui sotto quindi il calendario si genera, e si elencano solo le eccezioni:
-- ogni giorno che non compare e' presenza in ufficio.

create temporary table _cal (giorno date primary key) on commit drop;
insert into _cal (giorno)
select d::date
  from generate_series('2026-01-01'::date, '2026-12-31'::date, interval '1 day') d
 where extract(isodow from d) <= 5
   and d::date not in ('2026-01-01','2026-01-06','2026-04-06','2026-05-01',
                       '2026-06-02','2026-12-07','2026-12-08','2026-12-25');

create temporary table _ecc (
  email  text not null,
  status public.hr_availability_status not null,
  ore    numeric,
  nota   text,
  giorni date[] not null
) on commit drop;
insert into _ecc (email, status, ore, nota, giorni) values
  ('a.berdin@fgb-studio.com','office',1,'Pp1','{2026-03-27,2026-06-25}'),
  ('a.berdin@fgb-studio.com','office',2,'Pp2','{2026-03-25,2026-05-13,2026-05-29,2026-06-17,2026-06-24,2026-07-14}'),
  ('a.berdin@fgb-studio.com','permit',8,'Pp8','{2026-12-04,2026-12-09,2026-12-10,2026-12-11,2026-12-14,2026-12-15}'),
  ('a.berdin@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-06-01,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21,2026-12-16,2026-12-17,2026-12-18,2026-12-21,2026-12-22,2026-12-23,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('a.berdin@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('a.isaac@fgb-studio.com','office',1,'Pp1','{2026-01-26,2026-02-10,2026-04-03}'),
  ('a.isaac@fgb-studio.com','permit',8,'Pp8','{2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21}'),
  ('a.isaac@fgb-studio.com','sick',null,null,'{2026-01-20,2026-01-21,2026-02-16,2026-02-17,2026-03-18,2026-03-19,2026-04-17,2026-05-18,2026-05-19,2026-06-15,2026-06-16,2026-08-24}'),
  ('a.isaac@fgb-studio.com','smart_working',null,null,'{2026-01-09,2026-01-14,2026-01-28,2026-02-04,2026-02-11,2026-02-18,2026-02-25,2026-03-04,2026-03-11,2026-03-25,2026-04-01,2026-04-08,2026-04-15,2026-04-22,2026-04-29,2026-05-07,2026-05-13,2026-05-20,2026-05-27,2026-06-03,2026-06-10,2026-06-17,2026-06-24,2026-07-01,2026-07-08,2026-08-26,2026-09-02,2026-09-09,2026-09-16,2026-09-23,2026-09-30,2026-10-07,2026-10-14,2026-10-21,2026-10-28,2026-11-04,2026-11-11,2026-11-18,2026-11-25,2026-12-02,2026-12-09,2026-12-16,2026-12-23}'),
  ('a.isaac@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-01-07,2026-03-16,2026-06-01,2026-07-13,2026-07-14,2026-07-15,2026-07-16,2026-07-17,2026-07-20,2026-07-21,2026-07-22,2026-07-23,2026-07-24,2026-07-27,2026-07-28,2026-07-29,2026-07-30,2026-07-31,2026-08-03,2026-08-04,2026-08-05,2026-08-06,2026-08-07,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('a.isaac@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('c.ferrante@fgb-studio.com','office',1,'Pp1','{2026-08-17}'),
  ('c.ferrante@fgb-studio.com','office',2,'Pp2','{2026-03-13,2026-04-22,2026-04-30}'),
  ('c.ferrante@fgb-studio.com','office',3,'Pp3','{2026-02-02}'),
  ('c.ferrante@fgb-studio.com','permit',4,'Pp4','{2026-05-22}'),
  ('c.ferrante@fgb-studio.com','permit',8,'Pp8','{2026-05-29,2026-09-04,2026-09-22}'),
  ('c.ferrante@fgb-studio.com','sick',null,null,'{2026-02-03,2026-02-04,2026-02-19,2026-05-12,2026-06-05,2026-07-13}'),
  ('c.ferrante@fgb-studio.com','travel',null,null,'{2026-02-13}'),
  ('c.ferrante@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-03-16,2026-03-17,2026-04-01,2026-04-02,2026-04-03,2026-05-04,2026-06-01,2026-06-03,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-06,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('c.ferrante@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-09-21}'),
  ('e.donadello@fgb-studio.com','office',1,'PP1','{2026-07-09}'),
  ('e.donadello@fgb-studio.com','office',3,'PP3','{2026-07-31}'),
  ('e.donadello@fgb-studio.com','office',3,'Pp3','{2026-11-09}'),
  ('e.donadello@fgb-studio.com','permit',4,'Pp4','{2026-06-10}'),
  ('e.donadello@fgb-studio.com','permit',8,'Pp8','{2026-08-03,2026-08-04}'),
  ('e.donadello@fgb-studio.com','sick',null,null,'{2026-02-27,2026-03-02,2026-03-03,2026-07-06,2026-07-07}'),
  ('e.donadello@fgb-studio.com','smart_working',null,null,'{2026-01-07,2026-01-14,2026-01-21,2026-01-28,2026-02-04,2026-02-11,2026-02-18,2026-02-25,2026-03-04,2026-03-11,2026-03-18,2026-03-25,2026-04-01,2026-04-08,2026-04-15,2026-04-22,2026-04-29,2026-05-06,2026-05-13,2026-05-20,2026-05-27,2026-06-17,2026-06-24,2026-06-25,2026-07-15,2026-07-22,2026-07-29,2026-08-19,2026-08-26,2026-09-02,2026-09-09,2026-09-16,2026-09-23,2026-09-30,2026-10-07,2026-10-14,2026-10-21,2026-10-28,2026-11-04,2026-11-11,2026-11-18,2026-11-25,2026-12-02,2026-12-09,2026-12-16,2026-12-23}'),
  ('e.donadello@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-05-29,2026-06-01,2026-06-03,2026-06-04,2026-06-05,2026-06-08,2026-06-09,2026-06-23,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('e.donadello@fgb-studio.com','vacation',null,null,'{2026-08-05,2026-08-06,2026-08-07,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-09-21}'),
  ('k.cardoso@fgb-studio.com','office',1,'Pp1','{2026-03-02,2026-06-05}'),
  ('k.cardoso@fgb-studio.com','office',2,'Pp2','{2026-05-26}'),
  ('k.cardoso@fgb-studio.com','office',3,'Pp3','{2026-05-07}'),
  ('k.cardoso@fgb-studio.com','office',3.5,'P3.5','{2026-03-06}'),
  ('k.cardoso@fgb-studio.com','permit',4,'PP4','{2026-07-10,2026-07-28}'),
  ('k.cardoso@fgb-studio.com','permit',4,'Pp4','{2026-02-11,2026-06-23}'),
  ('k.cardoso@fgb-studio.com','permit',8,'PP8','{2026-07-31}'),
  ('k.cardoso@fgb-studio.com','permit',8,'Pp8','{2026-03-19}'),
  ('k.cardoso@fgb-studio.com','sick',null,null,'{2026-01-26,2026-01-27,2026-01-30,2026-05-13,2026-05-14,2026-05-15,2026-06-12}'),
  ('k.cardoso@fgb-studio.com','smart_working',null,null,'{2026-01-29,2026-03-27,2026-08-03,2026-08-04,2026-08-05,2026-08-06,2026-08-07,2026-08-24,2026-08-25,2026-08-26,2026-08-27,2026-08-28,2026-12-01,2026-12-02,2026-12-03,2026-12-04,2026-12-09,2026-12-10,2026-12-11,2026-12-14,2026-12-15,2026-12-16,2026-12-17,2026-12-18}'),
  ('k.cardoso@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-01-08,2026-01-09,2026-01-12,2026-04-02,2026-04-03,2026-04-30,2026-06-01,2026-06-30,2026-07-01,2026-07-02,2026-12-21,2026-12-22,2026-12-23,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('k.cardoso@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21}'),
  ('l.braghieri@fgb-studio.com','office',2,'Pp2','{2026-08-21}'),
  ('l.braghieri@fgb-studio.com','permit',4,'PP4','{2026-07-08}'),
  ('l.braghieri@fgb-studio.com','permit',4,'Pp4','{2026-05-06,2026-05-14,2026-05-20,2026-05-22}'),
  ('l.braghieri@fgb-studio.com','smart_working',null,null,'{2026-01-07,2026-01-08,2026-01-09,2026-01-19,2026-01-20,2026-01-21,2026-01-22,2026-01-23,2026-01-26,2026-01-27,2026-01-28,2026-01-29,2026-01-30,2026-02-02,2026-02-03,2026-02-04,2026-02-05,2026-02-06,2026-02-16,2026-02-17,2026-02-18,2026-02-19,2026-02-20,2026-03-02,2026-03-03,2026-03-04,2026-03-05,2026-03-06,2026-03-09,2026-03-10,2026-03-11,2026-03-12,2026-03-13,2026-03-16,2026-03-17,2026-03-18,2026-03-20,2026-03-23,2026-03-24,2026-03-25,2026-03-26}'),
  ('l.braghieri@fgb-studio.com','travel',null,null,'{2026-02-09,2026-02-10,2026-02-23,2026-02-24,2026-03-19,2026-04-14,2026-06-24,2026-06-25,2026-06-26,2026-07-13,2026-07-14,2026-07-16,2026-07-28,2026-07-29,2026-07-30,2026-08-03,2026-08-04}'),
  ('l.braghieri@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-04-03,2026-06-01,2026-06-05,2026-06-08,2026-06-09,2026-06-10,2026-06-22,2026-12-21,2026-12-22,2026-12-23,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('l.braghieri@fgb-studio.com','vacation',null,null,'{2026-07-03,2026-07-10,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('m.decarlo@fgb-studio.com','office',1,'Pp1','{2026-03-10,2026-06-22}'),
  ('m.decarlo@fgb-studio.com','office',2,'Pp2','{2026-06-18}'),
  ('m.decarlo@fgb-studio.com','permit',4,'Pp4','{2026-04-09,2026-04-29}'),
  ('m.decarlo@fgb-studio.com','permit',8,'Pp8','{2026-03-30,2026-07-10,2026-09-07,2026-09-08}'),
  ('m.decarlo@fgb-studio.com','sick',null,null,'{2026-01-15,2026-03-16,2026-03-17,2026-04-16,2026-04-17,2026-05-13,2026-05-14,2026-05-15,2026-06-09,2026-06-10}'),
  ('m.decarlo@fgb-studio.com','travel',null,null,'{2026-01-19,2026-02-11,2026-03-23,2026-04-23,2026-05-07,2026-05-25,2026-06-03,2026-06-12,2026-06-16,2026-06-23,2026-06-25,2026-07-23,2026-07-28,2026-08-05}'),
  ('m.decarlo@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-03-31,2026-04-01,2026-04-02,2026-04-03,2026-04-10,2026-06-01,2026-09-03,2026-09-04,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('m.decarlo@fgb-studio.com','vacation',null,null,'{2026-07-06,2026-07-07,2026-07-08,2026-07-09,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('m.martignoni@fgb-studio.com','office',3,'Pp3','{2026-06-05}'),
  ('m.martignoni@fgb-studio.com','permit',4,'PP4','{2026-07-31}'),
  ('m.martignoni@fgb-studio.com','permit',8,'Pp8','{2026-08-17,2026-08-18,2026-08-19,2026-12-21,2026-12-22,2026-12-23}'),
  ('m.martignoni@fgb-studio.com','smart_working',null,null,'{2026-01-07,2026-01-13,2026-01-14,2026-01-20,2026-01-21,2026-01-28,2026-01-29,2026-02-03,2026-02-04,2026-02-10,2026-02-11,2026-02-19,2026-02-20,2026-02-27,2026-03-03,2026-03-04,2026-03-10,2026-03-11,2026-03-17,2026-03-19,2026-03-24,2026-03-25,2026-03-31,2026-04-01,2026-04-08,2026-04-09,2026-04-14,2026-04-15,2026-04-23,2026-04-29,2026-05-05,2026-05-06,2026-05-13,2026-05-15,2026-05-19,2026-05-20,2026-05-26,2026-05-27,2026-06-03,2026-06-23,2026-06-24,2026-06-30,2026-07-01,2026-07-07,2026-07-08,2026-07-21,2026-07-28,2026-07-29,2026-08-05,2026-08-25,2026-08-26,2026-09-01,2026-09-02,2026-09-08,2026-09-09,2026-09-15,2026-09-16,2026-09-22,2026-09-23,2026-09-29,2026-09-30,2026-10-06,2026-10-07,2026-10-13,2026-10-14,2026-11-03,2026-11-04,2026-11-10,2026-11-11,2026-11-17,2026-11-18,2026-11-24,2026-11-25,2026-12-01,2026-12-02,2026-12-09,2026-12-15,2026-12-16}'),
  ('m.martignoni@fgb-studio.com','travel',null,null,'{2026-01-22,2026-02-23,2026-02-24,2026-04-21,2026-04-22,2026-04-28,2026-07-14,2026-07-16,2026-07-22,2026-07-23,2026-07-27,2026-08-03,2026-08-04}'),
  ('m.martignoni@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-06-01,2026-06-08,2026-06-09,2026-06-10,2026-06-11,2026-06-12,2026-06-15,2026-06-16,2026-06-17,2026-06-18,2026-06-19,2026-07-13,2026-08-07,2026-10-21,2026-10-22,2026-10-23,2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-11-02,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('m.martignoni@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('m.sundaresan@fgb-studio.com','office',0.5,'P0.5','{2026-01-12}'),
  ('m.sundaresan@fgb-studio.com','office',1,'PP1','{2026-07-07}'),
  ('m.sundaresan@fgb-studio.com','office',1,'Pp1','{2026-01-09,2026-02-06,2026-02-13,2026-02-27,2026-03-26,2026-04-20,2026-05-21}'),
  ('m.sundaresan@fgb-studio.com','office',2,'Pp2','{2026-02-03,2026-02-24,2026-07-06}'),
  ('m.sundaresan@fgb-studio.com','sick',null,null,'{2026-01-15,2026-01-16,2026-05-08,2026-06-23,2026-06-24,2026-07-28}'),
  ('m.sundaresan@fgb-studio.com','travel',null,null,'{2026-02-02}'),
  ('m.sundaresan@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-03-30,2026-04-09,2026-04-10,2026-05-29,2026-06-01,2026-06-03,2026-06-09,2026-06-30,2026-07-01,2026-07-02,2026-12-09,2026-12-10,2026-12-11,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('m.sundaresan@fgb-studio.com','vacation',null,null,'{2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14}'),
  ('m.vellutini@fgb-studio.com','permit',4,'Pp4','{2026-06-08}'),
  ('m.vellutini@fgb-studio.com','permit',8,'Pp8','{2026-09-18}'),
  ('m.vellutini@fgb-studio.com','smart_working',null,null,'{2026-01-07,2026-01-19,2026-03-30,2026-04-07,2026-04-08,2026-06-03,2026-06-04,2026-06-05,2026-08-03,2026-08-04,2026-08-05,2026-08-06,2026-08-07,2026-08-24,2026-08-25,2026-08-26,2026-08-27,2026-08-28,2026-10-05,2026-12-21,2026-12-22,2026-12-23}'),
  ('m.vellutini@fgb-studio.com','travel',null,null,'{2026-01-20,2026-01-21,2026-03-19,2026-04-09,2026-04-10,2026-04-14,2026-04-15,2026-04-16,2026-04-28,2026-04-30,2026-06-24,2026-06-25,2026-06-26}'),
  ('m.vellutini@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-05-18,2026-05-19,2026-05-20,2026-05-21,2026-05-22,2026-06-01,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('m.vellutini@fgb-studio.com','vacation',null,null,'{2026-07-20,2026-07-21,2026-07-22,2026-07-23,2026-07-24,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21}'),
  ('s.gadru@fgb-studio.com','office',1,'Pp1','{2026-03-18,2026-04-14,2026-06-08}'),
  ('s.gadru@fgb-studio.com','permit',8,'Pp8','{2026-04-27,2026-04-28,2026-08-27,2026-08-28}'),
  ('s.gadru@fgb-studio.com','smart_working',null,null,'{2026-01-07,2026-01-08,2026-01-09,2026-05-04,2026-05-05,2026-05-06,2026-05-07,2026-05-08,2026-05-11,2026-05-12,2026-05-13,2026-08-24,2026-08-25,2026-08-26,2026-12-09,2026-12-10,2026-12-11,2026-12-14,2026-12-15,2026-12-16,2026-12-17,2026-12-18,2026-12-21,2026-12-22,2026-12-23}'),
  ('s.gadru@fgb-studio.com','unavailable',null,null,'{2026-01-02,2026-01-05,2026-04-29,2026-04-30,2026-05-14,2026-05-15,2026-06-01,2026-12-24,2026-12-28,2026-12-29,2026-12-30,2026-12-31}'),
  ('s.gadru@fgb-studio.com','vacation',null,null,'{2026-08-06,2026-08-07,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21}');

create temporary table _team (email text primary key) on commit drop;
insert into _team (email) values ('a.berdin@fgb-studio.com'),('a.isaac@fgb-studio.com'),('c.ferrante@fgb-studio.com'),('e.donadello@fgb-studio.com'),('k.cardoso@fgb-studio.com'),('l.braghieri@fgb-studio.com'),('m.decarlo@fgb-studio.com'),('m.martignoni@fgb-studio.com'),('m.sundaresan@fgb-studio.com'),('m.vellutini@fgb-studio.com'),('s.gadru@fgb-studio.com');

-- Un'email che non trova il profilo e' un errore di mappatura, non un caso da
-- ignorare: meglio fermarsi che caricare un calendario a meta'.
do $$
declare v_orfane text;
begin
  select string_agg(t.email, ', ' order by t.email) into v_orfane
    from _team t left join public.profiles p on p.email = t.email
   where p.id is null;
  if v_orfane is not null then
    raise exception 'Nessun profilo per: %', v_orfane;
  end if;
end $$;

-- Il calendario del file dev'essere quello che il generatore ha ricostruito: se
-- un'eccezione cade fuori, la regola sulle feste e' sbagliata e va corretta prima
-- di caricare.
do $$
declare v_fuori integer;
begin
  select count(*) into v_fuori
    from _ecc e cross join lateral unnest(e.giorni) g(giorno)
   where not exists (select 1 from _cal c where c.giorno = g.giorno);
  if v_fuori > 0 then
    raise exception '% giorni fuori calendario', v_fuori;
  end if;
end $$;

with eccezioni as (
  select e.email, g.giorno, e.status, e.ore, e.nota
    from _ecc e cross join lateral unnest(e.giorni) g(giorno)
)
insert into public.hr_availability (user_id, date, status, hours_planned, note)
select p.id,
       c.giorno,
       coalesce(e.status, 'office'::public.hr_availability_status),
       e.ore,
       e.nota
  from _team t
  join public.profiles p on p.email = t.email
 cross join _cal c
  left join eccezioni e on e.email = t.email and e.giorno = c.giorno
on conflict (user_id, date) do update
   set status        = excluded.status,
       hours_planned = excluded.hours_planned,
       note          = excluded.note,
       updated_at    = now();
