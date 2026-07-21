import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Wind, Zap, Monitor, ChevronRight, ChevronDown, X, Table as TableIcon } from "lucide-react";
import { ExcelFilterButton } from "@/components/common/ExcelFilterButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { Plus, LayoutGrid, Upload, Search, Package, Link2Off, Loader2 } from "lucide-react";
import { AssignToSiteDialog } from "@/components/hardwares/AssignToSiteDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";

export default function Hardwares() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hardwares, setHardwares] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [newHardware, setNewHardware] = useState({
    device_id: "",
    mac_address: "",
    product_id: "",
    status: "In Stock"
  });

  const [assignment, setAssignment] = useState({
    hardware_id: "",
    site_id: "",
    notes: ""
  });
  const [isAssigning, setIsAssigning] = useState(false);

  const [detailedHardware, setDetailedHardware] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [colFilters, setColFilters] = useState<Record<string, { selectedValues: string[] | undefined; sort: 'asc'|'desc'|null }>>({});
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null); // 'AIR' | 'Energy' | 'Internal'
  const [kpiExpandedOffice, setKpiExpandedOffice] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data: hwData } = await (supabase as any)
      .from("hardwares")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: prodData } = await supabase.from("products" as any).select("id, name");
    const { data: siteData } = await supabase.from("sites").select("id, name, country").neq("status", "canceled");
    const { data: devData } = await (supabase as any)
      .from("devices")
      .select("device_id, status, last_seen");

    // Merge online status + last_seen from devices table into hardwares by device_id
    const onlineMap: Record<string, { online_status: string | null; last_seen: string | null }> = {};
    (devData || []).forEach((d: any) => {
      onlineMap[String(d.device_id)] = {
        online_status: d.status ?? null,   // devices.status = 'online' | 'offline' | 'warning' etc.
        last_seen: d.last_seen ?? null,
      };
    });
    const merged = (hwData || []).map((h: any) => ({
      ...h,
      online_status: onlineMap[String(h.device_id)]?.online_status ?? null,
      last_seen: onlineMap[String(h.device_id)]?.last_seen ?? null,
    }));

    setHardwares(merged);
    setProducts(prodData || []);
    setSites(siteData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getHwCategory = (h: any) => {
    if (!h) return "AIR";
    if (h.category) return h.category;
    const prod = products.find((p: any) => p.id === h.product_id);
    return prod?.category || "AIR";
  };

  const filteredHardwares = (() => {
    let list = hardwares.filter(h => {
      const matchesSearch = h.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (h.mac_address && h.mac_address.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (products.find((p: any) => p.id === h.product_id)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !selectedCategory || getHwCategory(h) === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Apply per-column Excel filters
    const applyCol = (key: string, getValue: (h: any) => string) => {
      const f = colFilters[key];
      if (f?.selectedValues !== undefined) {
        list = list.filter(h => f.selectedValues!.includes(getValue(h)));
      }
      if (f?.sort === 'asc') list = [...list].sort((a, b) => getValue(a).localeCompare(getValue(b), undefined, { numeric: true }));
      if (f?.sort === 'desc') list = [...list].sort((a, b) => getValue(b).localeCompare(getValue(a), undefined, { numeric: true }));
    };

    applyCol('device_id', h => String(h.device_id));
    applyCol('catalog', h => products.find((p: any) => p.id === h.product_id)?.name || 'Unknown');
    applyCol('type', h => h.hardware_type || '-');
    applyCol('po', h => h.po || '-');
    applyCol('status', h => h.status || '-');
    applyCol('location', h => {
      if (h.site_id) {
        const site = sites.find((s: any) => s.id === h.site_id);
        return site?.country || h.country || '(Blanks)';
      }
      return h.country || '(Blanks)';
    });
    applyCol('created', h => new Date(h.created_at).toLocaleDateString());

    return list;
  })();

  const colValues = (getValue: (h: any) => string) =>
    [...new Set(hardwares.map(getValue))].filter(Boolean).sort();

  const setCol = (key: string) => (next: { selectedValues: string[] | undefined; sort: 'asc'|'desc'|null }) =>
    setColFilters(prev => ({ ...prev, [key]: next }));

  const getCol = (key: string) => colFilters[key] || { selectedValues: undefined, sort: null };

  // Summary Metrics
  const totalUnits = hardwares.length;
  
  const handleUnassign = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("hardwares")
        .update({ 
          site_id: null, 
          status: "In Stock" 
        })
        .eq("id", id);

      if (error) throw error;
      
      toast({ 
        title: "Hardware Unassigned", 
        description: "Unit has been returned to global stock successfully." 
      });
      
      setDetailedHardware(null);
      fetchData();
    } catch (err: any) {
      toast({ 
        title: "Unassignment Failed", 
        description: err.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };
  // AIR Metrics (exclude Internal Use)
  const airTotal = hardwares.filter(h => getHwCategory(h) === 'AIR' && h.status !== 'Internal Use').length;
  const airStock = hardwares.filter(h => getHwCategory(h) === 'AIR' && h.status === 'In Stock').length;
  const airAssigned = hardwares.filter(h => getHwCategory(h) === 'AIR' && h.status === 'Assigned').length;

  // Energy Metrics (exclude Internal Use)
  const energyTotal = hardwares.filter(h => getHwCategory(h) === 'Energy' && h.status !== 'Internal Use').length;
  const energyStock = hardwares.filter(h => getHwCategory(h) === 'Energy' && h.status === 'In Stock').length;
  const energyAssigned = hardwares.filter(h => getHwCategory(h) === 'Energy' && h.status === 'Assigned').length;

  // Internal Use Metrics
  const internalItems = hardwares.filter(h => h.status === 'Internal Use');
  const internalTotal = internalItems.length;

  // Helper: get office breakdown for a given set of devices
  const getKpiOfficeBreakdown = (items: any[]) => {
    const groups: Record<string, {
      total: number;
      byType: Record<string, { stock: number; assigned: number; internal: number; devices: any[] }>;
    }> = {};
    items.forEach(h => {
      const office = getOfficeName(h);
      if (!groups[office]) groups[office] = { total: 0, byType: {} };
      groups[office].total++;
      const typ = h.hardware_type || 'Unknown';
      if (!groups[office].byType[typ]) groups[office].byType[typ] = { stock: 0, assigned: 0, internal: 0, devices: [] };
      if (h.status === 'In Stock') groups[office].byType[typ].stock++;
      else if (h.status === 'Assigned') groups[office].byType[typ].assigned++;
      else if (h.status === 'Internal Use') groups[office].byType[typ].internal++;
      groups[office].byType[typ].devices.push(h);
    });
    return Object.entries(groups)
      .map(([officeName, info]) => ({ officeName, ...info }))
      .sort((a, b) => b.total - a.total);
  };

  const getKpiItems = (kpi: string) => {
    if (kpi === 'Internal') return internalItems;
    // Exclude Internal Use devices from AIR/Energy breakdowns
    return hardwares.filter(h => getHwCategory(h) === kpi && h.status !== 'Internal Use');
  };

  const getOfficeName = (h: any) => {
    const reg = h.region || '';
    if (reg === 'Europe' || reg === 'Middle-East') return 'Italy Office';
    if (reg === 'APAC') return 'China Office';
    if (reg === 'America') return 'USA Office';
    
    // Fallback based on country
    const c = (h.country || '').toLowerCase();
    if (c.includes('italy')) return 'Italy Office';
    if (c.includes('china')) return 'China Office';
    if (c.includes('usa') || c.includes('united states')) return 'USA Office';
    return 'Other / Unspecified';
  };

  const getDisplayLocation = (h: any) => {
    if (!h) return "Unspecified";
    if (h.status === 'Assigned' || h.status === 'Delivered') {
      const site = sites.find((s: any) => s.id === h.site_id);
      return site?.name || h.country || "Assigned Project";
    }
    if (h.status === 'In Stock') {
      return getOfficeName(h);
    }
    return h.country || "Global Stock";
  };

  const getHierarchicalBreakdown = (cat: string) => {
    const items = hardwares.filter(h => getHwCategory(h) === cat && (h.status === 'In Stock' || h.status === 'Assigned'));
    const groups: Record<string, { 
      total: number; 
      available: number; 
      assigned: number; 
      typologies: Record<string, { available: number; assigned: number }>;
      devices: Array<{ id: string; device_id: string; hardware_type: string; status: string; siteName?: string; country?: string }>
    }> = {};
    
    items.forEach(i => {
      const office = getOfficeName(i);
      if (!groups[office]) {
        groups[office] = { total: 0, available: 0, assigned: 0, typologies: {}, devices: [] };
      }
      
      groups[office].total++;
      
      const type = i.hardware_type || 'Unknown';
      if (!groups[office].typologies[type]) {
        groups[office].typologies[type] = { available: 0, assigned: 0 };
      }
      
      let siteName = undefined;
      let country = undefined;
      
      if (i.status === 'In Stock') {
        groups[office].available++;
        groups[office].typologies[type].available++;
      } else if (i.status === 'Assigned') {
        groups[office].assigned++;
        groups[office].typologies[type].assigned++;
        
        if (i.site_id) {
          const site = sites.find(s => s.id === i.site_id);
          siteName = site?.name || 'Active Project';
          country = site?.country || i.country || 'Unspecified';
        }
      }
      
      groups[office].devices.push({
        id: i.id,
        device_id: i.device_id,
        hardware_type: type,
        status: i.status,
        siteName,
        country
      });
    });

    return Object.entries(groups)
      .map(([officeName, info]) => ({
        officeName,
        total: info.total,
        available: info.available,
        assigned: info.assigned,
        typologyList: Object.entries(info.typologies).map(([name, counts]) => ({ name, ...counts })),
        devicesList: info.devices.sort((a, b) => a.device_id.localeCompare(b.device_id))
      }))
      .sort((a, b) => b.total - a.total);
  };

  const handleAddHardware = async () => {
    if (!newHardware.device_id || !newHardware.product_id) {
      toast({ title: "Validation Error", description: "Device ID and Product are required", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).from("hardwares").insert([{
      device_id: newHardware.device_id,
      mac_address: newHardware.mac_address || null,
      product_id: newHardware.product_id,
      status: newHardware.status
    }]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Hardware added successfully" });
      setIsAdding(false);
      setNewHardware({ device_id: "", mac_address: "", product_id: "", status: "In Stock" });
      fetchData();
    }
  };

  const handleAssignHardware = async () => {
    if (!assignment.hardware_id || !assignment.site_id) {
      toast({ title: "Validation Error", description: "Hardware and Site are required", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("hardwares")
      .update({
        site_id: assignment.site_id,
        status: "Assigned",
        notes: assignment.notes ? `PM Assignment: ${assignment.notes}` : null
      })
      .eq('id', assignment.hardware_id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Assigned!", description: "Hardware moved to site successfully." });
      setIsAssigning(false);
      setAssignment({ hardware_id: "", site_id: "", notes: "" });
      fetchData();
    }
  };

  const handleSaveLogistics = async () => {
    if (!detailedHardware) return;

    const { error } = await (supabase as any)
      .from("hardwares")
      .update({
        ["shipment_mode"]: detailedHardware.shipment_mode,
        ["carrier_name"]: detailedHardware.carrier_name,
        ["tracking_number"]: detailedHardware.tracking_number,
        ["delivery_person"]: detailedHardware.delivery_person,
        ["shipment_date"]: new Date().toISOString()
      })
      .eq('id', detailedHardware.id);

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Shipment Recorded", description: "Logistics data saved successfully." });
      setDetailedHardware(null);
      fetchData();
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File selected:", file.name);

    if (products.length === 0) {
      toast({ title: "Catalog not loaded", description: "Wait a moment for the DB to load.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        console.log("Reading file buffer...");
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: "array" });

        const getProductId = (type: any) => {
          const t = String(type || "").toLowerCase().trim();
          if (!t) return null;

          if (t.includes("co2")) return (products as any[]).find(p => p.name.toUpperCase().includes("CO2"))?.id;
          if (t.includes("well")) return (products as any[]).find(p => p.name.toUpperCase().includes("WELL"))?.id;
          if (t.includes("leed")) return (products as any[]).find(p => p.name.toUpperCase().includes("LEED"))?.id;
          
          if (t.includes("fgb") || t.includes("bridge") || t.includes("meter") || t.includes("greeny")) {
            return (products as any[]).find(p => p.name.toUpperCase().includes("GREENY") || p.name.toUpperCase().includes("ENERGY"))?.id;
          }
          return null;
        };

        const allItems: any[] = [];
        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];

          rows.forEach(row => {
            const deviceId = row.ID || row["Sensor ID"] || row["Serial"];
            const rawType = row.TYPE || row["Hardware type"] || row["Category"];

            if (deviceId) {
              const productId = getProductId(rawType);
              if (productId) {
                allItems.push({
                  device_id: String(deviceId),
                  mac_address: row.MAC ? String(row.MAC) : null,
                  product_id: productId,
                  status: "In Stock",
                  country: row.Place || row.Country || row.Region || null,
                  notes: row.Notes || null
                });
              }
            }
          });
        });

        if (allItems.length === 0) {
          toast({ title: "No Matches", description: "Check if columns ID/TYPE exist.", variant: "destructive" });
          return;
        }

        // Upsert uses device_id as the unique key to prevent duplicates
        const { error } = await (supabase as any).from("hardwares").upsert(allItems, { onConflict: 'device_id' });
        if (error) {
          toast({ title: "DB Error", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Import Success!", description: `Added ${allItems.length} records.` });
          fetchData();
        }
      } catch (err: any) {
        toast({ title: "Parser Error", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <MainLayout title="Hardwares" subtitle="Management of physical devices and serialization">
      <div className="mb-6 flex justify-between items-center gap-4">
        <Button
          variant="outline"
          className="glass border-[#009193]/20 text-[#009193] flex items-center gap-2"
          onClick={() => navigate("/inventory")}
        >
          <LayoutGrid className="h-4 w-4" /> View Stock Summary
        </Button>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-[#009193] transition-colors" />
            <Input
              placeholder="Search serial or MAC..."
              className="pl-9 w-64 glass border-[#009193]/10 focus:border-[#009193]/30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>


          <div className="flex gap-2">
            <Dialog open={isAdding} onOpenChange={setIsAdding}>
              <DialogTrigger asChild>
                <Button className="tb-button primary">
                  <Plus className="h-4 w-4 mr-2" /> Register Hardware
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-heavy sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Inventory</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Device ID (Serial)</Label>
                    <Input 
                      value={newHardware.device_id} 
                      onChange={(e) => setNewHardware({ ...newHardware, device_id: e.target.value })} 
                      placeholder="e.g. SN-998122" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>MAC Address</Label>
                    <Input value={newHardware.mac_address} onChange={(e) => setNewHardware({ ...newHardware, mac_address: e.target.value })} placeholder="e.g. 00:1B:44..." />
                  </div>
                  <div className="grid gap-2">
                    <Label>Product Catalog</Label>
                    <Select onValueChange={(val) => setNewHardware({ ...newHardware, product_id: val })}>
                      <SelectTrigger><SelectValue placeholder="Select device type" /></SelectTrigger>
                      <SelectContent>{products.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleAddHardware} className="w-full tb-button primary mt-2">Register Asset</Button>
              </DialogContent>
            </Dialog>

          <Button
            variant="outline"
            className="border-[#009193]/30 text-[#009193] hover:bg-[#009193]/5"
            onClick={() => setIsAssigning(true)}
          >
            <Package className="h-4 w-4 mr-2" /> Assign to Site
          </Button>
          <AssignToSiteDialog
            open={isAssigning}
            onOpenChange={setIsAssigning}
            hardwares={hardwares}
            onSaved={fetchData}
          />
          </div>
        </div>
      </div>

      {/* KPI Command Center */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Total Card */}
        <div 
          onClick={() => { setSelectedCategory(null); setSelectedKpi(null); setKpiExpandedOffice(null); }}
          className={`premium-card glass p-5 flex items-center gap-3 transition-all cursor-pointer hover:shadow-lg border-2 ${!selectedCategory && !selectedKpi ? 'border-[#009193] bg-[#009193]/5' : 'border-transparent'}`}
        >
          <div className="h-11 w-11 rounded-full bg-[#009193]/10 flex items-center justify-center shrink-0">
            <LayoutGrid className="h-5 w-5 text-[#009193]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total</p>
            <p className="text-3xl font-bold text-foreground">{totalUnits}</p>
            <div className="flex gap-1.5 mt-1">
              <Badge variant="outline" className="text-[9px] border-blue-500/20 text-blue-600 px-1 py-0">{airTotal} AIR</Badge>
              <Badge variant="outline" className="text-[9px] border-orange-500/20 text-orange-600 px-1 py-0">{energyTotal} ENRG</Badge>
            </div>
          </div>
        </div>

        {/* AIR Card */}
        <div 
          onClick={() => { setSelectedCategory('AIR'); setSelectedKpi('AIR'); setKpiExpandedOffice(null); }}
          className={`premium-card glass p-5 flex items-center gap-3 transition-all cursor-pointer hover:shadow-lg border-2 ${selectedKpi === 'AIR' ? 'border-blue-600 bg-blue-500/5' : 'border-transparent'}`}
        >
          <div className="h-11 w-11 rounded-full bg-blue-600/10 flex items-center justify-center shrink-0">
            <Wind className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">AIR Stock</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-blue-600">{airStock}</p>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Available stock</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">Assigned: {airAssigned}</span>
              <div className="w-16 h-1 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${airTotal > 0 ? (airAssigned/airTotal)*100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Energy Card */}
        <div 
          onClick={() => { setSelectedCategory('Energy'); setSelectedKpi('Energy'); setKpiExpandedOffice(null); }}
          className={`premium-card glass p-5 flex items-center gap-3 transition-all cursor-pointer hover:shadow-lg border-2 ${selectedKpi === 'Energy' ? 'border-orange-600 bg-orange-500/5' : 'border-transparent'}`}
        >
          <div className="h-11 w-11 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Energy Stock</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-orange-600">{energyStock}</p>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Available stock</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">Assigned: {energyAssigned}</span>
              <div className="w-16 h-1 bg-orange-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-600 transition-all" style={{ width: `${energyTotal > 0 ? (energyAssigned/energyTotal)*100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Internal Use Card */}
        <div 
          onClick={() => { setSelectedKpi('Internal'); setSelectedCategory(null); setKpiExpandedOffice(null); }}
          className={`premium-card glass p-5 flex items-center gap-3 transition-all cursor-pointer hover:shadow-lg border-2 ${selectedKpi === 'Internal' ? 'border-purple-600 bg-purple-500/5' : 'border-transparent'}`}
        >
          <div className="h-11 w-11 rounded-full bg-purple-600/10 flex items-center justify-center shrink-0">
            <Monitor className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Internal Use</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-purple-600">{internalTotal}</p>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">units</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold mt-1">Display / Other Internal Use</p>
          </div>
        </div>
      </div>

      {/* KPI Drill-Down Panel */}
      {selectedKpi && (() => {
        const kpiItems = getKpiItems(selectedKpi);
        const officeBreakdown = getKpiOfficeBreakdown(kpiItems);
        const kpiColor = selectedKpi === 'AIR' ? 'blue' : selectedKpi === 'Energy' ? 'orange' : 'purple';
        const kpiLabel = selectedKpi === 'AIR' ? 'AIR' : selectedKpi === 'Energy' ? 'Energy' : 'Internal Use';
        return (
          <div className="mb-8 animate-in slide-in-from-top-2">
            {/* Office Breakdown Row */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                {kpiLabel} — Office Breakdown
              </h3>
              <button 
                onClick={() => { setSelectedKpi(null); setKpiExpandedOffice(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-3 mb-4">
              {officeBreakdown.map(({ officeName, total, byType }) => {
                const isActive = kpiExpandedOffice === officeName;
                const stockCount = Object.values(byType).reduce((s, t) => s + t.stock, 0);
                const assignedCount = Object.values(byType).reduce((s, t) => s + t.assigned, 0);
                const internalCount = Object.values(byType).reduce((s, t) => s + t.internal, 0);
                return (
                  <button
                    key={officeName}
                    onClick={() => setKpiExpandedOffice(isActive ? null : officeName)}
                    className={`flex-1 rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${
                      isActive
                        ? `border-${kpiColor}-500 bg-${kpiColor}-50/50 dark:bg-${kpiColor}-950/20 shadow-sm`
                        : 'border-slate-100 dark:border-slate-900 bg-white/60 dark:bg-slate-950/60 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-foreground">{officeName}</p>
                      {isActive 
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {selectedKpi === 'Internal' ? internalCount : (stockCount + assignedCount)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {stockCount > 0 && <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold px-1.5">{stockCount} Stock</Badge>}
                      {assignedCount > 0 && <Badge className="bg-amber-100 text-amber-800 border-none text-[9px] font-bold px-1.5">{assignedCount} Assigned</Badge>}
                      {internalCount > 0 && <Badge className="bg-purple-100 text-purple-800 border-none text-[9px] font-bold px-1.5">{internalCount} Internal</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Typology Split Columns */}
            {kpiExpandedOffice && (() => {
              const officeData = officeBreakdown.find(o => o.officeName === kpiExpandedOffice);
              if (!officeData) return null;
              const typologies = Object.entries(officeData.byType);
              return (
                <div className="rounded-2xl border border-slate-100 dark:border-slate-900 bg-white/50 dark:bg-slate-950/50 p-5 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-foreground">{kpiExpandedOffice} — Device Detail</h4>
                    <Badge variant="outline" className="text-[10px] font-bold">{officeData.total} total units</Badge>
                  </div>
                  <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${typologies.length}, minmax(0, 1fr))` }}>
                    {typologies.map(([typName, counts]) => (
                      <div key={typName} className="flex flex-col rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                        {/* Column Header */}
                        <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">{typName}</span>
                          <Badge variant="outline" className="text-[9px] font-bold">{counts.stock + counts.assigned + counts.internal}</Badge>
                        </div>

                        {/* In Stock Section */}
                        {counts.stock > 0 && (
                          <div className="flex-1">
                            <div className="px-3 py-1.5 bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30">
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">In Stock ({counts.stock})</span>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-900 max-h-52 overflow-y-auto">
                              {counts.devices
                                .filter(d => d.status === 'In Stock')
                                .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)))
                                .map((d: any) => (
                                  <div key={d.id} className="px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="font-mono text-[11px] font-semibold text-foreground">{d.device_id}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Assigned Section */}
                        {counts.assigned > 0 && (
                          <div className="flex-1">
                            <div className="px-3 py-1.5 bg-amber-50/80 dark:bg-amber-950/20 border-y border-amber-100 dark:border-amber-900/30">
                              <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Assigned ({counts.assigned})</span>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-900 max-h-52 overflow-y-auto">
                              {counts.devices
                                .filter(d => d.status === 'Assigned')
                                .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)))
                                .map((d: any) => {
                                  const site = sites.find((s: any) => s.id === d.site_id);
                                  return (
                                    <div key={d.id} className="px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                      <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                        <span className="font-mono text-[11px] font-semibold text-foreground">{d.device_id}</span>
                                      </div>
                                      {site && <p className="text-[10px] text-muted-foreground pl-3.5 truncate">{site.name}</p>}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Internal Use Section */}
                        {counts.internal > 0 && (
                          <div className="flex-1">
                            <div className="px-3 py-1.5 bg-purple-50/80 dark:bg-purple-950/20 border-y border-purple-100 dark:border-purple-900/30">
                              <span className="text-[9px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">Internal Use ({counts.internal})</span>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-900 max-h-52 overflow-y-auto">
                              {counts.devices
                                .filter(d => d.status === 'Internal Use')
                                .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)))
                                .map((d: any) => (
                                  <div key={d.id} className="px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                    <div className="flex items-center gap-2">
                                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                                      <span className="font-mono text-[11px] font-semibold text-foreground">{d.device_id}</span>
                                    </div>
                                    {d.notes && <p className="text-[10px] text-muted-foreground pl-3.5 truncate">{d.notes}</p>}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Legacy Category Breakdown (shown when category is selected but not via KPI panel) */}
      {selectedCategory && !selectedKpi && (
        <div className="mb-8 space-y-4 animate-in slide-in-from-top-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">Location Breakdown</h3>
          {getHierarchicalBreakdown(selectedCategory).map(({ officeName, total, available, assigned, typologyList, devicesList }) => {
            const isExpanded = expandedOffice === officeName;
            return (
              <div 
                key={officeName} 
                className={`rounded-xl border transition-all ${
                  isExpanded 
                    ? 'bg-slate-50/50 dark:bg-slate-900/30 border-[#009193]/30 shadow-sm' 
                    : 'bg-white/60 dark:bg-slate-950/60 border-slate-100 dark:border-slate-900 hover:border-slate-200'
                }`}
              >
                <div 
                  onClick={() => setExpandedOffice(isExpanded ? null : officeName)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-[#009193]">
                      <TableIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold tracking-tight text-foreground">{officeName}</h4>
                      <p className="text-[10px] text-muted-foreground font-semibold">{total} Total Units</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold px-1.5 py-0.5">{available} Available</Badge>
                      <Badge className="bg-amber-100 text-amber-800 border-none text-[9px] font-bold px-1.5 py-0.5">{assigned} Assigned</Badge>
                    </div>
                    <span className="text-muted-foreground text-xs font-bold">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100/50 dark:border-slate-900/50 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {typologyList.map((t) => (
                        <div key={t.name} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-200/50 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          <span>{t.name}</span>
                          <span className="h-3 w-px bg-slate-300" />
                          <span className="text-emerald-600">{t.available} In Stock</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                          <span className="text-amber-600">{t.assigned} Assigned</span>
                        </div>
                      ))}
                    </div>
                    <div className="border border-slate-100 dark:border-slate-900 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-900">
                      {devicesList.map((dev) => (
                        <div key={dev.id} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{dev.device_id}</span>
                            <Badge variant="outline" className="text-[9px] py-0">{dev.hardware_type}</Badge>
                          </div>
                          <div>
                            {dev.status === 'In Stock'
                              ? <span className="text-emerald-600 font-bold text-[10px] uppercase">In Stock</span>
                              : <span className="text-amber-600 font-semibold text-[10px]">→ {dev.siteName} {dev.country ? `(${dev.country})` : ''}</span>
                            }
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
      )}

      <div className="premium-card glass p-6">
        <Tabs value={selectedCategory || "ALL"} onValueChange={(val) => setSelectedCategory(val === "ALL" ? null : val)} className="w-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <TableIcon className="h-5 w-5 text-[#009193]" />
                <h3 className="font-bold tracking-tight">{selectedCategory ? `${selectedCategory} Registry` : 'Global Hardware Registry'}</h3>
              </div>
            </div>

            <TabsList className="bg-[#009193]/5 border border-[#009193]/10">
              <TabsTrigger value="ALL" className="text-[11px] font-bold uppercase tracking-tight px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white">All Assets</TabsTrigger>
              <TabsTrigger value="AIR" className="text-[11px] font-bold uppercase tracking-tight px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white">AIR Portfolio</TabsTrigger>
              <TabsTrigger value="Energy" className="text-[11px] font-bold uppercase tracking-tight px-6 data-[state=active]:bg-[#009193] data-[state=active]:text-white">Energy Portfolio</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={selectedCategory || "ALL"} className="mt-0">
            {loading ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#009193]" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-[#009193]/10">
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Device ID" values={colValues(h => String(h.device_id))} state={getCol('device_id')} onChange={setCol('device_id')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Catalog Name" values={colValues(h => products.find((p: any) => p.id === h.product_id)?.name || 'Unknown')} state={getCol('catalog')} onChange={setCol('catalog')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Type" values={colValues(h => h.hardware_type || '-')} state={getCol('type')} onChange={setCol('type')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="PO #" values={colValues(h => h.po || '-')} state={getCol('po')} onChange={setCol('po')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Status" values={colValues(h => h.status || '-')} state={getCol('status')} onChange={setCol('status')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Location" values={colValues(h => { if (h.site_id) { const s = sites.find((s: any) => s.id === h.site_id); return s?.country || h.country || '(Blanks)'; } return h.country || '(Blanks)'; })} state={getCol('location')} onChange={setCol('location')} />
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold py-2">
                      <ExcelFilterButton label="Created" values={colValues(h => new Date(h.created_at).toLocaleDateString())} state={getCol('created')} onChange={setCol('created')} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHardwares.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No records found for {selectedCategory}.</TableCell></TableRow>
                  ) : (
                    filteredHardwares.map((item) => (
                      <TableRow 
                        key={item.id} 
                        className="hover:bg-[#009193]/5 transition-colors group cursor-pointer"
                        onClick={() => setDetailedHardware(item)}
                      >
                        <TableCell className="font-mono text-xs font-bold text-foreground">{item.device_id}</TableCell>
                        <TableCell className="text-xs">{products.find(p => p.id === item.product_id)?.name || "Unknown"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.hardware_type || "-"}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-[#009193]">{item.po || "-"}</TableCell>
                        <TableCell>
                          {item.status === 'Delivered' && item.hardware_type !== 'CO2' && item.online_status ? (
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[10px] font-bold uppercase border-none px-2 py-0.5 ${
                                item.online_status === 'online'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : item.online_status === 'offline'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${
                                  item.online_status === 'online' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.7)]'
                                  : item.online_status === 'offline' ? 'bg-red-500'
                                  : 'bg-slate-400'
                                }`} />
                                {item.online_status}
                              </Badge>
                              {item.last_seen && (
                                <span className="text-[10px] text-muted-foreground font-medium">{timeAgo(item.last_seen)}</span>
                              )}
                            </div>
                          ) : (
                            <Badge className={`text-[10px] uppercase font-bold border-none w-fit px-2 py-0.5 ${
                              item.status === 'Assigned' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' :
                              item.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' :
                              item.status === 'Internal Use' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400' :
                              item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' :
                              'bg-[#009193]/10 text-[#009193]'
                            }`}>
                              {item.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#009193]">
                          {(() => {
                            if (item.site_id) {
                              const site = sites.find((s: any) => s.id === item.site_id);
                              return site?.country || item.country || <span className="text-muted-foreground font-normal italic">Unspecified</span>;
                            }
                            return item.country || <span className="text-muted-foreground font-normal italic">Unspecified</span>;
                          })()}
                        </TableCell>

                        <TableCell className="text-[11px] text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
      {/* Hardware Detail Dialog */}
      <Dialog open={!!detailedHardware} onOpenChange={() => setDetailedHardware(null)}>
        <DialogContent className="glass-heavy sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-[#009193] font-mono">{detailedHardware?.device_id}</span>
              <Badge variant="outline" className="bg-[#009193]/5 text-[#009193] border-[#009193]/20">
                {detailedHardware?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Section 1: Technical Identity */}
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#009193] mb-3 border-b border-[#009193]/10 pb-1">Technical Identity</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Product Model</Label>
                  <p className="text-sm font-bold text-foreground">{detailedHardware?.hardware_type || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">
                    {getHwCategory(detailedHardware) === 'Energy' ? 'Primary Serial (Device ID)' : 'MAC Address'}
                  </Label>
                  <p className="text-sm font-mono font-medium text-foreground">
                    {getHwCategory(detailedHardware) === 'Energy' 
                      ? detailedHardware?.device_id 
                      : (detailedHardware?.mac_address || "-")}
                  </p>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Catalog Reference</Label>
                  <p className="text-sm font-medium text-muted-foreground italic">
                    {products.find(p => p.id === detailedHardware?.product_id)?.name || "Uncategorized Hardware"}
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2: Logistics & Procurement */}
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#009193] mb-3 border-b border-[#009193]/10 pb-1">Logistics & Procurement</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">PO Number</Label>
                  <p className="text-sm font-mono font-bold text-[#009193]">{detailedHardware?.po || "Not Recorded"}</p>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Shipment Mode</Label>
                  <Badge variant="outline" className="mt-1 text-[9px] uppercase font-bold border-muted-foreground/20">
                    {detailedHardware?.shipment_mode || 'Standard Freight'}
                  </Badge>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Shipment Date</Label>
                  <p className="text-sm font-bold text-foreground">
                    {detailedHardware?.shipment_date 
                      ? format(new Date(detailedHardware.shipment_date), 'dd/MM/yyyy') 
                      : (detailedHardware?.status === 'In Stock' ? 'Warehouse Receipt Pending' : 'Not Recorded')}
                  </p>
                </div>
                {detailedHardware?.shipment_mode === 'Courier' ? (
                  <>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Carrier</Label>
                      <p className="text-sm font-bold text-foreground">{detailedHardware?.carrier_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Tracking #</Label>
                      <p className="text-sm font-mono font-bold text-[#009193]">{detailedHardware?.tracking_number || "N/A"}</p>
                    </div>
                  </>
                ) : detailedHardware?.shipment_mode === 'In-Person' ? (
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Delivered By</Label>
                    <p className="text-sm font-bold text-foreground">{detailedHardware?.delivery_person || "N/A"}</p>
                  </div>
                ) : (
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Logistics Details</Label>
                    <p className="text-sm font-medium text-foreground">{detailedHardware?.logistics_details || "N/A"}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Deployment Context */}
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#009193] mb-3 border-b border-[#009193]/10 pb-1">Deployment Context</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Current Status</Label>
                  <div className="mt-1">
                    <Badge className={`text-[9px] uppercase font-bold border-none ${detailedHardware?.status === 'In Stock' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {detailedHardware?.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Location / Country</Label>
                  <p className="text-sm font-bold text-foreground flex items-center gap-1">
                    <Package className="h-3 w-3 text-[#009193]" />
                    {detailedHardware?.status === 'Assigned' || detailedHardware?.status === 'Delivered'
                      ? (sites.find(s => s.id === detailedHardware?.site_id)?.name || detailedHardware?.country || 'Active Project')
                      : detailedHardware?.status === 'In Stock'
                      ? getOfficeName(detailedHardware)
                      : (detailedHardware?.country || "Global Stock")}
                  </p>
                </div>
              </div>
            </div>

            {detailedHardware?.status === 'Assigned' && (
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full gap-2 text-xs font-bold border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300 transition-all shadow-sm"
                  onClick={() => handleUnassign(detailedHardware.id)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                  Unassign from Site & Return to Stock
                </Button>
                <p className="text-[9px] text-muted-foreground mt-2 text-center italic">
                  This will clear the site link and set status back to 'In Stock'.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#009193]/10">
            <Label className="text-[10px] uppercase text-muted-foreground">Notes</Label>
            <div className="mt-1 p-3 rounded bg-[#009193]/5 text-xs text-foreground italic border border-[#009193]/10">
              {detailedHardware?.notes || "No additional notes provided for this unit."}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
