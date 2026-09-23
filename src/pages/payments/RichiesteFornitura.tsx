import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, Check, Lock, Plus, Send, Trash2, X } from "lucide-react";
import { KpiCard, Money, Pill } from "@/components/payments/Comuni";
import { importo } from "@/lib/payments/aggregati";
import { useCommesse } from "@/hooks/useCashWbs";
import { useFornitori } from "@/hooks/usePayments";
import {
  useAllocazioni,
  useApprovaRichiesta,
  useCondizioni,
  useEliminaAllocazione,
  useEliminaCondizione,
  usePayWhenPaid,
  useRichiesteFornitura,
  useSalvaCondizione,
  useSalvaRichiesta,
} from "@/hooks/useFornitura";
import { useToast } from "@/hooks/use-toast";
import type {
  CondizionePO,
  EventoCondizione,
  RichiestaFornitura,
  StatoRichiesta,
} from "@/types/payments";

/**
 * Richieste di Fornitura — prima di attivare un fornitore.
 *
 * È il punto in cui una spesa entra nel sistema, e l'unico: da qui in avanti
 * le uscite di cassa non si scrivono più a mano, si generano dalle condizioni
 * negoziate. Cambiare una rata qui sposta i flag sulla timeline; scriverli
 * altrove vorrebbe dire avere due versioni della stessa promessa.
 *
 * L'ordine ha due stati che corrono in parallelo e non vanno confusi:
 * `stato_richiesta` dice a che punto è l'autorizzazione a spendere, `status`
 * dove sta la merce. Un ordine approvato e non ancora spedito è la normalità.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy", { locale: it }) : "—");

const STATI: Record<StatoRichiesta, { testo: string; tinta: "neutro" | "amber" | "green" | "red" }> =
  {
    bozza: { testo: "Bozza", tinta: "neutro" },
    inviata: { testo: "Inviata", tinta: "amber" },
    approvata: { testo: "Approvata", tinta: "green" },
    rifiutata: { testo: "Rifiutata", tinta: "red" },
  };

const EVENTI: Record<EventoCondizione, string> = {
  ordine: "All'ordine",
  fine_produzione: "A fine produzione",
  spedizione: "Alla spedizione",
  ricezione: "Alla ricezione",
  installazione: "All'installazione",
  collaudo: "Al collaudo",
  manuale: "A mano",
};

export default function RichiesteFornitura() {
  const { data: ordini = [], isLoading } = useRichiesteFornitura();
  const { data: fornitori = [] } = useFornitori();
  const { data: commesse = [] } = useCommesse();
  const salva = useSalvaRichiesta();
  const cambiaStato = useApprovaRichiesta();
  const { toast } = useToast();

  const [scelto, setScelto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"tutti" | StatoRichiesta>("tutti");

  const visibili = useMemo(
    () => (filtro === "tutti" ? ordini : ordini.filter((o) => o.stato_richiesta === filtro)),
    [ordini, filtro],
  );

  const ordine = useMemo(() => ordini.find((o) => o.id === scelto) ?? null, [ordini, scelto]);

  const daAutorizzare = ordini.filter((o) => o.stato_richiesta !== "approvata");
  const impegnato = ordini
    .filter((o) => o.stato_richiesta === "approvata")
    .reduce((t, o) => t + (o.importo_eur ?? 0), 0);

  const gruppi = useMemo(() => {
    const m = new Map<string, RichiestaFornitura[]>();
    for (const o of visibili) {
      const k = o.supplier ?? "Senza fornitore";
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibili]);

  const muoviStato = async (o: RichiestaFornitura, stato: StatoRichiesta) => {
    try {
      await cambiaStato.mutateAsync({ id: o.id, stato });
      toast({
        title:
          stato === "approvata"
            ? "Richiesta approvata"
            : stato === "inviata"
              ? "Richiesta inviata"
              : "Stato aggiornato",
        description:
          stato === "approvata"
            ? "I flag previsionali sono ora sulla timeline, tratteggiati."
            : undefined,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Non è stato possibile", description: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titolo text-lg">Richieste di Fornitura</h1>
          <p className="mt-1 max-w-[62ch] text-[12px]" style={{ color: "var(--muted)" }}>
            Le condizioni negoziate col fornitore generano i flag di uscita sulla timeline. Qui si
            scrivono le rate, non le date: quelle le calcola la catena ordine → produzione →
            spedizione → ricezione.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          etichetta="Da autorizzare"
          valore={String(daAutorizzare.length)}
          sotto={`su ${ordini.length} ordini a sistema`}
          variante={daAutorizzare.length > 0 ? "ambra" : "neutra"}
        />
        <KpiCard
          etichetta="Impegnato e approvato"
          valore={importo(impegnato)}
          sotto="controvalore in euro degli ordini approvati"
        />
        <KpiCard
          etichetta="Fornitori attivi"
          valore={String(new Set(ordini.map((o) => o.supplier)).size)}
          sotto={fornitori.map((f) => f.name).join(" · ")}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["tutti", "bozza", "inviata", "approvata", "rifiutata"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFiltro(s)}
            className="rounded-full px-3 py-1 text-[11.5px] font-semibold"
            style={{
              background: filtro === s ? "var(--dark)" : "#fff",
              color: filtro === s ? "#fff" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {s === "tutti" ? "Tutti" : STATI[s].testo}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* ── L'elenco ── */}
        <div className="space-y-3">
          {isLoading && (
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
              Caricamento…
            </p>
          )}
          {!isLoading && gruppi.length === 0 && (
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
              Nessun ordine con questo stato.
            </p>
          )}
          {gruppi.map(([fornitore, righe]) => (
            <div key={fornitore} className="card overflow-hidden">
              <div
                className="flex items-baseline justify-between px-3 py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <b className="text-[12.5px]">{fornitore}</b>
                <span className="num text-[11.5px]" style={{ color: "var(--muted)" }}>
                  {righe.length} {righe.length === 1 ? "ordine" : "ordini"}
                </span>
              </div>
              <ul>
                {righe.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setScelto(o.id === scelto ? null : o.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      style={{
                        background: o.id === scelto ? "var(--teal-bg)" : "transparent",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <span className="w-[76px] shrink-0 text-[12px] font-semibold">
                        {o.po_number ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px]">
                        {o.descrizione ??
                          commesse.find((k) => k.id === o.commessa_id)?.nome ??
                          "Senza commessa"}
                      </span>
                      <Money valore={o.po_cost} valuta={o.currency} className="text-[12px]" />
                      <Pill tinta={STATI[o.stato_richiesta].tinta}>
                        {STATI[o.stato_richiesta].testo}
                      </Pill>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Il dettaglio ── */}
        <div>
          {!ordine ? (
            <div
              className="card grid place-items-center p-8 text-center text-[12px]"
              style={{ color: "var(--muted)" }}
            >
              Scegli un ordine per vederne le condizioni di pagamento e il controllo
              <br />
              «pay when paid».
            </div>
          ) : (
            <Dettaglio
              ordine={ordine}
              commesse={commesse}
              onTestata={(campi) => salva.mutateAsync({ id: ordine.id, ...campi })}
              onStato={(s) => muoviStato(ordine, s)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Il pannello di dettaglio ─────────────────────────────────────────────── */

function Dettaglio({
  ordine,
  commesse,
  onTestata,
  onStato,
}: {
  ordine: RichiestaFornitura;
  commesse: { id: string; nome: string }[];
  onTestata: (campi: Partial<RichiestaFornitura>) => Promise<unknown>;
  onStato: (s: StatoRichiesta) => void;
}) {
  const { data: condizioni = [] } = useCondizioni(ordine.id);
  const { data: allocazioni = [] } = useAllocazioni(ordine.id);
  const { data: controllo = [] } = usePayWhenPaid(ordine.id);
  const salvaCond = useSalvaCondizione();
  const eliminaCond = useEliminaCondizione();
  const eliminaAlloc = useEliminaAllocazione();
  const { toast } = useToast();

  const totale = ordine.po_cost ?? 0;
  const sommaRate = condizioni.reduce(
    (t, c) => t + (c.importo ?? (totale * (c.pct ?? 0)) / 100),
    0,
  );
  const scarto = Math.round((totale - sommaRate) * 100) / 100;

  const guai = controllo.filter((r) => r.esito !== "ok" && r.esito !== "nessun incasso atteso");
  const bloccate = condizioni.filter((c) => !c.rigenerabile).length;

  const aggiungiRata = async () => {
    try {
      await salvaCond.mutateAsync({
        po_id: ordine.id,
        ordine: (condizioni.at(-1)?.ordine ?? 0) + 1,
        nome: "Nuova rata",
        pct: scarto > 0 && totale > 0 ? Math.round((scarto / totale) * 10000) / 100 : 10,
        evento: "ordine",
        giorni: 0,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Rata non aggiunta", description: e.message });
    }
  };

  return (
    <div className="space-y-3">
      {/* Testata */}
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="titolo text-[15px]">
              {ordine.po_number ?? "Ordine senza numero"} · {ordine.supplier}
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>
              {ordine.descrizione ?? "Senza descrizione"}
            </p>
          </div>
          <Money valore={ordine.po_cost} valuta={ordine.currency} className="text-[16px] font-bold" />
        </div>

        <dl className="mt-3 grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
          <Campo etichetta="Commessa">
            <select
              value={ordine.commessa_id ?? ""}
              onChange={(e) => onTestata({ commessa_id: e.target.value || null })}
              className="h-7 w-full rounded-[8px] px-1.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
            >
              <option value="">— nessuna —</option>
              {commesse.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etichetta="Corsia di spesa">
            <select
              value={ordine.corsia}
              onChange={(e) => onTestata({ corsia: e.target.value as any })}
              className="h-7 w-full rounded-[8px] px-1.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
            >
              <option value="merce">Merce</option>
              <option value="installazione">Installazione</option>
              <option value="servizi">Servizi</option>
            </select>
          </Campo>
          <Campo etichetta="Data ordine">
            <input
              type="date"
              value={ordine.data_ordine ?? ""}
              onChange={(e) => onTestata({ data_ordine: e.target.value || null })}
              className="h-7 w-full rounded-[8px] px-1.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
            />
          </Campo>
          <Campo etichetta="Lead time (giorni)">
            <input
              type="number"
              min={0}
              value={ordine.lead_time_giorni ?? ""}
              onChange={(e) =>
                onTestata({ lead_time_giorni: e.target.value ? Number(e.target.value) : null })
              }
              className="num h-7 w-full rounded-[8px] px-1.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
            />
          </Campo>
          <Campo etichetta="Consegna attesa">
            <input
              type="date"
              value={ordine.consegna_prevista ?? ""}
              onChange={(e) => onTestata({ consegna_prevista: e.target.value || null })}
              className="h-7 w-full rounded-[8px] px-1.5 text-[12px] outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff" }}
            />
          </Campo>
          <Campo etichetta="Approvata il">
            <span className="num">{d(ordine.approvata_il?.slice(0, 10) ?? null)}</span>
          </Campo>
        </dl>

        {ordine.note_condizioni && (
          <p
            className="mt-3 rounded-[8px] p-2 text-[11.5px]"
            style={{ background: "var(--bg-soft, #f7f7f5)", color: "var(--muted)" }}
          >
            {ordine.note_condizioni}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {ordine.stato_richiesta === "bozza" && (
            <Azione onClick={() => onStato("inviata")} icona={<Send className="h-3.5 w-3.5" />}>
              Invia al fornitore
            </Azione>
          )}
          {ordine.stato_richiesta !== "approvata" && (
            <Azione
              onClick={() => onStato("approvata")}
              icona={<Check className="h-3.5 w-3.5" />}
              primaria
            >
              Approva e genera i flag
            </Azione>
          )}
          {ordine.stato_richiesta !== "rifiutata" && ordine.stato_richiesta !== "approvata" && (
            <Azione onClick={() => onStato("rifiutata")} icona={<X className="h-3.5 w-3.5" />}>
              Rifiuta
            </Azione>
          )}
        </div>
      </div>

      {/* Pay when paid */}
      {guai.length > 0 && (
        <div
          className="card p-3"
          style={{ borderColor: "var(--red)", background: "var(--red-bg)" }}
        >
          <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--red)" }}>
            <AlertTriangle className="h-3.5 w-3.5" /> Pay when paid
          </p>
          <ul className="mt-1.5 space-y-1 text-[11.5px]">
            {guai.slice(0, 4).map((r) => (
              <li key={r.uscita_id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="num font-semibold">{d(r.data_uscita)}</span>
                <span>{r.descrizione}</span>
                <span style={{ color: "var(--red)" }}>
                  {r.esito === "paghiamo prima di incassare"
                    ? `paghiamo prima di incassare — primo incasso ${d(r.primo_incasso)}`
                    : `cassa a ${importo(r.saldo)} a quella data`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Condizioni */}
      <div className="card overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <b className="text-[12.5px]">Condizioni di pagamento</b>
          <div className="flex items-center gap-2">
            {scarto !== 0 && (
              <span className="num text-[11.5px]" style={{ color: "var(--amber)" }}>
                scoperto {importo(scarto, ordine.currency)}
              </span>
            )}
            <button
              type="button"
              onClick={aggiungiRata}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
              style={{ color: "var(--teal)" }}
            >
              <Plus className="h-3.5 w-3.5" /> Rata
            </button>
          </div>
        </div>

        {condizioni.length === 0 ? (
          <p className="px-3 py-4 text-[12px]" style={{ color: "var(--muted)" }}>
            Nessuna condizione: senza rate l'ordine non genera nessun flag di cassa.
          </p>
        ) : (
          <ul>
            {condizioni.map((c) => (
              <Rata
                key={c.id}
                c={c}
                totale={totale}
                valuta={ordine.currency}
                onSalva={(campi) => salvaCond.mutateAsync({ po_id: ordine.id, id: c.id, ...campi })}
                onElimina={() => eliminaCond.mutateAsync(c.id)}
              />
            ))}
          </ul>
        )}

        {bloccate > 0 && (
          <p className="px-3 py-2 text-[11px]" style={{ color: "var(--muted)" }}>
            <Lock className="mr-1 inline h-3 w-3" />
            {bloccate} {bloccate === 1 ? "rata ricostruita" : "rate ricostruite"} dal pregresso: le
            loro righe di cassa sono riconciliate a mano e il generatore non le riscrive.
          </p>
        )}
      </div>

      {/* Ripartizione */}
      <div className="card overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <b className="text-[12.5px]">Ripartizione fra i progetti</b>
          <span className="num text-[11.5px]" style={{ color: "var(--muted)" }}>
            {allocazioni.length} {allocazioni.length === 1 ? "voce" : "voci"}
          </span>
        </div>
        {allocazioni.length === 0 ? (
          <p className="px-3 py-4 text-[12px]" style={{ color: "var(--muted)" }}>
            Nessuna ripartizione: la spesa pesa intera sulla commessa di testata.
          </p>
        ) : (
          <ul className="max-h-[260px] overflow-y-auto">
            {allocazioni.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px]"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <span className="min-w-0 flex-1 truncate">{a.etichetta ?? "—"}</span>
                {a.pct !== null && (
                  <span className="num text-[11.5px]" style={{ color: "var(--muted)" }}>
                    {a.pct}%
                  </span>
                )}
                <Money valore={a.importo} valuta={ordine.currency} />
                <button
                  type="button"
                  onClick={() => eliminaAlloc.mutateAsync(a.id)}
                  aria-label="Togli"
                  style={{ color: "var(--faint)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Pezzi minuti ─────────────────────────────────────────────────────────── */

function Campo({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{etichetta}</dt>
      <dd className="m-0 mt-0.5">{children}</dd>
    </div>
  );
}

function Azione({
  children,
  onClick,
  icona,
  primaria,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icona?: React.ReactNode;
  primaria?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold"
      style={
        primaria
          ? { background: "var(--teal)", color: "#fff" }
          : { border: "1px solid var(--border)", background: "#fff", color: "var(--muted)" }
      }
    >
      {icona}
      {children}
    </button>
  );
}

function Rata({
  c,
  totale,
  valuta,
  onSalva,
  onElimina,
}: {
  c: CondizionePO;
  totale: number;
  valuta: RichiestaFornitura["currency"];
  onSalva: (campi: Partial<CondizionePO>) => Promise<unknown>;
  onElimina: () => Promise<unknown>;
}) {
  const valore = c.importo ?? (totale * (c.pct ?? 0)) / 100;
  const bloccata = !c.rigenerabile;

  return (
    <li
      className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="num w-5 shrink-0 text-[11px]" style={{ color: "var(--faint)" }}>
        {c.ordine}
      </span>

      <input
        defaultValue={c.nome}
        onBlur={(e) => e.target.value !== c.nome && onSalva({ nome: e.target.value })}
        disabled={bloccata}
        className="min-w-[120px] flex-1 rounded-[8px] px-1.5 py-1 outline-none disabled:opacity-60"
        style={{ border: "1px solid var(--border)", background: bloccata ? "transparent" : "#fff" }}
      />

      {c.pct !== null ? (
        <span className="inline-flex items-center gap-0.5">
          <input
            type="number"
            min={0.01}
            max={100}
            step={0.01}
            defaultValue={c.pct}
            onBlur={(e) =>
              Number(e.target.value) !== c.pct && onSalva({ pct: Number(e.target.value) })
            }
            disabled={bloccata}
            className="num w-[62px] rounded-[8px] px-1.5 py-1 text-right outline-none disabled:opacity-60"
            style={{ border: "1px solid var(--border)", background: bloccata ? "transparent" : "#fff" }}
          />
          <span style={{ color: "var(--muted)" }}>%</span>
        </span>
      ) : (
        <input
          type="number"
          step={0.01}
          defaultValue={c.importo ?? 0}
          onBlur={(e) =>
            Number(e.target.value) !== c.importo && onSalva({ importo: Number(e.target.value) })
          }
          disabled={bloccata}
          className="num w-[96px] rounded-[8px] px-1.5 py-1 text-right outline-none disabled:opacity-60"
          style={{ border: "1px solid var(--border)", background: bloccata ? "transparent" : "#fff" }}
        />
      )}

      <select
        value={c.evento}
        onChange={(e) => onSalva({ evento: e.target.value as EventoCondizione })}
        disabled={bloccata}
        className="rounded-[8px] px-1 py-1 text-[11.5px] outline-none disabled:opacity-60"
        style={{ border: "1px solid var(--border)", background: bloccata ? "transparent" : "#fff" }}
      >
        {Object.entries(EVENTI).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <span className="inline-flex items-center gap-0.5">
        <span style={{ color: "var(--muted)" }}>+</span>
        <input
          type="number"
          min={0}
          defaultValue={c.giorni}
          onBlur={(e) =>
            Number(e.target.value) !== c.giorni && onSalva({ giorni: Number(e.target.value) })
          }
          disabled={bloccata}
          className="num w-[52px] rounded-[8px] px-1 py-1 text-right outline-none disabled:opacity-60"
          style={{ border: "1px solid var(--border)", background: bloccata ? "transparent" : "#fff" }}
        />
        <span style={{ color: "var(--muted)" }}>gg</span>
      </span>

      <Money valore={valore} valuta={valuta} className="w-[92px] text-right" />

      {!c.ripartita && (
        <Pill tinta="neutro" className="text-[10px]">
          non ripartita
        </Pill>
      )}

      {bloccata ? (
        <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--faint)" }} />
      ) : (
        <button type="button" onClick={onElimina} aria-label="Togli la rata" style={{ color: "var(--faint)" }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
