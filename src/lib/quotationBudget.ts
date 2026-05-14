// Pure helpers for the FTE & Budget Builder used by the New Quotation wizard.
// Nothing here touches the database — output is consumed by the UI and
// later persisted to `quotation_budget_history` + `certifications.total_fees`.

export type BudgetRole =
  | "Partner"
  | "CxA"
  | "PM"
  | "Senior Specialist"
  | "Junior Specialist"
  | "Energy Modeler"
  | "Document Manager";

export const BUDGET_ROLES: BudgetRole[] = [
  "Partner",
  "CxA",
  "PM",
  "Senior Specialist",
  "Junior Specialist",
  "Energy Modeler",
  "Document Manager",
];

/** Default daily blended rate (EUR/day) per role — fully-loaded cost. */
export const ROLE_DAILY_RATES: Record<BudgetRole, number> = {
  Partner: 900,
  CxA: 700,
  PM: 550,
  "Senior Specialist": 450,
  "Junior Specialist": 280,
  "Energy Modeler": 500,
  "Document Manager": 320,
};

export const HOURS_PER_DAY = 8;

export interface EffortRow {
  id: string;
  role: BudgetRole;
  days: number;
  daily_rate: number;
}

export interface SubcontractRow {
  id: string;
  description: string;
  amount: number;
}

export interface BudgetBuilderState {
  effort: EffortRow[];
  ope_travel: number;
  hardware_amount: number;
  hardware_breakdown: { label: string; amount: number }[];
  hardware_override: boolean;
  gbci_fees: number;
  subcontracts: SubcontractRow[];
  overhead_pct: number;
  contingency_pct: number;
  markup_pct: number;
}

export function emptyBuilder(): BudgetBuilderState {
  return {
    effort: [],
    ope_travel: 0,
    hardware_amount: 0,
    hardware_breakdown: [],
    hardware_override: false,
    gbci_fees: 0,
    subcontracts: [],
    overhead_pct: 20,
    contingency_pct: 10,
    markup_pct: 25,
  };
}

export interface BudgetComputation {
  effort_subtotal: number;
  effort_days: number;
  ope_subtotal: number;
  hardware_subtotal: number;
  fees_subtotal: number;
  subcontracts_subtotal: number;
  direct_subtotal: number;
  overhead: number;
  contingency: number;
  total_cost: number;
  markup: number;
  suggested_total: number;
}

export function computeBudget(s: BudgetBuilderState): BudgetComputation {
  const effort_subtotal = s.effort.reduce((sum, r) => sum + (r.days || 0) * (r.daily_rate || 0), 0);
  const effort_days = s.effort.reduce((sum, r) => sum + (r.days || 0), 0);
  const ope_subtotal = s.ope_travel || 0;
  const hardware_subtotal = s.hardware_amount || 0;
  const fees_subtotal = s.gbci_fees || 0;
  const subcontracts_subtotal = s.subcontracts.reduce((sum, r) => sum + (r.amount || 0), 0);

  const direct_subtotal =
    effort_subtotal + ope_subtotal + hardware_subtotal + fees_subtotal + subcontracts_subtotal;

  const overhead = direct_subtotal * ((s.overhead_pct || 0) / 100);
  const contingency = direct_subtotal * ((s.contingency_pct || 0) / 100);
  const total_cost = direct_subtotal + overhead + contingency;
  const markup = total_cost * ((s.markup_pct || 0) / 100);
  const suggested_total = total_cost + markup;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    effort_subtotal: round(effort_subtotal),
    effort_days: round(effort_days),
    ope_subtotal: round(ope_subtotal),
    hardware_subtotal: round(hardware_subtotal),
    fees_subtotal: round(fees_subtotal),
    subcontracts_subtotal: round(subcontracts_subtotal),
    direct_subtotal: round(direct_subtotal),
    overhead: round(overhead),
    contingency: round(contingency),
    total_cost: round(total_cost),
    markup: round(markup),
    suggested_total: round(suggested_total),
  };
}
