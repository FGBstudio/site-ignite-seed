import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, Clock, FileWarning, TriangleAlert } from "lucide-react";
import { usePortafoglio, useCorsieSito, type RigaPortafoglio } from "@/hooks/usePortafoglio";
import { useConfermeInSospeso } from "@/hooks/useCronoprogramma";
import {
  ColumnFilter,
  applyColumnFiltersAndSort,
  type ColFiltersMap,
  type SortConfig,
} from "@/components/common/ColumnFilter";
import { proponiTipo } from "@/lib/projectTimelineTemplates";

const d = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * PROJECTS — la vista admin dei cantieri, v1.1 §12.
 *
 * Stessa griglia di SERVICES: stessi controlli di ordinamento e filtro, stessa
 * resa dei tag, cosi' l'admin non impara due interfacce. Sopra restano i KPI e
 * le liste di eccezione della vista direzionale (v1 §8.4): l'admin non vuole
 * guardare tutto, vuole che il sistema gli dica cosa guardare.
 *
 * Lo Status e' derivato, mai compilato a mano: la data di oggi contro la
 * PROJECT TIMELINE. Design fino al construction start, Construction fino
 * all'handover, Certification fino all'ultimo attainment.
 */

type StatusProgetto = "design" | "construction" | "certification";

const STATUS_META: Record<StatusProgetto, { label: string; className: string }> = {
  design: { label: "Design", className: "border-border bg-muted/60 text-muted-foreground" },
  construction: { label: "Construction", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  certification: { label: "Certification", className: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300" },
};

interface ExtraSito {
  country: string | null;
  region: string | null;
  typology: string | null;
  certTags: string[];
  tuttiExisting: boolean;
  handover: string | null;
  constructionStart: string | null;
  primaData: string | null;
}

/** I dati che fn_portafoglio_siti non porta: tipologia, paese, tag, date chiave. */
function useExtraSiti() {
  return useQuery({
    queryKey: ["portafoglio", "extra"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ExtraSito>> => {
      const [{ data: siti }, { data: certs }, { data: croni }] = await Promise.all([
        (supabase as any).from("sites").select("id, country, region, typology"),
        (supabase as any)
          .from("certifications")
          .select("site_id, cert_type, cert_rating, status")
          .not("status", "in", '("canceled","cancelled","potential","quotation")'),
        (supabase as any).from("cronoprogrammi").select("id, site_id").eq("stato", "attivo"),
      ]);

      const cronoIds = ((croni ?? []) as any[]).map((c) => c.id);
      const { data: eventi } = cronoIds.length
        ? await (supabase as any)
            .from("cronoprogramma_eventi")
            .select("cronoprogramma_id, ancora, data_pianificata, data_effettiva")
            .in("cronoprogramma_id", cronoIds)
        : { data: [] };

      const cronoPerSito = new Map<string, string>(
        ((croni ?? []) as any[]).map((c) => [c.site_id, c.id])
      );
      const eventiPerCrono = new Map<string, any[]>();
      for (const e of (eventi ?? []) as any[]) {
        if (!eventiPerCrono.has(e.cronoprogramma_id)) eventiPerCrono.set(e.cronoprogramma_id, []);
        eventiPerCrono.get(e.cronoprogramma_id)!.push(e);
      }

      const out = new Map<string, ExtraSito>();
      for (const s of (siti ?? []) as any[]) {
        const proprie = ((certs ?? []) as any[]).filter((c) => c.site_id === s.id);
        const tags = Array.from(new Set(proprie.map((c) => c.cert_type).filter(Boolean))) as string[];
        const tuttiExisting =
          proprie.length > 0 &&
          proprie.every((c) => proponiTipo(c.cert_type, c.cert_rating).tipo === "existing");

        const cronoId = cronoPerSito.get(s.id);
        const evs = cronoId ? eventiPerCrono.get(cronoId) ?? [] : [];
        const dataDi = (ancora: string) => {
          const e = evs.find((x) => x.ancora === ancora);
          return e ? e.data_effettiva ?? e.data_pianificata ?? null : null;
        };
        const date = evs
          .map((e) => e.data_effettiva ?? e.data_pianificata)
          .filter(Boolean)
          .sort();

        out.set(s.id, {
          country: s.country,
          region: s.region,
          typology: s.typology,
          certTags: tags,
          tuttiExisting,
          handover: dataDi("handover"),
          constructionStart: dataDi("construction_start"),
          primaData: date[0] ?? null,
        });
      }
      return out;
    },
  });
}

function derivaStatus(r: RigaPortafoglio, extra: ExtraSito | undefined, oggi: string): StatusProgetto {
  if (!r.cronoprogramma_id) {
    // EXISTING non ha PROJECT TIMELINE ed e' sempre Certification; un progetto
    // di cantiere non ancora compilato sta prima del concept design → Design.
    return extra?.tuttiExisting ? "certification" : "design";
  }
  const start = extra?.constructionStart;
  const hand = extra?.handover;
  if (start && oggi < start) return "design";
  if (hand && oggi < hand) return "construction";
  if (!start && !hand) return "design";
  return "certification";
}

export default function ProjectsAdmin() {
  const navigate = useNavigate();
  const [soglia, setSoglia] = useState(21);
  const { data: righe = [], isLoading } = usePortafoglio(soglia);
  const { data: extra } = useExtraSiti();
  const { data: conferme = [] } = useConfermeInSospeso(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");
  const [colFilters, setColFilters] = useState<ColFiltersMap>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const oggi = format(new Date(), "yyyy-MM-dd");

  const attive = useMemo(() => righe.filter((r) => !r.storico), [righe]);
  const aRischio = useMemo(() => attive.filter((r) => r.a_rischio), [attive]);
  const conVincoli = useMemo(() => attive.filter((r) => r.vincoli_violati > 0), [attive]);
  const stantii = useMemo(() => attive.filter((r) => r.stantio), [attive]);

  const resolvers = useMemo(
    () => ({
      client: (r: RigaPortafoglio) => r.cliente ?? "",
      city: (r: RigaPortafoglio) => r.citta ?? "",
      project: (r: RigaPortafoglio) => r.sito,
      country: (r: RigaPortafoglio) => extra?.get(r.site_id)?.country ?? "",
      region: (r: RigaPortafoglio) => extra?.get(r.site_id)?.region ?? "",
      certifications: (r: RigaPortafoglio) => (extra?.get(r.site_id)?.certTags ?? []).join(" "),
      typology: (r: RigaPortafoglio) => extra?.get(r.site_id)?.typology ?? "",
      status: (r: RigaPortafoglio) => STATUS_META[derivaStatus(r, extra?.get(r.site_id), oggi)].label,
    }),
    [extra, oggi]
  );

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const base = q
      ? righe.filter(
          (r) =>
            r.sito.toLowerCase().includes(q) ||
            (r.citta ?? "").toLowerCase().includes(q) ||
            (r.cliente ?? "").toLowerCase().includes(q)
        )
      : righe;
    return applyColumnFiltersAndSort(base, colFilters, sortConfig, resolvers as any);
  }, [righe, cerca, colFilters, sortConfig, resolvers]);

  return (
    <MainLayout
      title="Projects"
      subtitle="Una riga per sito. Lo Status e' derivato dalla PROJECT TIMELINE, mai compilato a mano."
    >
      {/* ── KPI ── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi etichetta="Certificazioni attive"
             valore={attive.reduce((n, r) => n + r.certificazioni, 0)}
             nota={`${attive.length} siti`} />
        <Kpi etichetta="Contratti a rischio"
             valore={aRischio.length}
             nota={aRischio.length ? aRischio.map((r) => r.sito).slice(0, 2).join(", ") : "nessuno"}
             tono={aRischio.length ? "male" : "bene"} />
        <Kpi etichetta="Conferme in sospeso"
             valore={conferme.length}
             nota={conferme.length ? `${conferme.length} PM devono decidere` : "nessuna"}
             tono={conferme.length ? "attenzione" : "bene"} />
        <Kpi etichetta="Dati stantii"
             valore={stantii.length}
             nota={`PROJECT TIMELINE ferme da oltre ${soglia} giorni`}
             tono={stantii.length ? "attenzione" : "bene"} />
      </div>

      {/* ── Eccezioni ── */}
      <Card className="mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Da attenzionare</h2>
            <p className="text-xs text-muted-foreground">Le eccezioni, non tutto il portafoglio.</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            dato stantio dopo
            <Input
              type="number"
              value={soglia}
              min={1}
              onChange={(e) => setSoglia(Number(e.target.value) || 21)}
              className="h-7 w-16 text-xs"
            />
            giorni
          </label>
        </div>

        <div className="space-y-2">
          {aRischio.map((r) => (
            <Eccezione key={`r-${r.site_id}`} tono="male" icona={<TriangleAlert className="h-3.5 w-3.5" />} onClick={() => setAperta(r.site_id)}>
              <b>{r.sito}</b>: fine stimata {d(r.fine_stimata)}, oltre la scadenza del {d(r.scadenza_contratto)}.{" "}
              {r.mesi_proroga ? `Circa ${r.mesi_proroga} ${r.mesi_proroga === 1 ? "mese" : "mesi"} di proroga da negoziare.` : ""}
              {r.slittamento_giorni ? ` Slittamento ${r.slittamento_giorni > 0 ? "+" : ""}${r.slittamento_giorni} gg vs baseline.` : ""}
            </Eccezione>
          ))}
          {conferme.map((c) => (
            <Eccezione key={`c-${c.proposta_id}`} tono="attenzione" icona={<Clock className="h-3.5 w-3.5" />} onClick={() => navigate(`/projects/${c.certification_id}/cronoprogramma`)}>
              <b>{c.certificazione}</b> — {c.sito}: {c.milestone_da_spostare} date proposte dallo spostamento, in attesa di conferma del PM.
            </Eccezione>
          ))}
          {conVincoli.map((r) => (
            <Eccezione key={`v-${r.site_id}`} tono="attenzione" icona={<FileWarning className="h-3.5 w-3.5" />} onClick={() => setAperta(r.site_id)}>
              <b>{r.sito}</b>: {r.vincoli_violati} {r.vincoli_violati === 1 ? "vincolo di precedenza violato" : "vincoli di precedenza violati"}.
            </Eccezione>
          ))}
          {stantii.map((r) => (
            <Eccezione key={`s-${r.site_id}`} tono="attenzione" icona={<Clock className="h-3.5 w-3.5" />} onClick={() => setAperta(r.site_id)}>
              <b>{r.sito}</b>: date aggiornate {r.freschezza_giorni} giorni fa. Chiedere il gantt corrente al GC.
            </Eccezione>
          ))}
          {aRischio.length + conferme.length + conVincoli.length + stantii.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              {isLoading ? "Caricamento…" : "Niente da attenzionare."}
            </p>
          )}
        </div>
      </Card>

      {/* ── La tabella gemella di SERVICES ── */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Portafoglio per sito</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5">
              <ColumnFilter title="Client" colKey="client" rows={righe} getValue={resolvers.client} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Country" colKey="country" rows={righe} getValue={resolvers.country} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Typology" colKey="typology" rows={righe} getValue={resolvers.typology} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Status" colKey="status" rows={righe} getValue={resolvers.status} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
            </div>
            <Input
              placeholder="Cerca sito, citta', cliente…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              className="h-8 w-56 text-xs"
            />
          </div>
        </div>

        <div className="table-container">
          <table className="w-full text-sm" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-left font-medium">City</th>
                <th className="px-3 py-2 text-left font-medium">Project</th>
                <th className="px-3 py-2 text-left font-medium">Country</th>
                <th className="px-3 py-2 text-left font-medium">Region</th>
                <th className="px-3 py-2 text-left font-medium">Certifications</th>
                <th className="px-3 py-2 text-left font-medium">Typology</th>
                <th className="px-3 py-2 text-left font-medium">Handover</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibili.slice(0, 200).map((r) => (
                <RigaSito
                  key={r.site_id}
                  r={r}
                  x={extra?.get(r.site_id)}
                  oggi={oggi}
                  aperta={aperta === r.site_id}
                  onToggle={() => setAperta(aperta === r.site_id ? null : r.site_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {visibili.length > 200 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Mostrati i primi 200 di {visibili.length}. Restringi con la ricerca o i filtri.
          </p>
        )}
      </Card>
    </MainLayout>
  );
}

// ── Pezzi ─────────────────────────────────────────────────────────────────

function Kpi({ etichetta, valore, nota, tono }: { etichetta: string; valore: number; nota: string; tono?: "bene" | "male" | "attenzione" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{valore}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-[11px]",
          tono === "male" && "text-destructive",
          tono === "attenzione" && "text-amber-700 dark:text-amber-400",
          tono === "bene" && "text-emerald-700 dark:text-emerald-400",
          !tono && "text-muted-foreground"
        )}
        title={nota}
      >
        {nota}
      </p>
    </Card>
  );
}

function Eccezione({ tono, icona, children, onClick }: { tono: "male" | "attenzione"; icona: React.ReactNode; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
        tono === "male"
          ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
          : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      )}
    >
      <span className="mt-0.5 shrink-0">{icona}</span>
      <span>{children}</span>
    </button>
  );
}

function RigaSito({
  r,
  x,
  oggi,
  aperta,
  onToggle,
}: {
  r: RigaPortafoglio;
  x: ExtraSito | undefined;
  oggi: string;
  aperta: boolean;
  onToggle: () => void;
}) {
  const status = derivaStatus(r, x, oggi);
  const meta = STATUS_META[status];

  return (
    <>
      <tr
        className={cn("cursor-pointer border-b transition-colors hover:bg-muted/40", r.storico && "opacity-55")}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 text-xs font-semibold uppercase">{r.cliente ?? "—"}</td>
        <td className="px-3 py-2.5 text-xs uppercase text-muted-foreground">{r.citta ?? "—"}</td>
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-1.5">
            {aperta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="text-sm font-medium">{r.sito}</span>
            {r.storico && <Badge variant="outline" className="text-[10px]">storico</Badge>}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{x?.country ?? "—"}</td>
        <td className="px-3 py-2.5">
          {x?.region ? (
            <Badge variant="outline" className="rounded-full bg-muted/40 px-2.5 py-0.5 text-xs font-normal">{x.region}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className="flex flex-wrap gap-1">
            {(x?.certTags ?? []).slice(0, 4).map((t) => (
              <Badge key={t} variant="secondary" className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] font-medium">
                {t}
              </Badge>
            ))}
            {(x?.certTags.length ?? 0) > 4 && (
              <span className="text-[10px] text-muted-foreground">+{x!.certTags.length - 4}</span>
            )}
            {(x?.certTags.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{x?.typology ?? "—"}</td>
        <td className="px-3 py-2.5 text-xs tabular-nums">
          {x?.handover ? (
            <span>
              {d(x.handover)}
              {/* Lo scostamento dalla baseline contrattuale: discreto, accanto alla data. */}
              {r.slittamento_giorni != null && r.slittamento_giorni !== 0 && (
                <span className={cn("ml-1.5 text-[10px]", r.slittamento_giorni > 20 ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                  {r.slittamento_giorni > 0 ? "+" : ""}
                  {r.slittamento_giorni}g
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-medium", meta.className)}>
            {meta.label}
          </Badge>
        </td>
      </tr>

      {aperta && (
        <tr className="border-b bg-muted/20">
          <td colSpan={9} className="p-4">
            <DrillDown r={r} x={x} oggi={oggi} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * La riga espansa — v1.1 §12.2. Tutto sulla stessa scala temporale: la barra
 * PROJECT segmentata nelle tre fasi, una barra per certificazione con le
 * milestone come tacche ed etichette sfalsate, la linea dell'oggi che
 * attraversa tutto — e' cio' che rende leggibile lo Status a colpo d'occhio.
 */
function DrillDown({ r, x, oggi }: { r: RigaPortafoglio; x: ExtraSito | undefined; oggi: string }) {
  const navigate = useNavigate();
  const { data: corsie } = useCorsieSito(r.site_id, r.cronoprogramma_id, true);

  const modello = useMemo(() => {
    if (!corsie) return null;
    const tutte: string[] = [];
    for (const e of corsie.eventi) if (e.data) tutte.push(e.data);
    for (const c of corsie.certificazioni)
      for (const m of c.milestone) if (m.due_date) tutte.push(m.due_date);
    tutte.push(oggi);
    if (tutte.length < 2) return null;
    tutte.sort();
    const min = tutte[0];
    const max = tutte[tutte.length - 1];
    const span = Math.max(60, giorni(min, max));
    const pos = (dd: string) => Math.min(99.5, Math.max(0.5, (giorni(min, dd) / span) * 100));
    return { min, max, span, pos };
  }, [corsie, oggi]);

  if (!corsie) return <p className="text-xs text-muted-foreground">Caricamento…</p>;
  if (!modello)
    return (
      <p className="text-xs text-muted-foreground">
        Nessuna data ancora: il PM non ha compilato la PROJECT TIMELINE o la timeline.
      </p>
    );

  const { pos } = modello;
  const inizio = x?.primaData ?? modello.min;
  const start = x?.constructionStart;
  const hand = x?.handover;
  const ultimaCert = corsie.certificazioni
    .flatMap((c) => c.milestone.map((m) => m.due_date))
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  const anni = anniTra(modello.min, modello.max);

  return (
    <div className="space-y-3">
      {/* La scala: anni e trimestri come tacche. */}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {anni.map((a) => (
          <span key={a} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pos(a)}%` }}>
            {a.slice(0, 4)}
          </span>
        ))}
      </div>

      <div className="relative space-y-3">
        {/* Barra PROJECT: Design | Construction | Certification. */}
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Project</p>
          <div className="relative h-5 overflow-hidden rounded-md bg-muted/40">
            {start && (
              <div
                className="absolute inset-y-0 rounded-l-md bg-muted-foreground/25"
                style={{ left: `${pos(inizio)}%`, width: `${Math.max(0.5, pos(start) - pos(inizio))}%` }}
                title={`Design · ${d(inizio)} → ${d(start)}`}
              />
            )}
            {start && hand && (
              <div
                className="absolute inset-y-0 bg-amber-400/70 dark:bg-amber-600/60"
                style={{ left: `${pos(start)}%`, width: `${Math.max(0.5, pos(hand) - pos(start))}%` }}
                title={`Construction · ${d(start)} → ${d(hand)}`}
              />
            )}
            {hand && ultimaCert && ultimaCert > hand && (
              <div
                className="absolute inset-y-0 rounded-r-md bg-violet-400/60 dark:bg-violet-600/50"
                style={{ left: `${pos(hand)}%`, width: `${Math.max(0.5, pos(ultimaCert) - pos(hand))}%` }}
                title={`Certification · ${d(hand)} → ${d(ultimaCert)}`}
              />
            )}
          </div>
        </div>

        {/* Una barra per certificazione: tacche + etichette sfalsate. */}
        {corsie.certificazioni.map((c) => {
          const singole = c.milestone.filter((m) => m.series_step_order === null && m.due_date);
          const serie = c.milestone.filter((m) => m.series_step_order !== null && m.due_date);
          return (
            <div key={c.id}>
              <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.nome} <span className="normal-case">· {c.pm ?? "senza PM"}</span>
              </p>
              {/* Etichette sopra la barra, su due righe quando si affollano. */}
              <div className="relative h-7 text-[9px] text-muted-foreground">
                {singole.map((m, i) => (
                  <span
                    key={i}
                    className="absolute -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${pos(m.due_date!)}%`, top: i % 2 === 0 ? 0 : 12 }}
                    title={`${m.requirement} · ${d(m.due_date)}`}
                  >
                    {m.requirement.length > 18 ? `${m.requirement.slice(0, 17)}…` : m.requirement}
                  </span>
                ))}
                {serie.length > 0 && (
                  <span
                    className="absolute -translate-x-1/2 whitespace-nowrap text-violet-700 dark:text-violet-400"
                    style={{ left: `${pos(serie[Math.floor(serie.length / 2)].due_date!)}%`, top: 12 }}
                  >
                    report mensili 1…{serie.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/projects/${c.id}/cronoprogramma`)}
                className="relative block h-4 w-full cursor-pointer rounded-md bg-violet-100/70 transition-colors hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
                title={`Apri ${c.nome}`}
              >
                {singole.map((m, i) => (
                  <span
                    key={i}
                    className="absolute top-0.5 h-3 w-[3px] -translate-x-1/2 rounded-full bg-violet-600 dark:bg-violet-400"
                    style={{ left: `${pos(m.due_date!)}%` }}
                  />
                ))}
                {serie.map((m, i) => (
                  <span
                    key={`s${i}`}
                    className="absolute top-1 h-2 w-[2px] -translate-x-1/2 rounded-full bg-violet-400/70 dark:bg-violet-500/60"
                    style={{ left: `${pos(m.due_date!)}%` }}
                  />
                ))}
              </button>
            </div>
          );
        })}

        {/* La linea dell'oggi, attraverso tutte le barre. */}
        <div
          className="pointer-events-none absolute -top-1 bottom-0 w-px border-l border-dashed border-destructive"
          style={{ left: `${pos(oggi)}%` }}
        >
          <span className="absolute -top-3 left-1 text-[9px] font-medium text-destructive">oggi</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {r.slittamento_giorni != null && r.slittamento_giorni !== 0 &&
          `Slittamento ${r.slittamento_giorni > 0 ? "+" : ""}${r.slittamento_giorni} gg vs baseline · `}
        {r.fine_stimata && `fine stimata ${d(r.fine_stimata)} · `}
        {r.scadenza_contratto && `contratto al ${d(r.scadenza_contratto)} · `}
        clic su una corsia per aprire il dettaglio.
      </p>
    </div>
  );
}

function giorni(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** I primi gennaio compresi, per la scala del drill-down. */
function anniTra(da: string, a: string): string[] {
  const out: string[] = [];
  for (let y = parseISO(da).getFullYear(); y <= parseISO(a).getFullYear(); y++) {
    const iso = `${y}-01-01`;
    if (iso >= da && iso <= a) out.push(iso);
  }
  return out;
}
