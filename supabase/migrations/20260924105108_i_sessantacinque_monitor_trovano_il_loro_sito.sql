-- ═══════════════════════════════════════════════════════════════════════════
-- I sessantacinque monitor trovano il loro sito
--
-- Il pezzo che conta, e il motivo per cui va fatto ora: la telemetria di questi
-- monitor STA ENTRANDO. Tre milioni di messaggi in tre giorni sul broker, e i
-- Kering fra quelli — CO2, VOC, PM, temperatura — attribuiti a «FGB Milan
-- Office», che e' il sito dove atterra chi non ha un posto assegnato.
--
-- ── LA MAPPA E' LA LEVA, NON IL SINGOLO RECORD ────────────────────────────
-- La prova sta nei numeri: dei 405 monitor aria, i 146 presenti in
-- device_provisioning_map stanno TUTTI sul loro sito, zero orfani, tutti
-- coerenti con la mappa. Dei 259 assenti, 33 sono parcheggiati su FGB Milan
-- Office — e 32 di quei 33 sono questi.
--
-- Quindi l'associazione si scrive nella mappa. Vale per i 32 gia' arrivati e per
-- i 33 che arriveranno: quando un monitor parla per la prima volta, la mappa gli
-- dice dove andare. Scrivere solo i record esistenti avrebbe sistemato meta' del
-- problema e lasciato l'altra meta' a ripetersi.
--
-- ── I 33 NON ARRIVATI NON LI INVENTO ──────────────────────────────────────
-- Un record in `devices` dice «questo apparato esiste». Per i monitor che il
-- foglio segna «to be installed» o «Pending» non e' vero, e crearli vorrebbe
-- dire mettere a database trentatre apparati spenti indistinguibili da
-- trentatre guasti. La mappa registra l'intenzione senza affermare il fatto: il
-- record nasce quando il monitor parla, e nascera' nel posto giusto.
--
-- ── DUE FAMIGLIE DI IDENTIFICATIVI ────────────────────────────────────────
-- Cinquantasei sono MAC veri, dodici caratteri esadecimali. Nove sono Kaiterra,
-- otto caratteri: non sono MAC e non vanno in mac_address, o quel campo smette
-- di voler dire una cosa sola. Restano in device_id, che e' l'identificativo
-- con cui il broker li chiama.
--
-- ── IL LUOGO PORTA L'EDIFICIO ─────────────────────────────────────────────
-- Trecate e' un sito con dentro piu' edifici, e la colonna del foglio li dice
-- gia': «B1 P3-1 - Terrace», «B2 P1», «Building A». Vanno in `location` cosi'
-- come sono — edificio, piano, stanza in una stringa — perche' separarli in tre
-- campi vorrebbe dire inventare una struttura che il dato non ha.
--
-- La telemetria storica gia' timbrata col sito sbagliato si corregge a parte:
-- messa qui dentro fa scadere la transazione, perche' la tabella grezza porta
-- milioni di righe al giorno.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _kering_monitor (
  ident   text primary key,
  sito    text not null,
  luogo   text,
  indice  text
) on commit drop;

