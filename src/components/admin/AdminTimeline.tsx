import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock3,
} from "lucide-react";
import { useAdminPlannerData } from "@/hooks/useAdminPlannerData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FGBPlanner } from "@/components/dashboard/FGBPlanner";

export function AdminTimeline() {
  const { data: projects = [], isLoading } = useAdminPlannerData();

  const [filterPM, setFilterPM] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCert, setFilterCert] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");

  const { pmOptions, certOptions, brandOptions } = useMemo(() => {
    const pms = new Map<string, string>();
    const certs = new Set<string>();
    const brands = new Set<string>();
    for (const p of projects) {
      if (p.pm_id && p.pm_name) pms.set(p.pm_id, p.pm_name);
      if (p.cert_type) certs.add(p.cert_type);
      if (p.brand_name) brands.add(p.brand_name);
    }
    return {
      pmOptions: Array.from(pms.entries()).map(([id, name]) => ({ id, name })),
      certOptions: Array.from(certs),
      brandOptions: Array.from(brands),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filterPM !== "all" && p.pm_id !== filterPM) return false;
      if (filterStatus !== "all" && p.setup_status !== filterStatus) return false;
      if (filterCert !== "all" && p.cert_type !== filterCert) return false;
      if (filterBrand !== "all" && p.brand_name !== filterBrand) return false;
      return true;
    });
  }, [projects, filterPM, filterStatus, filterCert, filterBrand]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterPM} onValueChange={setFilterPM}>
          <SelectTrigger className="w-44"><SelectValue placeholder="PM" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All PMs</SelectItem>
            {pmOptions.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="da_configurare">To Configure</SelectItem>
            <SelectItem value="in_corso">In Progress</SelectItem>
            <SelectItem value="certificato">Certified</SelectItem>
          </SelectContent>
        </Select>

        {certOptions.length > 0 && (
          <Select value={filterCert} onValueChange={setFilterCert}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Certification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Certs</SelectItem>
              {certOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {brandOptions.length > 0 && (
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brandOptions.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filterPM !== "all" || filterStatus !== "all" || filterCert !== "all" || filterBrand !== "all") && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setFilterPM("all"); setFilterStatus("all"); setFilterCert("all"); setFilterBrand("all"); }}
          >
            Reset filters
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {projects.length} projects
        </span>
      </div>

      <div className="h-[600px] border rounded-lg shadow-sm bg-background">
        <FGBPlanner data={filtered.map((p) => p.plannerData)} />
      </div>
    </div>
  );
}
