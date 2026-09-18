import { useMemo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Info } from "lucide-react";
import { usePaymentsCtx } from "./PaymentsLayout";
import { useQuotazioniAperte, useTrancheAperte } from "@/hooks/usePayments";
import { BarreMensili, type Strato } from "@/components/payments/BarreMensili";
import { KpiCard } from "@/components/payments/Comuni";
import { importo, ivaPerMese, previsioneAnno, scadenzaIva } from "@/lib/payments/aggregati";

/**
 * IVA e Previsionale.
 *
 * Due pannelli che rispondono a due domande diverse: quanto devo accantonare
 * questo mese, e dove sto andando a finire quest'anno.
 */

/** In migliaia: su un grafico annuale le unità non si leggono comunque. */
const inK = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v > 0 ? "<1k" : "");

export default function IvaPrevisionale() {
  const { tutte, entita } = usePaymentsCtx();
  const { data: tranche = [] } = useTrancheAperte();
  const { data: quotazioni = [] } = useQuotazioniAperte();

  const oggi = new Date();
  const anno = oggi.getFullYear();

  // L'IVA si legge SEMPRE su tutte le fatture italiane, anche se il selettore
  // in alto è su un'altra società: il debito verso l'erario non cambia perché
  // sto guardando la UK.
  const iva = useMemo(() => ivaPerMese(tutte, anno, oggi), [tutte, anno]);
  const ivaMese = iva[oggi.getMonth()];
  const ivaVersataYtd = iva
    .slice(0, oggi.getMonth())
    .reduce((t, m) => t + m.importo, 0);

  const previsione = useMemo(
    () => previsioneAnno(tutte, tranche, quotazioni, anno),
    [tutte, tranche, quotazioni, anno],
  );

  const totali = previsione.reduce(
    (t, m) => ({
      emesso: t.emesso + m.emesso,
      pianificato: t.pianificato + m.pianificato,
      potenziale: t.potenziale + m.potenziale,
    }),
    { emesso: 0, pianificato: 0, potenziale: 0 },
  );
  const atteso = totali.emesso + totali.pianificato + totali.potenziale;

  const barreIva: Strato[][] = iva.map((m) => [
    { valore: m.importo, colore: "var(--teal)", stimato: m.stimato, nome: "IVA a debito" },
  ]);

  // Tre strati, mai mescolati: l'emesso è un fatto, il pianificato un impegno,
  // il potenziale una speranza pesata. Un numero solo sembrerebbe certo.
  const barrePrev: Strato[][] = previsione.map((m) => [
    { valore: m.emesso, colore: "var(--teal-dark)", nome: "Emesso" },
    { valore: m.pianificato, colore: "var(--teal)", nome: "Da emettere" },
    { valore: m.potenziale, colore: "var(--amber)", stimato: true, nome: "Potenziale ponderato" },
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titolo text-lg">IVA &amp; Previsionale</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          Quanto accantonare questo mese, e dove si va a finire quest'anno.
        </p>
      </div>

      {/* ── IVA ── */}
      <section className="card p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titolo text-[13px]">IVA a debito {anno}</h2>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            solo FGB Italia · lordo, senza detrarre l'IVA sugli acquisti
          </span>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <KpiCard
            etichetta={`Da versare — ${format(new Date(anno, oggi.getMonth()), "LLLL", { locale: it })}`}
            valore={importo(ivaMese?.importo ?? 0)}
            sotto={`entro il ${format(scadenzaIva(anno, oggi.getMonth()), "d MMMM", { locale: it })}`}
            variante="accento"
          />
          <KpiCard
            etichetta="Versata da inizio anno"
            valore={importo(ivaVersataYtd)}
            sotto={`${oggi.getMonth()} mesi chiusi`}
          />
        </div>

        <BarreMensili mesi={barreIva} meseCorrente={oggi.getMonth()} formato={inK} />

        <p
          className="mt-3 flex items-start gap-1.5 text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          I mesi futuri sono tratteggiati: sono stime dai piani di emissione, non documenti.
          {entita && entita !== "it" && (
            <b> Il filtro in alto non tocca questo pannello: il debito IVA resta quello italiano.</b>
          )}
        </p>
      </section>

      {/* ── Previsionale ── */}
      <section className="card p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titolo text-[13px]">Previsione a fine anno</h2>
          <span className="num text-[15px] font-extrabold">{importo(atteso)}</span>
        </header>

        <BarreMensili mesi={barrePrev} meseCorrente={oggi.getMonth()} formato={inK} />

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Legenda
            colore="var(--teal-dark)"
            nome="Emesso"
            valore={totali.emesso}
            nota="fatture già emesse, al netto delle note di credito"
          />
          <Legenda
            colore="var(--teal)"
            nome="Da emettere"
            valore={totali.pianificato}
            nota="tranche previste, collocate sulla data attesa dell'evento"
          />
          <Legenda
            colore="var(--amber)"
            nome="Potenziale ponderato"
            valore={totali.potenziale}
            tratteggio
            nota="quotazioni aperte, pesate per probabilità di chiusura"
          />
        </div>

        <p className="mt-3 text-[11px]" style={{ color: "var(--muted)" }}>
          Le tranche stanno nel mese in cui ci si aspetta l'evento che le rende esigibili: se la
          fine costruzione slitta, il ricavo si sposta da solo nel mese nuovo — nessuno deve
          aggiornare una previsione a mano.
        </p>
      </section>
    </div>
  );
}

function Legenda({
  colore,
  nome,
  valore,
  nota,
  tratteggio,
}: {
  colore: string;
  nome: string;
  valore: number;
  nota: string;
  tratteggio?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-0.5 h-3 w-3 shrink-0 rounded-[3px]"
        style={{
          background: tratteggio
            ? `repeating-linear-gradient(45deg, ${colore}, ${colore} 2px, transparent 2px, transparent 4px)`
            : colore,
          border: tratteggio ? `1px solid ${colore}` : undefined,
        }}
      />
      <span className="min-w-0">
        <span className="num block text-[13px] font-bold">{importo(valore)}</span>
        <span className="block text-[11px] font-semibold">{nome}</span>
        <span className="block text-[10.5px] leading-snug" style={{ color: "var(--muted)" }}>
          {nota}
        </span>
      </span>
    </div>
  );
}
