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
  country?: string | null;
  category?: string | null;
}

interface Allocation {
  id: string;
  product_id: string;
  quantity: number;
  requested_quantity: number | null;
  status: string;
  category: string | null;
  source: string | null;
  products?: { id: string; name: string; sku: string | null; category: string | null } | null;
}

interface Certification {
  id: string;
  pm_id: string | null;
  site_id: string | null;
  sites?: { name: string | null; country: string | null; region: string | null } | null;
}

interface AssignmentSlot {
  requestedProductId: string;
  productId: string;
  productName: string;
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
  const [stockCountry, setStockCountry] = useState<string>("all");

  const { data: pms = [] } = useProjectManagers();

  // Reset state when dialog is closed to prevent stale data on reopen
  useEffect(() => {
    if (!open) {
      setCertificationId("");
      setSlots([]);
      setStockCountry("all");
      setPmFilter("all");
      setMode("AIR");
    }
  }, [open]);

  const { data: certifications = [] } = useQuery({
    queryKey: ["certs-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, pm_id, site_id, sites(name, country, region)")
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
        .select("*, products(id, name, sku, category)")
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
        .select("id, device_id, mac_address, hardware_type, product_id, status, site_id, category")
        .eq("site_id", selectedSiteId!)
        .neq("status", "In Stock");
      if (error) throw error;
      return (data ?? []) as unknown as Hardware[];
    },
  });

  // Fetch all products for overrides
  const { data: allProducts = [] } = useQuery({
    queryKey: ["all-products-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const modeProducts = useMemo(
    () => allProducts.filter(p => {
      const name = p.name?.toUpperCase() || "";
      const isAirProduct = name.includes("CLAIR") || name.includes("WELL") || name.includes("LEED") || name.includes("CO2");
      const productCategory = isAirProduct ? "AIR" : (p.category?.toUpperCase() || "AIR");
      return productCategory === mode;
    }),
    [allProducts, mode]
  );

  const modeAllocations = useMemo(
    () => allocations.filter((a) => {
      // Hard override: If the product name indicates it's an Air monitor, force it to AIR mode.
      const name = a.products?.name?.toUpperCase() || "";
      const isAirProduct = name.includes("CLAIR") || name.includes("WELL") || name.includes("LEED") || name.includes("CO2");

      const productCategory = isAirProduct ? "AIR" : (a.category?.toUpperCase() || a.products?.category?.toUpperCase() || "AIR");
      return productCategory === mode;
    }),
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

  const totalRequested = productSummary.reduce((s, r) => s + r.requested, 0);
  const totalOnSite = productSummary.reduce((s, r) => s + r.onSite, 0);
  const totalRemaining = productSummary.reduce((s, r) => s + r.remaining, 0);

  // Slot: uno per pezzo da assegnare ancora
  useEffect(() => {
    setSlots(prev => {
      // If we already have slots and the project hasn't changed, don't reset them
      if (prev.length > 0 && prev.length === totalRemaining) {
        return prev;
      }

      const next: AssignmentSlot[] = [];
      for (const r of productSummary) {
        for (let i = 0; i < r.remaining; i++) {
          next.push({
            requestedProductId: r.productId,
            productId: r.productId,
            productName: r.productName,
            hardwareId: null,
          });
        }
      }
      return next;
    });
  }, [productSummary, totalRemaining]);

  const filteredCerts = useMemo(
    () => (pmFilter === "all" ? certifications : certifications.filter((c) => c.pm_id === pmFilter)),
    [certifications, pmFilter],
  );

  const selectedPm = pms.find((p) => p.id === selectedCert?.pm_id);

  // Stock disponibile (fonte grezza filtrata solo per status)
  const allStock = useMemo(
    () => hardwares.filter((h) => h.status === "In Stock"),
    [hardwares],
  );

  const updateSlot = (idx: number, patch: Partial<AssignmentSlot>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

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
      console.log("Logistics Trigger: Starting. Site ID:", selectedSiteId, "Name:", selectedCert?.sites?.name);
      toast({ title: "Logistics Sync Started", description: "Creating automated shipment record..." });

      // 1. Automated Logistics Trigger: Create Outbound Shipment (Do this first!)
      let newShipmentId: string | null = null;
      try {
        // Try matching by name (Case-Insensitive) OR by ID (if they share UUIDs)
        const { data: locations, error: locErr } = await (supabase as any)
          .from("ops_locations")
          .select("id")
          .or(`name.ilike."${selectedCert?.sites?.name || "___NOT_FOUND___"}",id.eq."${selectedSiteId || "00000000-0000-0000-0000-000000000000"}"`)
          .limit(1);
        
        if (locErr) console.error("Logistics Trigger: Location search error:", locErr);
        
        const destinationId = locations?.[0]?.id;
        const shipmentPayload = {
          shipment_type: "outbound",
          status: "awaiting dispatch",
          destination_location_id: destinationId || null,
          notes: `Automated shipment triggered by hardware assignment to site: ${selectedCert?.sites?.name || "Unknown"}`
        };

        const { data: shipData, error: shipErr } = await (supabase as any)
          .from("ops_shipments")
          .insert([shipmentPayload])
          .select();

        if (shipErr) {
          console.error("Logistics Trigger: Shipment creation failed:", shipErr);
          toast({ title: "Logistics Error", description: `Shipment failed: ${shipErr.message}`, variant: "destructive" });
        } else if (shipData && shipData[0]) {
          newShipmentId = shipData[0].id;
          console.log("Logistics Trigger: Shipment created:", newShipmentId);
        }
      } catch (logisticsErr) {
        console.error("Logistics trigger inner error:", logisticsErr);
      }

      // 2. Update physical hardware
      for (const slot of filledSlots) {
        const update: Record<string, unknown> = {
          site_id: selectedSiteId,
          status: "Assigned",
          product_id: slot.productId,
        };
        if (mode === "ENERGY" && bridgeOpen) {
          const isBridge = /bridge/i.test(slot.productName);
          if (isBridge) Object.assign(update, bridgeCfg);
        }
        const { error: hwErr } = await supabase
          .from("hardwares")
          .update(update as any)
          .eq("id", slot.hardwareId!);
        if (hwErr) throw hwErr;

        // Link to shipment if created
        if (newShipmentId) {
          await (supabase as any).from("ops_hardware_movements").insert({
            hardware_id: slot.hardwareId,
            shipment_id: newShipmentId,
            action: "dispatched"
          });
        }
      }

      // 3. Update allocations
      for (const r of productSummary) {
        const justAssignedForThisRequest = filledSlots.filter((s) => s.requestedProductId === r.productId).length;
        const newOnSite = r.onSite + justAssignedForThisRequest;
        const alloc = modeAllocations.find((a) => a.product_id === r.productId);
        if (!alloc) continue;
        let newStatus: string = alloc.status;
        if (newOnSite >= r.requested && r.requested > 0) newStatus = "Confirmed";
        else if (newOnSite > 0) newStatus = "Partially Confirmed";
        await supabase
          .from("project_allocations")
          .update({ status: newStatus })
          .eq("id", alloc.id);
      }

      // 4. Energy metrics
      if (mode === "ENERGY") {
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
      qc.invalidateQueries({ queryKey: ["ops_shipments"] }); // Refresh logistics too


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
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Filter by PM</Label>
              <Select value={pmFilter} onValueChange={setPmFilter}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-400">Project</Label>
              <Select value={certificationId} onValueChange={setCertificationId}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCerts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{c.sites?.name || "Unnamed Site"}</span>
                        {c.sites?.country && <span className="text-[10px] opacity-60 italic">{c.sites.country} {c.sites.region ? `(${c.sites.region})` : ""}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedCert && (
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 rounded-xl border border-slate-200/50 mb-1">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-bold text-slate-400 leading-tight">Project Location</span>
                <span className="text-xs font-semibold text-slate-700">
                  {selectedCert.sites?.country || "—"} {selectedCert.sites?.region ? `· ${selectedCert.sites.region}` : ""}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="flex flex-col flex-1">
                <span className="text-[9px] uppercase font-bold text-slate-400 leading-tight">Filter Stock by Country</span>
                <Select value={stockCountry} onValueChange={setStockCountry}>
                  <SelectTrigger className="h-6 border-none bg-transparent p-0 text-xs font-bold text-[#009193] focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Global Inventory</SelectItem>
                    {[...new Set(hardwares.filter(h => h.status === 'In Stock').map(h => h.country).filter(Boolean))].sort().map(country => (
                      <SelectItem key={country} value={country!}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {certificationId && (
            <div className="rounded-xl border border-[#009193]/20 bg-[#009193]/5 p-3 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-[#009193] mt-0.5 shrink-0" />
              <p className="text-xs text-[#009193]/90 font-medium leading-relaxed">{summarize()}</p>
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
                const candidates = allStock.filter(
                  (h) => {
                    const matchesProduct = h.product_id === slot.productId;
                    const matchesCategory = (h.category?.toUpperCase() || "AIR") === mode;
                    const matchesCountry = stockCountry === "all" || h.country === stockCountry;
                    const notTaken = h.id === slot.hardwareId || !slots.some(s => s.hardwareId === h.id);

                    return matchesProduct && matchesCategory && matchesCountry && notTaken;
                  }
                );
                return (
                  <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-end border-b border-slate-100 pb-3 last:border-0">
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-slate-500">
                          Slot {idx + 1}
                        </Label>
                        {slot.productId !== slot.requestedProductId && (
                          <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-600 bg-amber-50">
                            Override: PM asked for {modeAllocations.find(a => a.product_id === slot.requestedProductId)?.products?.name || "Original"}
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Select
                            value={slot.productId}
                            onValueChange={(v) => {
                              const p = modeProducts.find(mp => mp.id === v);
                              updateSlot(idx, {
                                productId: v,
                                productName: p?.name || slot.productName,
                                hardwareId: null
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs font-semibold bg-slate-50 border-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {modeProducts.map(p => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-[2]">
                          <Select
                            value={slot.hardwareId ?? ""}
                            onValueChange={(v) => updateSlot(idx, { hardwareId: v })}
                          >
                            <SelectTrigger className="h-9 border-slate-200">
                              <SelectValue placeholder="Pick physical device (serial · MAC)" />
                            </SelectTrigger>
                            <SelectContent>
                              {candidates.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching {slot.productName} in stock</div>
                              )}
                              {candidates.map((h) => (
                                <SelectItem key={h.id} value={h.id}>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-[#009193]">{h.device_id}</span>
                                      <Badge variant="outline" className="text-[9px] opacity-70 py-0 px-1 border-slate-200">
                                        {h.hardware_type || "No Model"}
                                      </Badge>
                                    </div>
                                    {h.mac_address && <span className="text-[10px] text-muted-foreground opacity-70">MAC: {h.mac_address}</span>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 mb-[2px] text-slate-400 hover:text-destructive"
                      onClick={() => updateSlot(idx, { hardwareId: null })}
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
