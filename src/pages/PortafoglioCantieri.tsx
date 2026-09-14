import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, Clock, FileWarning, TriangleAlert } from "lucide-react";
import { usePortafoglio, useCorsieSito, type RigaPortafoglio } from "@/hooks/usePortafoglio";
import { useConfermeInSospeso } from "@/hooks/useCronoprogramma";
import { TimelineViva, type Segno } from "@/components/cronoprogramma/TimelineViva";

const d = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * Il cruscotto direzionale.
 *
 * Su base sito, non su base cronoprogramma: una vista radicata sul cantiere
 * escluderebbe i 427 progetti che non ne hanno — il 38% del portafoglio — e
 * romperebbe la coerenza con la dashboard cliente, che e' gia' su base sito.
 *
 * Le eccezioni stanno sopra la tabella perche' e' quello che serve: l'admin non
 * vuole guardare tutto, vuole che il sistema gli dica cosa guardare.
 */
export default function PortafoglioCantieri() {
  const navigate = useNavigate();
  const [soglia, setSoglia] = useState(21);
  const { data: righe = [], isLoading } = usePortafoglio(soglia);
  const { data: conferme = [] } = useConfermeInSospeso(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");

  const attive = useMemo(() => righe.filter((r) => !r.storico), [righe]);
  const aRischio = useMemo(() => attive.filter((r) => r.a_rischio), [attive]);
  const conVincoli = useMemo(() => attive.filter((r) => r.vincoli_violati > 0), [attive]);
  const stantii = useMemo(() => attive.filter((r) => r.stantio), [attive]);

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return righe;
    return righe.filter(
      (r) =>
        r.sito.toLowerCase().includes(q) ||
        (r.citta ?? "").toLowerCase().includes(q) ||
        (r.cliente ?? "").toLowerCase().includes(q)
    );
  }, [righe, cerca]);

  return (
    <MainLayout
      title="Portafoglio cantieri"
      subtitle="Una riga per sito. Lo slittamento si misura sulla baseline contrattuale, il ritardo nostro sulle date correnti."
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
             nota={`cronoprogrammi fermi da oltre ${soglia} giorni`}
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
            <Eccezione
              key={`r-${r.site_id}`}
              tono="male"
              icona={<TriangleAlert className="h-3.5 w-3.5" />}
              onClick={() => setAperta(r.site_id)}
            >
              <b>{r.sito}</b>: fine stimata {d(r.fine_stimata)}, oltre la scadenza del{" "}
              {d(r.scadenza_contratto)}.{" "}
              {r.mesi_proroga ? `Circa ${r.mesi_proroga} ${r.mesi_proroga === 1 ? "mese" : "mesi"} di proroga da negoziare.` : ""}
              {r.slittamento_giorni ? ` Slittamento ${r.slittamento_giorni > 0 ? "+" : ""}${r.slittamento_giorni} gg vs baseline.` : ""}
            </Eccezione>
          ))}
          {conferme.map((c) => (
            <Eccezione
              key={`c-${c.proposta_id}`}
              tono="attenzione"
              icona={<Clock className="h-3.5 w-3.5" />}
              onClick={() => navigate(`/projects/${c.certification_id}/cronoprogramma`)}
            >
              <b>{c.certificazione}</b> — {c.sito}: {c.milestone_da_spostare} date proposte dallo
              spostamento, in attesa di conferma del PM.
            </Eccezione>
          ))}
          {conVincoli.map((r) => (
            <Eccezione
              key={`v-${r.site_id}`}
              tono="attenzione"
              icona={<FileWarning className="h-3.5 w-3.5" />}
              onClick={() => setAperta(r.site_id)}
            >
              <b>{r.sito}</b>: {r.vincoli_violati}{" "}
              {r.vincoli_violati === 1 ? "vincolo di precedenza violato" : "vincoli di precedenza violati"}.
            </Eccezione>
          ))}
          {stantii.map((r) => (
            <Eccezione
              key={`s-${r.site_id}`}
              tono="attenzione"
              icona={<Clock className="h-3.5 w-3.5" />}
              onClick={() => setAperta(r.site_id)}
            >
              <b>{r.sito}</b>: date di cantiere aggiornate {r.freschezza_giorni} giorni fa. Chiedere
              il gantt corrente al GC.
            </Eccezione>
          ))}
          {aRischio.length + conferme.length + conVincoli.length + stantii.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              {isLoading ? "Caricamento…" : "Niente da attenzionare."}
            </p>
          )}
        </div>
      </Card>

      {/* ── Portafoglio ── */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Portafoglio per sito</h2>
          <Input
            placeholder="Cerca sito, citta', cliente…"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            className="h-8 w-64 text-xs"
          />
        </div>

        <div className="table-container overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Sito</th>
                <th className="px-3 py-2 text-left font-medium">Cert.</th>
                <th className="px-3 py-2 text-left font-medium">Fase</th>
                <th className="px-3 py-2 text-right font-medium">Slittamento</th>
                <th className="px-3 py-2 text-right font-medium">Ritardo nostro</th>
                <th className="px-3 py-2 text-left font-medium">Prossima milestone</th>
                <th className="px-3 py-2 text-left font-medium">Freschezza</th>
                <th className="px-3 py-2 text-left font-medium">Fine vs contratto</th>
                <th className="px-3 py-2 text-right font-medium">Report</th>
              </tr>
            </thead>
            <tbody>
              {visibili.slice(0, 200).map((r) => (
                <RigaSito
                  key={r.site_id}
                  r={r}
                  aperta={aperta === r.site_id}
                  onToggle={() => setAperta(aperta === r.site_id ? null : r.site_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {visibili.length > 200 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Mostrati i primi 200 di {visibili.length}. Restringi con la ricerca.
          </p>
        )}
      </Card>
    </MainLayout>
  );
}

// ── Pezzi ─────────────────────────────────────────────────────────────────

function Kpi({
  etichetta,
  valore,
  nota,
  tono,
}: {
  etichetta: string;
  valore: number;
  nota: string;
  tono?: "bene" | "male" | "attenzione";
}) {
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

function Eccezione({
  tono,
  icona,
  children,
  onClick,
}: {
  tono: "male" | "attenzione";
  icona: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
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

function RigaSito({ r, aperta, onToggle }: { r: RigaPortafoglio; aperta: boolean; onToggle: () => void }) {
  const { data: corsie } = useCorsieSito(r.site_id, r.cronoprogramma_id, aperta);

  const segni: Segno[] = useMemo(() => {
    if (!corsie) return [];
    const out: Segno[] = corsie.eventi.map((e, i) => ({
      key: `e${i}`,
      label: e.nome,
      date: e.data,
      corsia: "crono",
      natura: "ancora",
    }));
    for (const c of corsie.certificazioni) {
      for (const m of c.milestone) {
        if (m.series_step_order !== null) continue;
        out.push({
          key: `${c.id}-${m.requirement}`,
          label: m.requirement,
          date: m.due_date,
          corsia: "cert",
          natura: m.derived_from ? "ereditato" : m.anchor_order !== null ? "calcolato" : "pm",
        });
      }
    }
    return out;
  }, [corsie]);

  return (
    <>
      <tr
        className={cn("cursor-pointer border-b transition-colors hover:bg-muted/40", r.storico && "opacity-55")}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {aperta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-medium">{r.sito}</span>
            {/* Un lavoro finito non e' un lavoro incompleto: si marca, non si
                riempie di allarmi. */}
            {r.storico && <Badge variant="outline" className="text-[10px]">storico</Badge>}
          </div>
          <span className="ml-5 text-[11px] text-muted-foreground">
            {r.cliente} · {r.citta}
          </span>
        </td>
        <td className="px-3 py-2.5 tabular-nums">{r.certificazioni}</td>
        <td className="px-3 py-2.5 text-xs">
          {r.fase_corrente ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <Scarto v={r.slittamento_giorni} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <Scarto v={r.ritardo_nostro_giorni} inverti />
        </td>
        <td className="px-3 py-2.5 text-xs">
          {r.prossima_milestone ? (
            <>
              {r.prossima_milestone}
              <span className="block text-[11px] text-muted-foreground">
                {d(r.prossima_data)}
                {r.prossimo_pm ? ` · ${r.prossimo_pm}` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {r.storico ? "—" : "timeline da compilare"}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs">
          {r.freschezza_giorni === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={cn(r.stantio && "text-amber-700 dark:text-amber-400")}>
              {r.freschezza_giorni} gg fa
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs">
          {r.fine_stimata === null ? (
            <span className="text-muted-foreground">—</span>
          ) : r.a_rischio ? (
            <span className="text-destructive">oltre di {r.mesi_proroga} mesi</span>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400">entro contratto</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right text-xs tabular-nums">
          {r.report_proiettati ? (
            <span className={cn((r.report_proiettati ?? 0) > (r.report_contrattuali ?? 0) && "text-primary")}>
              {r.report_proiettati}/{r.report_contrattuali}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {aperta && (
        <tr className="border-b bg-muted/20">
          <td colSpan={9} className="p-4">
            {!corsie ? (
              <p className="text-xs text-muted-foreground">Caricamento corsie…</p>
            ) : segni.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nessuna data ancora: il PM non ha compilato il cronoprogramma o la timeline.
              </p>
            ) : (
              <>
                <TimelineViva
                  segni={segni}
                  titoloCrono={r.cronoprogramma_id ? "Cantiere" : "Nessun cronoprogramma"}
                  titoloCert={`${corsie.certificazioni.length} certificazioni`}
                />
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  {corsie.certificazioni.map((c) => (
                    <span key={c.id}>
                      {c.nome} · {c.pm ?? "senza PM"}
                    </span>
                  ))}
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Uno scarto in giorni. Zero non e' un allarme e non si colora. */
function Scarto({ v, inverti }: { v: number | null; inverti?: boolean }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  if (v === 0) return <span className="text-emerald-700 dark:text-emerald-400">0 gg</span>;
  const male = inverti ? v > 0 : v > 20;
  const medio = !male && v > 0;
  return (
    <span
      className={cn(
        male && "text-destructive",
        medio && "text-amber-700 dark:text-amber-400",
        v < 0 && "text-emerald-700 dark:text-emerald-400"
      )}
    >
      {v > 0 ? "+" : ""}
      {v} gg
    </span>
  );
}
