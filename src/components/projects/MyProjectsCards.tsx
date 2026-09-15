import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Building2, MapPin } from "lucide-react";
import { useMyProjects, STATO_META, type StatoCompilazione } from "@/hooks/useStatoCompilazione";
import { PROJECT_TIPO_LABEL } from "@/lib/projectTimelineTemplates";
import { stilePill } from "@/lib/serviceColors";

/**
 * My Projects — flusso v2 §1.1.
 *
 * Una card per progetto assegnato: sito, cliente, tipo, la certificazione
 * nella tinta del servizio, e lo stato di compilazione a tre valori. Il click
 * porta dritto alla pagina progetto — dove il PM lavora davvero — invece che a
 * un dialogo di configurazione.
 *
 * Le card sono raggruppate per stato con quelle da iniziare in cima: e' la
 * lista del lavoro che manca, non un archivio.
 */
export function MyProjectsCards() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: righe = [], isLoading } = useMyProjects(user?.id, isAdmin);
  const [cerca, setCerca] = useState("");

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const base = q
      ? righe.filter((r) =>
          [r.sito, r.citta, r.cliente, r.nome].some((v) => (v ?? "").toLowerCase().includes(q))
        )
      : righe;
    const peso: Record<StatoCompilazione, number> = { da_iniziare: 0, pt_pronta: 1, completa: 2 };
    return [...base].sort(
      (a, b) => peso[a.stato] - peso[b.stato] || (a.sito ?? "").localeCompare(b.sito ?? "", "it")
    );
  }, [righe, cerca]);

  const conta = (s: StatoCompilazione) => righe.filter((r) => r.stato === s).length;

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Caricamento…</p>;
  }
  if (righe.length === 0) {
    return (
      <Card className="py-16 text-center">
        <p className="text-sm font-medium">Nessun progetto assegnato</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quando l'amministrazione ti assegna un progetto, lo trovi qui.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <b className="tabular-nums text-foreground">{conta("da_iniziare")}</b> da iniziare ·{" "}
          <b className="tabular-nums text-foreground">{conta("pt_pronta")}</b> con la project timeline pronta ·{" "}
          <b className="tabular-nums text-foreground">{conta("completa")}</b> complete
        </p>
        <Input
          placeholder="Cerca sito, città, cliente…"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          className="h-8 w-60 text-xs"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibili.map((r) => {
          const meta = STATO_META[r.stato];
          const servizio = `${r.cert_type ?? ""} ${r.cert_rating ?? ""} ${r.nome ?? ""}`;
          return (
            <button
              key={r.certification_id}
              type="button"
              onClick={() => navigate(`/projects/${r.certification_id}/cronoprogramma`)}
              className="rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold">{r.sito ?? "—"}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                    meta.tono === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                    meta.tono === "avviso" && "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                    meta.tono === "neutro" && "bg-muted text-muted-foreground"
                  )}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {r.citta ?? "—"}
                <span className="mx-0.5">·</span>
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{r.cliente ?? "—"}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                  style={stilePill(servizio)}
                >
                  {r.nome ?? r.cert_type ?? "certificazione"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground">
                  {PROJECT_TIPO_LABEL[r.tipo]}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
