import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronUp, Sparkles, CheckCircle2 } from "lucide-react";
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
  mac_address: string | null;
  hardware_type: string | null;
  product_id: string | null;
  status: string | null;
  site_id?: string | null;
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
  productId: string;
  productName: string;
  selectedTypeFilter: string;
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

  const selectedCert = certifications.find((c) => c.id === certificationId);
  const selectedSiteId = selectedCert?.site_id ?? null;

  const { data: allocations = [] } = useQuery<Allocation[]>({
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

  // Hardware fisicamente già sul sito (fonte di verità per l'assegnazione reale)
  const { data: onSiteHardwares = [] } = useQuery<Hardware[]>({
    queryKey: ["hardwares-on-site", selectedSiteId],
    enabled: Boolean(selectedSiteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hardwares")
        .select("id, device_id, mac_address, hardware_type, product_id, status, site_id")
        .eq("site_id", selectedSiteId!)
        .neq("status", "In Stock");
      if (error) throw error;
      return (data ?? []) as unknown as Hardware[];
    },
  });

  const modeAllocations = useMemo(
    () => allocations.filter((a) => (a.category ?? "AIR") === mode),
    [allocations, mode],
  );

  // Conteggio reale per product_id basato sui device fisicamente sul sito
  const physicalCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of onSiteHardwares) {
      if (!h.product_id) continue;
      map.set(h.product_id, (map.get(h.product_id) ?? 0) + 1);
    }
    return map;
  }, [onSiteHardwares]);

  // Riepilogo per prodotto: requested / on-site / remaining
  const productSummary = useMemo(() => {
    const rows: Array<{
      productId: string;
      productName: string;
      requested: number;
      onSite: number;
      remaining: number;
    }> = [];
    for (const alloc of modeAllocations) {
      const requested = alloc.requested_quantity ?? alloc.quantity ?? 0;
      const onSite = physicalCountByProduct.get(alloc.product_id) ?? 0;
      const remaining = Math.max(requested - onSite, 0);
      rows.push({
        productId: alloc.product_id,
        productName: alloc.products?.name ?? "Unknown",
        requested,
        onSite,
        remaining,
      });
    }
    return rows;
  }, [modeAllocations, physicalCountByProduct]);

  // Slot: uno per pezzo da assegnare ancora
  useEffect(() => {
    const next: AssignmentSlot[] = [];
    for (const r of productSummary) {
      for (let i = 0; i < r.remaining; i++) {
        next.push({
          productId: r.productId,
          productName: r.productName,
          selectedTypeFilter: "any",
          hardwareId: null,
        });
      }
    }
    setSlots(next);
  }, [productSummary]);

  const filteredCerts = useMemo(
    () => (pmFilter === "all" ? certifications : certifications.filter((c) => c.pm_id === pmFilter)),
    [certifications, pmFilter],
  );

  const selectedPm = pms.find((p) => p.id === selectedCert?.pm_id);

  // Stock disponibile (esclude i device già scelti in altri slot)
  const stock = useMemo(
    () =>
      hardwares.filter(
        (h) => h.status === "In Stock" && !slots.some((s) => s.hardwareId === h.id),
      ),
    [hardwares, slots],
  );
  const allTypes = useMemo(
    () => Array.from(new Set(hardwares.map((h) => h.hardware_type).filter(Boolean) as string[])),
    [hardwares],
  );

  const updateSlot = (idx: number, patch: Partial<AssignmentSlot>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const totalRequested = productSummary.reduce((s, r) => s + r.requested, 0);
  const totalOnSite = productSummary.reduce((s, r) => s + r.onSite, 0);
  const totalRemaining = productSummary.reduce((s, r) => s + r.remaining, 0);

  const summarize = (): string => {
    if (modeAllocations.length === 0) return "No requests yet for this project.";
    const who = mode === "AIR" ? selectedPm?.full_name ?? "the PM" : "Monitoring Team";
    const parts = productSummary.map((r) => `${r.requested}× ${r.productName}`);
    return `${who} requested ${parts.join(", ")}.`;
  };

  const handleSubmit = async () => {
    if (!certificationId) {
      toast({ title: "Pick a project first", variant: "destructive" });
      return;
    }
    const filledSlots = slots.filter((s) => s.hardwareId);
    if (filledSlots.length === 0) {
      toast({ title: "Pick at least one device from stock", variant: "destructive" });
      return;
    }
    if (!selectedSiteId) {
      toast({ title: "Project has no site linked", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1. Aggiorno gli hardware fisici: site_id + status=Assigned (+ network per i bridge in Energy)
      for (const slot of filledSlots) {
        const update: Record<string, unknown> = {
          site_id: selectedSiteId,
          status: "Assigned",
        };
        if (mode === "ENERGY" && bridgeOpen) {
          const isBridge = /bridge/i.test(slot.productName);
          if (isBridge) Object.assign(update, bridgeCfg);
        }
        const { error: hwErr } = await supabase
          .from("hardwares")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(update as any)
          .eq("id", slot.hardwareId!);
        if (hwErr) throw hwErr;
      }

      // 2. Aggiorno SOLO lo status delle allocation (NON la quantity = quella resta "richiesta").
      //    Calcolo il nuovo physical count per ciascun product_id e aggiorno status.
      for (const r of productSummary) {
        const justAssignedForProduct = filledSlots.filter((s) => s.productId === r.productId).length;
        const newOnSite = r.onSite + justAssignedForProduct;
        const alloc = modeAllocations.find((a) => a.product_id === r.productId);
        if (!alloc) continue;
        let newStatus: string = alloc.status;
        if (newOnSite >= r.requested && r.requested > 0) newStatus = "Allocated";
        else if (newOnSite > 0) newStatus = "Partially Allocated";
        await supabase
          .from("project_allocations")
          .update({ status: newStatus })
          .eq("id", alloc.id);
      }

      // 3. Energy: ricalcolo i contatori del site_energy_records dai device REALI sul sito
      if (mode === "ENERGY") {
        // Refresh degli hardware sul sito (inclusi quelli appena aggiornati)
        const { data: refreshed } = await supabase
          .from("hardwares")
          .select("id, hardware_type, product_id, status")
          .eq("site_id", selectedSiteId)
          .neq("status", "In Stock");
        const list = (refreshed ?? []) as Array<{ hardware_type: string | null }>;
        let no_pan10 = 0, no_pan12 = 0, no_pan14 = 0, total_bridges = 0;
        for (const h of list) {
          const t = (h.hardware_type ?? "").toUpperCase();
          if (t.includes("PAN-10") || t.includes("FGB10")) no_pan10++;
          else if (t.includes("PAN-12") || t.includes("FGB12")) no_pan12++;
          else if (t.includes("PAN-14") || t.includes("FGB14")) no_pan14++;
          if (t.includes("BRIDGE")) total_bridges++;
        }
        const total_sensors = no_pan10 + no_pan12 + no_pan14;
        const payload: Record<string, unknown> = {
          certification_id: certificationId,
          total_sensors,
          no_pan10,
          no_pan12,
          no_pan14,
          total_bridges,
          ...(bridgeOpen ? bridgeCfg : {}),
        };
        await supabase
          .from("site_energy_records" as never)
          .upsert(payload as never, { onConflict: "certification_id" });
      }

      qc.invalidateQueries({ queryKey: ["project-allocations", certificationId] });
      qc.invalidateQueries({ queryKey: ["hardwares-on-site", selectedSiteId] });
      qc.invalidateQueries({ queryKey: ["site-energy-records"] });
      toast({
        title: "Devices assigned",
        description: `${filledSlots.length} physical device(s) linked to site.`,
      });
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

          {/* Riepilogo per prodotto: Requested / On site / To assign */}
          {certificationId && productSummary.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <span>Product</span>
                <span className="text-right">Requested</span>
                <span className="text-right">On site</span>
                <span className="text-right">To assign</span>
              </div>
              {productSummary.map((r) => (
                <div
                  key={r.productId}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs border-t border-border items-center"
                >
                  <span className="font-medium">{r.productName}</span>
                  <span className="text-right tabular-nums">{r.requested}</span>
                  <span className="text-right tabular-nums">
                    <Badge variant={r.onSite > 0 ? "default" : "outline"} className="text-[10px]">
                      {r.onSite}
                    </Badge>
                  </span>
                  <span className="text-right tabular-nums">
                    <Badge
                      variant={r.remaining > 0 ? "destructive" : "outline"}
                      className="text-[10px]"
                    >
                      {r.remaining}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Stato globale */}
          {certificationId && totalRequested > 0 && totalRemaining === 0 && (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-xs text-foreground">
                All {totalRequested} requested {mode.toLowerCase()} devices are physically on site.
              </p>
            </div>
          )}

          {certificationId && totalOnSite > 0 && totalRemaining > 0 && (
            <p className="text-xs text-muted-foreground italic">
              {totalOnSite} of {totalRequested} already installed. {totalRemaining} left to assign.
            </p>
          )}

          {/* Devices già fisicamente sul sito (read-only) */}
          {onSiteHardwares.length > 0 && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium select-none">
                Devices already on site ({onSiteHardwares.length})
              </summary>
              <div className="divide-y divide-border">
                {onSiteHardwares.map((h) => (
                  <div key={h.id} className="px-3 py-2 text-[11px] grid grid-cols-3 gap-2">
                    <span className="font-mono">{h.device_id}</span>
                    <span className="font-mono text-muted-foreground">{h.mac_address ?? "—"}</span>
                    <span className="text-muted-foreground">{h.hardware_type ?? ""}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Slot da assegnare */}
          {slots.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                Pick physical devices from stock
              </p>
              {slots.map((slot, idx) => {
                const candidates = stock.filter(
                  (h) =>
                    slot.selectedTypeFilter === "any" || h.hardware_type === slot.selectedTypeFilter,
                );
                return (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div className="grid gap-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Slot {idx + 1} · for: <Badge variant="outline" className="ml-1">{slot.productName}</Badge>
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
                      <SelectTrigger><SelectValue placeholder="Pick device (serial · MAC)" /></SelectTrigger>
                      <SelectContent>
                        {candidates.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No stock available</div>
                        )}
                        {candidates.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.device_id}
                            {h.mac_address ? ` · ${h.mac_address}` : ""}
                            {h.hardware_type ? ` (${h.hardware_type})` : ""}
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
            </div>
          )}

          {mode === "ENERGY" && slots.length > 0 && (
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

        <Button
          onClick={handleSubmit}
          disabled={saving || slots.length === 0 || !slots.some((s) => s.hardwareId)}
          className="w-full"
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Assign Devices to Site
        </Button>
      </DialogContent>
    </Dialog>
  );
}
