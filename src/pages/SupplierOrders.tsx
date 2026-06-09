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
  X,
  TrendingUp,
  Minus
} from "lucide-react";
import { 
  MapContainer, 
  TileLayer, 
  CircleMarker, 
  Polyline, 
  Tooltip,
  GeoJSON,
  Marker
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const WORLD_GEO_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";

const CURRENCIES = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'CNY', symbol: '¥' }
];

const SHIPMENT_STATUSES = ["awaiting dispatch", "upcoming", "in_transit", "delivered", "cancelled"];

function StatCard({ number, label, change, color, icon: Icon }: any) {
  const bg = color === "black" ? "bg-zinc-900 text-white" :
             color === "teal" ? "bg-[#009193] text-white" : "bg-white border border-slate-200";

  return (
    <div className={cn(bg, "rounded-3xl p-6 shadow-sm flex-1 min-w-[240px] relative overflow-hidden group transition-all hover:scale-[1.02]")}>
      <div className="flex justify-between items-start relative z-10">
        <div>
          <div className="text-5xl font-semibold tracking-tighter tabular-nums">{number}</div>
          <div className={cn("text-xs font-bold uppercase tracking-wider mt-2 opacity-60", color === "teal" ? "text-white/80" : "")}>{label}</div>
        </div>
        <div className={cn("p-3 rounded-2xl", color === "black" ? "bg-white/10" : "bg-black/5")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {change && (
        <div className="mt-4 flex items-center gap-1.5 relative z-10">
          <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full", 
            color === "teal" ? "bg-white/20 text-white" : "bg-[#009193]/20 text-[#009193]")}>
            <TrendingUp className="h-3 w-3" /> {change}
          </div>
          <span className="text-[10px] opacity-40 font-bold uppercase tracking-tighter">vs last month</span>
        </div>
      )}
    </div>
  );
}

