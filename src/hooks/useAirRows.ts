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
  online_status: string | null;
  notes: string | null;
  // Financials
  inbound_cost: number;
  outbound_cost: number;
  internal_cost: number;
  customs_cost: number;
  vat_cost: number;
  hardware_cost: number;
  working_time_cost: number;
  total_cost: number;
  quotation_value: number;
  planned_remaining: number;
  taxes: number;
  profit: number;
  roi: number;
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
          project_name,
          pm_id,
          inbound_cost,
          outbound_cost,
          internal_cost,
          customs_cost,
          vat_cost,
          hardware_cost,
          working_time_cost,
          total_cost,
          quotation_value,
          planned_remaining,
          taxes,
          profit,
          roi,
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
          inbound_cost: record.inbound_cost ?? 0,
          outbound_cost: record.outbound_cost ?? 0,
          internal_cost: record.internal_cost ?? 0,
          customs_cost: record.customs_cost ?? 0,
          vat_cost: record.vat_cost ?? 0,
          hardware_cost: record.hardware_cost ?? 0,
          working_time_cost: record.working_time_cost ?? 0,
          total_cost: record.total_cost ?? 0,
          quotation_value: record.quotation_value ?? 0,
          planned_remaining: record.planned_remaining ?? 0,
          taxes: record.taxes ?? 0,
          profit: record.profit ?? 0,
          roi: record.roi ?? 0,
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
          category,
          product_id,
          products (
            category
          ),
          ops_purchase_orders (
            po_number
          )
        `)
        .eq('site_id', siteId)
        .neq('status', 'In Stock');

      if (error) throw error;
      if (!data) return [];

      return (data as any[])
        .filter((h: any) => {
          const cat = (h.category || h.products?.category || "AIR").toUpperCase();
          return cat.includes("AIR");
        })
        .map((h: any) => ({
          device_id: h.device_id,
          mac_address: h.mac_address,
          po_number: h.ops_purchase_orders?.po_number ?? null,
          shipment_date: h.shipment_date
        }));
    }
  });
}
