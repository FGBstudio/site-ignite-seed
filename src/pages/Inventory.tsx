import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table as TableIcon, Package, Clock, Truck, CheckCircle2, Monitor, ArrowRight } from "lucide-react";
import type { Product } from "@/types/custom-tables";

interface DeviceItem {
  id: string;
  device_id: string;
  mac_address: string | null;
  status: string;
  site_id: string | null;
  region: string | null;
  country: string | null;
  notes: string | null;
  hardware_type: string | null;
}

interface ProductStats {
  inStock: number;
  assigned: number;
  delivered: number;
  internalUse: number;
  shipped: number;
  installed: number;
  devices: DeviceItem[];
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, ProductStats>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [{ data: prodData }, { data: hwData }, { data: siteData }] = await Promise.all([
        supabase.from("products" as any).select("*").order("name"),
        (supabase as any).from("hardwares").select("id, device_id, mac_address, status, site_id, region, country, notes, hardware_type, product_id"),
        supabase.from("sites").select("id, name").neq("status", "canceled"),
      ]);

      setSites(siteData || []);

      // Build stats map keyed by product_id
      const map: Record<string, ProductStats> = {};
      (hwData || []).forEach((hw: any) => {
        if (!hw.product_id) return;
        if (!map[hw.product_id]) {
          map[hw.product_id] = { inStock: 0, assigned: 0, delivered: 0, internalUse: 0, shipped: 0, installed: 0, devices: [] };
        }
        const s = map[hw.product_id];
        if (hw.status === "In Stock") s.inStock++;
        else if (hw.status === "Assigned") s.assigned++;
        else if (hw.status === "Delivered") s.delivered++;
        else if (hw.status === "Internal Use") s.internalUse++;
        else if (hw.status === "Shipped") s.shipped++;
        else if (hw.status === "Installed") s.installed++;
        s.devices.push(hw);
      });

