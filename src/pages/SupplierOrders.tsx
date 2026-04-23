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
  Timer, 
  CheckCircle2, 
  Warehouse,
  MapPin,
  Calendar,
  Box,
  AlertCircle,
  Package,
  ExternalLink,
  Save
} from "lucide-react";
import type { Product, SupplierOrder } from "@/types/custom-tables";

const STATUS_FLOW = ["Draft", "Sent", "In_Transit", "Received"] as const;

const statusColors: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Sent: "bg-blue-100 text-blue-700 border-blue-200",
  In_Transit: "bg-amber-100 text-amber-700 border-amber-200",
  Received: "bg-green-100 text-green-700 border-green-200",
};

export default function SupplierOrders() {
  const { user, isAdmin } = useAuth();
  const [inboundOrders, setInboundOrders] = useState<SupplierOrder[]>([]);
  const [outboundHardwares, setOutboundHardwares] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inbound");
  const [outboundSubTab, setOutboundSubTab] = useState("awaiting");
  
  // Modal State
  const [selectedHardware, setSelectedHardware] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  const logStatusChange = async (hardwareId: string, oldStatus: string, newStatus: string, notes?: string) => {
    await (supabase as any).from("hardware_status_history").insert({
      hardware_id: hardwareId,
      previous_status: oldStatus,
      new_status: newStatus,
      changed_by: user?.id,
      notes: notes || "Logistics Dashboard Update"
    });
  };

  const handleUpdateHardware = async () => {
    if (!selectedHardware) return;

    const { error } = await (supabase as any)
      .from("hardwares")
      .update({
        fulfillment_status: selectedHardware.fulfillment_status,
        shipment_mode: selectedHardware.shipment_mode,
        carrier_name: selectedHardware.carrier_name,
        tracking_number: selectedHardware.tracking_number,
        delivery_person: selectedHardware.delivery_person,
        shipment_date: selectedHardware.shipment_date || (selectedHardware.fulfillment_status !== 'Allocated' ? new Date().toISOString() : null)
      })
      .eq('id', selectedHardware.id);

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else {
      await logStatusChange(selectedHardware.id, "N/A", selectedHardware.fulfillment_status, "Detailed Manual Update");
      toast({ title: "Updated", description: "Hardware logistics updated successfully." });
      setSelectedHardware(null);
      fetchData();
    }
  };

  const handleBulkDispatch = async () => {
    if (selectedIds.length === 0) return;

    const { error } = await (supabase as any)
      .from("hardwares")
      .update({ 
        fulfillment_status: "In_Transit",
        shipment_date: new Date().toISOString()
      })
      .in("id", selectedIds);

    if (error) {
      toast({ title: "Dispatch Failed", description: error.message, variant: "destructive" });
    } else {
      for (const id of selectedIds) {
        await logStatusChange(id, "Allocated", "In_Transit", "Bulk Dispatch Action");
      }
      toast({ title: "Assets Dispatched", description: `${selectedIds.length} units marked as In Transit.` });
      setSelectedIds([]);
      fetchData();
    }
  };

  const handleSupplierStatusChange = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from("supplier_orders" as any)
      .update({ status: newStatus } as any)
      .eq("id", orderId);

    if (error) {
      toast({ title: "Update error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Status updated", description: `Order updated to "${newStatus.replace("_", " ")}"` });
    await fetchData();
  };

  const awaitingDispatch = outboundHardwares.filter(h => h.fulfillment_status === "Allocated");
  const fulfilledDispatch = outboundHardwares.filter(h => h.fulfillment_status === "In_Transit" || h.fulfillment_status === "Delivered");

  return (
    <MainLayout title="Supply Chain Command" subtitle="Enterprise procurement tracking and global fulfillment logistics">
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
              <div className="flex items-center justify-between mb-6 text-[#009193]">
                <div>
                  <h3 className="font-bold tracking-tight">Supplier Orders</h3>
                  <p className="text-[11px] uppercase tracking-wider font-bold opacity-70">Incoming Raw Stock</p>
                </div>
                <Badge variant="outline" className="bg-[#009193]/5 text-[#009193] border-[#009193]/20">
                  {inboundOrders.length} Active Orders
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Supplier</th>
                      <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Product</th>
                      <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Qty</th>
                      <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">ETA</th>
                      <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboundOrders.map((order) => {
                      const product = products.find((p) => p.id === order.product_id);
                      return (
                        <tr key={order.id} className="border-b last:border-b-0 hover:bg-[#009193]/5 transition-colors group">
                          <td className="p-4 font-bold text-[#009193]">{order.supplier_name}</td>
                          <td className="p-4"><span className="text-xs font-medium">{product?.name ?? "Hardware Unit"}</span></td>
                          <td className="p-4 text-xs font-mono">{order.quantity_requested} units</td>
                          <td className="p-4 text-xs">{format(new Date(order.expected_delivery_date), "dd MMM yyyy")}</td>
                          <td className="p-4">
                            {isAdmin ? (
                              <Select value={order.status} onValueChange={(val) => handleSupplierStatusChange(order.id, val)}>
                                <SelectTrigger className="h-8 text-xs w-36 bg-white border-slate-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_FLOW.map((s) => (
                                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className={cn("text-[9px] uppercase font-bold border", statusColors[order.status])}>
                                {order.status.replace("_", " ")}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="outbound" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Tabs value={outboundSubTab} onValueChange={setOutboundSubTab} className="w-fit">
                  <TabsList className="bg-slate-100 p-1 h-9">
                    <TabsTrigger value="awaiting" className="text-xs px-4 data-[state=active]:bg-white">
                      Awaiting Dispatch ({awaitingDispatch.length})
                    </TabsTrigger>
                    <TabsTrigger value="shipped" className="text-xs px-4 data-[state=active]:bg-white">
                      Fulfilled ({fulfilledDispatch.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {outboundSubTab === "awaiting" && selectedIds.length > 0 && (
                  <Button onClick={handleBulkDispatch} className="h-9 bg-[#009193] hover:bg-[#009193]/90 text-white text-xs font-bold gap-2">
                    <Truck className="h-4 w-4" />
                    Dispatch Selected ({selectedIds.length})
                  </Button>
                )}
              </div>

              <div className="premium-card glass p-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {outboundSubTab === "awaiting" && <th className="p-4 w-10">
                          <Checkbox checked={selectedIds.length === awaitingDispatch.length && awaitingDispatch.length > 0} onCheckedChange={(checked) => setSelectedIds(checked ? awaitingDispatch.map(h => h.id) : [])} />
                        </th>}
                        <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Device / SN</th>
                        <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Destination</th>
                        <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">{outboundSubTab === "awaiting" ? "Request Date" : "Carrier / Tracking"}</th>
                        <th className="text-left p-4 text-[10px] uppercase font-bold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(outboundSubTab === "awaiting" ? awaitingDispatch : fulfilledDispatch).map((hw) => {
                        const site = sites.find(s => s.id === hw.site_id);
                        const isMissingData = (hw.fulfillment_status === "In_Transit" || hw.fulfillment_status === "Delivered") && !hw.tracking_number;
                        
                        return (
                          <tr key={hw.id} onClick={() => setSelectedHardware(hw)} className="border-b last:border-b-0 hover:bg-[#009193]/5 transition-colors group cursor-pointer">
                            {outboundSubTab === "awaiting" && (
                              <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selectedIds.includes(hw.id)} onCheckedChange={(checked) => setSelectedIds(prev => checked ? [...prev, hw.id] : prev.filter(id => id !== hw.id))} />
                              </td>
                            )}
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-bold text-[#009193]">{hw.device_id}</span>
                                <span className="text-[9px] text-muted-foreground uppercase font-bold">{hw.hardware_type}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3 text-[#009193]" />
                                <span className="text-xs font-bold">{site?.name || "Pending Site"}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              {outboundSubTab === "awaiting" ? (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(hw.created_at), "dd MMM yy")}
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium">{hw.carrier_name || hw.delivery_person || "-"}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{hw.tracking_number}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              {outboundSubTab === "shipped" && isMissingData ? (
                                <div className="flex items-center gap-1.5 text-rose-600 animate-pulse">
                                  <AlertCircle className="h-3 w-3" />
                                  <span className="text-[10px] font-bold uppercase">Missing Tracking</span>
                                </div>
                              ) : (
                                <Badge className={cn(
                                  "text-[9px] uppercase font-bold border-none",
                                  hw.fulfillment_status === "In_Transit" ? "bg-amber-100 text-amber-700" : 
                                  hw.fulfillment_status === "Delivered" ? "bg-green-100 text-green-700" :
                                  "bg-blue-100 text-blue-700"
                                )}>
                                  {hw.fulfillment_status}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Fulfillment Editor Modal */}
      <Dialog open={!!selectedHardware} onOpenChange={() => setSelectedHardware(null)}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden bg-white border-none shadow-2xl">
          <DialogHeader className="p-6 pb-4 bg-[#009193]/5 border-b border-[#009193]/10">
            <DialogTitle className="flex items-center gap-3 text-xl font-bold text-[#009193]">
              <div className="h-10 w-10 rounded-xl bg-[#009193] flex items-center justify-center text-white">
                <Box className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-mono opacity-70">SN: {selectedHardware?.device_id}</span>
                <span className="text-lg">Fulfillment Editor</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fulfillment Status</Label>
                <Select value={selectedHardware?.fulfillment_status} onValueChange={(val) => setSelectedHardware({...selectedHardware, fulfillment_status: val})}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Allocated">Awaiting Dispatch</SelectItem>
                    <SelectItem value="In_Transit">In Transit</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shipment Mode</Label>
                <Select value={selectedHardware?.shipment_mode || ""} onValueChange={(val) => setSelectedHardware({...selectedHardware, shipment_mode: val})}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Courier">Courier (DHL/FedEx)</SelectItem>
                    <SelectItem value="In-Person">In-Person Handover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {selectedHardware?.shipment_mode === 'In-Person' ? 'Delivered By' : 'Carrier Name'}
                </Label>
                <Input 
                  className="h-9 text-xs" 
                  value={selectedHardware?.shipment_mode === 'In-Person' ? (selectedHardware?.delivery_person || "") : (selectedHardware?.carrier_name || "")}
                  placeholder={selectedHardware?.shipment_mode === 'In-Person' ? "Person Name" : "e.g. DHL Express"}
                  onChange={(e) => {
                    if (selectedHardware?.shipment_mode === 'In-Person') setSelectedHardware({...selectedHardware, delivery_person: e.target.value});
                    else setSelectedHardware({...selectedHardware, carrier_name: e.target.value});
                  }}
                />
              </div>

              {selectedHardware?.shipment_mode === 'Courier' && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tracking Number / ID</Label>
                  <Input 
                    className="h-9 text-xs font-mono" 
                    value={selectedHardware?.tracking_number || ""}
                    placeholder="Enter Tracking ID"
                    onChange={(e) => setSelectedHardware({...selectedHardware, tracking_number: e.target.value})}
                  />
                </div>
              )}
            </div>

            <div className="pt-4 flex gap-3">
              <Button onClick={() => setSelectedHardware(null)} variant="outline" className="flex-1 h-10 text-xs font-bold uppercase tracking-widest border-slate-200">
                Cancel
              </Button>
              <Button onClick={handleUpdateHardware} className="flex-1 h-10 bg-[#009193] hover:bg-[#009193]/90 text-white text-xs font-bold uppercase tracking-widest gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
