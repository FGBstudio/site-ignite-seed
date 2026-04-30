import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Mode = "AIR" | "ENERGY";

interface Hardware {
  id: string;
  device_id: string;
  hardware_type: string | null;
  product_id: string | null;
  status: string | null;
}

interface Allocation {
  id: string;
  product_id: string;
  quantity: number;
  requested_quantity: number | null;
  status: string;
  category: string | null;
  source: string | null;
  products?: { id: string; name: string; sku: string | null } | null;
}

interface Certification {
  id: string;
  pm_id: string | null;
  site_id: string | null;
  sites?: { name: string | null } | null;
}

interface AssignmentSlot {
  productId: string; // requested product id
  productName: string;
  selectedTypeFilter: string; // hardware_type or "any"
  hardwareId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hardwares: Hardware[];
  onSaved: () => void;
}

export function AssignToSiteDialog({ open, onOpenChange, hardwares, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("AIR");
  const [pmFilter, setPmFilter] = useState<string>("all");
  const [certificationId, setCertificationId] = useState<string>("");
  const [slots, setSlots] = useState<AssignmentSlot[]>([]);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeCfg, setBridgeCfg] = useState({
    ip_configuration: "",
    assigned_port: "",
    ip_address: "",
    subnet_mask: "",
    gateway: "",
    dns1: "",
    dns2: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: pms = [] } = useProjectManagers();

  const { data: certifications = [] } = useQuery({
    queryKey: ["certs-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, pm_id, site_id, sites(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Certification[];
    },
  });

  const { data: allocations = [], refetch: refetchAlloc } = useQuery<Allocation[]>({
    queryKey: ["project-allocations", certificationId],
    enabled: Boolean(certificationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_allocations")
        .select("*, products(id, name, sku)")
        .eq("certification_id", certificationId);
      if (error) throw error;
      return (data ?? []) as unknown as Allocation[];
    },
  });

  // Filter allocations by mode (AIR vs ENERGY). Legacy rows w/o category are AIR.
  const modeAllocations = useMemo(
    () =>
      allocations.filter((a) => {
        const cat = a.category ?? "AIR";
        return cat === mode;
      }),
    [allocations, mode],
  );

  // Build slots from allocations: one slot per requested unit minus already-assigned
  useEffect(() => {
    const next: AssignmentSlot[] = [];
    for (const alloc of modeAllocations) {
      const requested = alloc.requested_quantity ?? alloc.quantity ?? 0;
      const alreadyAssigned = alloc.quantity ?? 0;
      const remaining = Math.max(requested - alreadyAssigned, 0);
      const productName = alloc.products?.name ?? "Unknown";
      for (let i = 0; i < remaining; i++) {
        next.push({
          productId: alloc.product_id,
          productName,
          selectedTypeFilter: "any",
          hardwareId: null,
        });
      }
    }
    setSlots(next);
  }, [modeAllocations]);

  const filteredCerts = useMemo(
    () => (pmFilter === "all" ? certifications : certifications.filter((c) => c.pm_id === pmFilter)),
    [certifications, pmFilter],
  );

  const selectedCert = certifications.find((c) => c.id === certificationId);
  const selectedPm = pms.find((p) => p.id === selectedCert?.pm_id);

  // Available stock: not yet assigned
  const stock = useMemo(
    () => hardwares.filter((h) => h.status === "In Stock" && !slots.some((s) => s.hardwareId === h.id)),
    [hardwares, slots],
  );
  const allTypes = useMemo(
    () => Array.from(new Set(hardwares.map((h) => h.hardware_type).filter(Boolean) as string[])),
    [hardwares],
  );

  const updateSlot = (idx: number, patch: Partial<AssignmentSlot>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const summarize = (): string => {
    if (modeAllocations.length === 0) return "No requests yet for this project.";
    const groups = new Map<string, number>();
    for (const a of modeAllocations) {
      const name = a.products?.name ?? "Hardware";
      const requested = a.requested_quantity ?? a.quantity ?? 0;
      groups.set(name, (groups.get(name) ?? 0) + requested);
    }
    const parts = [...groups.entries()].map(([n, q]) => `${q}× ${n}`);
    if (mode === "AIR") {
      const who = selectedPm?.full_name ?? "the PM";
      return `For this project ${who} asked for ${parts.join(", ")}.`;
    }
    return `For this project Monitoring Team asked for ${parts.join(", ")}.`;
  };

  const handleSubmit = async () => {
    if (!certificationId) {
      toast({ title: "Pick a project first", variant: "destructive" });
      return;
    }
    const filledSlots = slots.filter((s) => s.hardwareId);
    if (filledSlots.length === 0) {
      toast({ title: "Assign at least one device", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Group hardware ids per allocation product_id and update
      for (const slot of filledSlots) {
        const update: Record<string, unknown> = {
          site_id: selectedCert?.site_id ?? null,
          status: "Assigned",
        };
        if (mode === "ENERGY" && bridgeOpen) {
          const isBridge = /bridge/i.test(slot.productName);
          if (isBridge) Object.assign(update, bridgeCfg);
        }
        const { error: hwErr } = await supabase
          .from("hardwares")
          .update(update)
          .eq("id", slot.hardwareId!);
        if (hwErr) throw hwErr;
      }

      // Bump quantity on each allocation by # of slots filled for that product
      const byProduct = new Map<string, number>();
      for (const s of filledSlots) byProduct.set(s.productId, (byProduct.get(s.productId) ?? 0) + 1);
      for (const [productId, count] of byProduct) {
        const alloc = modeAllocations.find((a) => a.product_id === productId);
        if (!alloc) continue;
        await supabase
          .from("project_allocations")
          .update({ quantity: (alloc.quantity ?? 0) + count, status: "Allocated" })
          .eq("id", alloc.id);
      }

      // Refresh site_energy_records counts (Energy only)
      if (mode === "ENERGY") {
        const energyAllocs = allocations.filter((a) => (a.category ?? "AIR") === "ENERGY");
        const counts = computeEnergyCounts(energyAllocs, filledSlots, hardwares);
        const payload: Record<string, unknown> = {
          certification_id: certificationId,
          ...counts,
          ...(bridgeOpen ? bridgeCfg : {}),
        };
        await supabase
          .from("site_energy_records" as never)
          .upsert(payload as never, { onConflict: "certification_id" });
      }

      qc.invalidateQueries({ queryKey: ["project-allocations", certificationId] });
      qc.invalidateQueries({ queryKey: ["site-energy-records"] });
      toast({ title: "Devices assigned", description: `${filledSlots.length} device(s) allocated.` });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Assignment failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-heavy sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Assignment</DialogTitle>
        </DialogHeader>

        {/* Air / Energy slider */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 self-start">
          {(["AIR", "ENERGY"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "AIR" ? "Air" : "Energy"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Filter by PM</Label>
              <Select value={pmFilter} onValueChange={setPmFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Project</Label>
              <Select value={certificationId} onValueChange={setCertificationId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {filteredCerts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.sites?.name ?? c.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {certificationId && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-foreground">{summarize()}</p>
            </div>
          )}

          {certificationId && slots.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              All requested {mode.toLowerCase()} devices are already assigned, or none were requested.
            </p>
          )}

          {slots.map((slot, idx) => {
            const candidates = stock.filter(
              (h) =>
                slot.selectedTypeFilter === "any" || h.hardware_type === slot.selectedTypeFilter,
            );
            return (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Slot {idx + 1} · requested: <Badge variant="outline" className="ml-1">{slot.productName}</Badge>
                  </Label>
                  <Select
                    value={slot.selectedTypeFilter}
                    onValueChange={(v) => updateSlot(idx, { selectedTypeFilter: v, hardwareId: null })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any type</SelectItem>
                      {allTypes.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  value={slot.hardwareId ?? ""}
                  onValueChange={(v) => updateSlot(idx, { hardwareId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick available device" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.device_id} {h.hardware_type ? `(${h.hardware_type})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateSlot(idx, { hardwareId: null, selectedTypeFilter: "any" })}
                >
                  Clear
                </Button>
              </div>
            );
          })}

          {mode === "ENERGY" && (
            <div className="rounded-md border border-border">
              <button
                type="button"
                onClick={() => setBridgeOpen((o) => !o)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium"
              >
                <span>Bridge configuration (optional)</span>
                {bridgeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {bridgeOpen && (
                <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                  {(
                    [
                      ["ip_configuration", "IP configuration"],
                      ["assigned_port", "Assigned Port"],
                      ["ip_address", "IP address"],
                      ["subnet_mask", "Subnet Mask"],
                      ["gateway", "Gateway"],
                      ["dns1", "DNS 1"],
                      ["dns2", "DNS 2"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Input
                        value={bridgeCfg[key]}
                        onChange={(e) => setBridgeCfg({ ...bridgeCfg, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Confirm Allocation
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function computeEnergyCounts(
  allocs: Allocation[],
  newlyFilled: AssignmentSlot[],
  hardwares: Hardware[],
) {
  // Aggregate previously-assigned + newly-assigned hardwares for this cert
  const newHwIds = new Set(newlyFilled.map((s) => s.hardwareId).filter(Boolean) as string[]);
  const total_sensors = allocs.reduce((s, a) => s + (a.quantity ?? 0), 0) + newHwIds.size;
  let no_pan10 = 0;
  let no_pan12 = 0;
  let no_pan14 = 0;
  let total_bridges = 0;
  for (const id of newHwIds) {
    const hw = hardwares.find((h) => h.id === id);
    const t = (hw?.hardware_type ?? "").toUpperCase();
    if (t.includes("PAN-10") || t.includes("FGB10")) no_pan10++;
    else if (t.includes("PAN-12") || t.includes("FGB12")) no_pan12++;
    else if (t.includes("PAN-14") || t.includes("FGB14")) no_pan14++;
    if (t.includes("BRIDGE")) total_bridges++;
  }
  return { total_sensors, no_pan10, no_pan12, no_pan14, total_bridges };
}
