/**
 * Invoicing schemes — predefined tranche generators tied to project timeline triggers.
 * Used by the quotation/project wizards and the payments view.
 */

export type PaymentSchemeId =
  | "quotation_construction_50_50"
  | "quotation_design_construction_30_40_30"
  | "bdc_sal_custom";

export type TriggerEvent =
  | "quotation_signed"
  | "design_end"
  | "construction_end"
  | "manual_sal";

export interface SchemeTrancheTemplate {
  pct: number;
  trigger: TriggerEvent;
  name: string;
}

export interface PaymentSchemeDef {
  id: PaymentSchemeId;
  label: string;
  shortLabel: string;
  description: string;
  tranches: SchemeTrancheTemplate[]; // empty for custom
  isCustom?: boolean;
}

export const PAYMENT_SCHEMES: Record<PaymentSchemeId, PaymentSchemeDef> = {
  quotation_construction_50_50: {
    id: "quotation_construction_50_50",
    label: "50% Quotation Signature / 50% Construction End",
    shortLabel: "50/50",
    description: "Two equal tranches, one at signing and one at construction end.",
    tranches: [
      { pct: 50, trigger: "quotation_signed", name: "50% on Quotation Signature" },
      { pct: 50, trigger: "construction_end", name: "50% on Construction End" },
    ],
  },
  quotation_design_construction_30_40_30: {
    id: "quotation_design_construction_30_40_30",
    label: "30% Signature / 40% Design End / 30% Construction End",
    shortLabel: "30/40/30",
    description: "Three tranches aligned with quotation, design completion and construction end.",
    tranches: [
      { pct: 30, trigger: "quotation_signed", name: "30% on Quotation Signature" },
      { pct: 40, trigger: "design_end", name: "40% on Design End" },
      { pct: 30, trigger: "construction_end", name: "30% on Construction End" },
    ],
  },
  bdc_sal_custom: {
    id: "bdc_sal_custom",
    label: "BD+C — Custom SAL (defined per project)",
    shortLabel: "Custom SAL",
    description: "Add as many tranches (SAL) as needed. Each linked manually to a milestone.",
    tranches: [],
    isCustom: true,
  },
};

export const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  quotation_signed: "Quotation Signature",
  design_end: "Design End",
  construction_end: "Construction End",
  manual_sal: "Manual / SAL",
};

export interface GeneratedTranche {
  certification_id: string;
  name: string;
  amount: number;
  status: "Pending";
  payment_scheme: PaymentSchemeId;
  tranche_pct: number;
  tranche_order: number;
  trigger_event: TriggerEvent;
}

/**
 * Generates rows ready to be bulk-inserted into `cert_payment_milestones`
 * for a predefined scheme. For custom schemes, returns []; the caller
 * should provide the tranches manually.
 */
export function generateTranches(
  scheme: PaymentSchemeId,
  totalAmount: number,
  certId: string,
  customTranches?: { pct: number; trigger: TriggerEvent; name: string }[],
): GeneratedTranche[] {
  const def = PAYMENT_SCHEMES[scheme];
  const list = scheme === "bdc_sal_custom" ? (customTranches ?? []) : def.tranches;

  return list.map((t, i) => ({
    certification_id: certId,
    name: t.name,
    amount: Math.round(totalAmount * (t.pct / 100) * 100) / 100,
    status: "Pending" as const,
    payment_scheme: scheme,
    tranche_pct: t.pct,
    tranche_order: i + 1,
    trigger_event: t.trigger,
  }));
}

/** Sum-to-100 validation for custom SAL definitions */
export function validateCustomTranches(tranches: { pct: number }[]): {
  valid: boolean;
  total: number;
} {
  const total = tranches.reduce((s, t) => s + (Number(t.pct) || 0), 0);
  return { valid: Math.abs(total - 100) < 0.01 && tranches.length > 0, total };
}
