import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AirDevice {
  device_id: string | null;
  mac_address: string | null;
  po_number: string | null;
  shipment_date: string | null;
}

export interface AirMonitorRow {
  id: string; // site_id
  project_name: string;
  pm_name: string | null;
  region: string | null;
  country: string | null;
  city: string | null;
  status: string;
  total_sensors: number;
  po_numbers: string[];
  handover_date: string | null;
  latest_shipment_date: string | null;
  online_status: string | null;
  notes: string | null;
}

export function useAirRows() {
  return useQuery({
    queryKey: ["monitor-air-rows"],
    staleTime: 60_000,
    queryFn: async (): Promise<AirMonitorRow[]> => {
      const { data, error } = await supabase
        .from('site_air_records')
        .select(`
          site_id,
          total_sensors,
          po_numbers,
          handover_date,
          latest_shipment_date,
          online_status,
          notes,
          status,
          project_name,
          pm_id,
          sites (
            id,
            name,
            country,
            region,
            city
          ),
          profiles:pm_id (
            display_name,
            full_name,
            first_name,
            last_name
          )
        `);

      if (error) throw error;
      if (!data) return [];

      return data.map((record: any) => {
        const site = Array.isArray(record.sites) ? record.sites[0] : record.sites;
        const pm = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles;

        return {
          id: record.site_id,
          project_name: site?.name || record.project_name || `Site: ${record.site_id.slice(0, 8)}`,
          pm_name: pm ? (pm.full_name || pm.display_name || [pm.first_name, pm.last_name].filter(Boolean).join(" ")) : null,
          region: site?.region ?? null,
          country: site?.country ?? null,
          city: site?.city ?? null,
          status: record.status,
          total_sensors: record.total_sensors ?? 0,
          po_numbers: record.po_numbers ?? [],
          handover_date: record.handover_date ?? null,
          latest_shipment_date: record.latest_shipment_date ?? null,
          online_status: record.online_status ?? null,
          notes: record.notes ?? null,
        };
      });
    },
  });
}

/**
 * NEW: Fetches device details for a specific site on-demand.
 * This prevents the "giant JSON" problem and ensures data is always fresh.
 */
export function useAirDevices(siteId: string) {
  return useQuery({
    queryKey: ["monitor-air-devices", siteId],
    enabled: !!siteId,
    staleTime: 30_000,
    queryFn: async (): Promise<AirDevice[]> => {
      const { data, error } = await supabase
        .from('hardwares')
        .select(`
          device_id,
          mac_address,
          shipment_date,
          ops_purchase_orders (
            po_number
          )
        `)
        .eq('site_id', siteId)
        .ilike('category', '%AIR%')
        .neq('status', 'In Stock');

      if (error) throw error;
      if (!data) return [];

      return data.map((h: any) => ({
        device_id: h.device_id,
        mac_address: h.mac_address,
        po_number: h.ops_purchase_orders?.po_number ?? null,
        shipment_date: h.shipment_date
      }));
    }
  });
}
