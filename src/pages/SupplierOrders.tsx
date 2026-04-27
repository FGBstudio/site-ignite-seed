import { useEffect, useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { 
  Truck, 
  Warehouse,
  MapPin,
  Box,
  Layers,
  ChevronRight,
  ChevronDown,
  User,
  Search,
  Plus,
  Globe,
  FileText,
  Filter,
  Loader2,
  PackageCheck,
  ArrowRightLeft,
  Banknote,
  Calendar,
  CreditCard,
  Clock,
  Edit3,
  History,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  X
} from "lucide-react";

const CURRENCIES = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'CNY', symbol: '¥' }
];

const SHIPMENT_STATUSES = ["in_transit", "customs", "delivered", "cancelled"];

export default function SupplierOrders() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [hardwares, setHardwares] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const activeTab = searchParams.get("tab") || "inbound";
  const outboundSubTab = searchParams.get("sub") || "awaiting";
  const portfolioFilter = (searchParams.get("portfolio") || "ALL").toUpperCase();
  const selectedId = searchParams.get("id");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [hwSearchQuery, setHwSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  
  // Modals
  const [selectedHardware, setSelectedHardware] = useState<any | null>(null);
  const [hardwareMovements, setHardwareMovements] = useState<any[]>([]);
  const [showPoModal, setShowPoModal] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showAssignHwModal, setShowAssignHwModal] = useState(false);
  
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedHwIds, setSelectedHwIds] = useState<string[]>([]);
  const [showAllHardware, setShowAllHardware] = useState(false);

  // Form States
  const initialPoForm = {
    po_number: "",
    supplier: "",
    category: "ENERGY",
    po_cost: "0",
    currency: "EUR",
    po_issued_date: format(new Date(), "yyyy-MM-dd"),
    payment_status: "Unpaid",
    payment_date: "",
    notes: ""
  };

  const initialShipmentForm = {
    purchase_order_id: "",
    shipment_type: "inbound",
    origin_location_id: "",
    destination_location_id: "",
    carrier_name: "",
    tracking_number: "",
    total_shipping_cost: "0",
    customs_cost: "0",
    currency: "EUR",
    status: "in_transit",
    notes: ""
  };

  const [poForm, setPoForm] = useState(initialPoForm);
  const [shipmentForm, setShipmentForm] = useState(initialShipmentForm);

  // HANDLERS
  const handleCloseModal = useCallback(() => { 
    setSelectedHardware(null); 
    setHardwareMovements([]);
    setSearchParams(prev => { prev.delete("id"); return prev; }); 
  }, [setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, shipRes, locRes, hwRes, siteRes] = await Promise.all([
        (supabase as any).from("ops_purchase_orders").select("*").order("created_at", { ascending: false }),
        (supabase as any).from("ops_shipments").select("*, origin:ops_locations!origin_location_id(name), destination:ops_locations!destination_location_id(name)").order("created_at", { ascending: false }),
        (supabase as any).from("ops_locations").select("*").order("name"),
        supabase.from("hardwares").select("*, purchase_order:ops_purchase_orders(*)").order("created_at", { ascending: false }),
        supabase.from("sites").select("*")
      ]);

      setPurchaseOrders(poRes.data || []);
      setShipments(shipRes.data || []);
      setLocations(locRes.data || []);
      setHardwares((hwRes.data || []).map((h: any) => ({
        ...h,
        fulfillment_status: h.fulfillment_status || (h.shipment_date ? "Delivered" : (h.status === 'In Stock' ? "Ready" : "Allocated"))
      })));
      setSites(siteRes.data || []);

      if (selectedId) {
        const foundHw = (hwRes.data || []).find((h:any) => h.id === selectedId);
        if (foundHw) {
          setSelectedHardware(foundHw);
          const { data: movements } = await (supabase as any)
            .from("ops_hardware_movements")
            .select("*, shipment:ops_shipments(*, origin:ops_locations!origin_location_id(name), destination:ops_locations!destination_location_id(name))")
            .eq("hardware_id", selectedId)
            .order("created_at", { ascending: false });
          setHardwareMovements(movements || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setParam = (key: string, val: string) => { setSearchParams(prev => { prev.set(key, val); return prev; }); };
  
  const handleEditPo = (po: any) => {
    setEditingPoId(po.id);
    setPoForm({
      po_number: po.po_number || "",
      supplier: po.supplier || "",
      category: po.category || "ENERGY",
      po_cost: String(po.po_cost || 0),
      currency: po.currency || "EUR",
      po_issued_date: po.po_issued_date || format(new Date(), "yyyy-MM-dd"),
      payment_status: po.payment_status || "Unpaid",
      payment_date: po.payment_date || "",
      notes: po.notes || ""
    });
    setShowPoModal(true);
  };

  const handleEditShipment = async (ship: any) => {
    setEditingShipmentId(ship.id);
    setShowAllHardware(false);
    setShipmentForm({
      purchase_order_id: ship.purchase_order_id || "",
      shipment_type: ship.shipment_type || "inbound",
      origin_location_id: ship.origin_location_id || "",
      destination_location_id: ship.destination_location_id || "",
      carrier_name: ship.carrier_name || "",
      tracking_number: ship.tracking_number || "",
      total_shipping_cost: String(ship.total_shipping_cost || 0),
      customs_cost: String(ship.customs_cost || 0),
      currency: ship.currency || "EUR",
      status: ship.status || "in_transit",
      notes: ship.notes || ""
    });
    
    // Fetch associated hardwares for this shipment
    const { data: movements } = await (supabase as any)
      .from("ops_hardware_movements")
      .select("hardware_id")
      .eq("shipment_id", ship.id);
    
    setSelectedHwIds(movements?.map((m: any) => m.hardware_id) || []);
    setShowShipmentModal(true);
  };

  const handleSavePo = async () => {
    if (!poForm.po_number) return toast({ title: "PO Number Required", variant: "destructive" });
    setIsSaving(true);
    try {
      const payload = {
        ...poForm,
        po_cost: parseFloat(poForm.po_cost) || 0,
        payment_date: poForm.payment_date || null
      };

      if (editingPoId) {
        await (supabase as any).from("ops_purchase_orders").update(payload).eq("id", editingPoId);
      } else {
        await (supabase as any).from("ops_purchase_orders").insert([payload]);
      }
      
      toast({ title: "Success", description: "Purchase order saved." });
      setShowPoModal(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveShipment = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...shipmentForm,
        total_shipping_cost: parseFloat(shipmentForm.total_shipping_cost) || 0,
        customs_cost: parseFloat(shipmentForm.customs_cost) || 0,
        purchase_order_id: shipmentForm.purchase_order_id || null
      };

      let shipId = editingShipmentId;
      if (editingShipmentId) {
        await (supabase as any).from("ops_shipments").update(payload).eq("id", editingShipmentId);
      } else {
        const { data } = await (supabase as any).from("ops_shipments").insert([payload]).select();
        shipId = data?.[0].id;
      }

      if (shipId && selectedHwIds.length > 0) {
        const movements = selectedHwIds.map(hid => ({
          hardware_id: hid,
          shipment_id: shipId,
          action: payload.status === 'delivered' ? 'received' : 'dispatched'
        }));
        await (supabase as any).from("ops_hardware_movements").insert(movements);
      }
      
      toast({ title: "Success", description: `Shipment updated with ${selectedHwIds.length} devices.` });
      setShowShipmentModal(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchAssignPo = async () => {
    if (!editingPoId || selectedHwIds.length === 0) return;
    setIsSaving(true);
    try {
      await (supabase as any)
        .from("hardwares")
        .update({ purchase_order_id: editingPoId })
        .in("id", selectedHwIds);
      
      toast({ title: "Success", description: `Linked ${selectedHwIds.length} units to PO.` });
      setShowAssignHwModal(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Link Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // MEMOS
  const internalOffices = useMemo(() => {
    // Look for both tags just in case
    return locations.filter(l => l.type === 'internal_office' || l.type === 'office');
  }, [locations]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchesPortfolio = portfolioFilter === "ALL" || po.category?.toUpperCase() === portfolioFilter;
      const matchesSearch = !searchQuery || po.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) || po.supplier?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPortfolio && matchesSearch;
    });
  }, [purchaseOrders, portfolioFilter, searchQuery]);

  const internalShipments = useMemo(() => {
    return shipments.filter(s => s.shipment_type !== 'inbound' || !s.purchase_order_id);
  }, [shipments]);

  const selectableHardware = useMemo(() => {
    return hardwares.filter(h => {
      const matchesSearch = !hwSearchQuery || h.device_id?.toLowerCase().includes(hwSearchQuery.toLowerCase());
      const matchesPortfolio = portfolioFilter === "ALL" || h.category?.toUpperCase() === portfolioFilter;
      
      // If editing an existing shipment, show only associated units by default
      if (editingShipmentId && !showAllHardware) {
        return matchesSearch && matchesPortfolio && selectedHwIds.includes(h.id);
      }
      
      return matchesSearch && matchesPortfolio;
    });
  }, [hardwares, hwSearchQuery, portfolioFilter, editingShipmentId, selectedHwIds, showAllHardware]);

  const outboundProjects = useMemo(() => {
    const list = outboundSubTab === "awaiting" ? hardwares.filter(h => h.fulfillment_status === "Allocated") : hardwares.filter(h => h.fulfillment_status !== "Allocated" && h.status !== "In Stock");
    return sites.map(site => {
      const siteHw = list.filter(h => h.site_id === site.id && (portfolioFilter === "ALL" || h.category?.toUpperCase() === portfolioFilter));
      if (siteHw.length === 0) return null;
      if (searchQuery && !site.name.toLowerCase().includes(searchQuery.toLowerCase())) return null;
      return { ...site, hardwares: siteHw, categories: Array.from(new Set(siteHw.map(h => h.category))) };
    }).filter(Boolean);
  }, [outboundSubTab, hardwares, sites, portfolioFilter, searchQuery]);

  return (
    <MainLayout title="OPS COMMAND CENTER">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <Tabs value={activeTab} onValueChange={(v)=>setParam("tab", v)} className="w-fit">
            <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
              <TabsTrigger value="inbound" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white"><ArrowRightLeft className="h-4 w-4" /><span>Inbound Batches</span></TabsTrigger>
              <TabsTrigger value="internal" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white"><Activity className="h-4 w-4" /><span>Internal Moves</span></TabsTrigger>
              <TabsTrigger value="outbound" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white"><Truck className="h-4 w-4" /><span>Outbound Logistics</span></TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200">
              {["ALL", "ENERGY", "AIR"].map((p) => (
                <button key={p} onClick={() => setParam("portfolio", p)} className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all", portfolioFilter === p ? "bg-white text-[#009193] shadow-sm" : "text-slate-500 hover:text-[#009193]")}>{p}</button>
              ))}
            </div>
            {activeTab === 'inbound' && (
              <Button onClick={() => { setEditingPoId(null); setPoForm(initialPoForm); setShowPoModal(true); }} className="bg-[#009193] hover:bg-[#009193]/90 text-white text-xs h-9 gap-2 font-bold px-4">
                <Plus className="h-4 w-4" /> NEW PROCUREMENT
              </Button>
            )}
            {activeTab === 'internal' && (
              <Button onClick={() => { setEditingShipmentId(null); setShipmentForm({...initialShipmentForm, shipment_type: 'internal'}); setSelectedHwIds([]); setShowShipmentModal(true); }} className="bg-[#009193] hover:bg-[#009193]/90 text-white text-xs h-9 gap-2 font-bold px-4">
                <ArrowUpRight className="h-4 w-4" /> CREATE MOVEMENT
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} className="w-full">
          {/* INBOUND TAB */}
          <TabsContent value="inbound" className="mt-0 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2"><Globe className="h-4 w-4 text-[#009193]" /> Procurement Ledger ({filteredOrders.length} POs)</h3>
              <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" /><Input placeholder="Search PO..." className="pl-8 h-8 text-xs" value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} /></div>
            </div>
            <div className="space-y-3">
              {filteredOrders.map((po: any) => {
                const poShipments = shipments.filter(s => s.purchase_order_id === po.id);
                const linkedHwCount = hardwares.filter(h => h.purchase_order_id === po.id).length;
                const totalFreight = poShipments.reduce((sum, s) => sum + (Number(s.total_shipping_cost) || 0), 0);
                const totalCustoms = poShipments.reduce((sum, s) => sum + (Number(s.customs_cost) || 0), 0);
                const totalPoCost = Number(po.po_cost) || 0;
                const totalLandedCost = totalPoCost + totalFreight + totalCustoms;
                
                return (
                  <div key={po.id} className="premium-card glass border border-slate-100 overflow-hidden group">
                    <div className="p-5 flex items-center justify-between hover:bg-slate-50/20 transition-colors">
                      <div onClick={() => setExpandedGroups(prev => prev.includes(po.id) ? prev.filter(p => p !== po.id) : [...prev, po.id])} className="flex-1 flex items-center gap-5 cursor-pointer">
                        <div className="h-12 w-12 rounded-xl bg-[#009193]/10 flex flex-col items-center justify-center text-[#009193]"><FileText className="h-6 w-6" /></div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg tracking-tight">PO: {po.po_number}</h4>
                          <p className="text-xs font-bold text-[#009193] uppercase tracking-wide">{po.supplier} • {linkedHwCount} Units Assigned</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden md:block">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Landed Cost</p>
                          <p className="text-xl font-mono font-bold text-slate-800">{po.currency} {totalLandedCost.toLocaleString()}</p>
                          <div className="flex gap-2 justify-end mt-0.5">
                            <span className="text-[8px] font-bold text-slate-400 uppercase">PO: {totalPoCost.toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase">Ship: {totalFreight.toLocaleString()}</span>
                            {totalCustoms > 0 && <span className="text-[8px] font-bold text-slate-400 uppercase">Tax: {totalCustoms.toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={cn("text-[9px] uppercase border-none px-3", po.payment_status === 'Paid' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>{po.payment_status}</Badge>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingPoId(po.id); setSelectedHwIds([]); setShowAssignHwModal(true); }} className="h-6 text-[8px] uppercase font-bold text-[#009193] hover:bg-[#009193]/10">Assign Hardwares</Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditPo(po)} className="h-8 w-8 text-slate-400 hover:text-[#009193] hover:bg-[#009193]/10"><Edit3 className="h-4 w-4" /></Button>
                          <div onClick={() => setExpandedGroups(prev => prev.includes(po.id) ? prev.filter(p => p !== po.id) : [...prev, po.id])} className="cursor-pointer">{expandedGroups.includes(po.id) ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}</div>
                        </div>
                      </div>
                    </div>
                    {expandedGroups.includes(po.id) && (
                      <div className="border-t border-slate-50 bg-slate-50/10 p-5 space-y-4">
                        <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Logistics Legs (Shipments)</p> <Button variant="ghost" size="sm" onClick={() => { setEditingShipmentId(null); setShipmentForm({...initialShipmentForm, purchase_order_id: po.id}); setSelectedHwIds([]); setShowShipmentModal(true); }} className="h-6 text-[9px] text-[#009193] hover:bg-[#009193]/10 font-bold uppercase tracking-widest gap-1"><Plus className="h-3 w-3" /> Add Box/Leg</Button></div>
                        <div className="grid grid-cols-1 gap-2">
                          {poShipments.map(s => (
                            <div key={s.id} className="bg-white border border-slate-100 rounded-lg p-3 flex items-center justify-between shadow-sm">
                              <div className="flex items-center gap-4">
                                <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400"><Truck className="h-4 w-4" /></div>
                                <div><p className="text-xs font-bold text-slate-700">{s.origin?.name || "N/A"} → {s.destination?.name || "N/A"}</p><p className="text-[9px] uppercase font-bold text-slate-400">{s.carrier_name || "Unknown Carrier"}</p></div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right"><p className="text-[10px] font-mono font-bold text-slate-600">{s.currency} {Number(s.total_shipping_cost).toLocaleString()}</p></div>
                                <Badge className={cn("text-[8px] uppercase h-5", s.status === 'delivered' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>{s.status}</Badge>
                                <Button variant="ghost" size="icon" onClick={() => handleEditShipment(s)} className="h-7 w-7 text-slate-300 hover:text-[#009193]"><Edit3 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* INTERNAL MOVES TAB */}
          <TabsContent value="internal" className="mt-0 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-[#009193]" /> Office Transfers ({internalShipments.length} Total)</h3>
              <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" /><Input placeholder="Search moves..." className="pl-8 h-8 text-xs" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {internalShipments.map(s => (
                <div key={s.id} className="premium-card glass p-4 border border-slate-100 hover:border-[#009193]/30 transition-all cursor-pointer group" onClick={() => handleEditShipment(s)}>
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className="text-[9px] uppercase font-bold text-[#009193] bg-[#009193]/5 border-[#009193]/10">{s.shipment_type?.replace('_',' ')}</Badge>
                    <p className="text-[10px] font-mono text-slate-400">{format(new Date(s.created_at), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#009193] group-hover:bg-[#009193] group-hover:text-white transition-all"><Truck className="h-5 w-5" /></div>
                    <div><p className="text-xs font-bold text-slate-800">{s.origin?.name || "Office"} → {s.destination?.name || "Target"}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.carrier_name || "Self Delivery"}</p></div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><History className="h-3 w-3" /> View units...</div>
                    <Badge className={cn("text-[9px] uppercase border-none px-2", s.status === 'delivered' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>{s.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          {/* OUTBOUND TAB */}
          <TabsContent value="outbound" className="mt-0 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <Tabs value={outboundSubTab} onValueChange={(v)=>setParam("sub", v)} className="w-fit">
                <TabsList className="bg-slate-100 p-1 h-9">
                  <TabsTrigger value="awaiting" className="text-xs px-4 data-[state=active]:bg-white">Awaiting Dispatch ({sites.length} Sites)</TabsTrigger>
                  <TabsTrigger value="shipped" className="text-xs px-4 data-[state=active]:bg-white">Fulfilled</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-full md:w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search project sites..." className="pl-9 h-9 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            </div>
            <div className="space-y-3">
              {outboundProjects.map((project: any) => (
                <div key={project.id} className="premium-card glass border border-slate-100 overflow-hidden">
                  <div onClick={() => setExpandedGroups(prev => prev.includes(project.id) ? prev.filter(p => p !== project.id) : [...prev, project.id])} className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-4"><div className="h-10 w-10 rounded-xl bg-[#009193]/10 flex items-center justify-center text-[#009193]"><MapPin className="h-5 w-5" /></div><div><h4 className="font-bold text-slate-800 tracking-tight">{project.name}</h4><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{project.hardwares.length} Units Assigned</p></div></div>
                    <div className="flex items-center gap-3">{project.categories.map((cat: string) => <Badge key={cat} className="bg-[#009193]/5 text-[#009193] border-[#009193]/20 text-[9px] uppercase">{cat}: {project.hardwares.filter((h: any) => h.category === cat).length}</Badge>)}{expandedGroups.includes(project.id) ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}</div>
                  </div>
                  {expandedGroups.includes(project.id) && (
                    <div className="border-t border-slate-50 bg-slate-50/20 p-4 space-y-4">
                      {project.categories.map((cat: string) => (
                        <div key={cat} className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
                          <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-100"><span className="text-[10px] font-bold uppercase tracking-widest text-[#009193] flex items-center gap-2"><Layers className="h-3 w-3" /> {cat} Portfolio</span></div>
                          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50/30"><th className="text-left p-3 uppercase font-bold text-slate-400 text-[10px]">SN</th><th className="text-left p-3 uppercase font-bold text-slate-400 text-[10px]">Logistics Ledger</th><th className="text-right p-3 uppercase font-bold text-slate-400 text-[10px]">Status</th></tr></thead>
                            <tbody>{project.hardwares.filter((h: any) => h.category === cat).map((hw: any) => (
                              <tr key={hw.id} onClick={() => { setSelectedHardware(hw); setSearchParams(p=>{p.set("id",hw.id); return p;}); }} className="border-b last:border-b-0 hover:bg-[#009193]/5 transition-colors cursor-pointer"><td className="p-3 font-mono font-bold text-[#009193]">{hw.device_id}</td><td className="p-3"><div className="flex items-center gap-2 text-xs text-slate-400"><History className="h-3 w-3" /> <span>View audit trail...</span></div></td><td className="p-3 text-right"><Badge className={cn("text-[9px] uppercase border-none", hw.fulfillment_status === 'Allocated' ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600")}>{hw.fulfillment_status}</Badge></td></tr>
                            ))}</tbody></table></div>
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

      {/* SHIPMENT MODAL */}
      <Dialog open={showShipmentModal} onOpenChange={setShowShipmentModal}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white border-none shadow-2xl">
          <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-3 text-[#009193] font-bold text-xl"><Truck className="h-6 w-6" /> {editingShipmentId ? "Edit Logistics Record" : "New Movement Cycle"}</DialogTitle>
            <DialogDescription className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Select Origin/Destination (Offices Only) and pick devices.</DialogDescription>
          </DialogHeader>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
            <div className="space-y-4">
               <p className="text-[10px] font-bold uppercase text-[#009193] tracking-widest border-b pb-1">1. Logistics Route</p>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Origin Office</Label><Select value={shipmentForm.origin_location_id} onValueChange={(v)=>setShipmentForm({...shipmentForm, origin_location_id: v})}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick Office" /></SelectTrigger><SelectContent>{internalOffices.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Destination</Label><Select value={shipmentForm.destination_location_id} onValueChange={(v)=>setShipmentForm({...shipmentForm, destination_location_id: v})}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick Target" /></SelectTrigger><SelectContent>{internalOffices.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
               </div>
               <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Carrier / Forwarder</Label><Input placeholder="FedEx, UPS, Staff Delivery..." className="h-9 text-xs" value={shipmentForm.carrier_name} onChange={(e)=>setShipmentForm({...shipmentForm, carrier_name: e.target.value})} /></div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Freight Cost</Label><Input type="number" className="h-9 text-xs" value={shipmentForm.total_shipping_cost} onChange={(e)=>setShipmentForm({...shipmentForm, total_shipping_cost: e.target.value})} /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Status</Label><Select value={shipmentForm.status} onValueChange={(v)=>setShipmentForm({...shipmentForm, status: v})}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{SHIPMENT_STATUSES.map(s=><SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>)}</SelectContent></Select></div>
               </div>
               <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Tracking Number</Label><Input placeholder="AB1234567" className="h-9 text-xs" value={shipmentForm.tracking_number} onChange={(e)=>setShipmentForm({...shipmentForm, tracking_number: e.target.value})} /></div>
               <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Notes</Label><Textarea placeholder="Operational details..." className="h-20 text-xs" value={shipmentForm.notes} onChange={(e)=>setShipmentForm({...shipmentForm, notes: e.target.value})} /></div>
            </div>

            <div className="space-y-4 flex flex-col h-full">
                <p className="text-[10px] font-bold uppercase text-[#009193] tracking-widest border-b pb-1 flex justify-between items-center">
                  2. Hardware Selector 
                  <div className="flex items-center gap-2">
                    {editingShipmentId && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowAllHardware(!showAllHardware)}
                        className="h-5 text-[8px] font-bold uppercase text-slate-400 hover:text-[#009193]"
                      >
                        {showAllHardware ? "Show Associated Only" : "Show All"}
                      </Button>
                    )}
                    <Badge variant="secondary" className="h-4 text-[8px] font-bold bg-[#009193]/10 text-[#009193] border-[#009193]/20">
                      {selectedHwIds.length} Units in Movement
                    </Badge>
                  </div>
                </p>
               <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" /><Input placeholder="Filter serials..." className="pl-7 h-8 text-xs bg-slate-50/50" value={hwSearchQuery} onChange={(e)=>setHwSearchQuery(e.target.value)} /></div>
               <div className="flex-1 border rounded-lg overflow-y-auto bg-slate-50/30 p-2 space-y-1 min-h-[250px]">
                  {selectableHardware.map(hw => (
                    <div key={hw.id} className={cn("flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer border border-transparent", selectedHwIds.includes(hw.id) ? "bg-[#009193]/10 border-[#009193]/20" : "hover:bg-slate-100")} onClick={() => setSelectedHwIds(prev => prev.includes(hw.id) ? prev.filter(id => id !== hw.id) : [...prev, hw.id])}>
                      <Checkbox checked={selectedHwIds.includes(hw.id)} className="h-4 w-4 border-[#009193] data-[state=checked]:bg-[#009193]" />
                      <div className="flex-1"><p className="text-xs font-bold text-slate-700">{hw.device_id}</p><p className="text-[9px] uppercase text-slate-400 font-bold">{hw.category} • {hw.status}</p></div>
                    </div>
                  ))}
               </div>
               <Button onClick={handleSaveShipment} disabled={isSaving} className="w-full h-11 bg-[#009193] hover:bg-[#009193]/90 text-white font-bold gap-2">
                 {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {editingShipmentId ? "SAVE UPDATES" : "AUTHORIZE SHIPMENT"}
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ASSIGN HARDWARE TO PO MODAL */}
      <Dialog open={showAssignHwModal} onOpenChange={setShowAssignHwModal}>
        <DialogContent className="sm:max-w-[450px] p-6 bg-white border-none shadow-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-3 text-[#009193] font-bold text-xl"><FileText className="h-6 w-6" /> Assign Units to PO</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 uppercase tracking-widest">Mark these hardwares as 'Born From' this PO.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
             <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" /><Input placeholder="Search serial numbers..." className="pl-8 h-9 text-xs" value={hwSearchQuery} onChange={(e)=>setHwSearchQuery(e.target.value)} /></div>
             <div className="border rounded-xl h-64 overflow-y-auto bg-slate-50 p-3 space-y-2">
                {selectableHardware.map(hw => (
                  <div key={hw.id} className={cn("flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer", selectedHwIds.includes(hw.id) ? "bg-[#009193]/5 border-[#009193]/30" : "bg-white border-slate-100 hover:border-[#009193]/20")} onClick={() => setSelectedHwIds(prev => prev.includes(hw.id) ? prev.filter(id => id !== hw.id) : [...prev, hw.id])}>
                    <div><p className="text-xs font-bold text-slate-800">{hw.device_id}</p><p className="text-[9px] uppercase text-slate-400 font-bold">{hw.category}</p></div>
                    <Checkbox checked={selectedHwIds.includes(hw.id)} className="h-4 w-4 border-[#009193] data-[state=checked]:bg-[#009193]" />
                  </div>
                ))}
             </div>
             <Button onClick={handleBatchAssignPo} disabled={isSaving || selectedHwIds.length === 0} className="w-full h-12 bg-[#009193] hover:bg-[#009193]/90 text-white font-bold gap-2">
               {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />} LINK {selectedHwIds.length} DEVICES TO PO
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO MODAL */}
      <Dialog open={showPoModal} onOpenChange={setShowPoModal}>
        <DialogContent className="sm:max-w-[500px] p-6 bg-white border-none shadow-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-3 text-[#009193] font-bold text-xl"><CreditCard className="h-6 w-6" /> {editingPoId ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">PO Number</Label><Input placeholder="PO-1234" value={poForm.po_number} onChange={(e)=>setPoForm({...poForm, po_number: e.target.value})} /></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Category</Label><Select value={poForm.category} onValueChange={(v)=>setPoForm({...poForm, category: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ENERGY">ENERGY</SelectItem><SelectItem value="AIR">AIR</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Supplier</Label><Input placeholder="Manufacturer Name" value={poForm.supplier} onChange={(e)=>setPoForm({...poForm, supplier: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">PO Amount</Label><Input type="number" value={poForm.po_cost} onChange={(e)=>setPoForm({...poForm, po_cost: e.target.value})} /></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Currency</Label><Select value={poForm.currency} onValueChange={(v)=>setPoForm({...poForm, currency: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Issued Date</Label><Input type="date" value={poForm.po_issued_date} onChange={(e)=>setPoForm({...poForm, po_issued_date: e.target.value})} /></div>
            </div>
            <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Notes</Label><Textarea placeholder="Financial notes..." value={poForm.notes} onChange={(e)=>setPoForm({...poForm, notes: e.target.value})} /></div>
            <Button onClick={handleSavePo} disabled={isSaving} className="w-full h-11 bg-[#009193] hover:bg-[#009193]/90 text-white font-bold gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} SAVE PURCHASE ORDER
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* HARDWARE AUDIT TRAIL MODAL */}
      <Dialog open={!!selectedHardware} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-white shadow-2xl border-none">
          <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
            <div className="flex justify-between items-start">
               <div>
                  <DialogTitle className="flex items-center gap-3 text-slate-800 font-bold">Hardware Profile: {selectedHardware?.device_id}</DialogTitle>
                  <DialogDescription className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Full chain of custody & financial origin.</DialogDescription>
               </div>
               <Button variant="ghost" size="icon" onClick={handleCloseModal} className="h-8 w-8 rounded-full hover:bg-slate-200"><X className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
             <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest border-b pb-1 flex items-center gap-2"><CreditCard className="h-3 w-3" /> Financial Origin (Born From)</p>
                <div className="bg-[#009193]/5 border border-[#009193]/10 p-4 rounded-xl flex items-center justify-between">
                   <div>
                      <p className="text-xs font-bold text-slate-800">PO: {selectedHardware?.purchase_order?.po_number || "NOT LINKED"}</p>
                      <p className="text-[10px] font-bold text-[#009193] uppercase">{selectedHardware?.purchase_order?.supplier || "Unknown Supplier"} • {selectedHardware?.category} Portfolio</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Status</p>
                      <Badge className={cn("text-[9px] uppercase border-none", selectedHardware?.status === 'In Stock' ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600")}>{selectedHardware?.status}</Badge>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest border-b pb-1 flex items-center gap-2"><History className="h-3 w-3" /> Logistics Timeline (Ledger)</p>
                {hardwareMovements.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                     <p className="text-xs text-slate-400 font-medium italic">No ledger records found for this unit.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                    {hardwareMovements.map((move: any, i: number) => (
                      <div key={move.id} className="relative">
                        <div className={cn("absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white ring-4 ring-white shadow-sm", i === 0 ? "bg-[#009193]" : "bg-slate-300")} />
                        <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                           <div className="flex justify-between items-start mb-1">
                              <Badge variant="outline" className="text-[8px] uppercase">{move.shipment?.shipment_type?.replace('_',' ')}</Badge>
                              <span className="text-[9px] font-mono text-slate-400">{format(new Date(move.created_at), "dd MMM yyyy")}</span>
                           </div>
                           <p className="text-xs font-bold text-slate-700">{move.shipment?.origin?.name || "Origin"} → {move.shipment?.destination?.name || "Destination"}</p>
                           <div className="mt-2 flex items-center gap-3 text-[9px] text-slate-500">
                              <span className="flex items-center gap-1 uppercase font-bold"><Truck className="h-2.5 w-2.5" /> {move.shipment?.carrier_name || "Self"}</span>
                              <span className="flex items-center gap-1 font-mono font-bold"><Banknote className="h-2.5 w-2.5" /> {move.shipment?.currency} {Number(move.shipment?.total_shipping_cost || 0).toLocaleString()}</span>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>

             <div className="bg-[#009193] p-4 rounded-xl text-white">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider">True Landed Cost</span>
                  <span className="text-xl font-mono font-bold">
                    {selectedHardware?.purchase_order?.currency || '€'} {
                      (
                        (Number(selectedHardware?.purchase_order?.po_cost) || 0) + 
                        hardwareMovements.reduce((acc, m) => acc + (Number(m.shipment?.total_shipping_cost || 0) + Number(m.shipment?.customs_cost || 0)), 0)
                      ).toLocaleString()
                    }
                  </span>
                </div>
                <p className="text-[8px] text-white/60 uppercase mt-1 tracking-tighter">*Calculated from cumulative PO Cost + Freight + Customs for this unit.</p>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
