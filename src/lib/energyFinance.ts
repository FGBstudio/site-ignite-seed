// Finance computations for the Energy Monitoring quote pipeline.
// All amounts in EUR unless suffixed _usd.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EnergyFinanceSettings {
  vat_pct: number;
  customs_inbound_pct: number;
  customs_outbound_pct: number;
  pickup_default_usd: number;
  shipment_default_usd: number;
  installation_default_usd: number;
  company_cost_pct: number;
  fx_rate_usd_eur: number;
  quotation_markup_pct: number;
}

export const DEFAULT_FINANCE_SETTINGS: EnergyFinanceSettings = {
  vat_pct: 22,
  customs_inbound_pct: 5,
  customs_outbound_pct: 0,
  pickup_default_usd: 0,
  shipment_default_usd: 0,
  installation_default_usd: 0,
  company_cost_pct: 20,
  fx_rate_usd_eur: 0.86,
  quotation_markup_pct: 30,
};

export function useEnergyFinanceSettings() {
  return useQuery({
    queryKey: ["energy-finance-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EnergyFinanceSettings> => {
      const { data, error } = await supabase
        .from("energy_finance_settings" as never)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_FINANCE_SETTINGS;
      return { ...DEFAULT_FINANCE_SETTINGS, ...(data as Partial<EnergyFinanceSettings>) };
    },
  });
}

export interface FinanceInput {
  hardwareUsd: number; // sensors + bridges + mango
  fgbResource?: number;
}

export interface FinanceBreakdown {
  total_package_cost_usd: number;
  total_package_cost_eur: number;
  duty_customs_inbound: number;
  vat_fee: number;
  pickup_cost: number;
  shipment_cost: number;
  outbound_custom_cost: number;
  installation_cost: number;
  company_cost_pct: number;
  fgb_resource: number;
  total_cost: number;
  quotation_value: number;
  planned_remaining_value: number;
  taxes: number;
  profit: number;
  roi_pct: number;
  fx_rate_usd_eur: number;
}

export function computeFinance(
  input: FinanceInput,
  s: EnergyFinanceSettings,
): FinanceBreakdown {
  const fx = s.fx_rate_usd_eur || 0.86;
  const usd = input.hardwareUsd;
  const eur = usd * fx;
  const duties = eur * (s.customs_inbound_pct / 100);
  const vat = (eur + duties) * (s.vat_pct / 100);
  const pickup = s.pickup_default_usd * fx;
  const shipment = s.shipment_default_usd * fx;
  const outbound = (eur + duties) * (s.customs_outbound_pct / 100);
  const installation = s.installation_default_usd * fx;
  const fgb = input.fgbResource ?? 0;
  const subtotal = eur + duties + vat + pickup + shipment + outbound + installation + fgb;
  const companyCost = subtotal * (s.company_cost_pct / 100);
  const totalCost = subtotal + companyCost;
  const quotationValue = totalCost * (1 + s.quotation_markup_pct / 100);
  const taxes = quotationValue * (s.vat_pct / 100);
  const profit = quotationValue - totalCost;
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total_package_cost_usd: round(usd),
    total_package_cost_eur: round(eur),
    duty_customs_inbound: round(duties),
    vat_fee: round(vat),
    pickup_cost: round(pickup),
    shipment_cost: round(shipment),
    outbound_custom_cost: round(outbound),
    installation_cost: round(installation),
    company_cost_pct: s.company_cost_pct,
    fgb_resource: round(fgb),
    total_cost: round(totalCost),
    quotation_value: round(quotationValue),
    planned_remaining_value: round(quotationValue),
    taxes: round(taxes),
    profit: round(profit),
    roi_pct: Math.round(roi * 10) / 10,
    fx_rate_usd_eur: fx,
  };
}