insert into _kering_monitor (ident, sito, luogo, indice) values
 ('C4DD57B81B1B','KERING Senato','L.4.2 - Meeting room','KERING Senato351'),
 ('C4DD57B81C5B','KERING Senato','L.2.3 - Meeting room 2','KERING Senato352'),
 ('C4DD57B81C67','KERING Senato','L.2.1 - Open space','KERING Senato353'),
 ('C4DD57B81B5F','KERING Senato','L.3.11 - Meeting room','KERING Senato357'),
 ('C4DD57B81BC7','KERING Senato','L.2.5 - Meeting room 4','KERING Senato358'),
 ('C4DD57B81BDF','KERING Senato','L.4.12 - Meeting room','KERING Senato371'),
 ('C4DD57B81B17','KERING Senato','L.4.4 - Meeting room','KERING Senato372'),
 ('C4DD57B81AB7','KERING Senato','L.2.6 - Meeting room 5','KERING Senato373'),
 ('C4DD57B81ADF','KERING Senato','L.1.4 - Meeting room','KERING Senato374'),
 ('C4DD57B81B0F','KERING Senato','L.6.1 - Meeting room','KERING Senato375'),
 ('C4DD57B81AEF','Kering Scandicci','Bar','Kering Scandicci376'),
 ('C4DD57B81C73','Kering Scandicci','Mensa','Kering Scandicci377'),
 ('C4DD57B81CCB','Kering Scandicci','P2 meeting room','Kering Scandicci378'),
 ('C4DD57B81B73','Kering Scandicci','P2 Open space','Kering Scandicci379'),
 ('78E36D751417','Kering Scandicci','P3 Open space','Kering Scandicci430'),
 ('78E36D75101F','Kering Scandicci','P3 meeting room','Kering Scandicci431'),
 ('78E36D75102F','Kering Scandicci','P4 meeting room','Kering Scandicci432'),
 ('78E36D751067','Kering Scandicci','P4 Open space','Kering Scandicci433'),
 ('C4DD57B81A2F','Kering Scandicci','P5 Open space','Kering Scandicci434'),
 ('E0E2E67826F3','Kering Scandicci','P5 meeting room','Kering Scandicci435'),
 ('78E36D750C5F','KERING Trecate','B2 P1','KERING Trecate390'),
 ('78E36D750D53','KERING Trecate','B2 P1','KERING Trecate391'),
 ('78E36D7509C3','KERING Trecate','B2 P1','KERING Trecate392'),
 ('78E36D750817','KERING Trecate','B2 P1','KERING Trecate393'),
 ('78E36D750D6F','KERING Trecate','B2 P1','KERING Trecate394'),
 ('78E36D7509B3','KERING Trecate','B2 P1','KERING Trecate396'),
 ('78E36D75080F','KERING Trecate','B2 P1','KERING Trecate397'),
 ('78E36D750C23','KERING Trecate','B2 P1','KERING Trecate400'),
 ('78E36D75101B','KERING Trecate','B2 P1','KERING Trecate401'),
 ('78E36D75119B','KERING Trecate','B2 P1','KERING Trecate402'),
 ('C4DD57B81B9B','KERING Trecate','B1 P0-4 - Facility HS','KERING Trecate403'),
 ('C4DD57B81B77','KERING Trecate','B1 P3-1 - Terrace','KERING Trecate404'),
 ('C4DD57B81C33','KERING Trecate','B1 P0-3 - Costumer Centricity','KERING Trecate405'),
 ('C4DD57B81BBB','KERING Trecate','B1 P0 - Office','KERING Trecate406'),
 ('C4DD57B81BF7','KERING Trecate','B1 P0 - Co-Working','KERING Trecate407'),
 ('C4DD57B81C8B','KERING Trecate','B1 P0 - Simplicity','KERING Trecate408'),
 ('94C960191180','KERING Trecate','B2 P1','KERING Trecate409'),
 ('94B55577D3DC','KERING Trecate','B1 P1 - Tenacity','KERING Trecate739'),
 ('94B55577D1C0','KERING Trecate','B1 P1 - Jym','KERING Trecate740'),
 ('94B55577D178','KERING Trecate','B1 P1 - Audicity','KERING Trecate741'),
 ('94B55577D1D0','KERING Trecate','B1 P1 - Area Break','KERING Trecate742'),
 ('94B55577D17C','KERING Trecate','B1 P2 - Service room','KERING Trecate743'),
 ('94B55577D3E8','KERING Trecate','B1 P2 - Sustainability','KERING Trecate744'),
 ('94B55577D0E8','KERING Trecate','B1 P2 - Antincendio','KERING Trecate745'),
 ('94B55577D428','KERING Trecate','B1 P2 - Living','KERING Trecate746'),
 ('0390ec1c','KERING Trecate','Building A','KERING Trecate0390ec1c'),
 ('3d9ad096','KERING Trecate','Building A','KERING Trecate3d9ad096'),
 ('45308c89','KERING Trecate','Building A','KERING Trecate45308c89'),
 ('4dc62680','KERING Trecate','Building A','KERING Trecate4dc62680'),
 ('51ffdfff','KERING Trecate','Building A','KERING Trecate51ffdfff'),
 ('726dc9a0','KERING Trecate','Building A','KERING Trecate726dc9a0'),
 ('7c8f6d4a','KERING Trecate','Building A','KERING Trecate7c8f6d4a'),
 ('9d87c443','KERING Trecate','Building A','KERING Trecate9d87c443'),
 ('b84d9e4e','KERING Trecate','Building A','KERING Trecateb84d9e4e'),
 ('C4DD57B81A1F','Paris, Rue Monsieur','Rez de jardin - Agora 43P','Paris, Rue Monsieur420'),
 ('C4DD57B81A33','Paris, Rue Monsieur','Rez de jardin - salle de riunion 2','Paris, Rue Monsieur421'),
 ('C4DD57B81B7B','Paris, Rue Monsieur','Rez de chaussée - salle project','Paris, Rue Monsieur429'),
 ('78E36D751400','Paris, Rue Monsieur','Rez de jardin - mini Agora','Paris, Rue Monsieur437'),
 ('78E36D751434','Paris, Rue Monsieur','R+1 - bumping space','Paris, Rue Monsieur438'),
 ('78E36D751034','Paris, Rue Monsieur','Rez de jardin - salle de riunion 1','Paris, Rue Monsieur440'),
 ('78E36D751168','Paris, Rue Monsieur','Entre sol - Open space','Paris, Rue Monsieur442'),
 ('E0E2E6781F00','Paris, Rue Monsieur','Rez de chaussée - bar cafeteria','Paris, Rue Monsieur443'),
 ('94B55577D2A7','Kering Dubai',     null,'Kering Dubai634'),
 ('94B55577D27B','Kering Amsterdam', null,'Kering Amsterdam635'),
 ('94B55577D1DF','Kering San Paolo', null,'Kering San Paolo636');

