-- Le scalette di milestone, in tabella e non in un file.
--
-- Stessa ragione del catalogo: la timeline di WELL HSR arrivera' fra una
-- settimana e dev'essere un INSERT, non un rilascio. E il generatore smette di
-- indovinare: finora sceglieva il modello con una catena di ripieghi — match
-- esatto, poi senza sottotipo, poi "fuzzy", poi il primo modello dello schema,
-- poi una scaletta generica. Dopo la conversione del vocabolario quella catena
-- avrebbe pescato la timeline sbagliata per BREEAM In-Use e per tutti i WELL.
--
-- Ogni riga e' un passo. La scadenza e' inserita dal PM oppure calcolata da
-- un'altra milestone della STESSA scaletta, riferita per numero d'ordine: cosi'
-- la regola non si rompe se un domani una voce viene rinominata.
--
-- Una milestone obbligatoria non conta mai da una opzionale. Se il re-test non
-- avviene quella data non esiste, e una scadenza che non si calcola piu' e'
-- peggio di una scadenza sbagliata.

CREATE TABLE IF NOT EXISTS public.cert_timeline_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_key text    NOT NULL,
  order_index  integer NOT NULL,
  requirement  text    NOT NULL,
  timing_kind  text    NOT NULL CHECK (timing_kind IN ('manual','calculated','derived')),
  anchor_order integer,
  offset_days  integer,
  optional     boolean NOT NULL DEFAULT false,
  -- Dove il dato esiste gia' altrove nel sistema e il PM non deve riscriverlo.
  derived_from text CHECK (derived_from IN ('handover','air_shipment','energy_shipment','first_reading')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timeline_key, order_index),
  CHECK ((timing_kind = 'calculated') = (anchor_order IS NOT NULL AND offset_days IS NOT NULL)),
  CHECK ((timing_kind = 'derived') = (derived_from IS NOT NULL))
);

ALTER TABLE public.cert_timeline_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY cert_timeline_steps_read ON public.cert_timeline_steps
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.cert_timeline_steps IS
  'Le scalette di milestone, una riga per passo, indicizzate per timeline_key — la stessa chiave che cert_catalog assegna a ogni combinazione.';
COMMENT ON COLUMN public.cert_timeline_steps.anchor_order IS
  'Il numero d''ordine, DENTRO la stessa scaletta, della milestone da cui si conta la scadenza. Per numero e non per nome: immune alle rinominazioni.';
COMMENT ON COLUMN public.cert_timeline_steps.derived_from IS
  'Il dato esiste gia'' altrove: handover dalla certificazione, spedizioni e prima lettura dalle righe monitor. Il PM la vede ma non la digita, altrimenti due verita'' divergono.';
