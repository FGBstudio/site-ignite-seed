import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Calculator, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  type BudgetBuilderState,
  type BudgetRole,
  BUDGET_ROLES,
  ROLE_DAILY_RATES,
  computeBudget,
  emptyBuilder,
} from "@/lib/quotationBudget";
import { useHardwarePricing, computeGreenyKitCost, computeIaqCost } from "@/hooks/useHardwarePricing";
import { cn } from "@/lib/utils";

interface Props {
  state: BudgetBuilderState;
  onChange: (s: BudgetBuilderState) => void;
  hasIaq: boolean;
  hasEnergy: boolean;
  onApply: (suggested: number, gbciFees: number) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function QuotationBudgetBuilder({ state, onChange, hasIaq, hasEnergy, onApply }: Props) {
  const { data: pricing } = useHardwarePricing();
  const [iaqSensors, setIaqSensors] = useState(0);

  // Auto-recompute hardware when flags / sensors / pricing change (unless override).
  useEffect(() => {
    if (state.hardware_override) return;
    const breakdown: { label: string; amount: number }[] = [];
    let total = 0;
    if (hasIaq && pricing) {
      const c = computeIaqCost(pricing, iaqSensors);
      breakdown.push({ label: `ClAir IAQ — ${iaqSensors} sensor(s) × €${pricing.iaqMaxUnit.toFixed(2)}`, amount: c });
      total += c;
    }
    if (hasEnergy && pricing) {
      const c = computeGreenyKitCost(pricing);
      breakdown.push({
        label: `Greeny kit — 1 Bridge LAN (€${pricing.greenyBridgeLan.toFixed(2)}) + 12 × PAN12 (€${pricing.greenyPan12.toFixed(2)}) + 1 Mango (€${pricing.mango.toFixed(2)})`,
        amount: c,
      });
      total += c;
    }
    onChange({ ...state, hardware_amount: Math.round(total * 100) / 100, hardware_breakdown: breakdown });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIaq, hasEnergy, iaqSensors, pricing?.iaqMaxUnit, pricing?.greenyBridgeLan, pricing?.greenyPan12, pricing?.mango, state.hardware_override]);

  const computation = useMemo(() => computeBudget(state), [state]);

  const updateEffort = (id: string, patch: Partial<BudgetBuilderState["effort"][number]>) =>
    onChange({ ...state, effort: state.effort.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const addEffortRow = () =>
    onChange({
      ...state,
      effort: [
        ...state.effort,
        { id: uid(), role: "Senior Specialist", days: 0, daily_rate: ROLE_DAILY_RATES["Senior Specialist"] },
      ],
    });

  const removeEffort = (id: string) =>
    onChange({ ...state, effort: state.effort.filter((r) => r.id !== id) });

  const addSubcontract = () =>
    onChange({ ...state, subcontracts: [...state.subcontracts, { id: uid(), description: "", amount: 0 }] });

  const updateSubcontract = (id: string, patch: Partial<BudgetBuilderState["subcontracts"][number]>) =>
    onChange({
      ...state,
      subcontracts: state.subcontracts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });

  const removeSubcontract = (id: string) =>
    onChange({ ...state, subcontracts: state.subcontracts.filter((r) => r.id !== id) });

  const fmt = (n: number) => `€${n.toLocaleString("en-EU", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* 1. Effort */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Project Effort (per role)</p>
            <Button type="button" size="sm" variant="ghost" onClick={addEffortRow} className="h-7 gap-1">
              <Plus className="h-3 w-3" /> Add role
            </Button>
          </div>
          {state.effort.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No roles yet — click "Add role" to budget the effort.</p>
          ) : (
            <div className="space-y-2">
              {state.effort.map((row) => {
                const subtotal = (row.days || 0) * (row.daily_rate || 0);
                return (
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Label className="text-[10px] uppercase text-muted-foreground">Role</Label>
                      <Select
                        value={row.role}
                        onValueChange={(v) =>
                          updateEffort(row.id, { role: v as BudgetRole, daily_rate: ROLE_DAILY_RATES[v as BudgetRole] })
                        }
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BUDGET_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Days</Label>
                      <Input type="number" min={0} className="h-8 text-sm"
                        value={row.days || ""} onChange={(e) => updateEffort(row.id, { days: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px] uppercase text-muted-foreground">€/day</Label>
                      <Input type="number" min={0} className="h-8 text-sm"
                        value={row.daily_rate || ""} onChange={(e) => updateEffort(row.id, { daily_rate: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2 text-right">
                      <Label className="text-[10px] uppercase text-muted-foreground">Subtotal</Label>
                      <p className="h-8 flex items-center justify-end font-medium text-sm">{fmt(subtotal)}</p>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeEffort(row.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. OPE */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · OPE — Travel & Logistics</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-xs">Trips, accommodation, on-site visits (€)</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.ope_travel || ""} onChange={(e) => onChange({ ...state, ope_travel: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Hardware */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Hardware / Equipment</p>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={state.hardware_override} onCheckedChange={(v) => onChange({ ...state, hardware_override: v })} />
              Manual override
            </label>
          </div>

          {!hasIaq && !hasEnergy && (
            <p className="text-xs text-muted-foreground italic">No IAQ or Energy monitoring selected — hardware cost = €0.</p>
          )}

          {hasIaq && !state.hardware_override && (
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2">
                <Label className="text-xs">ClAir IAQ sensors (count)</Label>
                <Input type="number" min={0} className="h-8 text-sm"
                  value={iaqSensors || ""} onChange={(e) => setIaqSensors(Number(e.target.value) || 0)} />
              </div>
            </div>
          )}

          {!state.hardware_override && state.hardware_breakdown.length > 0 && (
            <div className="space-y-1 rounded-md bg-muted/40 p-2">
              {state.hardware_breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="font-medium">{fmt(b.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {state.hardware_override && (
            <div>
              <Label className="text-xs">Hardware total (€)</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.hardware_amount || ""} onChange={(e) => onChange({ ...state, hardware_amount: Number(e.target.value) || 0 })} />
            </div>
          )}

          {hasEnergy && pricing && pricing.greenyBridgeLan === 0 && (
            <div className="flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Some Greeny prices are €0 in <code>products</code> — use override if needed.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. GBCI Fees */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4 · Registration / Certification Fees</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-xs">GBCI / IWBI fees (€) — also written to "GBCI Fees"</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.gbci_fees || ""} onChange={(e) => onChange({ ...state, gbci_fees: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Subcontracts */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">5 · External Services & Subcontracts</p>
            <Button type="button" size="sm" variant="ghost" onClick={addSubcontract} className="h-7 gap-1">
              <Plus className="h-3 w-3" /> Add item
            </Button>
          </div>
          {state.subcontracts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">e.g. acoustic tests, blower-door, lab water analysis…</p>
          ) : state.subcontracts.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-8">
                <Label className="text-[10px] uppercase text-muted-foreground">Description</Label>
                <Input className="h-8 text-sm" value={row.description}
                  onChange={(e) => updateSubcontract(row.id, { description: e.target.value })} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px] uppercase text-muted-foreground">Amount (€)</Label>
                <Input type="number" min={0} className="h-8 text-sm" value={row.amount || ""}
                  onChange={(e) => updateSubcontract(row.id, { amount: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeSubcontract(row.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 6. Indirect costs */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">6 · Indirect Costs</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Overhead (%)</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.overhead_pct} onChange={(e) => onChange({ ...state, overhead_pct: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-xs">Contingency (%)</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.contingency_pct} onChange={(e) => onChange({ ...state, contingency_pct: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7. Markup */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">7 · Profit Margin</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Markup (%)</Label>
              <Input type="number" min={0} className="h-8 text-sm"
                value={state.markup_pct} onChange={(e) => onChange({ ...state, markup_pct: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Suggested Budget</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Effort ({computation.effort_days}d)</span><span className="text-right">{fmt(computation.effort_subtotal)}</span>
            <span className="text-muted-foreground">OPE</span><span className="text-right">{fmt(computation.ope_subtotal)}</span>
            <span className="text-muted-foreground">Hardware</span><span className="text-right">{fmt(computation.hardware_subtotal)}</span>
            <span className="text-muted-foreground">Reg. Fees</span><span className="text-right">{fmt(computation.fees_subtotal)}</span>
            <span className="text-muted-foreground">Subcontracts</span><span className="text-right">{fmt(computation.subcontracts_subtotal)}</span>
            <span className="text-muted-foreground font-medium">Direct subtotal</span><span className="text-right font-medium">{fmt(computation.direct_subtotal)}</span>
            <span className="text-muted-foreground">Overhead ({state.overhead_pct}%)</span><span className="text-right">{fmt(computation.overhead)}</span>
            <span className="text-muted-foreground">Contingency ({state.contingency_pct}%)</span><span className="text-right">{fmt(computation.contingency)}</span>
            <span className="text-muted-foreground font-medium">Total cost</span><span className="text-right font-medium">{fmt(computation.total_cost)}</span>
            <span className="text-muted-foreground">Markup ({state.markup_pct}%)</span><span className="text-right">{fmt(computation.markup)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Suggested Total Quotation</span>
            <Badge className="text-base px-3 py-1">{fmt(computation.suggested_total)}</Badge>
          </div>
          <Button
            type="button"
            className="w-full gap-2 mt-2"
            onClick={() => onApply(computation.suggested_total, state.gbci_fees)}
            disabled={computation.suggested_total <= 0}
          >
            <Check className="h-4 w-4" /> Use this value
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export { emptyBuilder };