-- Un controllo che vale piu' di un commento: se i conti non tornano si ferma
-- qui, invece di scrivere meta' delle righe.
do $$
declare v_n int; v_siti int;
begin
  select count(*), count(distinct sito) into v_n, v_siti from _kering_monitor;
  if v_n <> 65 then raise exception 'Attesi 65 monitor, trovati %', v_n; end if;
  if v_siti <> 7 then raise exception 'Attesi 7 siti, trovati %', v_siti; end if;
  if exists (select 1 from _kering_monitor m
              where not exists (select 1 from public.sites s where s.name = m.sito)) then
    raise exception 'Qualche monitor punta a un sito che non esiste';
  end if;
end $$;

-- ── La mappa di provisioning: vale per chi c'e' e per chi arrivera' ───────
insert into public.device_provisioning_map (device_external_id, mac_address, site_uuid, project_name)
select m.ident,
       case when m.ident ~ '^[0-9A-Fa-f]{12}$' then upper(m.ident) end,
       s.id,
       m.sito
  from _kering_monitor m
  join public.sites s on s.name = m.sito
 where not exists (
   select 1 from public.device_provisioning_map p
    where upper(p.device_external_id) = upper(m.ident)
 );

-- ── I monitor gia' arrivati lasciano il parcheggio ────────────────────────
update public.devices d
   set site_id  = s.id,
       location = m.luogo,
       name     = m.sito || coalesce(' - ' || m.luogo, ' - ' || right(d.device_id, 4)),
       category = 'air_monitor',
       metadata = coalesce(d.metadata, '{}'::jsonb)
                  || jsonb_build_object('project', m.sito, 'indice_foglio', m.indice)
  from _kering_monitor m
  join public.sites s on s.name = m.sito
 where upper(d.device_id) = upper(m.ident);
