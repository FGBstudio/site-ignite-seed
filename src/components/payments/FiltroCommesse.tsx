import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { importo } from "@/lib/payments/aggregati";
import type { SerieCommessa } from "@/lib/payments/wbs";

/**
 * Il filtro delle commesse.
 *
 * Un controllo solo, non un pulsante per commessa: con venti commesse una fila
 * di pastiglie occupa mezza schermata, con cento non sta in pagina. Qui il
 * riepilogo sta in un campo compatto e la scelta si fa in un popover che
 * cerca, raggruppa e mostra l'andamento di ciascuna — perché scegliere una
 * commessa «in deficit» richiede di vederne il saldo, non solo il nome.
 *
 * Si persiste l'elenco delle *escluse* e non delle incluse: così una commessa
 * creata domani entra accesa, invece di restare invisibile finché qualcuno non
 * se ne accorge.
 */

export interface VoceCommessa {
  nome: string;
  categoria: string;
  brand: string | null;
  contratto: string | null;
  serie: SerieCommessa | null;
}

interface Props {
  voci: VoceCommessa[];
  escluse: Set<string>;
  isolata: string | null;
  onCambia: (escluse: Set<string>, isolata: string | null) => void;
}

/** Senza accenti e senza maiuscole: «Vendôme» si trova scrivendo «vendome». */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function combacia(v: VoceCommessa, q: string): boolean {
  if (!q) return true;
  const fieno = norm([v.nome, v.categoria, v.brand, v.contratto].filter(Boolean).join(" "));
  return norm(q).split(/\s+/).filter(Boolean).every((t) => fieno.includes(t));
}

/** Evidenzia i termini trovati, senza toccare il testo originale. */
function Evidenzia({ testo, q }: { testo: string; q: string }) {
  if (!q.trim()) return <>{testo}</>;
  const termini = norm(q).split(/\s+/).filter(Boolean);
  const base = norm(testo);
  const dentro = new Array(testo.length).fill(false);
  for (const t of termini) {
    let i = base.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) dentro[k] = true;
      i = base.indexOf(t, i + 1);
    }
  }
  const pezzi: Array<{ s: string; on: boolean }> = [];
  for (let i = 0; i < testo.length; i++) {
    const on = dentro[i];
    if (pezzi.length && pezzi[pezzi.length - 1].on === on) pezzi[pezzi.length - 1].s += testo[i];
    else pezzi.push({ s: testo[i], on });
  }
  return (
    <>
      {pezzi.map((p, i) => (p.on ? <mark key={i}>{p.s}</mark> : <span key={i}>{p.s}</span>))}
    </>
  );
}

function tinta(v: number, max: number): string {
  if (v <= 0) return "#fff";
  return `color-mix(in srgb, var(--teal) ${Math.round(28 + 72 * Math.min(1, v / max))}%, #fff)`;
}

/** La mini-striscia: la stessa scala della timeline, in 64 pixel. */
function Striscia({ serie }: { serie: SerieCommessa | null }) {
  if (!serie) return <span className="spark" aria-hidden />;
  const max = Math.max(1, ...serie.cumulato);
  return (
    <span className="spark" aria-hidden>
      {serie.cumulato.map((v, i) => (
        <i key={i} style={{ background: tinta(v, max) }} />
      ))}
    </span>
  );
}

