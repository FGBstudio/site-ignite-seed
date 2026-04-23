import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { 
  Truck, 
  Warehouse,
  MapPin,
  Calendar,
  Box,
  Layers,
  DollarSign,
  PackageCheck,
  Combine,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  User,
  Activity
} from "lucide-react";
import type { Product, SupplierOrder } from "@/types/custom-tables";

export default function SupplierOrders() {
  const { user, isAdmin } = useAuth();
  const [inboundOrders, setInboundOrders] = useState<SupplierOrder[]>([]);
  const [outboundHardwares, setOutboundHardwares] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inbound");
  const [outboundSubTab, setOutboundSubTab] = useState("awaiting");
  
  // Accordion state
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  
  // Modal State
  const [selectedHardware, setSelectedHardware] = useState<any | null>(null);
  const [applyToProjectBundle, setApplyToProjectBundle] = useState(false);
  const [includeOtherCategories, setIncludeOtherCategories] = useState(false);
  const [shippingCost, setShippingCost] = useState("");
  const [shipDate, setShipDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shippedBy, setShippedBy] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [ordRes, prodRes, hwRes, siteRes] = await Promise.all([
      supabase.from("supplier_orders" as any).select("*").order("expected_delivery_date"),
      supabase.from("products" as any).select("*"),
      supabase.from("hardwares" as any).select("*").neq("status", "In Stock").order("created_at", { ascending: false }),
      supabase.from("sites" as any).select("*")
    ]);

    setInboundOrders((ordRes.data || []) as any);
    setProducts((prodRes.data || []) as any);
    
    const mappedHw = (hwRes.data || []).map((h: any) => {
      let f_status = h.fulfillment_status;
      if (!f_status) {
        if (h.shipment_date) f_status = "Delivered";
        else f_status = "Allocated";
      }
      return { ...h, fulfillment_status: f_status };
    });

    setOutboundHardwares(mappedHw);
    setSites(siteRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpdateHardware = async () => {
    if (!selectedHardware) return;

    // 1. AUTOMATICALLY find all units in this project category
    // This ensures that updating 1 unit updates the whole "Crate"
    const targetBundle = currentList.filter(h => 
      h.site_id === selectedHardware.site_id && 
      h.category === selectedHardware.category
    );
    
    const targetIds = targetBundle.map(h => h.id);

    // 2. Calculate Proportional Cost
    const totalUnits = targetIds.length;
    const totalCostValue = parseFloat(shippingCost) || 0;
    const proportionalCost = totalCostValue / totalUnits;
    const shipmentGroupId = selectedHardware.shipment_group_id || `SHIP-${Date.now()}-${selectedHardware.id.substring(0,4)}`;

    // 3. Perform the Global Update
    const payload: any = {
      ["fulfillment_status"]: selectedHardware.fulfillment_status,
      ["shipment_mode"]: selectedHardware.shipment_mode,
      ["carrier_name"]: selectedHardware.carrier_name,
      ["tracking_number"]: selectedHardware.tracking_number,
      ["delivery_person"]: selectedHardware.delivery_person,
      ["shipping_cost"]: proportionalCost,
      ["shipment_group_id"]: shipmentGroupId,
      ["shipment_date"]: new Date(shipDate).toISOString(),
      ["shipped_by"]: shippedBy || user?.email || "System"
    };

    const { error } = await (supabase as any)
      .from("hardwares")
      .update(payload)
      .in('id', targetIds);

    if (error) {
      console.error("Logistics Update Error:", error);
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "Project Bundle Updated", 
        description: `Successfully updated ${totalUnits} units for this site.` 
      });
      setSelectedHardware(null);
      resetModalState();
      fetchData();
    }
  };

  const resetModalState = () => {
    setApplyToProjectBundle(false);
    setIncludeOtherCategories(false);
    setShippingCost("");
    setShipDate(format(new Date(), "yyyy-MM-dd"));
    setShippedBy("");
  };

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const awaitingDispatch = outboundHardwares.filter(h => h.fulfillment_status === "Allocated");
  const fulfilledDispatch = outboundHardwares.filter(h => h.fulfillment_status === "In_Transit" || h.fulfillment_status === "Delivered");

  const currentList = outboundSubTab === "awaiting" ? awaitingDispatch : fulfilledDispatch;

  const groupedByProject = sites.map(site => {
    const siteHw = currentList.filter(h => h.site_id === site.id);
    if (siteHw.length === 0) return null;
    
    const categories = Array.from(new Set(siteHw.map(h => h.category)));
    return { ...site, hardwares: siteHw, categories };
  }).filter(Boolean) as any[];

  return (
    <MainLayout title="Logistics Control" subtitle="Project-led supply chain management and multi-portfolio fulfillment">
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100/50 p-1 mb-6 border border-slate-200">
            <TabsTrigger value="inbound" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white">
              <Warehouse className="h-4 w-4" />
              <span>Inbound Procurement</span>
            </TabsTrigger>
            <TabsTrigger value="outbound" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white">
              <Truck className="h-4 w-4" />
              <span>Outbound Logistics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbound" className="mt-0">
            <div className="premium-card glass p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold tracking-tight text-[#009193]">Supplier Procurement</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b"><th className="text-left p-4">Supplier</th><th className="text-left p-4">Product</th><th className="text-left p-4">Qty</th><th className="text-left p-4">Status</th></tr></thead>
                  <tbody>{inboundOrders.map(o => <tr key={o.id} className="border-b"><td className="p-4 font-bold">{o.supplier_name}</td><td className="p-4">{products.find(p=>p.id===o.product_id)?.name}</td><td className="p-4">{o.quantity_requested}</td><td className="p-4"><Badge variant="outline">{o.status}</Badge></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="outbound" className="mt-0 space-y-4">
            <Tabs value={outboundSubTab} onValueChange={setOutboundSubTab} className="w-fit">
              <TabsList className="bg-slate-100 p-1 h-9">
                <TabsTrigger value="awaiting" className="text-xs px-4 data-[state=active]:bg-white">Awaiting Dispatch ({awaitingDispatch.length})</TabsTrigger>
                <TabsTrigger value="shipped" className="text-xs px-4 data-[state=active]:bg-white">Fulfilled ({fulfilledDispatch.length})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-3">
              {groupedByProject.map((project) => (
                <div key={project.id} className="premium-card glass overflow-hidden border border-slate-100 shadow-sm transition-all duration-300">
                  {/* Level 1: Project Header */}
                  <div 
                    onClick={() => toggleProject(project.id)}
                    className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-[#009193]/10 flex items-center justify-center text-[#009193]">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 tracking-tight">{project.name}</h4>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{project.hardwares.length} Hardware Units Total</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {project.categories.map((cat: string) => (
                        <Badge key={cat} className="bg-[#009193]/5 text-[#009193] border-[#009193]/20 text-[9px] uppercase">
                          {cat}: {project.hardwares.filter((h: any) => h.category === cat).length}
                        </Badge>
                      ))}
                      {expandedProjects.includes(project.id) ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                    </div>
                  </div>

                  {/* Level 2: Categories (Expanded) */}
                  {expandedProjects.includes(project.id) && (
                    <div className="border-t border-slate-50 bg-slate-50/20 p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                      {project.categories.map((cat: string) => (
                        <div key={cat} className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
                          <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#009193] flex items-center gap-2">
                              <Layers className="h-3 w-3" /> {cat} Portfolio
                            </span>
                          </div>
                          
                          {/* Level 3: Device IDs Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-slate-50/30">
                                  <th className="text-left p-3 text-[9px] uppercase font-bold text-slate-400">Device ID / SN</th>
                                  <th className="text-left p-3 text-[9px] uppercase font-bold text-slate-400">Type</th>
                                  <th className="text-left p-3 text-[9px] uppercase font-bold text-slate-400">Logistics Detail</th>
                                  <th className="text-right p-3 text-[9px] uppercase font-bold text-slate-400">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.hardwares.filter((h: any) => h.category === cat).map((hw: any) => (
                                  <tr 
                                    key={hw.id} 
                                    onClick={() => {
                                      setSelectedHardware(hw);
                                      if (hw.shipment_date) setShipDate(format(new Date(hw.shipment_date), "yyyy-MM-dd"));
                                      if (hw.shipped_by) setShippedBy(hw.shipped_by);
                                      else setShippedBy(user?.email || "");
                                    }}
                                    className="border-b last:border-b-0 hover:bg-[#009193]/5 transition-colors cursor-pointer group"
                                  >
                                    <td className="p-3">
                                      <span className="font-mono text-[11px] font-bold text-[#009193]">{hw.device_id}</span>
                                    </td>
                                    <td className="p-3 text-[11px] font-medium text-slate-600">{hw.hardware_type}</td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-2">
                                        {hw.shipment_mode === 'Courier' ? <Truck className="h-3 w-3 text-blue-500" /> : hw.shipment_mode === 'In-Person' ? <User className="h-3 w-3 text-indigo-500" /> : <Activity className="h-3 w-3 text-slate-300" />}
                                        <span className="text-[10px] text-muted-foreground italic">
                                          {hw.carrier_name || hw.delivery_person || "Unassigned"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-right">
                                      <Badge className={cn(
                                        "text-[9px] font-bold uppercase border-none",
                                        hw.fulfillment_status === 'Allocated' ? "bg-blue-50 text-blue-600" :
                                        hw.fulfillment_status === 'In_Transit' ? "bg-amber-50 text-amber-600" :
                                        "bg-green-50 text-green-600"
                                      )}>
                                        {hw.fulfillment_status}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Fulfillment Modal remains same but with improved detail view */}
      <Dialog open={!!selectedHardware} onOpenChange={() => { setSelectedHardware(null); resetModalState(); }}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white border-none shadow-2xl">
          <DialogHeader className="p-6 pb-4 bg-[#009193]/5 border-b border-[#009193]/10">
            <DialogTitle className="flex items-center gap-3 text-xl font-bold text-[#009193]">
              <div className="h-10 w-10 rounded-xl bg-[#009193] flex items-center justify-center text-white"><Box className="h-6 w-6" /></div>
              <div className="flex flex-col">
                <span className="text-sm font-mono opacity-70">SN: {selectedHardware?.device_id}</span>
                <span className="text-lg">Logistics Master</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {/* Consolidation alerts integrated into the project-wise logic */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase text-muted-foreground">Shipment Mode</Label>
                <Select value={selectedHardware?.shipment_mode || ""} onValueChange={(val) => setSelectedHardware({...selectedHardware, shipment_mode: val})}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Courier">Courier (DHL/FedEx)</SelectItem><SelectItem value="In-Person">In-Person Handover</SelectItem></SelectContent>
                </Select>
              </div>
              {selectedHardware?.shipment_mode === 'Courier' && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase text-[#009193]">Total Box Cost</Label>
                  <div className="relative"><DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#009193]" /><Input type="number" className="h-9 text-xs pl-7" value={shippingCost} onChange={(e)=>setShippingCost(e.target.value)} /></div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase text-muted-foreground">Date</Label>
                <Input type="date" className="h-9 text-xs" value={shipDate} onChange={(e)=>setShipDate(e.target.value)} />
              </div>
              {selectedHardware?.shipment_mode === 'Courier' && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase text-muted-foreground">Shipped By</Label>
                  <Input className="h-9 text-xs" placeholder="Name" value={shippedBy} onChange={(e)=>setShippedBy(e.target.value)} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase text-muted-foreground">{selectedHardware?.shipment_mode === 'In-Person' ? 'Deliverer' : 'Carrier'}</Label>
                <Input className="h-9 text-xs" value={selectedHardware?.shipment_mode === 'In-Person' ? (selectedHardware?.delivery_person || "") : (selectedHardware?.carrier_name || "")} onChange={(e) => { if (selectedHardware?.shipment_mode === 'In-Person') setSelectedHardware({...selectedHardware, delivery_person: e.target.value}); else setSelectedHardware({...selectedHardware, carrier_name: e.target.value}); }} />
              </div>
              {selectedHardware?.shipment_mode === 'Courier' && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase text-muted-foreground">Tracking ID</Label>
                  <Input className="h-9 text-xs font-mono" value={selectedHardware?.tracking_number || ""} onChange={(e)=>setSelectedHardware({...selectedHardware, tracking_number: e.target.value})} />
                </div>
              )}
            </div>

            <div className="pt-2">
              <Label className="text-[11px] font-bold uppercase text-muted-foreground">New Status</Label>
              <Select value={selectedHardware?.fulfillment_status} onValueChange={(val) => setSelectedHardware({...selectedHardware, fulfillment_status: val})}>
                <SelectTrigger className="h-9 text-xs mt-1 bg-[#009193]/5 border-[#009193]/20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Allocated">Allocated</SelectItem><SelectItem value="In_Transit">In Transit</SelectItem><SelectItem value="Delivered">Delivered</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="pt-2 flex gap-3">
              <Button onClick={() => setSelectedHardware(null)} variant="outline" className="flex-1 h-10 text-xs font-bold uppercase">Cancel</Button>
              <Button onClick={handleUpdateHardware} className="flex-1 h-10 bg-[#009193] hover:bg-[#009193]/90 text-white text-xs font-bold uppercase gap-2"><PackageCheck className="h-4 w-4" />Save Update</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
