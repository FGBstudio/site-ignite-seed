import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ListFilter,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { usePortafoglio, useCorsieSito, type RigaPortafoglio } from "@/hooks/usePortafoglio";
import { PIETRA, stilePill, tintaServizio } from "@/lib/serviceColors";
import { proponiTipo } from "@/lib/projectTimelineTemplates";
import { AnelloAvanzamento } from "@/components/cronoprogramma/AnelloAvanzamento";

const d = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * PROJECTS — la vista admin, riscritta secondo la v1.2.
 *
 * Sistema colore unico per servizio, Status a quattro stati derivati piu' On
 * Hold manuale, KPI di testata che filtrano al click, barra filtri con chip e
 * stato nell'URL, header sticky, e il drill-down ristrutturato: colonna
 * sinistra congelata, confini di fase prolungati, modalita' Adatta/Scorri.
 *
 * Niente «storico» e niente «dato stantio»: mai richiesti, rimossi (v1.2 §5).
 */

// ── Status: quattro stati derivati + On Hold (v1.2 §5) ────────────────────

type Status = "design" | "construction" | "certification" | "certified" | "onhold";

const STATUS_META: Record<Status, { label: string; stile: React.CSSProperties; classe?: string }> = {
  design:        { label: "Design",        stile: { background: PIETRA.design, color: PIETRA.inchiostro, borderColor: PIETRA.construction } },
  construction:  { label: "Construction",  stile: { background: PIETRA.construction, color: "#3A3E35", borderColor: PIETRA.certification } },
  certification: { label: "Certification", stile: { background: PIETRA.certification, color: "#FFFFFF", borderColor: PIETRA.certification } },
  // Certified è l'unico stato che chiude un percorso, ed è l'unico che porta
  // il teal del marchio: nella scala di pietra gli altri tre sono gradazioni
  // della stessa terra, e il salto di colore dice «qui si è arrivati».
  certified:     { label: "Certified",     stile: { background: "hsl(var(--primary))", color: "#FFFFFF", borderColor: "hsl(var(--primary))" } },
  // L'unico stato manuale: outline tratteggiato, prevale sul derivato.
  onhold:        { label: "On Hold",       stile: { background: "transparent", color: "#8A5A00", borderColor: "#D97706", borderStyle: "dashed" } },
};

/** ~5 giorni lavorativi di tolleranza sul ritardo timeline (default v1.2 §7). */
const TOLLERANZA_RITARDO_GIORNI = 7;

// ── I dati che fn_portafoglio_siti non porta ──────────────────────────────

interface CertDettaglio {
  id: string;
  cert_type: string | null;
  cert_rating: string | null;
  status: string | null;
  issued: boolean;
  on_hold: boolean;
  on_hold_reason: string | null;
  pm_id: string | null;
  pm_nome: string | null;
}

interface ExtraSito {
  country: string | null;
  region: string | null;
  typology: string | null;
  certs: CertDettaglio[];
  tuttiExisting: boolean;
  handover: string | null;
  constructionStart: string | null;
  primaData: string | null;
}

function useExtraSiti() {
  return useQuery({
    queryKey: ["projects-admin", "extra"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ExtraSito>> => {
      const [{ data: siti }, { data: certs }, { data: croni }] = await Promise.all([
        (supabase as any).from("sites").select("id, country, region, typology"),
        (supabase as any)
          .from("certifications")
          .select("id, site_id, cert_type, cert_rating, status, issued_date, on_hold, on_hold_reason, pm_id")
          .not("status", "in", '("canceled","cancelled","potential","quotation")'),
        (supabase as any).from("cronoprogrammi").select("id, site_id").eq("stato", "attivo"),
      ]);

      const pmIds = Array.from(new Set(((certs ?? []) as any[]).map((c) => c.pm_id).filter(Boolean)));
      const { data: profili } = pmIds.length
        ? await (supabase as any).from("profiles").select("id, full_name, email").in("id", pmIds)
        : { data: [] };
      const nomePm = new Map<string, string>(
        ((profili ?? []) as any[]).map((p) => [p.id as string, (p.full_name || p.email) as string])
      );

      const cronoIds = ((croni ?? []) as any[]).map((c) => c.id);
      const { data: eventi } = cronoIds.length
        ? await (supabase as any)
            .from("cronoprogramma_eventi")
            .select("cronoprogramma_id, ancora, data_pianificata, data_effettiva")
            .in("cronoprogramma_id", cronoIds)
        : { data: [] };

      const cronoPerSito = new Map<string, string>(((croni ?? []) as any[]).map((c) => [c.site_id, c.id]));
      const eventiPerCrono = new Map<string, any[]>();
      for (const e of (eventi ?? []) as any[]) {
        if (!eventiPerCrono.has(e.cronoprogramma_id)) eventiPerCrono.set(e.cronoprogramma_id, []);
        eventiPerCrono.get(e.cronoprogramma_id)!.push(e);
      }

      const out = new Map<string, ExtraSito>();
      for (const s of (siti ?? []) as any[]) {
        const proprie: CertDettaglio[] = ((certs ?? []) as any[])
          .filter((c) => c.site_id === s.id)
          .map((c) => ({
            id: c.id,
            cert_type: c.cert_type,
            cert_rating: c.cert_rating,
            status: c.status,
            issued: !!c.issued_date || (c.status ?? "").toLowerCase() === "certificato",
            on_hold: !!c.on_hold,
            on_hold_reason: c.on_hold_reason ?? null,
            pm_id: c.pm_id,
            pm_nome: c.pm_id ? nomePm.get(c.pm_id) ?? null : null,
          }));

        const cronoId = cronoPerSito.get(s.id);
        const evs = cronoId ? eventiPerCrono.get(cronoId) ?? [] : [];
        const dataDi = (ancora: string) => {
          const e = evs.find((x) => x.ancora === ancora);
          return e ? e.data_effettiva ?? e.data_pianificata ?? null : null;
        };
        const date = evs.map((e) => e.data_effettiva ?? e.data_pianificata).filter(Boolean).sort();

        out.set(s.id, {
          country: s.country,
          region: s.region,
          typology: s.typology,
          certs: proprie,
          tuttiExisting:
            proprie.length > 0 &&
            proprie.every((c) => proponiTipo(c.cert_type, c.cert_rating).tipo === "existing"),
          handover: dataDi("handover"),
          constructionStart: dataDi("construction_start"),
          primaData: date[0] ?? null,
        });
      }
      return out;
    },
  });
}

/**
 * La condizione 1 di «Da attenzionare» (v1.2 §7): milestone in carico a FGB,
 * non completate e non opzionali, oltre la tolleranza. Misurata sulle date
 * correnti: se il cronoprogramma slitta e la milestone rientra, il ritardo si
 * chiude da solo. Le occorrenze di serie contano come milestone.
 */
function useRitardiTimeline(oggi: string) {
  return useQuery({
    queryKey: ["projects-admin", "ritardi", oggi],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const limite = new Date(`${oggi}T12:00:00`);
      limite.setDate(limite.getDate() - TOLLERANZA_RITARDO_GIORNI);
      const { data } = await (supabase as any)
        .from("certification_milestones")
        .select("certification_id")
        .eq("milestone_type", "timeline")
        .neq("status", "achieved")
        .is("completed_date", null)
        .eq("optional", false)
        .eq("not_applicable", false)
        .lt("due_date", limite.toISOString().slice(0, 10));
      const out = new Map<string, number>();
      for (const m of (data ?? []) as any[]) {
        out.set(m.certification_id, (out.get(m.certification_id) ?? 0) + 1);
      }
      return out;
    },
  });
}

