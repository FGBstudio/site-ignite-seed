import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Project, ProjectAllocation } from "@/types/custom-tables";

export interface KPIData {
  installed: number;
  confirmed: number;
  inStock: number;
  pipeline: number;
  toOrder: number;
  dropDeadDate: string | null;
}

export interface RunwayRow {
  product: Product;
  stock: number;
  totalDemand: number;
  runwayDate: string | null;
  orderQty: number;
  orderByDate: string | null;
  regions: RegionBreakdown[];
}

export interface RegionBreakdown {
  region: string;
  projects: {
    id: string;
    name: string;
    handoverDate: string;
    quantity: number;
    status: string;
  }[];
  totalQty: number;
}

export function useDashboardData(productFilter: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [hardwares, setHardwares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [prodRes, certRes, allocRes, hwRes] = await Promise.all([
        supabase.from("products" as any).select("*"),
        supabase.from("certifications").select("id, name, client, region, handover_date, status, pm_id, site_id"),
        supabase.from("project_allocations" as any).select("*"),
        supabase.from("hardwares").select("id, product_id, site_id, status"),
      ]);

      const stockMap: Record<string, number> = {};
      hwRes.data?.forEach(hw => {
        if (hw.status === 'In Stock') {
          stockMap[hw.product_id] = (stockMap[hw.product_id] || 0) + 1;
        }
      });

      const enrichedProducts = (prodRes.data || []).map((p: any) => ({
        ...p,
        quantity_in_stock: stockMap[p.id] || 0
      }));

      setProducts(enrichedProducts as any);
      setCerts((certRes.data || []) as any);
      setAllocations((allocRes.data || []) as any);
      setHardwares((hwRes.data || []) as any);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    if (productFilter === "all") return products;
    return products.filter((p) => p.id === productFilter);
  }, [products, productFilter]);

  const kpi = useMemo<KPIData>(() => {
    const relevantProductIds = new Set(filteredProducts.map((p) => p.id));
    const relevantAllocs = allocations.filter((a) => relevantProductIds.has(a.product_id));

    const inStock = filteredProducts.reduce((s, p) => s + (p.quantity_in_stock || 0), 0);

    const installed = relevantAllocs
      .filter((a) => a.status === "Confirmed")
      .reduce((s, a) => s + a.quantity, 0);

    const pipelineAllocs = relevantAllocs.map(a => {
      const cert = certs.find(c => c.id === (a as any).certification_id);
      const totalRequested = a.requested_quantity ?? a.quantity ?? 0;
      let outstanding = 0;
      if (a.status === 'Requested') {
        outstanding = totalRequested;
      } else if (a.status === 'Partially Confirmed') {
        const assigned = cert ? hardwares.filter(h => h.product_id === a.product_id && h.site_id === cert.site_id && h.status === 'Assigned').length : 0;
        outstanding = Math.max(0, totalRequested - assigned);
      }
      return outstanding;
    });

    const pipeline = pipelineAllocs.reduce((s, qty) => s + qty, 0);
    const confirmed = installed;

    const totalDemand = pipeline;
    const toOrder = Math.max(0, totalDemand - inStock);

    let dropDeadDate: string | null = null;
    if (toOrder > 0) {
      const activeAllocs = relevantAllocs.filter((a) =>
        a.status === "Requested" || a.status === "Partially Confirmed"
      );
      let earliestHandover: Date | null = null;
      for (const alloc of activeAllocs) {
        const cert = certs.find((c: any) => c.id === (alloc as any).certification_id);
        if (cert) {
          const d = new Date(cert.handover_date);
          if (!earliestHandover || d < earliestHandover) earliestHandover = d;
        }
      }
      if (earliestHandover) {
        const maxLeadTime = Math.max(...filteredProducts.map((p) => p.supplier_lead_time_days));
        const dd = new Date(earliestHandover);
        dd.setDate(dd.getDate() - maxLeadTime);
        dropDeadDate = dd.toISOString().split("T")[0];
      }
    }

    return { installed: 0, confirmed, inStock, pipeline, toOrder, dropDeadDate };
  }, [filteredProducts, allocations, certs, hardwares]);

  const runway = useMemo<RunwayRow[]>(() => {
    return filteredProducts.map((product) => {
      const prodAllocs = allocations.filter(
        (a) => a.product_id === product.id
      );

      const allocsWithOutstanding = prodAllocs.map((a) => {
        const cert = certs.find((c: any) => c.id === (a as any).certification_id);
        const totalRequested = a.requested_quantity ?? a.quantity ?? 0;
        let outstanding = 0;
        if (a.status === 'Requested') {
          outstanding = totalRequested;
        } else if (a.status === 'Partially Confirmed') {
          const assigned = cert ? hardwares.filter(h => h.product_id === a.product_id && h.site_id === cert.site_id && h.status === 'Assigned').length : 0;
          outstanding = Math.max(0, totalRequested - assigned);
        } else {
          outstanding = 0;
        }
        return { ...a, outstanding, handoverDate: cert?.handover_date || "9999-12-31", project: cert };
      }).filter(a => a.outstanding > 0);

      const totalDemand = allocsWithOutstanding.reduce((s, a) => s + a.outstanding, 0);

      const sortedAllocs = [...allocsWithOutstanding].sort((a, b) => a.handoverDate.localeCompare(b.handoverDate));

      let remaining = product.quantity_in_stock || 0;
      let runwayDate: string | null = null;
      for (const a of sortedAllocs) {
        remaining -= a.outstanding;
        if (remaining < 0 && !runwayDate) {
          runwayDate = a.handoverDate;
        }
      }

      const orderQty = Math.max(0, totalDemand - (product.quantity_in_stock || 0));
      let orderByDate: string | null = null;
      if (orderQty > 0 && runwayDate && runwayDate !== "9999-12-31") {
        const d = new Date(runwayDate);
        d.setDate(d.getDate() - product.supplier_lead_time_days);
        orderByDate = d.toISOString().split("T")[0];
      }

      const regionMap = new Map<string, RegionBreakdown["projects"]>();
      for (const a of sortedAllocs) {
        if (!a.project) continue;
        const r = a.project.region;
        if (!regionMap.has(r)) regionMap.set(r, []);
        regionMap.get(r)!.push({
          id: a.project.id,
          name: a.project.name,
          handoverDate: a.project.handover_date,
          quantity: a.outstanding,
          status: a.status,
        });
      }

      const regions: RegionBreakdown[] = [...regionMap.entries()].map(([region, projs]) => ({
        region,
        projects: projs,
        totalQty: projs.reduce((s, p) => s + p.quantity, 0),
      }));

      return { product, stock: product.quantity_in_stock || 0, totalDemand, runwayDate, orderQty, orderByDate, regions };
    });
  }, [filteredProducts, allocations, certs, hardwares]);

  return { products, kpi, runway, loading };
}
