import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, EyeOff, RotateCcw, Target, X } from "lucide-react";
import FiltroCommesse, { type VoceCommessa } from "@/components/payments/FiltroCommesse";
import EsportaScadenzario from "@/components/payments/EsportaScadenzario";
import {
  costruisciScadenzario,
  csvScadenzario,
  nomeFile,
  type OpzioniExport,
} from "@/lib/payments/scadenzario";
import "./wbs-filtro.css";
import {
  useApprovaUscita,
  useCashEvents,
  useCommesse,
  useProgettiTempi,
  useSegnaAvvenuto,
  useSpostaMovimento,
} from "@/hooks/useCashWbs";
import { KpiCard } from "@/components/payments/Comuni";
import { cifre, importo } from "@/lib/payments/aggregati";
import {
  costruisciAlbero,
  costruisciSettimane,
  rendiconto,
  serieCommesse,
  type Aggregato,
  type Milestone,
  type Riga,
  type Settimana,
} from "@/lib/payments/wbs";
import type { CashEvent, Certezza } from "@/types/payments";

/**
 * WBS di cassa.
 *
 * Una traccia settimanale su cui stanno marker e barre, non una tabella di
 * celle. Le righe aggregate portano la striscia bianco→teal del saldo cumulato,
 * visibile anche a nodo chiuso — aprire serve a capire *perché*, non a sapere
 * *se* — e i marker ci si agganciano sotto come emanazioni, non come simboli
 * sospesi: al passaggio la linea risale dentro la striscia e scende fino alla
 * nuvoletta, che è il modo di dire «questo importo viene da qui».
 */

const WKPX = 104;

/**
 * Il contenuto di un marker.
 *
 * Forma unica per una milestone singola e per una cadenza raggruppata: il
 * marker non ha motivo di sapere quale delle due sta mostrando, e tenerlo
 * ignorante evita di scrivere due volte la stessa nuvoletta.
 */
interface DatiMarker {
  colonna: number;
  lane: string;
  importo: number;
  documentale: boolean;
  /** Una ripartizione, non un movimento: si scrive senza segno. */
  quota: boolean;
  titolo: string;
  giorno: string | null;
  riferimento: string | null;
  percorso: string | null;
  nota: string | null;
  /** Solo sulle cadenze: le voci principali e quante restano fuori. */
  voci?: Array<{ titolo: string; importo: number }>;
  altri: number;
  /** L'importo scritto accanto al gambo. Assente sui documenti. */
  valore?: string;
  /** L'importo grande dentro la nuvoletta, già scritto per esteso. */
  amt: string;
  classi: string;
}

/** Come si leggono gli importi: tutto in euro, oppure ciascuno nella valuta in
 *  cui è pattuito — incassi in euro, uscite cinesi in RMB, americane in $. */
export type ModoValuta = "euro" | "originale";