// ── Le derivazioni per riga ───────────────────────────────────────────────

interface RigaV2 {
  base: RigaPortafoglio;
  x: ExtraSito | undefined;
  status: Status;
  /** I motivi On Hold, per l'hover della card e del chip. */
  motiviHold: string[];
  ritardoTimeline: boolean;
  estensione: boolean;
  attenzionare: boolean;
  pmNomi: string[];
}

function derivaRiga(
  r: RigaPortafoglio,
  x: ExtraSito | undefined,
  ritardi: Map<string, number> | undefined,
  oggi: string
): RigaV2 {
  const certs = x?.certs ?? [];
  const attive = certs.filter((c) => !c.issued);
  const certified = certs.length > 0 && attive.length === 0;
  const onHold = !certified && attive.length > 0 && attive.every((c) => c.on_hold);

  let status: Status;
  if (onHold) status = "onhold";
  else if (certified) status = "certified";
  else if (!r.cronoprogramma_id) status = x?.tuttiExisting ? "certification" : "design";
  else if (x?.constructionStart && oggi < x.constructionStart) status = "design";
  else if (x?.handover && oggi < x.handover) status = "construction";
  else if (!x?.constructionStart && !x?.handover) status = "design";
  else status = "certification";

  // On Hold escluso da «Da attenzionare»; le certificazioni in hold non
  // contano nemmeno per il ritardo timeline (gli alert sono silenziati).
  const ritardoTimeline =
    status !== "onhold" &&
    attive.some((c) => !c.on_hold && (ritardi?.get(c.id) ?? 0) > 0);
  const estensione = status !== "onhold" && r.a_rischio;

  return {
    base: r,
    x,
    status,
    motiviHold: certs.filter((c) => c.on_hold && c.on_hold_reason).map((c) => c.on_hold_reason!),
    ritardoTimeline,
    estensione,
    attenzionare: ritardoTimeline || estensione,
    pmNomi: Array.from(new Set(certs.map((c) => c.pm_nome).filter(Boolean))) as string[],
  };
}

/** "Marco Rossi" → "M. Rossi": la colonna PM e' stretta apposta. */
function puntato(nome: string): string {
  const parti = nome.trim().split(/\s+/);
  if (parti.length < 2) return nome;
  return `${parti[0][0]}. ${parti.slice(1).join(" ")}`;
}

// ── La pagina ─────────────────────────────────────────────────────────────

const STATUS_FILTRI: Status[] = ["design", "construction", "certification", "certified", "onhold"];

