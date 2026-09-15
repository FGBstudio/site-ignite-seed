import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { proponiTipo, type ProjectTipo } from "@/lib/projectTimelineTemplates";

/**
 * Lo stato di compilazione di un progetto — flusso v2 §1.1.
 *
 * Tre valori, e li decide un fatto solo: cosa esiste davvero.
 *   `da_iniziare`  — il sito non ha ancora la project timeline (e le serve);
 *   `pt_pronta`    — la project timeline c'e', manca la HQ FGB di questo PM;
 *   `completa`     — entrambe.
 *
 * Il calcolo sta qui e non nella card perche' la stessa domanda la fa anche
 * la pagina progetto per decidere se la sezione ② e' bloccata: due risposte
 * diverse alla stessa domanda divergerebbero al primo caso limite.
 */

export type StatoCompilazione = "da_iniziare" | "pt_pronta" | "completa";

export const STATO_META: Record<StatoCompilazione, { label: string; tono: "neutro" | "avviso" | "ok" }> = {
  da_iniziare: { label: "Da iniziare", tono: "neutro" },
  pt_pronta: { label: "Project timeline pronta", tono: "avviso" },
  completa: { label: "Timeline completa", tono: "ok" },
};

export interface RigaMyProjects {
  certification_id: string;
  nome: string | null;
  cert_type: string | null;
  cert_rating: string | null;
  site_id: string;
  sito: string | null;
  citta: string | null;
  cliente: string | null;
  tipo: ProjectTipo;
  stato: StatoCompilazione;
  /** Il record condiviso del sito, se esiste. */
  cronoprogramma_id: string | null;
}

export function useMyProjects(userId: string | undefined, isAdmin: boolean) {
  return useQuery({
    queryKey: ["my-projects", userId, isAdmin],
    enabled: !!userId,
    queryFn: async (): Promise<RigaMyProjects[]> => {
      let q = (supabase as any)
        .from("certifications")
        .select("id, name, cert_type, cert_rating, project_tipo, site_id, client, cronoprogramma_id, pm_id, status")
        .not("status", "in", '("canceled","cancelled","potential","quotation")');
      if (!isAdmin) q = q.eq("pm_id", userId);
      const { data: certs, error } = await q;
      if (error) throw error;
      const righe = (certs ?? []) as any[];
      if (righe.length === 0) return [];

      const siteIds = Array.from(new Set(righe.map((c) => c.site_id).filter(Boolean)));
      const certIds = righe.map((c) => c.id);

      const [{ data: siti }, { data: croni }, { data: ms }] = await Promise.all([
        (supabase as any).from("sites").select("id, name, city").in("id", siteIds),
        (supabase as any).from("cronoprogrammi").select("id, site_id").eq("stato", "attivo").in("site_id", siteIds),
        (supabase as any)
          .from("certification_milestones")
          .select("certification_id")
          .eq("milestone_type", "timeline")
          .in("certification_id", certIds),
      ]);

      const sito = new Map<string, any>(((siti ?? []) as any[]).map((s) => [s.id, s]));
      const cronoPerSito = new Map<string, string>(((croni ?? []) as any[]).map((c) => [c.site_id, c.id]));
      const conTimeline = new Set<string>(((ms ?? []) as any[]).map((m) => m.certification_id));

      return righe.map((c) => {
        const tipo: ProjectTipo =
          (c.project_tipo as ProjectTipo | null) ?? proponiTipo(c.cert_type, c.cert_rating).tipo;
        const cronoId = cronoPerSito.get(c.site_id) ?? null;
        // EXISTING non ha project timeline e non le serve: il suo «da
        // iniziare» e' la HQ FGB, non il cantiere.
        const ptOk = tipo === "existing" || !!cronoId;
        const stato: StatoCompilazione = !ptOk
          ? "da_iniziare"
          : conTimeline.has(c.id)
          ? "completa"
          : "pt_pronta";
        const s = sito.get(c.site_id);
        return {
          certification_id: c.id,
          nome: c.name,
          cert_type: c.cert_type,
          cert_rating: c.cert_rating,
          site_id: c.site_id,
          sito: s?.name ?? null,
          citta: s?.city ?? null,
          cliente: c.client ?? null,
          tipo,
          stato,
          cronoprogramma_id: cronoId,
        };
      });
    },
  });
}
