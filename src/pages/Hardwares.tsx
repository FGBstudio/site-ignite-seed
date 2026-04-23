import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
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
import { Plus, Table as TableIcon, LayoutGrid, Upload, Search, Package } from "lucide-react";
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

  const fetchData = async () => {
    setLoading(true);
    const { data: hwData } = await (supabase as any)
      .from("hardwares")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: prodData } = await supabase.from("products" as any).select("id, name");
    const { data: siteData } = await supabase.from("sites").select("id, name");

    setHardwares(hwData || []);
    setProducts(prodData || []);
    setSites(siteData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredHardwares = hardwares.filter(h => {
    const matchesSearch = h.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.mac_address && h.mac_address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (products.find((p: any) => p.id === h.product_id)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = !selectedCategory || h.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Summary Metrics
  const totalUnits = hardwares.length;
  
  // AIR Metrics
  const airTotal = hardwares.filter(h => h.category === 'AIR').length;
  const airStock = hardwares.filter(h => h.category === 'AIR' && h.status === 'In Stock').length;
  const airAssigned = hardwares.filter(h => h.category === 'AIR' && h.status !== 'In Stock').length;

  // Energy Metrics
  const energyTotal = hardwares.filter(h => h.category === 'Energy').length;
  const energyStock = hardwares.filter(h => h.category === 'Energy' && h.status === 'In Stock').length;
  const energyAssigned = hardwares.filter(h => h.category === 'Energy' && h.status !== 'In Stock').length;

  const getHierarchicalBreakdown = (cat: string) => {
    // Only show countries/locations that HAVE items "In Stock"
    const items = hardwares.filter(h => h.category === cat && h.status === 'In Stock');
    const groups: Record<string, Record<string, number>> = {};
    
    items.forEach(i => {
      const loc = i.country || 'Unspecified';
      if (!groups[loc]) groups[loc] = {};
      groups[loc][i.hardware_type] = (groups[loc][i.hardware_type] || 0) + 1;
    });

    return Object.entries(groups).sort((a, b) => {
      const aTotal = Object.values(a[1]).reduce((sum, val) => sum + val, 0);
      const bTotal = Object.values(b[1]).reduce((sum, val) => sum + val, 0);
      return bTotal - aTotal;
    });
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

          <Dialog open={isAssigning} onOpenChange={setIsAssigning}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-[#009193]/30 text-[#009193] hover:bg-[#009193]/5">
                <Package className="h-4 w-4 mr-2" /> Assign to Site
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-heavy sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Project Assignment</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Available Device ID (Stock Only)</Label>
                  <Select onValueChange={(val) => setAssignment({ ...assignment, hardware_id: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Search available inventory..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hardwares
                        .filter(h => h.status === 'In Stock')
                        .map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.device_id} ({h.hardware_type})
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Destination Project / Site</Label>
                  <Select onValueChange={(val) => setAssignment({ ...assignment, site_id: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Assignment Notes (PM)</Label>
                  <Input 
                    placeholder="e.g. For Phase 2 deployment" 
                    value={assignment.notes} 
                    onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })} 
                  />
                </div>
              </div>
              <Button onClick={handleAssignHardware} className="w-full tb-button primary">Confirm Allocation</Button>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {/* KPI Command Center */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Card */}
        <div 
          onClick={() => setSelectedCategory(null)}
          className={`premium-card glass p-6 flex items-center gap-4 transition-all cursor-pointer hover:shadow-lg border-2 ${!selectedCategory ? 'border-[#009193] bg-[#009193]/5' : 'border-transparent'}`}
        >
          <div className="h-12 w-12 rounded-full bg-[#009193]/10 flex items-center justify-center shrink-0">
            <LayoutGrid className="h-6 w-6 text-[#009193]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Hardwares</p>
            <p className="text-3xl font-bold text-foreground">{totalUnits}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-[9px] border-blue-500/20 text-blue-600 px-1 py-0">{airTotal} AIR</Badge>
              <Badge variant="outline" className="text-[9px] border-orange-500/20 text-orange-600 px-1 py-0">{energyTotal} ENRG</Badge>
            </div>
          </div>
        </div>

        {/* AIR Card */}
        <div 
          onClick={() => setSelectedCategory('AIR')}
          className={`premium-card glass p-6 flex items-center gap-4 transition-all cursor-pointer hover:shadow-lg border-2 ${selectedCategory === 'AIR' ? 'border-blue-600 bg-blue-500/5' : 'border-transparent'}`}
        >
          <div className="h-12 w-12 rounded-full bg-blue-600/10 flex items-center justify-center shrink-0">
            <Package className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">AIR Stock</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-blue-600">{airStock}</p>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Available</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">Assigned: {airAssigned}</span>
              <div className="w-20 h-1 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${airTotal > 0 ? (airAssigned/airTotal)*100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Energy Card */}
        <div 
          onClick={() => setSelectedCategory('Energy')}
          className={`premium-card glass p-6 flex items-center gap-4 transition-all cursor-pointer hover:shadow-lg border-2 ${selectedCategory === 'Energy' ? 'border-orange-600 bg-orange-500/5' : 'border-transparent'}`}
        >
          <div className="h-12 w-12 rounded-full bg-orange-600/10 flex items-center justify-center shrink-0">
            <TableIcon className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Energy Stock</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-orange-600">{energyStock}</p>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Available</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">Assigned: {energyAssigned}</span>
              <div className="w-20 h-1 bg-orange-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-600 transition-all" style={{ width: `${energyTotal > 0 ? (energyAssigned/energyTotal)*100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hierarchical Breakdown List */}
      {selectedCategory && (
        <div className="mb-8 space-y-6 animate-in slide-in-from-top-2">
          {getHierarchicalBreakdown(selectedCategory).map(([country, types]) => (
            <div key={country} className="premium-card glass p-4 border-[#009193]/5">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-3.5 w-3.5 text-purple-600" />
                <h4 className="text-sm font-bold tracking-tight text-foreground">{country}</h4>
                <Badge variant="outline" className="ml-auto bg-[#009193]/5 text-[#009193] border-none text-[10px]">
                  {Object.values(types).reduce((s, v) => s + v, 0)} Total Units
                </Badge>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {Object.entries(types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="bg-white/40 dark:bg-black/20 px-3 py-1 rounded-md border border-[#009193]/10 flex items-center gap-2 shadow-sm">
                    <span className="text-[11px] font-bold text-blue-600">{type}</span>
                    <span className="h-3 w-px bg-blue-500/20" />
                    <span className="text-[11px] font-bold text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="premium-card glass p-6">
        <Tabs value={selectedCategory || "ALL"} onValueChange={(val) => setSelectedCategory(val === "ALL" ? null : val)} className="w-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TableIcon className="h-5 w-5 text-[#009193]" />
              <h3 className="font-bold tracking-tight">{selectedCategory ? `${selectedCategory} Registry` : 'Global Hardware Registry'}</h3>
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
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Device ID</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Catalog Name</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Type</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">PO #</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Location (Country)</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider font-bold">Created</TableHead>
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
                          <Badge className="text-[10px] uppercase font-bold bg-[#009193]/10 text-[#009193] border-none">
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#009193]">
                          {item.country || <span className="text-muted-foreground font-normal italic">Unspecified</span>}
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
                    {detailedHardware?.category === 'Energy' ? 'Primary Serial (Device ID)' : 'MAC Address'}
                  </Label>
                  <p className="text-sm font-mono font-medium text-foreground">
                    {detailedHardware?.category === 'Energy' 
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
                    {detailedHardware?.status === 'Assigned' 
                      ? (sites.find(s => s.id === detailedHardware?.site_id)?.name || 'Active Project')
                      : (detailedHardware?.country || "Global Stock")}
                  </p>
                </div>
              </div>
            </div>
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