export default function ProjectsAdmin() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const oggi = format(new Date(), "yyyy-MM-dd");

  const { data: righe = [], isLoading } = usePortafoglio();
  const { data: extra } = useExtraSiti();
  const { data: ritardi } = useRitardiTimeline(oggi);

  const [aperta, setAperta] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "project", dir: 1 });

  // ── Lo stato dei filtri vive nell'URL: condivisibile (v1.2 §6) ──────────
  const q = params.get("q") ?? "";
  const multi = (k: string) => (params.get(k)?.split("|").filter(Boolean) ?? []) as string[];
  const fCert = multi("cert");
  const fTyp = multi("typ");
  const fReg = multi("reg");
  const fStatus = multi("status") as Status[];
  const fPm = multi("pm");
  const fAtt = params.get("att") === "1";

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
  };
  const toggleMulti = (k: string, valore: string) => {
    const cur = multi(k);
    const next = cur.includes(valore) ? cur.filter((x) => x !== valore) : [...cur, valore];
    setParam(k, next.join("|") || null);
  };
  const azzera = () => setParams(new URLSearchParams(), { replace: true });

  const tutte: RigaV2[] = useMemo(
    () => righe.map((r) => derivaRiga(r, extra?.get(r.site_id), ritardi, oggi)),
    [righe, extra, ritardi, oggi]
  );

  const filtra = (righe: RigaV2[], escludi?: string) =>
    righe.filter((v) => {
      if (escludi !== "q" && q) {
        const t = q.toLowerCase();
        if (
          !v.base.sito.toLowerCase().includes(t) &&
          !(v.base.cliente ?? "").toLowerCase().includes(t) &&
          !(v.base.citta ?? "").toLowerCase().includes(t)
        )
          return false;
      }
      if (escludi !== "cert" && fCert.length) {
        const tipi = (v.x?.certs ?? []).map((c) => c.cert_type ?? "");
        if (!fCert.some((f) => tipi.includes(f))) return false;
      }
      if (escludi !== "typ" && fTyp.length && !fTyp.includes(v.x?.typology ?? "")) return false;
      if (escludi !== "reg" && fReg.length && !fReg.includes(v.x?.region ?? "")) return false;
      if (escludi !== "status" && fStatus.length && !fStatus.includes(v.status)) return false;
      if (escludi !== "pm" && fPm.length && !v.pmNomi.some((p) => fPm.includes(p))) return false;
      if (escludi !== "att" && fAtt && !v.attenzionare) return false;
      return true;
    });

  const visibili = useMemo(() => {
    const out = filtra(tutte);
    const valore = (v: RigaV2): string => {
      switch (sort.key) {
        case "client": return v.base.cliente ?? "";
        case "city": return v.base.citta ?? "";
        case "country": return v.x?.country ?? "";
        case "region": return v.x?.region ?? "";
        case "typology": return v.x?.typology ?? "";
        case "handover": return v.x?.handover ?? "";
        case "pm": return v.pmNomi[0] ?? "";
        case "status": return STATUS_META[v.status].label;
        default: return v.base.sito;
      }
    };
    return [...out].sort((a, b) => sort.dir * valore(a).localeCompare(valore(b), "it"));
  }, [tutte, q, fCert, fTyp, fReg, fStatus, fPm, fAtt, sort]);

  // ── KPI (v1.2 §7): il click filtra la tabella ───────────────────────────
  const kpi = useMemo(() => {
    const inCorso = tutte.reduce(
      (n, v) => n + (v.x?.certs ?? []).filter((c) => !c.issued && !c.on_hold).length,
      0
    );
    const sitiInCorso = tutte.filter((v) =>
      ["design", "construction", "certification"].includes(v.status)
    ).length;
    const att = tutte.filter((v) => v.attenzionare);
    const hold = tutte.filter((v) => v.status === "onhold");
    const certTot = tutte.reduce((n, v) => n + (v.x?.certs ?? []).filter((c) => c.issued).length, 0);
    const sitiCertified = tutte.filter((v) => v.status === "certified").length;
    return {
      inCorso,
      sitiInCorso,
      att,
      attTimeline: att.filter((v) => v.ritardoTimeline).length,
      attContratto: att.filter((v) => v.estensione).length,
      hold,
      certTot,
      sitiCertified,
    };
  }, [tutte]);

  const filtriAttivi: Array<{ label: string; onRemove: () => void }> = [
    ...(q ? [{ label: `cerca: ${q}`, onRemove: () => setParam("q", null) }] : []),
    ...fCert.map((v) => ({ label: v, onRemove: () => toggleMulti("cert", v) })),
    ...fTyp.map((v) => ({ label: v, onRemove: () => toggleMulti("typ", v) })),
    ...fReg.map((v) => ({ label: v, onRemove: () => toggleMulti("reg", v) })),
    ...fStatus.map((v) => ({ label: STATUS_META[v].label, onRemove: () => toggleMulti("status", v) })),
    ...fPm.map((v) => ({ label: v, onRemove: () => toggleMulti("pm", v) })),
    ...(fAtt ? [{ label: "Da attenzionare", onRemove: () => setParam("att", null) }] : []),
  ];

  const opzioni = (chiave: string, estrai: (v: RigaV2) => string[]) => {
    const base = filtra(tutte, chiave);
    const conta = new Map<string, number>();
    for (const v of base) for (const val of estrai(v)) if (val) conta.set(val, (conta.get(val) ?? 0) + 1);
    return Array.from(conta.entries()).sort((a, b) => a[0].localeCompare(b[0], "it"));
  };

  return (
    <MainLayout
      title="Projects"
      subtitle="Una riga per sito. Lo Status e' derivato dalla PROJECT TIMELINE, mai compilato a mano."
    >
      {/* ── KPI di testata: il click filtra (v1.2 §7) ── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          etichetta="Certificazioni in corso"
          valore={kpi.inCorso}
          nota={`su ${kpi.sitiInCorso} siti`}
          attiva={fStatus.length === 3 && ["design", "construction", "certification"].every((s) => fStatus.includes(s as Status))}
          onClick={() => {
            const p = new URLSearchParams();
            p.set("status", "design|construction|certification");
            setParams(p, { replace: true });
          }}
        />
        <KpiCard
          etichetta="Da attenzionare"
          valore={kpi.att.length}
          nota={
            kpi.att.length
              ? `${kpi.attTimeline} timeline in ritardo · ${kpi.attContratto} oltre contratto`
              : "niente da segnalare"
          }
          tono={kpi.att.length ? "male" : "bene"}
          attiva={fAtt}
          onClick={() => {
            const p = new URLSearchParams();
            p.set("att", "1");
            setParams(p, { replace: true });
          }}
        />
        <KpiCard
          etichetta="On Hold"
          valore={kpi.hold.length}
          nota={kpi.hold.length ? kpi.hold.map((v) => v.base.sito).slice(0, 2).join(", ") : "nessuno"}
          title={kpi.hold.flatMap((v) => v.motiviHold).join(" · ") || undefined}
          tono={kpi.hold.length ? "attenzione" : "bene"}
          attiva={fStatus.length === 1 && fStatus[0] === "onhold"}
          onClick={() => {
            const p = new URLSearchParams();
            p.set("status", "onhold");
            setParams(p, { replace: true });
          }}
        />
        <KpiCard
          etichetta="Certified"
          valore={kpi.certTot}
          nota={`${kpi.sitiCertified} progetti interamente certificati`}
          attiva={fStatus.length === 1 && fStatus[0] === "certified"}
          onClick={() => {
            const p = new URLSearchParams();
            p.set("status", "certified");
            setParams(p, { replace: true });
          }}
        />
      </div>

      <Card className="p-5">
        {/* ── Barra filtri unica (v1.2 §6) ── */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Cerca client, project, city…"
            value={q}
            onChange={(e) => setParam("q", e.target.value || null)}
            className="h-8 w-56 text-xs"
          />
          <MultiFiltro
            etichetta="Certification"
            opzioni={opzioni("cert", (v) => (v.x?.certs ?? []).map((c) => c.cert_type ?? ""))}
            selezionate={fCert}
            onToggle={(x) => toggleMulti("cert", x)}
          />
          <MultiFiltro
            etichetta="Typology"
            opzioni={opzioni("typ", (v) => [v.x?.typology ?? ""])}
            selezionate={fTyp}
            onToggle={(x) => toggleMulti("typ", x)}
          />
          <MultiFiltro
            etichetta="Region"
            opzioni={opzioni("reg", (v) => [v.x?.region ?? ""])}
            selezionate={fReg}
            onToggle={(x) => toggleMulti("reg", x)}
          />
          <MultiFiltro
            etichetta="Status"
            opzioni={opzioni("status", (v) => [STATUS_META[v.status].label])}
            selezionate={fStatus.map((s) => STATUS_META[s].label)}
            onToggle={(label) => {
              const s = STATUS_FILTRI.find((k) => STATUS_META[k].label === label);
              if (s) toggleMulti("status", s);
            }}
          />
          <MultiFiltro
            etichetta="PM"
            opzioni={opzioni("pm", (v) => v.pmNomi)}
            selezionate={fPm}
            onToggle={(x) => toggleMulti("pm", x)}
          />
        </div>

        {filtriAttivi.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {filtriAttivi.map((f, i) => (
              <button
                key={i}
                onClick={f.onRemove}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                {f.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={azzera} className="text-[11px] text-muted-foreground underline hover:text-foreground">
              Azzera
            </button>
          </div>
        )}

        {/* ── La tabella: header sticky (v1.2 §4) ── */}
        <div className="table-container max-h-[calc(100vh-270px)]">
          <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 1280 }}>
            <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <Th k="client"   sort={sort} setSort={setSort}>Client</Th>
                <Th k="city"     sort={sort} setSort={setSort}>City</Th>
                <Th k="project"  sort={sort} setSort={setSort}>Project</Th>
                <Th k="country"  sort={sort} setSort={setSort}>Country</Th>
                <Th k="region"   sort={sort} setSort={setSort}>Region</Th>
                <th className="border-b bg-card px-3 py-2 text-left font-medium">Certifications</th>
                <Th k="typology" sort={sort} setSort={setSort}>Typology</Th>
                <Th k="handover" sort={sort} setSort={setSort}>Handover</Th>
                <Th k="pm"       sort={sort} setSort={setSort}>PM</Th>
                <th className="border-b bg-card px-3 py-2 text-left font-medium" title="Cantiere e certificazione, tenuti separati">
                  Avanz.
                </th>
                <Th k="status"   sort={sort} setSort={setSort}>Status</Th>
              </tr>
            </thead>
            <tbody>
              {visibili.slice(0, 200).map((v) => (
                <RigaSito
                  key={v.base.site_id}
                  v={v}
                  oggi={oggi}
                  aperta={aperta === v.base.site_id}
                  onToggle={() => setAperta(aperta === v.base.site_id ? null : v.base.site_id)}
                  onApri={(certId) => navigate(`/projects/${certId}/cronoprogramma`)}
                />
              ))}
              {visibili.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "Caricamento…" : "Nessun sito con questi filtri."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visibili.length > 200 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Mostrati i primi 200 di {visibili.length}. Restringi coi filtri.
          </p>
        )}
      </Card>
    </MainLayout>
  );
}

