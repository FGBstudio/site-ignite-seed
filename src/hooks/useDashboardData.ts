import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type Project = Tables<"projects">;
type Allocation = Tables<"project_allocations">;

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
  runwayDate: string | null; // date when stock runs out
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [prodRes, projRes, allocRes] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("projects").select("*"),
        supabase.from("project_allocations").select("*"),
      ]);
      setProducts(prodRes.data || []);
      setProjects(projRes.data || []);
      setAllocations(allocRes.data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filteredProducts = useMemo(() => {
    if (productFilter === "all") return products;
    return products.filter((p) => p.id === productFilter);
  }, [products, productFilter]);

  const kpi = useMemo<KPIData>(() => {
    const relevantProductIds = new Set(filteredProducts.map((p) => p.id));
    const relevantAllocs = allocations.filter((a) => relevantProductIds.has(a.product_id));

    const installed = relevantAllocs
      .filter((a) => a.status === "Installed_Online")
      .reduce((s, a) => s + a.quantity, 0);

    const confirmed = relevantAllocs
      .filter((a) => ["Allocated", "Requested", "Shipped"].includes(a.status))
      .reduce((s, a) => s + a.quantity, 0);

    const inStock = filteredProducts.reduce((s, p) => s + p.quantity_in_stock, 0);

    const pipeline = relevantAllocs
      .filter((a) => a.status === "Draft")
      .reduce((s, a) => s + a.quantity, 0);

    const totalDemand = confirmed + pipeline;
    const toOrder = Math.max(0, totalDemand - inStock);

    // Calculate drop-dead date: earliest handover minus lead time
    let dropDeadDate: string | null = null;
    if (toOrder > 0) {
      const activeAllocs = relevantAllocs.filter((a) =>
        ["Draft", "Allocated", "Requested", "Shipped"].includes(a.status)
      );
      let earliestHandover: Date | null = null;
      for (const alloc of activeAllocs) {
        const proj = projects.find((p) => p.id === alloc.project_id);
        if (proj) {
          const d = new Date(proj.handover_date);
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

    return { installed, confirmed, inStock, pipeline, toOrder, dropDeadDate };
  }, [filteredProducts, allocations, projects]);

  const runway = useMemo<RunwayRow[]>(() => {
    return filteredProducts.map((product) => {
      const prodAllocs = allocations.filter(
        (a) => a.product_id === product.id && a.status !== "Installed_Online"
      );
      const totalDemand = prodAllocs.reduce((s, a) => s + a.quantity, 0);

      // Sort allocations by project handover to compute runway
      const allocsWithDate = prodAllocs
        .map((a) => {
          const proj = projects.find((p) => p.id === a.project_id);
          return { ...a, handoverDate: proj?.handover_date || "9999-12-31", project: proj };
        })
        .sort((a, b) => a.handoverDate.localeCompare(b.handoverDate));

      let remaining = product.quantity_in_stock;
      let runwayDate: string | null = null;
      for (const a of allocsWithDate) {
        remaining -= a.quantity;
        if (remaining < 0 && !runwayDate) {
          runwayDate = a.handoverDate;
        }
      }

      const orderQty = Math.max(0, totalDemand - product.quantity_in_stock);
      let orderByDate: string | null = null;
      if (orderQty > 0 && runwayDate && runwayDate !== "9999-12-31") {
        const d = new Date(runwayDate);
        d.setDate(d.getDate() - product.supplier_lead_time_days);
        orderByDate = d.toISOString().split("T")[0];
      }

      // Regional breakdown
      const regionMap = new Map<string, RegionBreakdown["projects"]>();
      for (const a of allocsWithDate) {
        if (!a.project) continue;
        const r = a.project.region;
        if (!regionMap.has(r)) regionMap.set(r, []);
        regionMap.get(r)!.push({
          id: a.project.id,
          name: a.project.name,
          handoverDate: a.project.handover_date,
          quantity: a.quantity,
          status: a.status,
        });
      }

      const regions: RegionBreakdown[] = [...regionMap.entries()].map(([region, projs]) => ({
        region,
        projects: projs,
        totalQty: projs.reduce((s, p) => s + p.quantity, 0),
      }));

      return { product, stock: product.quantity_in_stock, totalDemand, runwayDate, orderQty, orderByDate, regions };
    });
  }, [filteredProducts, allocations, projects]);

  return { products, kpi, runway, loading };
}