export default function WbsCassa() {
  const { data: eventi = [], isLoading } = useCashEvents();
  const { data: commesse = [] } = useCommesse();
  const { data: tempi = [] } = useProgettiTempi();

  const [aperte, setAperte] = useState<Record<string, boolean>>({
    master: true,
    "cat:Energy": true,
    "cat:Air": true,
  });
  const [scelta, setScelta] = useState<string | null>(null);
  const [finestra, setFinestra] = useState({ indietro: 4, avanti: 16 });
  const [isolata, setIsolata] = useState<string | null>(null);
  // In euro si sommano, in originale si riconoscono: «− RMB 12.434» è il
  // numero che il fornitore ha in mano, e cercarlo in euro non lo trovi.
  const [modoValuta, setModoValuta] = useState<ModoValuta>("euro");

  // La selezione vive nell'URL: una vista filtrata si può mandare a qualcuno.
  // Si salvano le *escluse* e non le incluse perché una commessa creata domani
  // deve risultare accesa, non invisibile finché qualcuno non se ne accorge.
  const [params, setParams] = useSearchParams();
  const escluse = useMemo(
    () => new Set((params.get("escludi") ?? "").split("~").filter(Boolean)),
    [params],
  );

  const cambiaFiltro = (nuove: Set<string>, iso: string | null) => {
    const p = new URLSearchParams(params);
    if (nuove.size) p.set("escludi", [...nuove].join("~"));
    else p.delete("escludi");
    setParams(p, { replace: true });
    setIsolata(iso);
  };

  // Filtrare qui e non più a valle: albero, rendiconto, saldo e KPI vengono
  // tutti da questa lista, quindi si muovono insieme senza doverli avvisare.
  const visibili = useMemo(
    () => (escluse.size ? eventi.filter((e) => !escluse.has(e.commessa)) : eventi),
    [eventi, escluse],
  );

  // Quanto indietro e quanto avanti servirebbe per non lasciare niente fuori:
  // è il limite oltre il quale allargare non mostra più nulla di nuovo.
  const copertura = useMemo(() => {
    const date = visibili.map((e) => e.data).filter(Boolean) as string[];
    if (!date.length) return { indietro: 4, avanti: 16 };
    const oggi = Date.now();
    const gg = (d: string) => Math.ceil((oggi - new Date(d + "T00:00:00Z").getTime()) / 86400000 / 7);
    return {
      indietro: Math.max(4, ...date.map(gg)) + 1,
      avanti: Math.max(16, ...date.map((d) => -gg(d))) + 2,
    };
  }, [visibili]);

  const settimane = useMemo(
    () => costruisciSettimane(new Date(), finestra.indietro, finestra.avanti),
    [finestra],
  );

  /** Le serie di *tutte* le commesse: le mini-strisce del filtro devono
   *  mostrare anche quelle spente, che è proprio quando servono per decidere
   *  se riaccenderle. */
  const serie = useMemo(() => serieCommesse(eventi, settimane), [eventi, settimane]);

  const elencoCommesse: VoceCommessa[] = useMemo(() => {
    const contratti = new Map(commesse.map((k) => [k.nome, k.contratto_cliente]));
    return [...serie.entries()]
      .map(([nome, s]) => ({
        nome,
        categoria: s.categoria,
        brand: s.brand,
        contratto: contratti.get(nome) ?? null,
        serie: s,
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
  }, [serie, commesse]);

  const totaliPerCategoria = useMemo(() => {
    const t: Record<string, number> = {};
    elencoCommesse.forEach((v) => (t[v.categoria] = (t[v.categoria] ?? 0) + 1));
    return t;
  }, [elencoCommesse]);

  const albero = useMemo(
    () => costruisciAlbero(visibili, commesse, tempi, settimane, totaliPerCategoria),
    [visibili, commesse, tempi, settimane, totaliPerCategoria],
  );
  const master = albero[0];
  const conti = useMemo(() => (master ? rendiconto(master) : null), [master]);

  const righe = useMemo(() => {
    const out: Riga[] = [];
    const scendi = (r: Riga) => {
      out.push(r);
      if (aperte[r.chiave]) r.figli?.forEach(scendi);
    };
    albero.forEach(scendi);
    return out;
  }, [albero, aperte]);

  // La milestone scelta si cerca fra quelle visibili: chiudere il nodo che la
  // conteneva chiude anche il pannello, invece di lasciarlo aperto su qualcosa
  // che non si vede più.
  const scelto = useMemo(() => {
    if (!scelta) return null;
    for (const r of righe) {
      const m = r.milestones.find((x) => x.id === scelta);
      if (m) return m;
    }
    return null;
  }, [scelta, righe]);

  if (isLoading) {
    return (
      <p className="card p-10 text-center text-[12.5px]" style={{ color: "var(--muted)" }}>
        Sto leggendo i movimenti…
      </p>
    );
  }
  // Solo il caso «non c'è proprio niente» esce di qui. Se sono i filtri ad
  // aver svuotato la griglia la pagina resta in piedi: togliere i comandi
  // proprio quando servono a riaccendere lascerebbe l'utente in trappola.
  if (!master || eventi.length === 0) {
    return (
      <p className="card p-10 text-center text-[12.5px]" style={{ color: "var(--muted)" }}>
        Nessun movimento di cassa registrato.
      </p>
    );
  }

  const accese = elencoCommesse.filter((v) => !escluse.has(v.nome));

  /** Isolare apre da sé inviluppo e commessa: la resa di una commessa sola
   *  deve leggersi subito, non dopo altri due clic. */
  const isola = (nome: string, categoria: string) => {
    cambiaFiltro(new Set(elencoCommesse.filter((v) => v.nome !== nome).map((v) => v.nome)), nome);
    setAperte((a) => ({
      ...a,
      master: true,
      [`cat:${categoria}`]: true,
      [`k:${nome}`]: true,
      [`k:${nome}:passivo`]: true,
    }));
  };

  const nascondi = (nome: string) => {
    cambiaFiltro(new Set([...escluse, nome]), isolata === nome ? null : isolata);
  };

  // Il titolo della riga totale dice su cosa si sta guardando: con un filtro
  // attivo «Cassa di tutte le commesse» sarebbe semplicemente falso.
  const titoloMaster =
    escluse.size === 0
      ? "Cassa di tutte le commesse"
      : accese.length === 1
        ? `Cassa · ${accese[0].nome}`
        : `Cassa della selezione · ${accese.length} commesse`;

  // Il contesto dell'export: cosa sta guardando chi preme Esporta. Serve al
  // perimetro «selezione corrente» e all'intestazione del foglio, che deve
  // dire su cosa è stato costruito — un foglio senza quella riga è
  // indistinguibile da un foglio fatto su un altro filtro.
  const primaSett = settimane[1]?.inizio ?? "1970-01-01";
  const ultimaSett = settimane[settimane.length - 2]?.inizio ?? "2999-12-31";
  const fineFinestra = new Date(ultimaSett + "T00:00:00Z");
  fineFinestra.setUTCDate(fineFinestra.getUTCDate() + 6);
  const contestoExport = {
    oggi: new Date(),
    finestra: { da: primaSett, a: fineFinestra.toISOString().slice(0, 10) },
    etichettaFinestra: `${settimane[1]?.etichetta ?? "—"} (${settimane[1]?.sotto ?? ""}) → ${
      settimane[settimane.length - 2]?.etichetta ?? "—"
    } (${settimane[settimane.length - 2]?.sotto ?? ""})`,
    selezione:
      escluse.size === 0
        ? "tutte le commesse"
        : `${accese.length} di ${elencoCommesse.length} commesse`,
  };

  const esporta = async (o: OpzioniExport) => {
    const s = costruisciScadenzario(visibili, o, contestoExport);
    const nome = nomeFile(s, o, contestoExport.oggi);
    // ExcelJS pesa quasi un megabyte: il modulo che lo usa resta fuori dal
    // bundle finché qualcuno non esporta davvero. Anche il CSV passa di lì,
    // solo per il download: è il prezzo di una funzione che si usa di rado.
    const { esportaScadenzarioExcel, scarica } = await import(
      "@/lib/payments/scadenzarioExcel"
    );
    if (o.formato === "csv") {
      // BOM: senza, Excel in italiano apre il file come Latin-1 e le accentate
      // diventano scarabocchi.
      scarica(
        new Blob(["﻿" + csvScadenzario(s)], { type: "text/csv;charset=utf-8" }),
        nome,
      );
      return;
    }
    await esportaScadenzarioExcel(s, nome);
  };

  const idxOggi = settimane.findIndex((s) => s.corrente);
  const primoDeficit = conti
    ? conti.netto.findIndex((v, i) => v < 0 && i >= idxOggi && i < settimane.length - 1)
    : -1;
  const saldoMin = conti ? Math.min(...conti.saldo.slice(0, -1)) : 0;
  const nSenzaData = visibili.filter((e) => !e.data).length;
  const importoSenzaData = visibili.filter((e) => !e.data).reduce((s, e) => s + e.importo_eur, 0);

  // Cosa sta nascosto dentro «Pregresso»: serve a sapere se vale la pena
  // allargare, senza doverlo fare per scoprirlo.
  const iniFinestra = settimane[1]?.inizio ?? null;
  const prima = visibili.filter((e) => e.data && iniFinestra && e.data < iniFinestra);
  const pregresso = {
    quanti: prima.length,
    dal: prima.length ? prima.map((e) => e.data!).sort()[0] : null,
    importo: prima.reduce((s, e) => s + e.importo_eur, 0),
  };

  return (
    <div
      className="wbs space-y-5"
      style={{ ["--ncol" as string]: String(settimane.length) }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="titolo text-lg">WBS di cassa</h1>
          <p className="mt-1 max-w-[74ch] text-[12.5px]" style={{ color: "var(--muted)" }}>
            Una traccia settimanale per commessa: quando incassiamo dal cliente e quando dobbiamo
            saldare fornitori e installatori, sulla stessa riga del tempo. Passa sopra un elemento
            per il dettaglio, cliccalo per agire.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroCommesse
            voci={elencoCommesse}
            escluse={escluse}
            isolata={isolata}
            onCambia={cambiaFiltro}
          />
          <EsportaScadenzario
            conteggio={(o) => {
              const s = costruisciScadenzario(visibili, o, contestoExport);
              return { righe: s.righe.length, senzaData: s.senzaData.length };
            }}
            onEsporta={esporta}
          />
          {/* Due letture degli stessi movimenti. I totali restano in euro in
              entrambe, perché una somma fra valute diverse non è un numero. */}
          <div className="segm" role="group" aria-label="Valuta degli importi">
            <button
              type="button"
              aria-pressed={modoValuta === "euro"}
              onClick={() => setModoValuta("euro")}
            >
              Euro
            </button>
            <button
              type="button"
              aria-pressed={modoValuta === "originale"}
              onClick={() => setModoValuta("originale")}
              title="Incassi in euro, uscite nella valuta del contratto"
            >
              Originale
            </button>
          </div>
          <Bottone onClick={() => setAperte(tutte(albero, true))}>Apri tutto</Bottone>
          <Bottone onClick={() => setAperte({ master: true })}>Chiudi tutto</Bottone>
        </div>
      </div>

      {/* La finestra. Allargarla indietro fa uscire da «Pregresso» i movimenti
          già avvenuti, ciascuno sulla settimana in cui è successo davvero. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Indietro</span>
        {[
          { n: 4, t: "1 mese" },
          { n: 13, t: "3 mesi" },
          { n: 26, t: "6 mesi" },
          { n: 52, t: "1 anno" },
        ].map((o) => (
          <Bottone
            key={o.n}
            attivo={finestra.indietro === o.n}
            onClick={() => setFinestra((f) => ({ ...f, indietro: o.n }))}
          >
            {o.t}
          </Bottone>
        ))}
        <Bottone
          attivo={finestra.indietro >= copertura.indietro && finestra.avanti >= copertura.avanti}
          onClick={() => setFinestra(copertura)}
        >
          Tutto lo storico
        </Bottone>

        <span className="label ml-3">Avanti</span>
        {[
          { n: 8, t: "2 mesi" },
          { n: 16, t: "4 mesi" },
          { n: 39, t: "9 mesi" },
        ].map((o) => (
          <Bottone
            key={o.n}
            attivo={finestra.avanti === o.n}
            onClick={() => setFinestra((f) => ({ ...f, avanti: o.n }))}
          >
            {o.t}
          </Bottone>
        ))}

        <span className="ml-auto text-[11px]" style={{ color: "var(--faint)" }}>
          {settimane.length - 2} settimane in griglia
        </span>
      </div>

      {/* Barra di stato del filtro: c'è solo quando serve, e dà sempre la via
          per tornare a vedere tutto. Con poche commesse accese si nominano una
          per una; con molte si riassume per inviluppo, perché venti chip sono
          di nuovo il problema che il filtro doveva risolvere. */}
      {escluse.size > 0 && (
        <div className="fstate">
          <span>
            Filtro attivo · <b>{accese.length}</b> di {elencoCommesse.length} commesse:
          </span>
          {accese.length <= 4
            ? accese.map((v) => (
                <span className="chip" key={v.nome}>
                  {v.nome}
                  <button
                    type="button"
                    aria-label={"Togli " + v.nome}
                    onClick={() => cambiaFiltro(new Set([...escluse, v.nome]), null)}
                  >
                    ×
                  </button>
                </span>
              ))
            : Object.entries(totaliPerCategoria).map(([cat, tot]) => (
                <span className="chip" key={cat}>
                  {cat} · {accese.filter((v) => v.categoria === cat).length}/{tot}
                </span>
              ))}
          <button type="button" className="linkbtn" onClick={() => cambiaFiltro(new Set(), null)}>
            Mostra tutte
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          etichetta="Saldo a fine finestra"
          valore={importo(conti?.saldo[settimane.length - 2] ?? 0)}
          sotto="pregresso compreso"
          variante="scura"
        />
        <KpiCard
          etichetta="Saldo più basso"
          valore={importo(saldoMin)}
          sotto={saldoMin < 0 ? "va coperto" : "mai sotto zero"}
          variante={saldoMin < 0 ? "rossa" : "neutra"}
        />
        <KpiCard
          etichetta="Prima settimana in deficit"
          valore={primoDeficit >= 0 ? settimane[primoDeficit].etichetta : "nessuna"}
          sotto={
            primoDeficit >= 0
              ? `mancano ${importo(Math.abs(conti!.netto[primoDeficit]))}`
              : "nessun buco davanti"
          }
          variante={primoDeficit >= 0 ? "ambra" : "neutra"}
        />
        <KpiCard
          etichetta="Senza data"
          valore={importo(importoSenzaData)}
          sotto={`${nSenzaData} movimenti da datare`}
        />
      </div>

      {visibili.length === 0 && (
        <p className="card p-8 text-center text-[12.5px]" style={{ color: "var(--muted)" }}>
          Nessuna commessa selezionata.{" "}
          <button type="button" className="linkbtn" onClick={() => cambiaFiltro(new Set(), null)}>
            Mostra tutte
          </button>
        </p>
      )}

      <div className="card overflow-hidden" hidden={visibili.length === 0}>
        <div className="wbs-scroll">
          <div className="wbs-grid">
            <Testata
              settimane={settimane}
              idxOggi={idxOggi}
              pregresso={pregresso}
              onEstendi={() =>
                setFinestra((f) => ({
                  ...f,
                  indietro: Math.min(copertura.indietro, f.indietro + 13),
                }))
              }
            />
            {righe.map((r) => (
              <RigaTraccia
                key={r.chiave}
                riga={r}
                settimane={settimane}
                idxOggi={idxOggi}
                picco={Math.max(1, ...(master.cumulato ?? []).map((v) => Math.max(v, 0)))}
                aperta={!!aperte[r.chiave]}
                onToggle={() => setAperte((a) => ({ ...a, [r.chiave]: !a[r.chiave] }))}
                onMilestone={setScelta}
                settimanaDi={(i) => settimane[i]?.inizio ?? null}
                trovaData={(id) => eventi.find((e) => e.id === id)?.data ?? null}
                titolo={r.tipo === "master" ? titoloMaster : r.nome}
                isolata={isolata === r.commessa && accese.length === 1}
                onIsola={
                  r.commessa
                    ? () =>
                        isola(
                          r.commessa!,
                          elencoCommesse.find((v) => v.nome === r.commessa)?.categoria ?? "",
                        )
                    : undefined
                }
                onNascondi={r.commessa ? () => nascondi(r.commessa!) : undefined}
                modoValuta={modoValuta}
                onTutte={() => cambiaFiltro(new Set(), null)}
              />
            ))}
            {conti && <Rendiconto conti={conti} settimane={settimane} idxOggi={idxOggi} />}
          </div>
        </div>
        <Legenda />
      </div>

      {scelto && (
        <Pannello
          milestone={scelto}
          evento={eventi.find((e) => e.id === scelto.id) ?? null}
          settimana={settimane[scelto.colonna]}
          nettoSettimana={conti?.netto[scelto.colonna] ?? 0}
          onChiudi={() => setScelta(null)}
        />
      )}
    </div>
  );
}

/* ── Testata ──────────────────────────────────────────────────────────────── */

function Testata({
  settimane,
  idxOggi,
  pregresso,
  onEstendi,
}: {
  settimane: Settimana[];
  idxOggi: number;
  pregresso: { quanti: number; dal: string | null; importo: number };
  onEstendi: () => void;
}) {
  return (
    <div className="wbs-row wbs-hdr">
      <div className="wbs-lbl">
        <span className="nm">
          Categoria / commessa / voce
          <small>una colonna per settimana</small>
        </span>
      </div>
      <div className="wbs-track">
        <div className="wbs-preg" />
        <div className="wbs-nodate" />
        {idxOggi >= 0 && (
          <div className="wbs-today" style={{ left: (idxOggi + 0.5) * WKPX }} />
        )}
        {settimane.map((s, i) => {
          // «Pregresso» non è una settimana: è tutto quello che sta prima.
          // Cliccandolo la finestra si allarga e quei movimenti escono allo
          // scoperto, ciascuno sulla data in cui è avvenuto davvero.
          if (s.pregresso) {
            return (
              <button
                key={s.chiave}
                type="button"
                onClick={onEstendi}
                className="wbs-wk"
                style={{ left: 0, width: WKPX, textAlign: "left", background: "none", border: 0 }}
                title={
                  pregresso.quanti
                    ? `${pregresso.quanti} movimenti${pregresso.dal ? ` dal ${pregresso.dal}` : ""} · ${importo(
                        pregresso.importo,
                      )}. Clicca per allargare la finestra indietro e vederne le date.`
                    : "Niente prima della finestra"
                }
              >
                <b className="num" style={{ textDecoration: "underline dotted", textUnderlineOffset: 3 }}>
                  {s.etichetta}
                </b>
                <span>{pregresso.quanti ? `${pregresso.quanti} mov. · estendi` : s.sotto}</span>
              </button>
            );
          }
          return (
            <div
              key={s.chiave}
              className={`wbs-wk${s.corrente ? " now" : ""}`}
              style={{ left: i * WKPX, width: WKPX }}
              title={s.inizio ? `Settimana dal ${s.inizio}` : s.sotto}
            >
              <b className="num">{s.etichetta}</b>
              <span>{s.sotto}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Una riga ─────────────────────────────────────────────────────────────── */

function RigaTraccia({
  riga,
  settimane,
  idxOggi,
  picco,
  aperta,
  onToggle,
  onMilestone,
  settimanaDi,
  trovaData,
  titolo,
  isolata,
  onIsola,
  onNascondi,
  onTutte,
  modoValuta,
}: {
  riga: Riga;
  settimane: Settimana[];
  idxOggi: number;
  picco: number;
  aperta: boolean;
  onToggle: () => void;
  onMilestone: (id: string) => void;
  settimanaDi: (i: number) => string | null;
  trovaData: (id: string) => string | null;
  titolo: string;
  isolata: boolean;
  onIsola?: () => void;
  onNascondi?: () => void;
  onTutte: () => void;
  modoValuta: ModoValuta;
}) {
  const conStriscia = riga.tipo === "master" || riga.tipo === "categoria" || riga.tipo === "commessa";
  const haFigli = !!riga.figli?.length;
  const n = settimane.length;
  /** Quanto scende il gambo del primo marker prima di agganciarsi: la striscia
   *  dove c'è, il binario sottile dove non c'è. */
  const ancoraggio = conStriscia ? 15 : 4;

  // I numeri della riga, a coppie etichetta/valore invece che in una frase
  // unica: «entrate € 9.600 · uscite € 0 · saldo € 9.600 · quote € 3.514, non
  // sommate · resa 100%» è tecnicamente completo e praticamente illeggibile.
  // Le quote vanno comunque nominate — una riga con zero di cassa e un marker
  // da 44.000 accanto sembra un errore finché non si legge che è una
  // ripartizione e non un esborso.
  const cifre: Array<[string, string]> = [];
  if (conStriscia && riga.cumulato) {
    cifre.push(["entrate", importo(riga.entrate.reduce((s, v) => s + v, 0))]);
    cifre.push(["uscite", importo(Math.abs(riga.uscite.reduce((s, v) => s + v, 0)))]);
    cifre.push(["saldo", importo(riga.cumulato[n - 1])]);
  } else {
    cifre.push(["cassa", importo(riga.totale)]);
  }
  if (riga.quote) cifre.push(["quote (non sommate)", importo(Math.abs(riga.quote))]);
  if (riga.resa != null) cifre.push(["resa", `${Math.round(riga.resa * 100)}%`]);

  return (
    <div className={`wbs-row lv-${riga.tipo}`}>
      <div
        className="wbs-lbl"
        style={{
          paddingLeft: 10 + riga.livello * 15,
          boxShadow: riga.corsia
            ? `inset 3px 0 0 var(${VAR_LANE[LANE_CSS[riga.corsia]]})`
            : undefined,
        }}
      >
        {haFigli ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={aperta}
            aria-label={`${aperta ? "Chiudi" : "Apri"} ${riga.nome}`}
            className="w-4 shrink-0 text-left"
            style={{ color: "inherit", opacity: 0.6 }}
          >
            {aperta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="nm">
          {titolo}
          {isolata && <span className="isolated-tag">ISOLATA</span>}
          {riga.sotto && <small className="desc">{riga.sotto}</small>}
          <small className="cifre num">
            {cifre.map(([voce, valore]) => (
              <span key={voce}>
                <i>{voce}</i>
                {valore}
              </span>
            ))}
          </small>
          {riga.tipo === "commessa" && riga.scarto != null && riga.scarto !== 0 && (
            <small className="scarto num">
              dichiarato {importo(riga.valoreDichiarato ?? 0)}, non quadra per{" "}
              {importo(Math.abs(riga.scarto))}
            </small>
          )}
        </span>

        {riga.commessa && (
          <span className="rowacts">
            {isolata ? (
              <button type="button" onClick={onTutte} title="Torna a tutte le commesse" aria-label="Torna a tutte le commesse">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" onClick={onIsola} title="Isola questa commessa" aria-label={`Isola ${riga.nome}`}>
                <Target className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={onNascondi} title="Nascondi questa commessa" aria-label={`Nascondi ${riga.nome}`}>
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <div
        className="wbs-track"
        style={{ height: riga.altezza, ["--sh" as string]: conStriscia ? "15px" : "4px" }}
      >
        <div className="wbs-preg" />
        <div className="wbs-nodate" />
        {/* Senza striscia il marker resterebbe sospeso su niente: si aggancia
            a un binario sottile nella tinta della corsia. */}
        {!conStriscia && riga.corsia && (
          <div
            className="wbs-rail"
            style={{
              background: `color-mix(in srgb, var(${VAR_LANE[LANE_CSS[riga.corsia]]}) 22%, transparent)`,
            }}
          />
        )}
        {idxOggi >= 0 && <div className="wbs-today" style={{ left: (idxOggi + 0.5) * WKPX }} />}

        {/* Striscia di cassa: bianca a saldo ≤ 0, sempre più teal man mano che sale */}
        {conStriscia &&
          riga.cumulato?.map((v, i) => (
            <div
              key={i}
              className={`wbs-cash${i === 0 ? " first" : ""}${i === n - 1 ? " last" : ""}`}
              style={{ left: i * WKPX, width: WKPX, background: tintaSaldo(v, picco) }}
              title={`${settimane[i].etichetta} · saldo ${importo(v)}`}
            />
          ))}

        {/* Banda-inviluppo del gruppo progetti, con i segmenti di installazione */}
        {riga.inviluppo && (
          <div
            className="wbs-env"
            style={{
              left: riga.inviluppo.da * WKPX + 3,
              width: (riga.inviluppo.a - riga.inviluppo.da + 1) * WKPX - 6,
            }}
            title="Dal primo acquisto materiali all'ultimo incasso"
          >
            {riga.inviluppo.segmenti.map((s, i) => (
              <div
                key={i}
                className="seg"
                style={{ left: (s.da - riga.inviluppo!.da) * WKPX + 4, width: s.durata * WKPX - 8 }}
                title={`Installazione · ${settimane[s.da].etichetta}`}
              />
            ))}
          </div>
        )}

        {/* Linea di vita del progetto */}
        {riga.vita && (
          <div
            className="wbs-life"
            style={{ left: riga.vita.da * WKPX + WKPX / 2, width: (riga.vita.a - riga.vita.da) * WKPX, top: 14 }}
          />
        )}

        {/* Barre: il programma che si estende */}
        {riga.barre.map((b, i) => (
          <div
            key={i}
            className={`wbs-bar ${b.lane}${b.stimata ? " stimata" : ""}`}
            style={{ left: b.colonna * WKPX + 3, width: b.durata * WKPX - 6, top: 6 }}
            title={b.dettaglio}
          >
            {b.testo}
            {b.stimata && " ~"}
          </div>
        ))}

        {/* Gli elementi arrivano già raggruppati secondo il livello della riga:
            singoli sui progetti, per corsia sui cicli, per direzione sulle
            righe di sintesi. Qui si disegnano e basta — stessa spaziatura per
            tutti, 12px dal bordo colonna e 17 fra un marker e il successivo. */}
        {riga.elementi.map((e) =>
          e.tipo === "singola" ? (
            <Marker
              key={e.m.id}
              dati={datiDiMilestone(e.m, trovaData(e.m.id), modoValuta)}
              sinistra={e.m.colonna * WKPX + 12 + e.posto * PASSO_X}
              posto={e.posto}
              ancoraggio={ancoraggio}
              onClick={() => onMilestone(e.m.id)}
            />
          ) : (
            <Marker
              key={e.a.chiave}
              dati={datiDiAggregato(e.a, riga.nome, settimanaDi(e.a.colonna), modoValuta)}
              sinistra={e.a.colonna * WKPX + 12 + e.posto * PASSO_X}
              posto={e.posto}
              ancoraggio={ancoraggio}
              onClick={onToggle}
            />
          ),
        )}
      </div>
    </div>
  );
}

/* ── Rendiconto ───────────────────────────────────────────────────────────── */

function Rendiconto({
  conti,
  settimane,
  idxOggi,
}: {
  conti: { entrate: number[]; uscite: number[]; netto: number[]; saldo: number[] };
  settimane: Settimana[];
  idxOggi: number;
}) {
  const riga = (
    nome: string,
    sotto: string,
    valori: number[],
    forte = false,
    deficitSe: (v: number) => boolean = () => false,
  ) => (
    <div className={`wbs-row wbs-led${forte ? " forte" : ""}`} key={nome}>
      <div className="wbs-lbl">
        <span className="w-4 shrink-0" />
        <span className="nm">
          {nome}
          <small>{sotto}</small>
        </span>
      </div>
      <div className="wbs-track">
        {valori.map((v, i) => (
          <span
            key={settimane[i].chiave}
            className={`num ${v > 0 ? "pos" : v < 0 ? "neg" : "zero"}${deficitSe(v) ? " deficit" : ""}`}
            style={idxOggi === i ? { boxShadow: "inset 2px 0 0 var(--red)" } : undefined}
          >
            {v === 0 ? "·" : segnato(v)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ borderTop: "2px solid var(--border)" }}>
      <div className="wbs-row wbs-hdr">
        <div className="wbs-lbl">
          <span className="nm">
            Rendiconto netto settimanale
            <small>base per approvare o posticipare un'uscita</small>
          </span>
        </div>
        <div className="wbs-track" style={{ height: 34 }}>
          <div className="wbs-preg" />
          <div className="wbs-nodate" />
        </div>
      </div>
      {riga("Uscite fornitori e installatori", "quanto esce", conti.uscite)}
      {riga("Entrate cliente", "quanto entra", conti.entrate)}
      {riga("Netto settimana", "entrate meno uscite", conti.netto, true, (v) => v < 0)}
      {riga("Saldo cumulato", "liquidità complessiva", conti.saldo, true, (v) => v < 0)}
    </div>
  );
}

/* ── Pannello ─────────────────────────────────────────────────────────────── */

function Pannello({
  milestone,
  evento,
  settimana,
  nettoSettimana,
  onChiudi,
}: {
  milestone: Milestone;
  evento: CashEvent | null;
  settimana: Settimana;
  nettoSettimana: number;
  onChiudi: () => void;
}) {
  const sposta = useSpostaMovimento();
  const segna = useSegnaAvvenuto();
  const approva = useApprovaUscita();

  const origine = evento?.origine ?? "uscita";
  const data = evento?.data ?? null;
  const gia = milestone.certezza === "reale" || milestone.stato === "pagata";

  return (
    <aside className="card overflow-hidden">
      <header
        className="flex flex-wrap items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--teal-bg)" }}
      >
        <h2 className="titolo text-[13px]">{milestone.titolo}</h2>
        <span
          className="num ml-auto text-[15px] font-extrabold"
          style={{ color: milestone.importo < 0 ? "var(--red)" : "var(--green)" }}
        >
          {milestone.documentale
            ? `fattura ${quotaVal(milestone.importo)}`
            : milestone.quota
              ? quotaVal(milestone.importo)
              : segnato(milestone.importo)}
        </span>
        <button type="button" onClick={onChiudi} aria-label="Chiudi il dettaglio">
          <X className="h-4 w-4" style={{ color: "var(--teal-dark)" }} />
        </button>
      </header>

      <dl className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-[12.5px]" style={{ gridTemplateColumns: "140px 1fr" }}>
        <dt style={{ color: "var(--muted)" }}>Afferenza</dt>
        <dd className="m-0 font-medium">{milestone.percorso}</dd>
        <dt style={{ color: "var(--muted)" }}>Settimana</dt>
        <dd className="m-0 font-medium">
          {settimana.etichetta} · {settimana.sotto}
        </dd>
        <dt style={{ color: "var(--muted)" }}>Data</dt>
        <dd className="m-0 font-medium">{data ?? "da definire"}</dd>
        <dt style={{ color: "var(--muted)" }}>Origine della data</dt>
        <dd className="m-0 font-medium">{DESCRIZIONE_FONTE[evento?.fonte ?? ""] ?? "—"}</dd>
        <dt style={{ color: "var(--muted)" }}>Stato</dt>
        <dd className="m-0 font-medium">{milestone.stato}</dd>
      </dl>

      {milestone.quota && (
        <p className="mx-4 mb-3 rounded-[10px] p-3 text-[11.5px]" style={{ background: "var(--ground)", color: "var(--muted)" }}>
          Quota operativa: è la ripartizione sul singolo sito di un importo già contato sul ciclo
          della commessa. Si vede, ma <b>non entra in nessuna somma</b> — contarla due volte
          gonfierebbe il rendiconto.
        </p>
      )}

      <div className="mx-4 mb-3 rounded-[10px] p-3 text-[12px]" style={{ background: "var(--ground)" }}>
        <span style={{ color: "var(--muted)" }}>Netto della settimana con questo movimento: </span>
        <b className="num" style={{ color: nettoSettimana < 0 ? "var(--red)" : "var(--green)" }}>
          {importo(nettoSettimana)}
        </b>
        {nettoSettimana < 0 && (
          <p className="mt-1.5 flex items-start gap-1.5" style={{ color: "var(--red)" }}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Da coprire con un giroconto, oppure posticipando un'uscita: sono la stessa decisione
              vista dai due lati.
            </span>
          </p>
        )}
      </div>

      {milestone.documentale && (
        <p className="mx-4 mb-3 rounded-[10px] p-3 text-[11.5px]" style={{ background: "var(--ground)", color: "var(--muted)" }}>
          Emissione della fattura: qui <b>non esce denaro</b>. È il giorno da cui contano i
          termini; l'uscita di cassa sta più avanti sulla traccia, in rosso.
        </p>
      )}

      {!milestone.quota && !milestone.documentale && (
        <div className="grid gap-2 px-4 pb-4">
          {origine === "uscita" && milestone.stato === "prevista" && (
            <Azione onClick={() => approva.mutate(milestone.id)} occupato={approva.isPending}>
              Approva l'uscita
            </Azione>
          )}
          {!gia && data && (
            <Azione
              primaria
              onClick={() => segna.mutate({ id: milestone.id, origine, data })}
              occupato={segna.isPending}
            >
              {milestone.importo < 0 ? "Segna pagata" : "Segna incassata"}
            </Azione>
          )}
          {data && (
            <div className="grid grid-cols-2 gap-2">
              <Azione
                onClick={() => sposta.mutate({ id: milestone.id, origine, data, giorni: -7 })}
                occupato={sposta.isPending}
              >
                ← Anticipa 1 settimana
              </Azione>
              <Azione
                onClick={() => sposta.mutate({ id: milestone.id, origine, data, giorni: 7 })}
                occupato={sposta.isPending}
              >
                Posticipa 1 settimana →
              </Azione>
            </div>
          )}
          {!data && (
            <p className="text-[11.5px]" style={{ color: "var(--muted)" }}>
              Senza una data non c'è niente da spostare: prima va detto quando si prevede
              che avvenga.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

/* ── Contorno ─────────────────────────────────────────────────────────────── */

/** La classe della corsia sul marker e sul filo della riga. */
const LANE_CSS: Record<string, string> = {
  cliente: "in",
  fornitore: "forn",
  installatore: "inst",
};

/**
 * I quattro colori della vista, e nessun altro.
 *
 * I nomi delle variabili dicono il ruolo e non la tinta: il giorno in cui la
 * terracotta diventa un altro rosso, «uscita installatore» resta vera.
 */
const VAR_LANE: Record<string, string> = {
  in: "--in",
  forn: "--out-forn",
  inst: "--out-inst",
  po: "--po",
};

const DESCRIZIONE_FONTE: Record<string, string> = {
  incasso: "Incasso già avvenuto",
  scadenza_fattura: "Scadenza della fattura emessa",
  pagamento_previsto: "Data di pagamento dichiarata dal cliente",
  evento_effettivo: "Il passo è stato chiuso dal PM",
  evento_previsto: "Data pianificata della milestone",
  ordine_hardware: "Data dell'ordine fornitore",
  primo_dato: "Primo giorno in cui il sito ha trasmesso",
  contratto: "Scritta nel contratto o sulla fattura",
  evento: "Dedotta da un evento avvenuto",
  stima: "Stima dal piano di commessa",
  senza_data: "Nessuna fonte ha saputo dire quando",
  telemetria_scartata: "Telemetria anteriore all'ordine: collaudo a banco, scartata",
};

/** Bianco fino a zero, teal crescente sopra: è una questione di grado. */
function tintaSaldo(v: number, picco: number): string {
  if (v <= 0) return "var(--neg)";
  const p = Math.round(25 + 75 * Math.min(1, v / picco));
  return `color-mix(in srgb, var(--teal) ${p}%, var(--neg))`;
}

/** Quanto dista una freccia dalla successiva, nella stessa settimana. */
const PASSO_X = 16;

/**
 * L'importo scritto accanto alla freccia.
 *
 * Con al massimo tre marker per settimana il simbolo di valuta ci sta, e a un
 * totale serve: «+ € 3.560» si legge come una cifra di cassa, «+3560» come un
 * conteggio di qualcos'altro.
 */
/**
 * Il simbolo di una valuta. RMB e non ¥, perché sul renminbi il simbolo lo
 * condivide con lo yen e in un foglio di pagamenti cinesi l'ambiguità costa.
 */
const SIMBOLO: Record<string, string> = { EUR: "€", CNY: "RMB", USD: "$", GBP: "£" };

const segnoDi = (v: number) => (v > 0 ? "+" : "−");

/**
 * L'importo scritto accanto alla freccia, nella valuta richiesta.
 *
 * In modalità originale un'uscita si legge come sta sul contratto — «− RMB
 * 12.434» — e un incasso resta in euro, perché in euro è pattuito. Quando il
 * marker somma valute diverse la valuta comune non esiste e si torna all'euro:
 * è l'unico modo di scrivere un totale che sia un numero.
 */
function compatto(v: number, valuta = "EUR"): string {
  if (v === 0) return "";
  const s = SIMBOLO[valuta] ?? valuta;
  return `${segnoDi(v)} ${s} ${cifre(Math.round(Math.abs(v)))}`;
}

/**
 * L'importo di una quota, senza segno.
 *
 * Il «−» vuol dire «esce», e una quota non esce: è la fetta di una spesa già
 * contata altrove. Toglierlo è quello che impedisce di leggere «€ 0 di cassa»
 * e «− € 44.243» sulla stessa riga come una contraddizione.
 */
function quotaVal(v: number, valuta = "EUR"): string {
  if (v === 0) return "";
  return `${SIMBOLO[valuta] ?? valuta} ${cifre(Math.round(Math.abs(v)))}`;
}

/** L'importo nella valuta del contratto, con l'euro accanto: nella nuvoletta
 *  c'è spazio per dire tutti e due, e sono due informazioni diverse. */
function conCambio(m: { importo: number; importoValuta: number; valuta: string }): string {
  const euro = segnato(m.importo);
  if (m.valuta === "EUR") return euro;
  return `${segnoDi(m.importo)} ${SIMBOLO[m.valuta] ?? m.valuta} ${cifre(
    Math.round(Math.abs(m.importoValuta)),
  )}  ·  ${euro}`;
}

function segnato(v: number): string {
  if (v === 0) return "·";
  return (v > 0 ? "+ " : "− ") + importo(Math.abs(v));
}

/**
 * Il marker: gambo, punta e nuvoletta, in un elemento solo.
 *
 * Tutta l'animazione sta nel CSS — il gambo che risale dentro la striscia e
 * scende sotto, la nuvoletta che sboccia a fine corsa. In JavaScript resta
 * solo quello che il CSS non può sapere: se sotto c'è spazio per aprirla, e se
 * il dispositivo ha un cursore da passare sopra.
 */
function Marker({
  dati,
  sinistra,
  posto = 0,
  ancoraggio,
  onClick,
}: {
  dati: DatiMarker;
  sinistra: number;
  /** Il suo posto nella fila della settimana: decide dove scende l importo. */
  posto?: number;
  ancoraggio: number;
  onClick: () => void;
}) {
  const testoImporto = dati.amt;

  // Se sotto non ci sta, la nuvoletta si apre sopra. Il limite non è solo il
  // fondo della finestra: la griglia scorre dentro un contenitore che ritaglia,
  // e una nuvoletta tagliata a metà è peggio di una che si apre dalla parte
  // opposta. Si misura al momento perché dipende da quanto si è scrollato.
  const controllaSpazio = (el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    const box = el.closest(".wbs-scroll")?.getBoundingClientRect();
    const giu = Math.min(window.innerHeight, box?.bottom ?? Infinity);
    const destra = Math.min(window.innerWidth, box?.right ?? Infinity);
    el.classList.toggle("flip", giu - b.top < 210);
    el.classList.toggle("left", destra - b.left < 300);
  };

  // Senza cursore non esiste il passaggio del mouse: il tocco apre e chiude.
  const senzaCursore = () =>
    typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

  return (
    <button
      type="button"
      className={`wbs-mk ${dati.lane} ${dati.classi}`}
      style={{ left: sinistra }}
      aria-label={`${dati.titolo}, ${testoImporto}`}
      onMouseEnter={(e) => controllaSpazio(e.currentTarget)}
      onFocus={(e) => controllaSpazio(e.currentTarget)}
      onClick={(e) => {
        if (senzaCursore()) {
          e.stopPropagation();
          const io = e.currentTarget;
          document.querySelectorAll(".wbs-mk.open").forEach((o) => o !== io && o.classList.remove("open"));
          controllaSpazio(io);
          io.classList.toggle("open");
          return;
        }
        onClick();
      }}
    >
      {/* Gambo e punta, e nient'altro sulla traccia: importo, titolo e
          dettaglio stanno nella nuvoletta. È quello che tiene la griglia
          leggibile quando in una settimana cadono otto movimenti. */}
      <span className="stem" />
      <span className="tip" />
      {/* Le frecce stanno in fila, i loro importi in colonna sotto: ogni
          valore torna indietro del proprio posto, così partono tutti dal
          bordo della settimana e restano incolonnati invece di scalare a
          destra finendo nella settimana dopo. */}
      {dati.valore && (
        <span
          className="val num"
          style={{ left: -posto * PASSO_X, top: ancoraggio + 18 + posto * 13 }}
        >
          {dati.valore}
        </span>
      )}
      <span className="wbs-co">
        <span className="amt num">{testoImporto}</span>
        <span className="ti">{dati.titolo}</span>
        <span className="dt">
          {dati.giorno ?? "senza data"}
          {dati.riferimento && <> · {dati.riferimento}</>}
        </span>
        {dati.voci && dati.voci.length > 0 && (
          <span className="voci">
            {dati.voci.map((v, i) => (
              <span key={i}>
                <span>{v.titolo}</span>
                <span className="num">{segnato(v.importo)}</span>
              </span>
            ))}
          </span>
        )}
        {dati.altri > 0 && <span className="more">+ altri {dati.altri}</span>}
        {dati.percorso && (
          <span className="path" dangerouslySetInnerHTML={{ __html: dati.percorso }} />
        )}
        {dati.nota && <span className="nota">{dati.nota}</span>}
      </span>
    </button>
  );
}

/**
 * Pieno vuol dire avvenuto, e nient'altro.
 *
 * Tutto il resto si tratteggia — anche quello di cui non sappiamo dire la
 * certezza, perché «non lo so» non è «è successo», e disegnarlo pieno lo fa
 * leggere come denaro già mosso. I documenti fanno eccezione: una fattura
 * emessa è un fatto, e il suo quadratino grigio resta pieno.
 */
function classiDi(x: {
  quota?: boolean;
  documentale?: boolean;
  documento?: "emessa" | "ricevuta" | null;
  certezza: Certezza | null;
  stato?: string;
}): string {
  const avvenuto = x.certezza === "reale" || x.stato === "pagata";
  return [
    x.quota && "quota",
    x.documento === "ricevuta" && "ricevuta",
    !x.documentale && !avvenuto && "attesa",
    x.certezza === "prevista" && "prevista",
    x.certezza === "stimata" && "stimata",
    // La fattura è arrivata ed è stata approvata: la data non è più dedotta.
    // Resta tratteggiata perché il denaro non si è mosso, ma si distingue.
    x.stato === "approvata" && !avvenuto && "dovuta",
    avvenuto && "pagata",
    x.stato === "congelata" && "congelata",
  ]
    .filter(Boolean)
    .join(" ");
}

/** L'ultimo segmento del percorso in grassetto: è il nodo di cui si parla. */
function briciole(percorso: string): string {
  const parti = percorso.split(" › ").map(fuggi);
  if (parti.length < 2) return parti.join(" › ");
  parti[parti.length - 2] = `<b>${parti[parti.length - 2]}</b>`;
  return parti.join(" › ");
}

const fuggi = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function datiDiMilestone(m: Milestone, giorno: string | null, modo: ModoValuta): DatiMarker {
  // In originale l'importo si scrive come sta sul contratto. In euro sempre
  // euro. Gli incassi sono in euro comunque, quindi il modo non li tocca.
  const nativa = modo === "originale" && m.valuta !== "EUR";
  const v = nativa ? m.importoValuta : m.importo;
  const val = nativa ? m.valuta : "EUR";
  const nota = m.documentale
    ? m.documento === "ricevuta"
      ? "Fattura del fornitore arrivata: qui non esce denaro, parte il conto alla rovescia dei termini."
      : "Fattura emessa: qui non entra denaro, parte il conto alla rovescia dei termini."
    : m.quota
    ? "Quota di progetto: si vede, non entra in nessuna somma."
    : m.stato === "approvata"
      ? "Fattura ricevuta e verificata: la scadenza è quella del documento, non una deduzione."
    : m.certezza === "prevista"
      ? "Data dedotta: evento avvenuto più i termini di pagamento."
      : m.certezza === "stimata"
        ? "Anche l'evento è una previsione: la data si muoverà."
        : m.stato === "congelata"
          ? "Trattenuta fino al controllo qualità."
          : m.certezza === "contrattuale"
            ? "Scadenza scritta, non ancora confermata: il denaro non si è mosso."
            : null;
  return {
    colonna: m.colonna,
    lane: m.lane,
    importo: m.importo,
    documentale: m.documentale,
    quota: m.quota,
    titolo: m.titolo,
    giorno: m.giorno ?? giorno,
    riferimento: m.dettaglio ? m.dettaglio.split(" · ")[0] : null,
    percorso: briciole(m.percorso),
    nota,
    altri: 0,
    valore: m.documentale ? undefined : m.quota ? quotaVal(v, val) : compatto(v, val),
    // Nella nuvoletta c'è spazio per dirle tutte e due, e sono due cose
    // diverse: quella su cui il fornitore discute e quella che esce da conto.
    amt: m.documentale
      ? `fattura ${m.documento === "ricevuta" ? "ricevuta" : "emessa"} ${quotaVal(
          m.importoValuta,
          m.valuta,
        )}`
      : m.quota
        ? quotaVal(m.importoValuta, m.valuta)
        : conCambio(m),
    classi: classiDi(m),
  };
}

function datiDiAggregato(
  a: Aggregato,
  nodo: string,
  inizioSettimana: string | null,
  modo: ModoValuta,
): DatiMarker {
  const titolo = `${a.quanti} ${a.etichetta}`;
  // Un totale si può scrivere in valuta solo se una valuta comune c'è.
  const nativa = modo === "originale" && !!a.valuta && a.valuta !== "EUR";
  const v = nativa ? a.importoValuta : a.importo;
  const val = nativa ? a.valuta! : "EUR";
  return {
    colonna: a.colonna,
    lane: a.lane,
    importo: a.importo,
    documentale: a.lane === "po",
    quota: a.quota,
    titolo,
    giorno: inizioSettimana ? `settimana dal ${inizioSettimana}` : "prima della finestra",
    riferimento: nodo,
    percorso: null,
    nota: a.lane === "po"
      ? a.documento === "ricevuta"
        ? "Fatture dei fornitori arrivate: qui non esce denaro, parte il conto alla rovescia dei termini."
        : "Fatture emesse: qui non si muove denaro, parte il conto alla rovescia dei termini."
      : a.quota
      ? "Quote di progetto: si vedono, non entrano in nessuna somma."
      : a.certezza === "stimata"
        ? "Tutto previsionale: anche gli eventi che lo generano sono stime."
        : a.certezza === "prevista"
          ? "Tutto dedotto da eventi avvenuti più i termini di pagamento."
          : a.certezza === "contrattuale"
            ? "Scadenze scritte, nessuna ancora confermata: il denaro non si è mosso."
            : "Totale della settimana: apri la riga per i singoli movimenti.",
    voci: a.voci,
    altri: Math.max(0, a.quanti - a.voci.length),
    // Il totale si vede sempre: è la ragione per cui il marker è aggregato.
    // Quello che non si vede in griglia è *di cosa* è fatto — e sta un
    // millimetro sotto, nella nuvoletta.
    valore: a.lane === "po" ? undefined : a.quota ? quotaVal(v, val) : compatto(v, val),
    amt:
      a.lane === "po"
        ? `${a.quanti} fatture ${a.documento === "ricevuta" ? "ricevute" : "emesse"} · ${quotaVal(
            a.valuta ? a.importoValuta : a.importo,
            a.valuta ?? "EUR",
          )}`
        : a.quota
          ? quotaVal(a.valuta ? a.importoValuta : a.importo, a.valuta ?? "EUR")
          : a.valuta && a.valuta !== "EUR"
            ? conCambio({ importo: a.importo, importoValuta: a.importoValuta, valuta: a.valuta })
            : segnato(a.importo),
    // Il totale porta la certezza del suo pezzo meno certo: basta un
    // movimento previsto perché tutta la settimana resti tratteggiata.
    classi: `agg ${classiDi({
      quota: a.quota,
      documentale: a.lane === "po",
      documento: a.documento,
      certezza: a.certezza,
    })}`.trim(),
  };
}

function Azione({
  children,
  onClick,
  primaria = false,
  occupato = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primaria?: boolean;
  occupato?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={occupato}
      className="rounded-[8px] px-3 py-2 text-left text-[12.5px] font-semibold disabled:opacity-45"
      style={
        primaria
          ? { background: "var(--dark)", color: "#fff", border: "1px solid var(--dark)" }
          : { background: "var(--ground)", border: "1px solid var(--border)" }
      }
    >
      {children}
    </button>
  );
}

function Legenda() {
  return (
    <div
      className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 py-2.5 text-[10.5px]"
      style={{ background: "var(--ground)", color: "var(--muted)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Punta entra lane="in" />Incassi cliente
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Punta lane="forn" />Uscite fornitori e materiali
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Punta lane="inst" />Uscite installatori
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Punta entra lane="in" pallida />Quota di progetto, non sommata
      </span>
      {/* I tre momenti di una fattura, nell'ordine in cui succedono. Il
          documento è grigio da tutte e due le parti — non è cassa — e a
          distinguerlo è la forma: quadrato quello che emettiamo, tondo
          quello che ci arriva. */}
      <span className="inline-flex items-center gap-1.5">
        <Documento />
        Fattura emessa da noi
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Documento tondo />
        Fattura del fornitore ricevuta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-flex flex-col items-center" style={{ lineHeight: 0 }}>
          <span
            style={{
              width: 2,
              height: 7,
              backgroundImage:
                "repeating-linear-gradient(to bottom, var(--out-forn) 0 3px, transparent 3px 6px)",
            }}
          />
          <Triangolo colore="var(--out-forn)" />
        </span>
        Tratteggiato rado: uscita prevista, data dedotta
      </span>
      {/* Fra la previsione e il bonifico c'è uno stato intermedio che vale la
          pena distinguere: la fattura è in casa e verificata, quindi la data
          non si muoverà più, ma il denaro non è ancora uscito. */}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-flex flex-col items-center" style={{ lineHeight: 0 }}>
          <span
            style={{
              width: 2,
              height: 7,
              backgroundImage:
                "repeating-linear-gradient(to bottom, var(--out-forn) 0 5px, transparent 5px 7px)",
            }}
          />
          <Triangolo colore="var(--out-forn)" />
        </span>
        Tratteggiato fitto: da pagare, scadenza da fattura
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Punta lane="forn" />Pieno: uscita confermata, il denaro è uscito
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i
          className="inline-block h-2 w-5 rounded-[3px]"
          style={{ background: "var(--po-bg)", border: "1px solid var(--po)" }}
        />
        Durate: acquisto e installazione
      </span>
      <span>
        Ogni settimana porta al massimo <b>tre frecce</b> — incassi, fornitori, installatori — con
        accanto il totale. Di cosa è fatto quel totale si legge passandoci sopra.
      </span>
      <span>
        Sulle righe aggregate la striscia è il <b>saldo progressivo</b>: bianca sotto zero, più teal
        man mano che sale. Sui progetti è il <b>tempo</b> che passa fra l'acquisto dei materiali e
        l'ultimo incasso.
      </span>
    </div>
  );
}

/** Gambo e punta in miniatura, per la legenda: è lo stesso segno della griglia,
 *  testa in testa e gambo dietro. */
function Punta({
  entra = false,
  lane,
  pallida = false,
}: {
  entra?: boolean;
  lane: string;
  pallida?: boolean;
}) {
  const colore = `var(${VAR_LANE[lane] ?? "--po"})`;
  return (
    <span
      aria-hidden
      className="inline-flex flex-col items-center"
      style={{ opacity: pallida ? 0.55 : 1, lineHeight: 0 }}
    >
      {entra && <Triangolo su colore={colore} />}
      <span style={{ width: 2, height: 7, background: colore, borderRadius: 1 }} />
      {!entra && <Triangolo colore={colore} />}
    </span>
  );
}

/** Il segno del documento: gambo grigio e una forma vuota. Nessuna punta,
 *  perché il denaro non si muove. */
function Documento({ tondo = false }: { tondo?: boolean }) {
  return (
    <span aria-hidden className="inline-flex flex-col items-center" style={{ lineHeight: 0 }}>
      <span style={{ width: 2, height: 7, background: "var(--po)" }} />
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: tondo ? "50%" : 2,
          background: "#fff",
          boxShadow: "inset 0 0 0 1.5px var(--po)",
        }}
      />
    </span>
  );
}

function Triangolo({ su = false, colore }: { su?: boolean; colore: string }) {
  return (
    <span
      style={{
        width: 0,
        height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        [su ? "borderBottom" : "borderTop"]: `6px solid ${colore}`,
      }}
    />
  );
}

function Bottone({
  children,
  onClick,
  attivo = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  attivo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attivo}
      className="rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-bold"
      style={
        attivo
          ? { background: "var(--teal)", border: "1px solid var(--teal)", color: "#fff" }
          : { background: "#fff", border: "1px solid var(--border)", color: "var(--muted)" }
      }
    >
      {children}
    </button>
  );
}

function tutte(righe: Riga[], valore: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const scendi = (r: Riga) => {
    if (r.figli?.length) {
      out[r.chiave] = valore;
      r.figli.forEach(scendi);
    }
  };
  righe.forEach(scendi);
  return out;
}