// ── Pezzi di testata ──────────────────────────────────────────────────────

function KpiCard({
  etichetta,
  valore,
  nota,
  tono,
  attiva,
  onClick,
  title,
}: {
  etichetta: string;
  valore: number;
  nota: string;
  tono?: "bene" | "male" | "attenzione";
  attiva?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        attiva && "border-primary ring-1 ring-primary/40"
      )}
    >
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
      >
        {nota}
      </p>
    </button>
  );
}

function MultiFiltro({
  etichetta,
  opzioni,
  selezionate,
  onToggle,
}: {
  etichetta: string;
  opzioni: Array<[string, number]>;
  selezionate: string[];
  onToggle: (valore: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", selezionate.length && "border-primary text-primary")}>
          <ListFilter className="h-3.5 w-3.5" />
          {etichetta}
          {selezionate.length > 0 && <span className="tabular-nums">({selezionate.length})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {opzioni.map(([valore, conteggio]) => (
            <label key={valore} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
              <Checkbox checked={selezionate.includes(valore)} onCheckedChange={() => onToggle(valore)} />
              <span className="min-w-0 flex-1 truncate">{valore}</span>
              <span className="tabular-nums text-muted-foreground">{conteggio}</span>
            </label>
          ))}
          {opzioni.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">Nessuna opzione.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Th({
  k,
  sort,
  setSort,
  children,
}: {
  k: string;
  sort: { key: string; dir: 1 | -1 };
  setSort: (s: { key: string; dir: 1 | -1 }) => void;
  children: React.ReactNode;
}) {
  const attivo = sort.key === k;
  return (
    <th className="border-b bg-card px-3 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: attivo ? ((sort.dir * -1) as 1 | -1) : 1 })}
        className={cn("inline-flex items-center gap-1 uppercase tracking-wider", attivo && "text-foreground")}
      >
        {children}
        {attivo && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

// ── La riga ───────────────────────────────────────────────────────────────

function RigaSito({
  v,
  oggi,
  aperta,
  onToggle,
  onApri,
}: {
  v: RigaV2;
  oggi: string;
  aperta: boolean;
  onToggle: () => void;
  onApri: (certId: string) => void;
}) {
  const meta = STATUS_META[v.status];
  const r = v.base;
  const x = v.x;
  const tag = Array.from(new Set((x?.certs ?? []).map((c) => `${c.cert_type ?? ""}`).filter(Boolean)));

  return (
    <>
      {/* Un sito certificato è finito, e in una lista di ottocento righe deve
          distinguersi prima che l'occhio arrivi alla colonna Status — che sta
          in fondo a destra. Fascia tenue nel teal del marchio e un filetto
          pieno a sinistra: si legge di traverso, senza rubare contrasto al
          testo né aggiungere un colore nuovo al sistema. */}
      <tr
        className={cn(
          "cursor-pointer transition-colors",
          v.status === "certified"
            ? "bg-primary/[0.055] hover:bg-primary/[0.09]"
            : "hover:bg-muted/40"
        )}
        onClick={onToggle}
      >
        <td
          className={cn(
            "relative border-b px-3 py-2.5 text-xs font-semibold uppercase",
            v.status === "certified" &&
              "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary"
          )}
        >
          {r.cliente ?? "—"}
        </td>
        <td className="border-b px-3 py-2.5 text-xs uppercase text-muted-foreground">{r.citta ?? "—"}</td>
        <td className="border-b px-3 py-2.5">
          <span className="flex items-center gap-1.5">
            {aperta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="text-sm font-medium">{r.sito}</span>
          </span>
        </td>
        <td className="border-b px-3 py-2.5 text-xs text-muted-foreground">{x?.country ?? "—"}</td>
        <td className="border-b px-3 py-2.5">
          {x?.region ? (
            <Badge variant="outline" className="rounded-full bg-muted/40 px-2.5 py-0.5 text-xs font-normal">{x.region}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="border-b px-3 py-2.5">
          <span className="flex flex-wrap gap-1">
            {tag.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="rounded-full border px-2 py-0.5 text-[10px] font-medium" style={stilePill(t)}>
                {t}
              </Badge>
            ))}
            {tag.length > 4 && <span className="text-[10px] text-muted-foreground">+{tag.length - 4}</span>}
            {tag.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </span>
        </td>
        <td className="border-b px-3 py-2.5 text-xs text-muted-foreground">{x?.typology ?? "—"}</td>
        <td className="border-b px-3 py-2.5 text-xs tabular-nums">
          {x?.handover ? (
            <span>
              {d(x.handover)}
              {r.slittamento_giorni != null && r.slittamento_giorni !== 0 && (
                <span className={cn("ml-1.5 text-[10.5px]", r.slittamento_giorni > 20 ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                  {r.slittamento_giorni > 0 ? "+" : ""}
                  {r.slittamento_giorni}g
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="border-b px-3 py-2.5 text-xs" title={v.pmNomi.join(", ") || undefined}>
          {v.pmNomi.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : v.pmNomi.length === 1 ? (
            puntato(v.pmNomi[0])
          ) : (
            `${puntato(v.pmNomi[0])} +${v.pmNomi.length - 1}`
          )}
        </td>
        {/* Due anelli, non uno: il cantiere e la certificazione avanzano a
            velocita' diverse, e il caso che va visto e' proprio quello in cui
            divergono — cantiere al 70%, certificazione al 10%. Una media
            unica lo nasconderebbe dietro un 40 che non significa niente. */}
        <td className="border-b px-3 py-2.5">
          <span className="flex items-center gap-2">
            <AnelloAvanzamento
              pct={r.avanzamento}
              etichetta={`Cantiere · ${r.sito}`}
              soloLettura
              dimensione={26}
            />
            <AnelloAvanzamento
              pct={r.avanzamento_cert}
              etichetta={`Certificazioni · ${r.sito}`}
              tinta="#009193"
              soloLettura
              dimensione={26}
            />
            {r.righe_ferme > 0 && (
              <span
                className="text-[10px] text-amber-700 dark:text-amber-400"
                title="Righe in corso che nessuno aggiorna da due settimane"
              >
                {r.righe_ferme}⏸
              </span>
            )}
          </span>
        </td>
        <td className="border-b px-3 py-2.5">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
            style={meta.stile}
            title={v.status === "onhold" ? v.motiviHold.join(" · ") || undefined : undefined}
          >
            {meta.label}
          </span>
          {v.attenzionare && (
            <span
              className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
              title={[v.ritardoTimeline && "timeline in ritardo", v.estensione && "fine stimata oltre contratto"]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
        </td>
      </tr>

      {aperta && (
        <tr className="bg-muted/20">
          <td colSpan={11} className="border-b p-0">
            <DrillDown r={r} x={x} oggi={oggi} onApri={onApri} />
          </td>
        </tr>
      )}
    </>
  );
}

// ══ Il drill-down (v1.2 §3) ════════════════════════════════════════════════

const COL_SX = 172;
const ALTEZZA_ASSE = 30;
const PX_MESE_MIN = 45;
const PX_MESE_MAX = 200;

interface Corsia {
  id: string;
  nome: string;
  pm: string | null;
  tinta: ReturnType<typeof tintaServizio>;
  milestone: Array<{ label: string; data: string; serie: boolean; ancora: boolean; fatta: boolean }>;
  serieLabel: string | null;
  vuota: boolean;
}

function DrillDown({
  r,
  x,
  oggi,
  onApri,
}: {
  r: RigaPortafoglio;
  x: ExtraSito | undefined;
  oggi: string;
  onApri: (certId: string) => void;
}) {
  const { data: corsie } = useCorsieSito(r.site_id, r.cronoprogramma_id, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [larghezzaVista, setLarghezzaVista] = useState(900);
  const [modo, setModo] = useState<"adatta" | "scorri" | null>(null);
  const [pxMese, setPxMese] = useState(90);
  const [tutteEtichette, setTutteEtichette] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) setLarghezzaVista(el.clientWidth - COL_SX);
  }, [corsie]);

  const modello = useMemo(() => {
    if (!corsie) return null;
    const date: string[] = [oggi];
    for (const e of corsie.eventi) {
      if (e.data) date.push(e.data);
      if (e.fine) date.push(e.fine);
    }
    for (const c of corsie.certificazioni)
      for (const m of c.milestone) if (m.due_date) date.push(m.due_date);
    if (r.scadenza_contratto) date.push(r.scadenza_contratto);
    if (date.length < 2) return null;
    date.sort();
    // Margine del 3% per lato: primo e ultimo evento mai incollati al bordo.
    const g0 = giorni(date[0], date[date.length - 1]);
    const margine = Math.max(10, Math.round(g0 * 0.03));
    const min = spostaGiorni(date[0], -margine);
    const max = spostaGiorni(date[date.length - 1], margine);
    return { min, max, span: giorni(min, max), mesi: giorni(min, max) / 30.4 };
  }, [corsie, oggi, r.scadenza_contratto]);

  // All'apertura: Adatta, salvo durata che comprimerebbe sotto la densita'
  // minima leggibile — allora direttamente Scorri, centrato sull'oggi (§3.2).
  useEffect(() => {
    if (!modello || modo !== null) return;
    const densita = larghezzaVista / modello.mesi;
    if (densita < 40) {
      setModo("scorri");
    } else {
      setModo("adatta");
    }
  }, [modello, larghezzaVista, modo]);

  const vaiOggi = () => {
    const el = scrollRef.current;
    if (!el || !modello) return;
    const xOggi = (giorni(modello.min, oggi) / modello.span) * contenutoW;
    el.scrollTo({ left: Math.max(0, COL_SX + xOggi - el.clientWidth / 2), behavior: "smooth" });
  };

  useEffect(() => {
    if (modo === "scorri") vaiOggi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  if (!corsie) return <p className="p-4 text-xs text-muted-foreground">Caricamento…</p>;
  if (!modello)
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Nessuna data ancora: il PM non ha compilato la PROJECT TIMELINE.
      </p>
    );

  const contenutoW =
    modo === "scorri" ? Math.max(larghezzaVista, modello.mesi * pxMese) : larghezzaVista;
  const pos = (dd: string) => (giorni(modello.min, dd) / modello.span) * contenutoW;

  // Le corsie di servizio, nel sistema colore unico.
  const lanes: Corsia[] = corsie.certificazioni.map((c) => {
    const tinta = tintaServizio(`${c.cert_type ?? ""} ${c.nome}`);
    const singole = c.milestone.filter((m) => m.series_step_order === null && m.due_date);
    const serie = c.milestone.filter((m) => m.series_step_order !== null && m.due_date);
    return {
      id: c.id,
      nome: c.nome,
      pm: c.pm,
      tinta,
      milestone: [
        ...singole.map((m) => ({
          label: m.requirement,
          data: m.due_date!,
          serie: false,
          ancora: m.derived_from !== null,
          fatta: m.status === "achieved",
        })),
        ...serie.map((m) => ({ label: m.requirement, data: m.due_date!, serie: true, ancora: false, fatta: m.status === "achieved" })),
      ],
      serieLabel: serie.length ? `report mensili 1…${serie.length}` : null,
      vuota: c.milestone.length === 0,
    };
  });

  const inizio = x?.primaData ?? modello.min;
  const start = x?.constructionStart;
  const hand = x?.handover;
  const ultima = lanes.flatMap((l) => l.milestone.map((m) => m.data)).sort().pop();

  return (
    <div className="border-t">
      {/* Controlli: Adatta/Scorri, zoom, Oggi (§3.2). */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-1.5">
        <div className="flex overflow-hidden rounded-md border text-[11px]">
          {(["adatta", "scorri"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={cn("px-2.5 py-1 capitalize", modo === m ? "bg-foreground text-background" : "hover:bg-muted")}
            >
              {m}
            </button>
          ))}
        </div>
        {modo === "scorri" && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPxMese((z) => Math.max(PX_MESE_MIN, z - 15))} className="rounded border p-1 hover:bg-muted" aria-label="Riduci">
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-14 text-center text-[10.5px] tabular-nums text-muted-foreground">{pxMese}px/m</span>
            <button onClick={() => setPxMese((z) => Math.min(PX_MESE_MAX, z + 15))} className="rounded border p-1 hover:bg-muted" aria-label="Ingrandisci">
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
        <button onClick={() => { if (modo !== "scorri") setModo("scorri"); else vaiOggi(); }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted">
          <Crosshair className="h-3 w-3" /> Oggi
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox checked={tutteEtichette} onCheckedChange={(v) => setTutteEtichette(!!v)} />
          mostra tutte le etichette
        </label>
      </div>

      {/* Il pannello congelato: colonna sinistra sticky-left, asse sticky-top. */}
      <div
        ref={scrollRef}
        className={cn("relative max-h-[440px] overflow-auto", modo === "scorri" && "cursor-grab active:cursor-grabbing")}
        onPointerDown={(e) => {
          if (modo !== "scorri") return;
          const el = scrollRef.current!;
          const sx = el.scrollLeft, sy = el.scrollTop, px = e.clientX, py = e.clientY;
          const muovi = (ev: PointerEvent) => {
            el.scrollLeft = sx - (ev.clientX - px);
            el.scrollTop = sy - (ev.clientY - py);
          };
          const fine = () => {
            window.removeEventListener("pointermove", muovi);
            window.removeEventListener("pointerup", fine);
          };
          window.addEventListener("pointermove", muovi);
          window.addEventListener("pointerup", fine);
        }}
      >
        <div className="relative" style={{ width: COL_SX + contenutoW }}>
          {/* Asse temporale in testa, sticky (§3.1). */}
          <Asse modello={modello} pos={pos} contenutoW={contenutoW} pxMese={modo === "scorri" ? pxMese : larghezzaVista / modello.mesi} />

          {/* Confini di fase prolungati + linea dell'oggi: attraversano tutto. */}
          <div className="pointer-events-none absolute bottom-0 z-10" style={{ top: ALTEZZA_ASSE, left: COL_SX, width: contenutoW }}>
            {[start, hand].filter(Boolean).map((b, i) => (
              <div key={i} className="absolute bottom-0 top-0 border-l border-dashed" style={{ left: pos(b!), borderColor: PIETRA.certification }} />
            ))}
            <div className="absolute bottom-0 top-0 border-l border-dashed border-destructive" style={{ left: pos(oggi) }}>
              <span className="absolute -top-0.5 left-1 rounded-full bg-destructive/10 px-1.5 text-[10.5px] font-medium text-destructive">oggi</span>
            </div>
          </div>

          {/* Barra Project, per prima (§3.1). */}
          <BarraProject inizio={inizio} start={start} hand={hand} ultima={ultima} pos={pos} contenutoW={contenutoW} />

          {/* Una corsia per servizio. */}
          {lanes.map((l) => (
            <CorsiaServizio
              key={l.id}
              corsia={l}
              pos={pos}
              contenutoW={contenutoW}
              tutteEtichette={tutteEtichette}
              onDoppioClick={() => onApri(l.id)}
            />
          ))}
        </div>
      </div>

      <p className="border-t px-3 py-1.5 text-[10.5px] text-muted-foreground">
        {r.slittamento_giorni != null && r.slittamento_giorni !== 0 &&
          `Slittamento ${r.slittamento_giorni > 0 ? "+" : ""}${r.slittamento_giorni} gg vs baseline · `}
        {r.fine_stimata && `fine stimata ${d(r.fine_stimata)} · `}
        {r.scadenza_contratto && `contratto al ${d(r.scadenza_contratto)} · `}
        doppio click su una corsia per aprire il dettaglio.
      </p>
    </div>
  );
}

function Asse({
  modello,
  pos,
  contenutoW,
  pxMese,
}: {
  modello: { min: string; max: string };
  pos: (d: string) => number;
  contenutoW: number;
  pxMese: number;
}) {
  // Anni e trimestri; i mesi compaiono quando lo zoom lo consente (§3.1).
  const tacche = taccheAsse(modello.min, modello.max, pxMese);
  return (
    <div className="sticky top-0 z-30 flex border-b bg-card" style={{ height: ALTEZZA_ASSE }}>
      <div className="sticky left-0 z-40 shrink-0 border-r bg-card" style={{ width: COL_SX }} />
      <div className="relative" style={{ width: contenutoW }}>
        {tacche.map((t) => (
          <span
            key={t.data}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-[10.5px] tabular-nums",
              t.forte ? "font-medium text-foreground" : "text-muted-foreground"
            )}
            style={{ left: pos(t.data) + 3 }}
          >
            {t.label}
          </span>
        ))}
        {tacche.map((t) => (
          <span key={`l${t.data}`} className="absolute bottom-0 top-0 border-l" style={{ left: pos(t.data), borderColor: "hsl(var(--border))" }} />
        ))}
      </div>
    </div>
  );
}

function BarraProject({
  inizio,
  start,
  hand,
  ultima,
  pos,
  contenutoW,
}: {
  inizio: string;
  start: string | null | undefined;
  hand: string | null | undefined;
  ultima: string | undefined;
  pos: (d: string) => number;
  contenutoW: number;
}) {
  const segmenti: Array<{ label: string; da: string; a: string; colore: string; testo: string }> = [];
  if (start) segmenti.push({ label: "Design", da: inizio, a: start, colore: PIETRA.design, testo: PIETRA.inchiostro });
  if (start && hand) segmenti.push({ label: "Construction", da: start, a: hand, colore: PIETRA.construction, testo: "#3A3E35" });
  if (hand && ultima && ultima > hand)
    segmenti.push({ label: "Certification", da: hand, a: ultima, colore: PIETRA.certification, testo: "#FFFFFF" });

  return (
    <div className="flex border-b" style={{ minHeight: 58 }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-card px-3" style={{ width: COL_SX }}>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PIETRA.construction }} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">Project</p>
          <p className="text-[10.5px] text-muted-foreground">timeline di cantiere</p>
        </div>
      </div>
      <div className="relative" style={{ width: contenutoW }}>
        <div className="absolute left-0 right-0 top-3 h-6">
          {segmenti.map((s) => {
            const w = Math.max(2, pos(s.a) - pos(s.da));
            const dentro = w >= 92;
            return (
              <div key={s.label}>
                <div
                  className="absolute flex h-6 items-center justify-center overflow-hidden rounded-sm"
                  style={{ left: pos(s.da), width: w, background: s.colore }}
                  title={`${s.label} · ${d(s.da)} → ${d(s.a)}`}
                >
                  {dentro && (
                    <span className="px-1 text-[11px] font-medium" style={{ color: s.testo }}>
                      {s.label}
                    </span>
                  )}
                </div>
                {/* Etichetta sopra quando il segmento e' stretto (§3.1). */}
                {!dentro && (
                  <span className="absolute -top-0.5 text-[10.5px] font-medium" style={{ left: pos(s.da), color: PIETRA.inchiostro }}>
                    {s.label}
                  </span>
                )}
              </div>
            );
          })}
          {/* Le date di confine, sotto ogni giunzione. */}
          {[start, hand].filter(Boolean).map((b) => (
            <span
              key={b}
              className="absolute top-7 -translate-x-1/2 whitespace-nowrap text-[10.5px] tabular-nums text-muted-foreground"
              style={{ left: pos(b!) }}
            >
              {d(b)}
            </span>
          ))}
        </div>
        {segmenti.length === 0 && (
          <p className="absolute top-4 px-2 text-[11px] italic text-muted-foreground">
            date di cantiere non ancora compilate
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Una corsia di servizio, con l'anti-collisione a tre stadi (§2): etichette su
 * due righe alternate con lineetta di richiamo; se ancora si toccano, le
 * non-ancora collassano in tacche con tooltip; il toggle «mostra tutte le
 * etichette» alza la corsia invece di rimpicciolire il testo.
 */
function CorsiaServizio({
  corsia,
  pos,
  contenutoW,
  tutteEtichette,
  onDoppioClick,
}: {
  corsia: Corsia;
  pos: (d: string) => number;
  contenutoW: number;
  tutteEtichette: boolean;
  onDoppioClick: () => void;
}) {
  const { tinta } = corsia;
  const singole = corsia.milestone.filter((m) => !m.serie);
  const serie = corsia.milestone.filter((m) => m.serie);

  // Assegnazione delle etichette alle righe: larghezza stimata a 11px,
  // greedy sulla riga piu' in alto che non collide.
  const LARGH_CHAR = 6.1;
  const etichette = singole
    .map((m) => ({ ...m, x: pos(m.data), w: Math.min(m.label.length, 28) * LARGH_CHAR }))
    .sort((a, b) => a.x - b.x);

  const maxRighe = tutteEtichette ? 8 : 2;
  const righeFine: number[] = [];
  const assegnate: Array<(typeof etichette)[number] & { riga: number | null }> = [];
  for (const e of etichette) {
    let riga: number | null = null;
    for (let i = 0; i < maxRighe; i++) {
      if ((righeFine[i] ?? -Infinity) + 8 <= e.x) {
        riga = i;
        righeFine[i] = e.x + e.w;
        break;
      }
    }
    // Stadio 2: le non-ancora collassano in tacca; le ancore non si troncano
    // mai — trovano posto perche' hanno la precedenza qui sotto.
    assegnate.push({ ...e, riga });
  }
  // Le ancore hanno precedenza: se un'ancora e' rimasta fuori, ruba la riga
  // all'etichetta non-ancora piu' vicina.
  for (const a of assegnate) {
    if (a.riga !== null || !a.ancora) continue;
    const vicina = assegnate
      .filter((b) => b.riga !== null && !b.ancora && Math.abs(b.x - a.x) < b.w + 8)
      .sort((b1, b2) => Math.abs(b1.x - a.x) - Math.abs(b2.x - a.x))[0];
    if (vicina) {
      a.riga = vicina.riga;
      vicina.riga = null;
    }
  }

  const righeUsate = Math.max(1, ...assegnate.map((a) => (a.riga ?? -1) + 1));
  const hEtichette = righeUsate * 15 + 2;
  const hCorsia = hEtichette + 26 + (serie.length ? 14 : 0);

  return (
    <div className="flex border-b last:border-b-0" style={{ minHeight: hCorsia + 8 }}>
      {/* Colonna sinistra congelata: quadratino colore + nome + PM (§3.1). */}
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-card px-3" style={{ width: COL_SX }}>
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-sm border"
          style={{
            background: tinta.bg,
            borderColor: tinta.strong,
            borderStyle: tinta.dashed ? "dashed" : "solid",
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" title={corsia.nome}>{corsia.nome}</p>
          <p className="truncate text-[10.5px] text-muted-foreground">{corsia.pm ?? "senza PM"}</p>
        </div>
      </div>

      <div
        className="relative"
        style={{ width: contenutoW }}
        onDoubleClick={onDoppioClick}
        title="Doppio click: apri il dettaglio"
      >
        {corsia.vuota ? (
          /* Mai una corsia bianca ambigua (§3.1). */
          <div className="absolute inset-x-2 top-1/2 flex h-4 -translate-y-1/2 items-center justify-center rounded-sm bg-muted/60">
            <span className="text-[10.5px] italic text-muted-foreground">timeline non compilata</span>
          </div>
        ) : (
          <>
            {/* Etichette, righe alternate, con lineetta di richiamo. */}
            {assegnate.map((a, i) =>
              a.riga !== null ? (
                <div key={i}>
                  <span
                    className="absolute whitespace-nowrap text-[11px]"
                    style={{ left: a.x - 2, top: a.riga * 15 + 2, color: tinta.strong, fontWeight: a.ancora ? 600 : 400 }}
                    title={`${a.label} · ${d(a.data)}`}
                  >
                    {a.label.length > 28 ? `${a.label.slice(0, 27)}…` : a.label}
                  </span>
                  <span
                    className="absolute w-px"
                    style={{ left: a.x, top: a.riga * 15 + 14, height: hEtichette - a.riga * 15 - 12, background: tinta.mid }}
                  />
                </div>
              ) : null
            )}

            {/* La barra della corsia. */}
            <div
              className="absolute left-0 right-0 rounded-sm border"
              style={{
                top: hEtichette,
                height: 18,
                background: tinta.bg,
                borderColor: tinta.strong,
                borderStyle: tinta.dashed ? "dashed" : "solid",
                opacity: 0.95,
              }}
            />
            {/* Tacche: milestone singole (con tooltip anche quando l'etichetta e' collassata). */}
            {assegnate.map((a, i) => (
              <span
                key={`t${i}`}
                className="absolute w-[3px] -translate-x-1/2 rounded-full"
                style={{ left: a.x, top: hEtichette + 2, height: 14, background: tinta.strong, opacity: a.fatta ? 1 : 0.75 }}
                title={`${a.label} · ${d(a.data)}`}
              />
            ))}
            {/* Serie ricorrenti: tacche ravvicinate + etichetta cumulativa. */}
            {serie.map((m, i) => (
              <span
                key={`s${i}`}
                className="absolute w-[2px] -translate-x-1/2 rounded-full"
                style={{ left: pos(m.data), top: hEtichette + 4, height: 10, background: tinta.mid }}
                title={`${m.label} · ${d(m.data)}`}
              />
            ))}
            {corsia.serieLabel && serie.length > 0 && (
              <span
                className="absolute -translate-x-1/2 whitespace-nowrap text-[10.5px]"
                style={{
                  left: pos(serie[Math.floor(serie.length / 2)].data),
                  top: hEtichette + 22,
                  color: tinta.strong,
                }}
              >
                {corsia.serieLabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Aritmetica dell'asse ──────────────────────────────────────────────────

function giorni(a: string, b: string) {
  return Math.max(1, Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000));
}
function spostaGiorni(iso: string, n: number) {
  const x = parseISO(iso);
  x.setDate(x.getDate() + n);
  return format(x, "yyyy-MM-dd");
}

/** Anni sempre; trimestri quando c'e' spazio; mesi quando lo zoom lo consente. */
function taccheAsse(min: string, max: string, pxMese: number): Array<{ data: string; label: string; forte: boolean }> {
  const out: Array<{ data: string; label: string; forte: boolean }> = [];
  const inizio = parseISO(min);
  const fine = parseISO(max);
  const cur = new Date(inizio.getFullYear(), inizio.getMonth(), 1);
  while (cur <= fine) {
    const iso = format(cur, "yyyy-MM-dd");
    if (iso >= min) {
      const mese = cur.getMonth();
      if (mese === 0) out.push({ data: iso, label: String(cur.getFullYear()), forte: true });
      else if (pxMese >= 60) out.push({ data: iso, label: format(cur, "LLL", { locale: it }), forte: false });
      else if (pxMese >= 18 && mese % 3 === 0) out.push({ data: iso, label: `T${mese / 3 + 1}`, forte: false });
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