export default function FiltroCommesse({ voci, escluse, isolata, onCambia }: Props) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const accese = voci.filter((v) => !escluse.has(v.nome));
  const risultati = useMemo(() => voci.filter((v) => combacia(v, q)), [voci, q]);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setAperto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAperto(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    const t = setTimeout(() => campo.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
      clearTimeout(t);
    };
  }, [aperto]);

  const applica = (tenute: Set<string>) =>
    onCambia(new Set(voci.filter((v) => !tenute.has(v.nome)).map((v) => v.nome)), null);

  const commuta = (nome: string) => {
    const s = new Set(escluse);
    if (s.has(nome)) s.delete(nome);
    else s.add(nome);
    onCambia(s, null);
  };

  const soltanto = (nome: string) => applica(new Set([nome]));

  // Le categorie si mostrano solo se la ricerca ne ha lasciato qualcosa.
  const gruppi = useMemo(() => {
    const m = new Map<string, VoceCommessa[]>();
    risultati.forEach((v) => {
      if (!m.has(v.categoria)) m.set(v.categoria, []);
      m.get(v.categoria)!.push(v);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [risultati]);

  const riepilogo =
    escluse.size === 0
      ? `Tutte · ${voci.length}`
      : accese.length === 1
        ? accese[0].nome
        : accese.length === 0
          ? "Nessuna"
          : `${accese.length} di ${voci.length}`;

  return (
    <div className="fwrap" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={`fbtn${escluse.size ? " active" : ""}`}
        aria-expanded={aperto}
        aria-haspopup="dialog"
        onClick={() => setAperto((a) => !a)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="fl">Commesse</span>
        <span className="fv">{riepilogo}</span>
        {isolata && <span className="isolated-tag">ISOLATA</span>}
        <ChevronDown className="chev h-3.5 w-3.5" />
      </button>

      {aperto && (
        <div className="fpop" role="dialog" aria-label="Scegli le commesse">
          <div className="fsearch">
            <Search className="h-4 w-4" />
            <input
              ref={campo}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca per nome, brand, inviluppo, contratto…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim() && risultati.length) {
                  applica(new Set(risultati.map((v) => v.nome)));
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  box.current?.querySelector<HTMLInputElement>(".fitem input")?.focus();
                }
              }}
            />
          </div>

          <div className="fquick">
            {q.trim() ? (
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={() => applica(new Set(risultati.map((v) => v.nome)))}
                >
                  Solo i risultati ({risultati.length})<span className="kbd">Invio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const s = new Set(escluse);
                    risultati.forEach((v) => s.delete(v.nome));
                    onCambia(s, null);
                  }}
                >
                  Aggiungi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const s = new Set(escluse);
                    risultati.forEach((v) => s.add(v.nome));
                    onCambia(s, null);
                  }}
                >
                  Escludi
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onCambia(new Set(), null)}>
                  Tutte
                </button>
                <button
                  type="button"
                  onClick={() => onCambia(new Set(voci.map((v) => v.nome)), null)}
                >
                  Nessuna
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applica(
                      new Set(
                        voci
                          .filter((v) => v.serie?.cumulato.some((x) => x < 0))
                          .map((v) => v.nome),
                      ),
                    )
                  }
                >
                  In deficit
                </button>
                <button
                  type="button"
                  onClick={() => applica(new Set(voci.filter((v) => (v.serie?.uscite ?? 0) < 0).map((v) => v.nome)))}
                >
                  Con uscite
                </button>
              </>
            )}
          </div>

          <div className="flist">
            {gruppi.length === 0 && <p className="fempty">Nessuna commessa corrisponde.</p>}
            {gruppi.map(([categoria, lista]) => {
              const on = lista.filter((v) => !escluse.has(v.nome)).length;
              return (
                <div key={categoria}>
                  <div className="fgrp">
                    <input
                      type="checkbox"
                      checked={on === lista.length}
                      ref={(el) => {
                        if (el) el.indeterminate = on > 0 && on < lista.length;
                      }}
                      aria-label={`Tutte le commesse ${categoria}`}
                      onChange={() => {
                        const s = new Set(escluse);
                        if (on === lista.length) lista.forEach((v) => s.add(v.nome));
                        else lista.forEach((v) => s.delete(v.nome));
                        onCambia(s, null);
                      }}
                    />
                    {categoria}
                    <span className="n">
                      {on}/{lista.length}
                    </span>
                  </div>

                  {lista.map((v) => {
                    const accesa = !escluse.has(v.nome);
                    return (
                      <label key={v.nome} className={`fitem${accesa ? "" : " off"}`}>
                        <input
                          type="checkbox"
                          checked={accesa}
                          onChange={() => commuta(v.nome)}
                          aria-label={v.nome}
                        />
                        <span className="nm">
                          <Evidenzia testo={v.nome} q={q} />
                          <small>
                            {[v.brand, v.contratto].filter(Boolean).join(" · ") || v.categoria}
                          </small>
                        </span>
                        <Striscia serie={v.serie} />
                        <span
                          className="end num"
                          style={{
                            color: (v.serie?.saldo ?? 0) < 0 ? "var(--red)" : "var(--muted)",
                          }}
                        >
                          {importo(v.serie?.saldo ?? 0)}
                        </span>
                        <button
                          type="button"
                          className="solo"
                          onClick={(e) => {
                            e.preventDefault();
                            soltanto(v.nome);
                          }}
                        >
                          Solo →
                        </button>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="ffoot">
            <span>
              {accese.length} di {voci.length} selezionate
            </span>
            <button type="button" onClick={() => setAperto(false)}>
              Fatto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
