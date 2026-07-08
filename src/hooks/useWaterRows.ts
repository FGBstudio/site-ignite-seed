import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadIdentityMaps } from "@/lib/monitorIdentity";

export interface WaterMonitorRow {
  id: string; // site_id
  certification_id: string | null;
  project_name: string;
  pm_name: string | null;
  region: string | null;
  country: string | null;
  city: string | null;
  brand_name: string | null;
  status: string;
  total_sensors: number;
  po_numbers: string[];
  online_status: string | null;
  notes: string | null;
  handover_date: string | null;
}

export function useWaterRows() {
  return useQuery({
    queryKey: ["monitor-water-rows"],
    staleTime: 60_000,
    queryFn: async (): Promise<WaterMonitorRow[]> => {
      const { data, error } = await supabase
        .from("site_water_records" as never)
        .select("*");
      if (error) throw error;
      const records = (data ?? []) as Array<{
        site_id: string;
        certification_id: string | null;
        pm_id: string | null;
        project_name: string;
        status: string;
        total_sensors: number | null;
        po_numbers: string[] | null;
        online_status: string | null;
        notes: string | null;
        handover_date: string | null;
      }>;
      if (records.length === 0) return [];

      const siteIds = records.map((r) => r.site_id).filter(Boolean);
      const certIds = records.map((r) => r.certification_id).filter(Boolean) as string[];
      const pmIds = Array.from(new Set(records.map((r) => r.pm_id).filter(Boolean) as string[]));

      const [identity, pmsRes] = await Promise.all([
        loadIdentityMaps(siteIds, certIds),
        pmIds.length
          ? supabase.from("profiles").select("id, display_name, full_name, first_name, last_name").in("id", pmIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const pmById = new Map<string, { display_name: string | null; full_name: string | null; first_name: string | null; last_name: string | null }>();
      ((pmsRes.data ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null; first_name: string | null; last_name: string | null }>).forEach((p) => pmById.set(p.id, p));

      return records.map<WaterMonitorRow>((r) => {
        const id =
          (r.certification_id ? identity.byCertId.get(r.certification_id) : null) ??
          identity.bySiteId.get(r.site_id) ??
          null;
        const pm = r.pm_id ? pmById.get(r.pm_id) : null;
        return {
          id: r.site_id,
          certification_id: r.certification_id,
          project_name: id?.project || r.project_name || `Site: ${r.site_id.slice(0, 8)}`,
          pm_name: pm ? pm.full_name || pm.display_name || [pm.first_name, pm.last_name].filter(Boolean).join(" ") || null : null,
          brand_name: id?.client ?? null,
          city: id?.city ?? null,
          region: id?.region ?? null,
          country: id?.country ?? null,
          status: r.status ?? "Requested",
          total_sensors: r.total_sensors ?? 0,
          po_numbers: r.po_numbers ?? [],
          online_status: r.online_status ?? null,
          notes: r.notes ?? null,
          handover_date: r.handover_date ?? null,
        };
      });
    },
  });
}
