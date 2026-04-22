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
    site_id: "",
    status: "In Stock"
  });

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
      (products.find(p => p.id === h.product_id)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = !selectedCategory || h.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Summary Metrics
  const totalUnits = hardwares.length;
  const iaqUnits = hardwares.filter(h => h.category === 'AIR').length;
  const energyUnits = hardwares.filter(h => h.category === 'Energy').length;

  const getHierarchicalBreakdown = (cat: string) => {
    const items = hardwares.filter(h => h.category === cat);
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
      site_id: newHardware.site_id === "none" ? null : (newHardware.site_id || null),
      status: newHardware.status
    }]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Hardware added successfully" });
      setIsAdding(false);
      setNewHardware({ device_id: "", mac_address: "", product_id: "", site_id: "", status: "In Stock" });
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

          if (t.includes("co2")) return products.find(p => p.name.toUpperCase().includes("CO2"))?.id;
          if (t.includes("well")) return products.find(p => p.name.toUpperCase().includes("WELL"))?.id;
          if (t.includes("leed")) return products.find(p => p.name.toUpperCase().includes("LEED"))?.id;

          if (t.includes("fgb") || t.includes("bridge") || t.includes("meter") || t.includes("greeny")) {
            return products.find(p => p.name.toUpperCase().includes("GREENY") || p.name.toUpperCase().includes("ENERGY"))?.id;
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


          <Dialog open={isAdding} onOpenChange={setIsAdding}>
            <DialogTrigger asChild>
              <Button className="tb-button primary flex items-center gap-2">
                <Plus className="h-4 w-4" /> Register Hardware
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-heavy sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Register New Hardware</DialogTitle>
                <p className="text-xs text-muted-foreground">Add a physical device manually.</p>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Device ID (Serial)</Label>
                  <Input value={newHardware.device_id} onChange={(e) => setNewHardware({ ...newHardware, device_id: e.target.value })} placeholder="e.g. SN-998122" />
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
              <Button onClick={handleAddHardware} className="w-full tb-button primary mt-2">Add to Records</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div 
          onClick={() => setSelectedCategory(null)}
          className={`premium-card glass p-4 flex items-center gap-4 cursor-pointer border-2 transition-all ${!selectedCategory ? 'border-[#009193] bg-[#009193]/5' : 'border-transparent'}`}
        >
          <div className="h-10 w-10 rounded-full bg-[#009193]/10 flex items-center justify-center shrink-0">
            <LayoutGrid className="h-5 w-5 text-[#009193]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">All Inventory</p>
            <p className="text-2xl font-bold text-[#009193]">{totalUnits}</p>
          </div>
        </div>
        
        <div 
          onClick={() => setSelectedCategory('AIR')}
          className={`premium-card glass p-4 flex items-center gap-4 cursor-pointer border-2 transition-all ${selectedCategory === 'AIR' ? 'border-blue-500 bg-blue-500/5' : 'border-transparent'}`}
        >
          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">AIR Stock</p>
            <p className="text-2xl font-bold text-blue-600">{iaqUnits}</p>
          </div>
        </div>

        <div 
          onClick={() => setSelectedCategory('Energy')}
          className={`premium-card glass p-4 flex items-center gap-4 cursor-pointer border-2 transition-all ${selectedCategory === 'Energy' ? 'border-orange-500 bg-orange-500/5' : 'border-transparent'}`}
        >
          <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <TableIcon className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Energy Stock</p>
            <p className="text-2xl font-bold text-orange-600">{energyUnits}</p>
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
        <div className="flex items-center gap-2 mb-6">
          <TableIcon className="h-5 w-5 text-[#009193]" />
          <h3 className="font-bold tracking-tight">Full Hardware Registry</h3>
        </div>

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
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No records found matching your search.</TableCell></TableRow>
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
          
          <div className="grid grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Product Type</Label>
                <p className="text-sm font-semibold">{detailedHardware?.hardware_type}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Catalog Name</Label>
                <p className="text-sm font-semibold">{products.find(p => p.id === detailedHardware?.product_id)?.name || "Unknown"}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">PO Number</Label>
                <p className="text-sm font-mono text-[#009193] font-bold">{detailedHardware?.po || "N/A"}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Current Location</Label>
                <p className="text-sm font-semibold flex items-center gap-1">
                  <Search className="h-3 w-3 text-[#009193]" />
                  {detailedHardware?.country || "Warehouse / Italy"}
                </p>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">MAC Address</Label>
                <p className="text-sm font-mono">{detailedHardware?.mac_address || "-"}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Registration Date</Label>
                <p className="text-sm">{detailedHardware && new Date(detailedHardware.created_at).toLocaleDateString()}</p>
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
