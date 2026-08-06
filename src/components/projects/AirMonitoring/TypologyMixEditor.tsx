import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Monitor typology editor for one air record.
 *
 * `site_air_records.air_product_ids` is a MULTISET: the product id repeated N
 * times means N devices of that product. The old single-select could only ever
 * write `[productId]`, so a project with, say, 10 WELL and 5 LEED collapsed into
 * "one typology" and the report attributed every sensor to it. This editor
 * writes real quantities, which is what the pivot's typology split consumes.
 */

/** Multiset → { productId: quantity }. */
export function toProductCounts(productIds: string[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pid of productIds ?? []) out[pid] = (out[pid] || 0) + 1;
  return out;
}

/** { productId: quantity } → multiset, dropping zero/negative entries. */
export function toMultiset(counts: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [pid, qty] of Object.entries(counts)) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    for (let i = 0; i < n; i += 1) out.push(pid);
  }
  return out;
}

interface Props {
  productIds: string[];
  airProducts: { id: string; name: string }[];
  productNameById: Map<string, string>;
  /** Devices physically assigned to the site — the control total to reconcile with. */
  totalSensors: number;
  onSave: (productIds: string[]) => Promise<boolean>;
}

export function TypologyMixEditor({
  productIds,
  airProducts,
  productNameById,
  totalSensors,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const current = useMemo(() => toProductCounts(productIds), [productIds]);
  const draftSum = Object.values(draft).reduce((s, n) => s + (Number(n) || 0), 0);
  const mismatch = totalSensors > 0 && draftSum !== totalSensors;

  const openEditor = (isOpen: boolean) => {
    if (isOpen) setDraft({ ...current });
    setOpen(isOpen);
  };

  const setQty = (pid: string, raw: string) => {
    const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
    setDraft((d) => ({ ...d, [pid]: n }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onSave(toMultiset(draft));
      if (ok) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const entries = Object.entries(current).filter(([, n]) => n > 0);

  return (
    <Popover open={open} onOpenChange={openEditor}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left w-full min-h-[28px] rounded hover:bg-slate-100/70 transition-colors px-1 -mx-1"
          title="Set the monitor typology mix and quantities"
        >
          {entries.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entries.map(([pid, count]) => (
                <Badge
                  key={pid}
                  variant="outline"
                  className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 px-2 h-5 flex items-center gap-1 whitespace-nowrap"
                  title={productNameById.get(pid) ?? pid.slice(0, 8)}
                >
                  <span className="truncate max-w-[130px]">
                    {count > 1 ? `${count}x ` : ""}
                    {productNameById.get(pid) ?? pid.slice(0, 8)}
                  </span>
                </Badge>
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center h-7 px-2 text-[11px] text-slate-400 border border-dashed border-slate-300 rounded">
              Set typology…
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-3 space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-800">Monitor typology mix</p>
          <p className="text-[11px] text-slate-500">
            Quantity per product. A project can carry more than one typology.
          </p>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {airProducts.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-700 flex-1 truncate" title={p.name}>
                {p.name}
              </span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft[p.id] ?? 0}
                onChange={(e) => setQty(p.id, e.target.value)}
                className="h-7 w-16 text-xs text-right"
              />
            </div>
          ))}
          {airProducts.length === 0 && (
            <p className="text-[11px] text-slate-400 italic">No AIR products in the catalogue.</p>
          )}
        </div>

        <div className="border-t pt-2 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Total in mix</span>
            <span className="font-bold tabular-nums text-slate-800">{draftSum}</span>
          </div>
          {totalSensors > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Devices assigned</span>
              <span className="font-bold tabular-nums text-slate-800">{totalSensors}</span>
            </div>
          )}
          {mismatch && (
            <p className={cn(
              "text-[10px] flex items-start gap-1 rounded px-1.5 py-1",
              "bg-amber-50 text-amber-700 border border-amber-200",
            )}>
              <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
              <span>
                The mix does not match the {totalSensors} assigned device
                {totalSensors === 1 ? "" : "s"}. The report will scale the split
                proportionally — set the exact quantities to avoid that.
              </span>
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