      setStatsMap(map);
      setProducts((prodData as any) || []);
      setLoading(false);
    };

    fetchData();
  }, []);

  const certColor = (cert: string) => {
    switch (cert) {
      case "WELL": return "border-primary text-primary";
      case "LEED": return "border-emerald-500 text-emerald-600";
      case "CO2": return "border-amber-500 text-amber-600";
      case "CO2-CO": return "border-red-500 text-red-600";
      case "Energy": return "border-purple-500 text-purple-600";
      default: return "border-muted-foreground text-muted-foreground";
    }
  };

  const getSiteName = (site_id: string | null) => {
    if (!site_id) return null;
    return sites.find(s => s.id === site_id)?.name || null;
  };

  const selectedStats = selectedProduct ? (statsMap[selectedProduct.id] || { inStock: 0, assigned: 0, delivered: 0, internalUse: 0, shipped: 0, installed: 0, devices: [] }) : null;

  return (
    <MainLayout title="Inventory Summary" subtitle="Single source of truth — live counts from hardware registry">
      <div className="mb-6 flex justify-end">
        <Button
          variant="outline"
          className="glass border-[#009193]/20 text-[#009193] flex items-center gap-2"
          onClick={() => navigate("/hardwares")}
        >
          <TableIcon className="h-4 w-4" /> View Detailed Hardware List
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#009193]" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
        >
          {products.map((product, idx) => {
            const stats = statsMap[product.id] || { inStock: 0, assigned: 0, delivered: 0, internalUse: 0 };
            const total = stats.inStock + stats.assigned + stats.delivered + stats.internalUse;
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04 }}
              >
                <Card
                  className="cursor-pointer premium-card group hover:shadow-lg transition-all border-2 border-transparent hover:border-[#009193]/20"
                  onClick={() => setSelectedProduct(product)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={certColor(product.certification)}>
                        {product.certification}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>
                    </div>
                    <CardTitle className="text-base mt-2 group-hover:text-[#009193] transition-colors leading-snug">
                      {product.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Main stock number */}
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-foreground">{stats.inStock}</span>
                      <span className="text-sm text-muted-foreground">in stock</span>
                    </div>

                    {/* Status badges row */}
                    <div className="flex flex-wrap gap-1">
                      {stats.assigned > 0 && (
                        <Badge className="bg-amber-100 text-amber-800 border-none text-[9px] font-bold px-1.5 py-0.5">
                          {stats.assigned} Assigned
                        </Badge>
                      )}
                      {stats.delivered > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold px-1.5 py-0.5">
                          {stats.delivered} Delivered
                        </Badge>
                      )}
                      {stats.internalUse > 0 && (
                        <Badge className="bg-purple-100 text-purple-800 border-none text-[9px] font-bold px-1.5 py-0.5">
                          {stats.internalUse} Internal
                        </Badge>
                      )}
                      {total === 0 && (
                        <span className="text-[10px] text-muted-foreground italic">No registered units</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-[#009193] opacity-0 group-hover:opacity-100 transition-opacity">
                      Click for details <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {selectedProduct && selectedStats && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Badge variant="outline" className={certColor(selectedProduct.certification)}>
                    {selectedProduct.certification}
                  </Badge>
                  {selectedProduct.name}
                </DialogTitle>
                <p className="text-sm text-muted-foreground font-mono">{selectedProduct.sku}</p>
              </DialogHeader>

              <div className="space-y-6 mt-2">
                {/* Status KPI mini-cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 text-center">
                    <Package className="h-4 w-4 mx-auto text-emerald-600 mb-1" />
                    <p className="text-2xl font-bold text-emerald-700">{selectedStats.inStock}</p>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">In Stock</p>
                  </div>
                  <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-center">
                    <Clock className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                    <p className="text-2xl font-bold text-amber-700">{selectedStats.assigned}</p>
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Assigned</p>
                  </div>
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 p-3 text-center">
                    <CheckCircle2 className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                    <p className="text-2xl font-bold text-blue-700">{selectedStats.delivered}</p>
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Delivered</p>
                  </div>
                  <div className="rounded-xl border-2 border-purple-200 bg-purple-50/60 dark:bg-purple-950/20 p-3 text-center">
                    <Monitor className="h-4 w-4 mx-auto text-purple-600 mb-1" />
                    <p className="text-2xl font-bold text-purple-700">{selectedStats.internalUse}</p>
                    <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">Internal</p>
                  </div>
                </div>

                {/* Shipped / Installed row if any */}
                {(selectedStats.shipped > 0 || selectedStats.installed > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedStats.shipped > 0 && (
                      <div className="rounded-xl border p-3 text-center">
                        <Truck className="h-4 w-4 mx-auto text-slate-500 mb-1" />
                        <p className="text-xl font-bold">{selectedStats.shipped}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Shipped</p>
                      </div>
                    )}
                    {selectedStats.installed > 0 && (
                      <div className="rounded-xl border p-3 text-center">
                        <CheckCircle2 className="h-4 w-4 mx-auto text-slate-500 mb-1" />
                        <p className="text-xl font-bold">{selectedStats.installed}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Installed</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Device list grouped by status */}
                {selectedStats.devices.length === 0 ? (
                  <div className="bg-muted/30 border border-dashed rounded-xl p-8 text-center">
                    <p className="text-sm text-muted-foreground">No serialized units registered for this product.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* In Stock */}
                    {selectedStats.devices.filter(d => d.status === 'In Stock').length > 0 && (
                      <DeviceGroup
                        label="In Stock"
                        color="emerald"
                        devices={selectedStats.devices.filter(d => d.status === 'In Stock')}
                        getSiteName={getSiteName}
                      />
                    )}
                    {/* Assigned */}
                    {selectedStats.devices.filter(d => d.status === 'Assigned').length > 0 && (
                      <DeviceGroup
                        label="Assigned"
                        color="amber"
                        devices={selectedStats.devices.filter(d => d.status === 'Assigned')}
                        getSiteName={getSiteName}
                        showSite
                      />
                    )}
                    {/* Delivered */}
                    {selectedStats.devices.filter(d => d.status === 'Delivered').length > 0 && (
                      <DeviceGroup
                        label="Delivered"
                        color="blue"
                        devices={selectedStats.devices.filter(d => d.status === 'Delivered')}
                        getSiteName={getSiteName}
                        showSite
                      />
                    )}
                    {/* Shipped */}
                    {selectedStats.devices.filter(d => d.status === 'Shipped').length > 0 && (
                      <DeviceGroup
                        label="Shipped"
                        color="slate"
                        devices={selectedStats.devices.filter(d => d.status === 'Shipped')}
                        getSiteName={getSiteName}
                        showSite
                      />
                    )}
                    {/* Internal Use */}
                    {selectedStats.devices.filter(d => d.status === 'Internal Use').length > 0 && (
                      <DeviceGroup
                        label="Internal Use"
                        color="purple"
                        devices={selectedStats.devices.filter(d => d.status === 'Internal Use')}
                        getSiteName={getSiteName}
                        showNotes
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

// Reusable device group component
function DeviceGroup({
  label,
  color,
  devices,
  getSiteName,
  showSite = false,
  showNotes = false,
}: {
  label: string;
  color: string;
  devices: DeviceItem[];
  getSiteName: (id: string | null) => string | null;
  showSite?: boolean;
  showNotes?: boolean;
}) {
  const colorMap: Record<string, { header: string; dot: string; badge: string }> = {
    emerald: { header: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
    amber: { header: "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-400", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
    blue: { header: "bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-400", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
    purple: { header: "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30 text-purple-700 dark:text-purple-400", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-800" },
    slate: { header: "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700" },
  };
  const c = colorMap[color] || colorMap.slate;

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <div className={`px-4 py-2 border-b flex items-center justify-between ${c.header}`}>
        <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
        <Badge className={`${c.badge} border-none text-[9px] font-bold`}>{devices.length}</Badge>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-900 max-h-56 overflow-y-auto">
        {devices
          .sort((a, b) => String(a.device_id).localeCompare(String(b.device_id)))
          .map((d) => {
            const siteName = showSite ? getSiteName(d.site_id) : null;
            return (
              <div key={d.id} className="px-4 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
                  <div>
                    <span className="font-mono text-xs font-semibold text-foreground">{d.device_id}</span>
                    {d.mac_address && (
                      <span className="text-[10px] text-muted-foreground font-mono ml-2">{d.mac_address}</span>
                    )}
                    {showNotes && d.notes && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{d.notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {siteName && (
                    <p className="text-[10px] font-semibold text-foreground truncate max-w-[140px]">{siteName}</p>
                  )}
                  {(d.country || d.region) && (
                    <p className="text-[9px] text-muted-foreground">{d.country}{d.region ? ` · ${d.region}` : ''}</p>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