export default function SupplierOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profiles, setProfiles] = useState<any[]>([]);
  
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [hardwares, setHardwares] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [worldGeo, setWorldGeo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const activeTab = searchParams.get("tab") || "overview";
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
  const [deliveryMode, setDeliveryMode] = useState<"carrier" | "in_person">("carrier");
  const [deliveryDetail, setDeliveryDetail] = useState("");
  const [selectedHwIds, setSelectedHwIds] = useState<string[]>([]);
  const [showAllHardware, setShowAllHardware] = useState(false);
  const [outboundOriginFilter, setOutboundOriginFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");
  const [mapZoom, setMapZoom] = useState(1);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    shipments.forEach(s => {
      if (s.shipped_date) {
        const d = new Date(s.shipped_date);
        const month = d.toLocaleString('en-US', { month: 'long' });
        const year = d.getFullYear();
        months.add(`${month} ${year}`);
      }
    });
    return Array.from(months).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });
  }, [shipments]);

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
    notes: "",
    shipped_date: "",
    shipped_by: ""
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
      const [poRes, shipRes, locRes, hwRes, siteRes, profilesRes] = await Promise.all([
        (supabase as any).from("ops_purchase_orders").select("*").order("created_at", { ascending: false }),
        (supabase as any).from("ops_shipments").select("*, origin:ops_locations!origin_location_id(name), destination:ops_locations!destination_location_id(name), ops_hardware_movements(hardwares(id, product_id, hardware_type, category, products(category, name)))").order("created_at", { ascending: false }),
        (supabase as any).from("ops_locations").select("*").order("name"),
        supabase.from("hardwares").select("*, products(category, name), purchase_order:ops_purchase_orders(*)").order("created_at", { ascending: false }),
        supabase.from("sites").select("*"),
        supabase.from("profiles").select("id, full_name, display_name, first_name, last_name, email").order("full_name")
      ]);

      setPurchaseOrders(poRes.data || []);
      
      const enrichedShipments = (shipRes.data || []).map((s: any) => ({
        ...s,
        ops_hardware_movements: (s.ops_hardware_movements || []).map((m: any) => {
          if (!m.hardwares) return m;
          const hw = m.hardwares;
          const prod = hw.products;
          return {
            ...m,
            hardwares: {
              ...hw,
              category: hw.category || prod?.category || "AIR",
              hardware_type: hw.hardware_type || prod?.name || null
            }
          };
        })
      }));
      setShipments(enrichedShipments);
      
      setLocations(locRes.data || []);
      
      const enrichedHw = (hwRes.data || []).map((h: any) => {
        const prod = h.products;
        return {
          ...h,
          category: h.category || prod?.category || "AIR",
          hardware_type: h.hardware_type || prod?.name || null,
          fulfillment_status: h.fulfillment_status || (h.shipment_date ? "Delivered" : (h.status === 'In Stock' ? "Ready" : "Allocated"))
        };
      });
      setHardwares(enrichedHw);
      setSites(siteRes.data || []);

      const formattedProfiles = (profilesRes.data || []).map((p: any) => ({
        id: p.id,
        full_name:
          p.full_name ||
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.email ||
          "User",
      }));
      setProfiles(formattedProfiles);

      if (selectedId) {
        const foundHw = enrichedHw.find((h:any) => h.id === selectedId);
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

  useEffect(() => {
    fetch(WORLD_GEO_URL)
      .then(res => res.json())
      .then(data => setWorldGeo(data))
      .catch(err => console.error("GeoJSON load error:", err));
  }, []);

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
      notes: ship.notes || "",
      shipped_date: ship.shipped_date || "",
      shipped_by: ship.shipped_by || ""
    });

    const carrierStr = ship.carrier_name || "";
    if (carrierStr.includes("(In Person)")) {
      setDeliveryMode("in_person");
      setDeliveryDetail(carrierStr.replace(" (In Person)", ""));
    } else {
      setDeliveryMode("carrier");
      setDeliveryDetail(carrierStr.replace(" (Carrier)", ""));
    }
    
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
      const finalCarrier = deliveryMode === 'carrier' 
        ? `${deliveryDetail} (Carrier)` 
        : `${deliveryDetail} (In Person)`;

      const payload = {
        ...shipmentForm,
        carrier_name: finalCarrier,
        total_shipping_cost: parseFloat(shipmentForm.total_shipping_cost) || 0,
        customs_cost: parseFloat(shipmentForm.customs_cost) || 0,
        purchase_order_id: shipmentForm.purchase_order_id || null,
        origin_location_id: shipmentForm.origin_location_id || null,
        destination_location_id: shipmentForm.destination_location_id || null,
        shipped_date: shipmentForm.shipped_date || null,
        shipped_by: shipmentForm.shipped_by || null
      };

      let shipId = editingShipmentId;
      if (editingShipmentId) {
        const { error: updateErr } = await (supabase as any)
          .from("ops_shipments")
          .update(payload)
          .eq("id", editingShipmentId);
        if (updateErr) throw updateErr;
      } else {
        const { data, error: insertErr } = await (supabase as any)
          .from("ops_shipments")
          .insert([payload])
          .select();
        if (insertErr) throw insertErr;
        shipId = data?.[0].id;
      }

      if (shipId && selectedHwIds.length > 0) {
        // First, clear existing associations for this shipment to avoid duplicates
        const { error: delErr } = await (supabase as any)
          .from("ops_hardware_movements")
          .delete()
          .eq("shipment_id", shipId);
        if (delErr) throw delErr;
        
        const movements = selectedHwIds.map(hid => ({
          hardware_id: hid,
          shipment_id: shipId,
          action: payload.status === 'delivered' 
            ? 'received' 
            : (payload.status === 'in_transit' ? 'in_transit' : 'dispatched')
        }));
        const { error: insErr } = await (supabase as any)
          .from("ops_hardware_movements")
          .insert(movements);
        if (insErr) throw insErr;
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
    return shipments.filter(s => {
      if (s.shipment_type !== 'internal') return false;
      const matchesPortfolio = portfolioFilter === "ALL" || s.ops_hardware_movements?.some((m: any) => m.hardwares?.category?.toUpperCase() === portfolioFilter);
      
      let matchesMonth = true;
      if (monthFilter !== "ALL" && s.shipped_date) {
        const d = new Date(s.shipped_date);
        const label = `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
        matchesMonth = label === monthFilter;
      }

      return matchesPortfolio && matchesMonth;
    });
  }, [shipments, portfolioFilter, monthFilter]);

  const outboundShipments = useMemo(() => {
    const rawList = shipments.filter(s => {
      if (s.shipment_type !== 'outbound') return false;
      const matchesSearch = !searchQuery || s.destination?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesSubTab = false;
      if (outboundSubTab === 'shipped') {
        matchesSubTab = s.status === 'delivered';
      } else if (outboundSubTab === 'intransit') {
        matchesSubTab = s.status === 'in_transit';
      } else {
        // awaiting dispatch or upcoming
        matchesSubTab = s.status === 'awaiting dispatch' || s.status === 'upcoming';
      }

      const matchesOrigin = outboundOriginFilter === "ALL" || s.origin_location_id === outboundOriginFilter;
      const matchesPortfolio = portfolioFilter === "ALL" || s.ops_hardware_movements?.some((m: any) => m.hardwares?.category?.toUpperCase() === portfolioFilter);
      
      let matchesMonth = true;
      if (monthFilter !== "ALL" && s.shipped_date) {
        const d = new Date(s.shipped_date);
        const label = `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
        matchesMonth = label === monthFilter;
      }
      
      return matchesSearch && matchesSubTab && matchesOrigin && matchesPortfolio && matchesMonth;
    });

    if (outboundSubTab !== 'awaiting') return rawList;

    // Group awaiting dispatch shipments by destination site/location
    const grouped = new Map<string, any>();
    for (const s of rawList) {
      const key = s.destination_location_id || s.destination?.name || s.id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          ...s,
          ops_hardware_movements: [...(s.ops_hardware_movements || [])],
        });
      } else {
        const existing = grouped.get(key);
        if (s.ops_hardware_movements) {
          existing.ops_hardware_movements.push(...s.ops_hardware_movements);
        }
        if (s.notes && !existing.notes?.includes(s.notes)) {
          existing.notes = (existing.notes ? existing.notes + "; " : "") + s.notes;
        }
      }
    }
    return Array.from(grouped.values());
  }, [shipments, searchQuery, outboundSubTab, outboundOriginFilter, portfolioFilter, monthFilter]);

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

  const mapData = useMemo(() => {
    const locMarkers: any[] = [];
    const locMap = new Map();

    locations.forEach(l => {
      if (l.lat && l.lng) {
        locMap.set(l.id, { name: l.name, coords: [l.lng, l.lat], type: l.type });
      }
    });

    const connections: any[] = [];
    const countsByLoc: any = {};

    shipments.forEach(s => {
      const origin = locMap.get(s.origin_location_id);
      const dest = locMap.get(s.destination_location_id);
      
      if (origin && dest) {
        connections.push({ 
          from: origin.coords, 
          to: dest.coords, 
          status: s.status,
          type: s.shipment_type
        });
        countsByLoc[s.origin_location_id] = (countsByLoc[s.origin_location_id] || 0) + (s.ops_hardware_movements?.length || 0);
        countsByLoc[s.destination_location_id] = (countsByLoc[s.destination_location_id] || 0) + (s.ops_hardware_movements?.length || 0);
        
        // Mark origin as inbound source if type is inbound
        if (s.shipment_type === 'inbound') {
          locMap.set(s.origin_location_id, { ...origin, isInboundOrigin: true });
        }
      }
    });

    Object.keys(countsByLoc).forEach(id => {
      const loc = locMap.get(id);
      if (loc) {
        locMarkers.push({ ...loc, value: countsByLoc[id], id });
      }
    });

    return { markers: locMarkers, connections };
  }, [shipments, locations]);

  const stats = useMemo(() => {
    return {
      upcoming: shipments.filter(s => s.status === 'upcoming').length,
      pending: shipments.filter(s => s.status === 'in_transit' || s.status === 'customs').length,
      fulfilled: shipments.filter(s => s.status === 'delivered').length
    };
  }, [shipments]);

  const sustainabilityInsights = useMemo(() => {
    const outboundShipments = shipments.filter(s => s.shipment_type === 'outbound' && (Number(s.co2e_lbs) || 0) > 0);
    
    const scope3Cat4 = outboundShipments.reduce((sum, s) => sum + (Number(s.co2e_lbs) || 0), 0);
    const totalDistance = outboundShipments.reduce((sum, s) => sum + (Number(s.distance_miles) || 0), 0);
    const shipmentsCount = outboundShipments.length;

    const brandMap: { [key: string]: number } = {};
    outboundShipments.forEach(s => {
      const loc = locations.find(l => l.id === s.destination_location_id);
      const brandName = loc?.brand || "Other / Unassigned";
      brandMap[brandName] = (brandMap[brandName] || 0) + (Number(s.co2e_lbs) || 0);
    });

    const scope3Cat1 = Object.entries(brandMap)
      .map(([brand, emissions]) => ({ brand, emissions }))
      .sort((a, b) => b.emissions - a.emissions);

    return {
      scope3Cat4,
      totalDistance,
      shipmentsCount,
      scope3Cat1
    };
  }, [shipments, locations]);

  return (
    <MainLayout title="OPS COMMAND CENTER">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <Tabs value={activeTab} onValueChange={(v)=>setParam("tab", v)} className="w-fit">
            <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
              <TabsTrigger value="overview" className="flex items-center gap-2 px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white"><Globe className="h-4 w-4" /><span>Overview</span></TabsTrigger>
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
          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard number={stats.upcoming} label="Upcoming Shipments" change="" color="black" icon={PackageCheck} />
              <StatCard number={stats.pending} label="Shipments In Progress" change="" color="white" icon={Clock} />
              <StatCard number={stats.fulfilled} label="Fulfilled Deliveries" change="" color="teal" icon={CheckCircle2} />
            </div>

            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="flex justify-between items-center mb-8 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                    <Globe className="h-5 w-5 text-[#009193]" /> Global Logistics Network
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time hardware flow across offices and sites</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-zinc-900" />
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter">Inbound</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#ef4444]" />
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter">Internal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[#009193]" />
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tighter">Outbound</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-full bg-slate-50 hover:bg-slate-100"><Filter className="h-4 w-4 text-slate-400" /></Button>
                </div>
              </div>

            <div className="h-[600px] w-full rounded-3xl overflow-hidden bg-[#f8fafc] border border-slate-100 relative z-0">
              <MapContainer 
                center={[20, 0] as any} 
                zoom={2} 
                style={{ height: "100%", width: "100%", background: "#f8fafc" }}
                scrollWheelZoom={true}
              >
                {worldGeo && (
                  <GeoJSON 
                    data={worldGeo} 
                    style={() => ({
                      fillColor: "#e2e8f0",
                      weight: 0.5,
                      opacity: 1,
                      color: "#cbd5e1",
                      fillOpacity: 0.5
                    })}
                  />
                )}

                {/* Shipment Connections */}
                {mapData.connections.map((conn, i) => {
                  const lineColor = conn.type === 'inbound' ? '#18181b' : 
                                    conn.type === 'outbound' ? '#009193' : 
                                    '#ef4444';
                  const isDelivered = conn.status === 'delivered';
                  const isInternal = conn.type === 'internal';
                  
                  return (
                    <Polyline
                      key={`line-${i}`}
                      positions={[
                        [conn.from[1], conn.from[0]], 
                        [conn.to[1], conn.to[0]]
                      ] as any}
                      color={lineColor}
                      weight={2.5}
                      opacity={isDelivered ? 0.3 : 0.8}
                      dashArray={isInternal ? "5, 5" : "0"}
                    >
                      <Tooltip sticky>
                        <div className="text-[10px] font-bold uppercase tracking-tight">
                          <span className={cn("px-2 py-0.5 rounded-full text-white mr-2", 
                            conn.type === 'inbound' ? 'bg-zinc-900' : 
                            conn.type === 'outbound' ? 'bg-[#009193]' : 'bg-[#ef4444]')}>
                            {conn.type}
                          </span>
                          {conn.status}
                        </div>
                      </Tooltip>
                    </Polyline>
                  );
                })}

                {/* Office/Warehouse/Site Markers */}
                {mapData.markers.map((loc, i) => {
                  const isOffice = loc.type?.toLowerCase().includes('office');
                  const isInboundOrigin = loc.isInboundOrigin;
                  
                  if (isOffice) {
                    const icon = L.divIcon({
                      html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-[#18181b] border-2 border-white text-white shadow-xl hover:scale-110 transition-all">
                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-warehouse"><path d="M3 21V10l9-6 9 6v11"/><path d="M9 21V11h6v10"/><path d="M2 10l10-7 10 7"/><path d="m11 13 1 1 1-1"/></svg>
                             </div>`,
                      className: 'custom-div-icon',
                      iconSize: [40, 40],
                      iconAnchor: [20, 20],
                    });

                    return (
                      <Marker key={`marker-${i}`} position={[loc.coords[1], loc.coords[0]] as any} icon={icon}>
                        <Tooltip direction="top" offset={[0, -20]} className="premium-tooltip">
                          <div className="p-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#009193] leading-none mb-1">{loc.type}</div>
                            <div className="text-sm font-bold text-slate-800">{loc.name}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-[#18181b] text-white rounded-full">{loc.value} Units</span>
                            </div>
                          </div>
                        </Tooltip>
                      </Marker>
                    );
                  }

                  return (
                    <CircleMarker
                      key={`marker-${i}`}
                      center={[loc.coords[1], loc.coords[0]] as any}
                      radius={6}
                      fillColor={isInboundOrigin ? "#18181b" : "#009193"}
                      color="white"
                      weight={2}
                      opacity={1}
                      fillOpacity={1}
                    >
                      <Tooltip direction="top" offset={[0, -5]}>
                        <div className="p-1">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">{loc.type || 'SITE'}</div>
                          <div className="text-sm font-bold text-slate-800">{loc.name}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded-full">{loc.value} Units</span>
                          </div>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            </div>

            {/* Sustainability Insights Section */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="flex justify-between items-center mb-6 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#009193]" /> Sustainability Insights - Scope 3 Emissions
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time carbon footprint metrics & scopes</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Card: FGB Emissions */}
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-widest block mb-1">
                      FGB Emissions
                    </span>
                    <h4 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                      FGB Emissions - Category 4
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Outbound Transportation and Distribution emissions calculated from logistics routes and cargo weight.
                    </p>
                  </div>
                  
                  <div className="my-6 pt-4 flex items-baseline gap-2 border-t border-slate-200/60">
                    <span className="text-5xl font-extrabold tracking-tighter text-[#009193] font-mono">
                      {sustainabilityInsights.scope3Cat4.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-bold uppercase text-slate-400">lbs CO₂e</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100/80 rounded-2xl p-4 flex flex-col justify-between">
                      <div className="h-8 w-8 rounded-lg bg-[#009193]/10 flex items-center justify-center text-[#009193] mb-3">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-none mb-1">Total Distance</p>
                        <p className="text-lg font-mono font-bold text-slate-800">
                          {sustainabilityInsights.totalDistance.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] font-bold text-slate-400">mi</span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-100/80 rounded-2xl p-4 flex flex-col justify-between">
                      <div className="h-8 w-8 rounded-lg bg-[#009193]/10 flex items-center justify-center text-[#009193] mb-3">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-none mb-1">Reported Shipments</p>
                        <p className="text-lg font-mono font-bold text-slate-800">
                          {sustainabilityInsights.shipmentsCount} <span className="text-[10px] font-bold text-slate-400">runs</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Card: Clients Section */}
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                  <div className="mb-4">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-widest block mb-1">
                      Client Allocated Emissions
                    </span>
                    <h4 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                      Client Breakdown
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      For client side Scope 3, this represents Category 1 - Purchased Goods & Services carbon footprint allocated to each client brand.
                    </p>
                  </div>
                  
                  <div className="space-y-3 mt-6">
                    {sustainabilityInsights.scope3Cat1.length === 0 ? (
                      <div className="text-xs text-slate-400 italic text-center py-4">No outbound emissions recorded for brands.</div>
                    ) : (
                      sustainabilityInsights.scope3Cat1.map(({ brand, emissions }) => {
                        const maxEmissions = Math.max(...sustainabilityInsights.scope3Cat1.map(x => x.emissions), 1);
                        const percentage = (emissions / maxEmissions) * 100;
                        return (
                          <div key={brand} className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-700">{brand}</span>
                              <span className="text-slate-500 font-mono">{emissions.toLocaleString(undefined, { maximumFractionDigits: 2 })} lbs</span>
                            </div>
                            <div className="w-full h-2 bg-slate-200/50 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#009193] rounded-full transition-all duration-500" 
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

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
                                <div>
                                  <p className="text-xs font-bold text-slate-700">{s.origin?.name || "N/A"} → {s.destination?.name || "N/A"}</p>
                                  <div className="flex gap-2 items-center">
                                    <p className="text-[9px] uppercase font-bold text-slate-400">{s.carrier_name || "Unknown Carrier"}</p>
                                    {s.shipped_date && <span className="text-[9px] font-bold text-[#009193]">Shipped: {format(new Date(s.shipped_date), "dd MMM yy")}</span>}
                                    <span className="text-[9px] font-bold text-slate-400">({s.ops_hardware_movements?.length || 0} units)</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right"><p className="text-[10px] font-mono font-bold text-slate-600">{s.currency} {Number(s.total_shipping_cost).toLocaleString()}</p></div>
                                <Badge className={cn("text-[8px] uppercase h-5", 
                                   s.status === 'delivered' 
                                     ? "bg-green-50 text-green-600" 
                                     : (s.status === 'in_transit' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600")
                                 )}>{s.status?.replace('_',' ')}</Badge>
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
              <div className="flex items-center gap-2">
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="h-8 w-[160px] text-xs bg-slate-50 border-slate-200">
                    <Calendar className="h-3 w-3 mr-2 text-slate-400" />
                    <SelectValue placeholder="All Months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Time</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" /><Input placeholder="Search moves..." className="pl-8 h-8 text-xs" /></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {internalShipments.map(s => {
                const hwCount = s.ops_hardware_movements?.length || 0;
                const types = s.ops_hardware_movements?.reduce((acc: any, m: any) => {
                  const type = m.hardwares?.hardware_type?.toUpperCase() || 'UNKNOWN';
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                }, {});
                const typeStrings = types ? Object.entries(types).map(([k, v]) => `${v} ${k}`) : [];

                return (
                <div key={s.id} className="premium-card glass p-4 border border-slate-100 hover:border-[#009193]/30 transition-all cursor-pointer group" onClick={() => handleEditShipment(s)}>
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className="text-[9px] uppercase font-bold text-[#009193] bg-[#009193]/5 border-[#009193]/10">{s.shipment_type?.replace('_',' ')}</Badge>
                    <div className="text-right">
                      {s.shipped_date && <p className="text-[10px] font-mono text-[#009193] font-bold">Shipped: {format(new Date(s.shipped_date), "dd MMM yyyy")}</p>}
                      <p className="text-[9px] font-mono text-slate-400">Created: {format(new Date(s.created_at), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#009193] group-hover:bg-[#009193] group-hover:text-white transition-all"><Truck className="h-5 w-5" /></div>
                    <div><p className="text-xs font-bold text-slate-800">{s.origin?.name || "Office"} → {s.destination?.name || "Target"}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.carrier_name || "Self Delivery"}</p></div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><History className="h-3 w-3" /> {hwCount} Units</div>
                      {typeStrings.length > 0 && <span className="text-[9px] font-bold text-[#009193]">{typeStrings.join(', ')}</span>}
                    </div>
                     <Badge className={cn("text-[9px] uppercase border-none px-2", 
                       s.status === 'delivered' 
                         ? "bg-green-50 text-green-600" 
                         : (s.status === 'in_transit' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600")
                     )}>{s.status?.replace('_',' ')}</Badge>
                  </div>
                </div>
              )})}
            </div>
          </TabsContent>
          
          {/* OUTBOUND TAB */}
          <TabsContent value="outbound" className="mt-0 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <Tabs value={outboundSubTab} onValueChange={(v)=>setParam("sub", v)} className="w-fit">
                  <TabsList className="bg-slate-100 p-1 h-9">
                    <TabsTrigger value="awaiting" className="text-xs px-4 data-[state=active]:bg-white">Awaiting Dispatch ({shipments.filter(s => s.shipment_type === 'outbound' && (s.status === 'awaiting dispatch' || s.status === 'upcoming') && (portfolioFilter === "ALL" || s.ops_hardware_movements?.some((m: any) => m.hardwares?.category?.toUpperCase() === portfolioFilter))).length})</TabsTrigger>
                    <TabsTrigger value="intransit" className="text-xs px-4 data-[state=active]:bg-white">In Transit ({shipments.filter(s => s.shipment_type === 'outbound' && s.status === 'in_transit' && (portfolioFilter === "ALL" || s.ops_hardware_movements?.some((m: any) => m.hardwares?.category?.toUpperCase() === portfolioFilter))).length})</TabsTrigger>
                    <TabsTrigger value="shipped" className="text-xs px-4 data-[state=active]:bg-white">Fulfilled ({shipments.filter(s => s.shipment_type === 'outbound' && s.status === 'delivered' && (portfolioFilter === "ALL" || s.ops_hardware_movements?.some((m: any) => m.hardwares?.category?.toUpperCase() === portfolioFilter))).length})</TabsTrigger>
                  </TabsList>
                </Tabs>
                {outboundSubTab !== 'awaiting' && (
                  <Select value={outboundOriginFilter} onValueChange={setOutboundOriginFilter}>
                    <SelectTrigger className="h-9 w-[180px] text-xs bg-slate-50 border-slate-200">
                      <SelectValue placeholder="Origin Office" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Origins</SelectItem>
                      {internalOffices.map(off => (
                        <SelectItem key={off.id} value={off.id}>{off.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="h-9 w-[180px] text-xs bg-slate-50 border-slate-200">
                    <Calendar className="h-3 w-3 mr-2 text-slate-400" />
                    <SelectValue placeholder="All Months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Time</SelectItem>
                    {availableMonths.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-full md:w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search destinations..." className="pl-9 h-9 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {outboundShipments.map(s => {
                const hwCount = s.ops_hardware_movements?.length || 0;
                const types = s.ops_hardware_movements?.reduce((acc: any, m: any) => {
                  const type = m.hardwares?.hardware_type?.toUpperCase() || 'UNKNOWN';
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                }, {});
                const typeStrings = types ? Object.entries(types).map(([k, v]) => `${v} ${k}`) : [];

                return (
                  <div key={s.id} className="premium-card glass p-4 border border-slate-100 hover:border-[#009193]/30 transition-all cursor-pointer group" onClick={() => handleEditShipment(s)}>
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="outline" className="text-[9px] uppercase font-bold text-[#009193] bg-[#009193]/5 border-[#009193]/10">OUTBOUND</Badge>
                      <div className="text-right font-semibold">
                        {s.status === 'delivered' ? (
                          s.shipped_date ? <p className="text-[10px] font-mono text-[#009193] font-bold">Delivered: {format(new Date(s.shipped_date), "dd MMM yyyy")}</p> : <p className="text-[10px] font-mono text-[#009193] font-bold">Delivered</p>
                        ) : s.status === 'in_transit' ? (
                          s.shipped_date ? <p className="text-[10px] font-mono text-[#009193] font-bold">In Transit: {format(new Date(s.shipped_date), "dd MMM yyyy")}</p> : <p className="text-[10px] font-mono text-[#009193] font-bold">In Transit</p>
                        ) : (
                          <p className="text-[10px] font-mono text-amber-600 font-bold">Waiting to be shipped</p>
                        )}
                        <p className="text-[9px] font-mono text-slate-400">Created: {format(new Date(s.created_at), "dd MMM yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#009193] group-hover:bg-[#009193] group-hover:text-white transition-all"><Truck className="h-5 w-5" /></div>
                      <div><p className="text-xs font-bold text-slate-800">{s.origin?.name || "Office"} → {s.destination?.name || "Target"}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.carrier_name || "Self Delivery"}</p></div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><History className="h-3 w-3" /> {hwCount} Units</div>
                        {typeStrings.length > 0 && <span className="text-[9px] font-bold text-[#009193]">{typeStrings.join(', ')}</span>}
                      </div>
                      <Badge className={cn("text-[9px] uppercase border-none px-2", 
                        s.status === 'delivered' 
                          ? "bg-green-50 text-green-600" 
                          : (s.status === 'in_transit' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600")
                      )}>{s.status?.replace('_',' ')}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* SHIPMENT MODAL */}
      <Dialog open={showShipmentModal} onOpenChange={setShowShipmentModal}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white border-none shadow-2xl">
          <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-3 text-[#009193] font-bold text-xl"><Truck className="h-6 w-6" /> {editingShipmentId ? "Edit Logistics Record" : "New Movement Cycle"}</DialogTitle>
            <DialogDescription className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Select Origin/Destination and pick devices to fulfill.</DialogDescription>
          </DialogHeader>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
            <div className="space-y-4">
               <p className="text-[10px] font-bold uppercase text-[#009193] tracking-widest border-b pb-1">1. Logistics Route</p>
               <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Origin (Warehouse/Office)</Label><Select value={shipmentForm.origin_location_id} onValueChange={(v)=>setShipmentForm({...shipmentForm, origin_location_id: v})}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick Origin" /></SelectTrigger><SelectContent>{internalOffices.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
                   <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Destination (Site/Office)</Label><Select value={shipmentForm.destination_location_id} onValueChange={(v)=>setShipmentForm({...shipmentForm, destination_location_id: v})}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick Destination" /></SelectTrigger><SelectContent>{locations.map(l=><SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
               </div>
               <div className="space-y-4 pt-2">
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase text-slate-400">Delivery Mode</Label>
                     <Select value={deliveryMode} onValueChange={(v: any)=>setDeliveryMode(v)}>
                       <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="carrier">Via Carrier</SelectItem>
                         <SelectItem value="in_person">Deliver In Person</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase text-slate-400">
                       {deliveryMode === 'carrier' ? 'Select Carrier' : 'Person Name'}
                     </Label>
                     {deliveryMode === 'carrier' ? (
                       <Select value={deliveryDetail} onValueChange={setDeliveryDetail}>
                         <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                         <SelectContent>
                           <SelectItem value="DHL">DHL</SelectItem>
                           <SelectItem value="FedEx">FedEx</SelectItem>
                           <SelectItem value="UPS">UPS</SelectItem>
                           <SelectItem value="TNT">TNT</SelectItem>
                           <SelectItem value="Other">Other</SelectItem>
                         </SelectContent>
                       </Select>
                     ) : (
                       <Input 
                        placeholder="John Doe..." 
                        className="h-9 text-xs" 
                        value={deliveryDetail} 
                        onChange={(e)=>setDeliveryDetail(e.target.value)} 
                       />
                     )}
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Freight Cost</Label><Input type="number" className="h-9 text-xs" value={shipmentForm.total_shipping_cost} onChange={(e)=>setShipmentForm({...shipmentForm, total_shipping_cost: e.target.value})} /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Status</Label><Select value={shipmentForm.status} onValueChange={(v)=>setShipmentForm({...shipmentForm, status: v})}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{SHIPMENT_STATUSES.map(s=><SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>)}</SelectContent></Select></div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Tracking Number</Label><Input placeholder="AB1234567" className="h-9 text-xs" value={shipmentForm.tracking_number} onChange={(e)=>setShipmentForm({...shipmentForm, tracking_number: e.target.value})} /></div>
                 <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-slate-400">Shipped Date</Label><Input type="date" className="h-9 text-xs" value={shipmentForm.shipped_date} onChange={(e)=>setShipmentForm({...shipmentForm, shipped_date: e.target.value})} /></div>
               </div>
               <div className="space-y-2">
                 <Label className="text-[10px] font-bold uppercase text-slate-400">Shipped By</Label>
                 <Select value={shipmentForm.shipped_by || "none"} onValueChange={(v)=>setShipmentForm({...shipmentForm, shipped_by: v === "none" ? "" : v})}>
                   <SelectTrigger className="h-9 text-xs">
                     <SelectValue placeholder="Select PM / Operator" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="none">None / Unassigned</SelectItem>
                     {profiles.map((p: any) => (
                       <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
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
