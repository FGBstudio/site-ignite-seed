import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useProjectDetails, useCertification, useProjectAllocations, usePhysicalHardware, useProducts } from "@/hooks/useProjectDetails";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScorecardEditor } from "@/components/projects/ScorecardEditor";
import { ProjectWBS } from "@/components/projects/ProjectWBS";
import { ProjectOverview } from "@/components/projects/ProjectOverview";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectPayments } from "@/components/projects/ProjectPayments";
import { ProjectCanvas } from "@/components/projects/ProjectCanvas";
import { ArrowLeft, MapPin, Calendar, User, Cpu, Plus, Package, Info, History } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FGBPlanner, type GanttRowData, type GanttSegment } from "@/components/dashboard/FGBPlanner";
import { EnergyMonitoringPanel } from "@/components/projects/EnergyMonitoring/EnergyMonitoringPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.projectId || params.id; 
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: project, isLoading } = useProjectDetails(projectId);
  const { data: certification } = useCertification(projectId, project?.site_id);
  const { data: allocations } = useProjectAllocations(projectId);
  const { data: physicalHw } = usePhysicalHardware(project?.site_id);
  const { data: products = [] } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [requestForm, setRequestForm] = useState({
    productId: "",
    quantity: "1",
    targetDate: ""
  });
  const [isRequesting, setIsRequesting] = useState(false);

  const { data: timelineMilestones = [] } = useQuery({
    queryKey: ["project-timeline", certification?.id],
    enabled: !!certification?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select('*')
        .eq("certification_id", certification!.id)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (error) throw error;
      return data || [];
    },
  });

  const plannerData: GanttRowData[] = useMemo(() => {
    if (!project || timelineMilestones.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    const projectLaunchDate = project.created_at.slice(0, 10);
    const projectSegments: GanttSegment[] = [];

    const phases: GanttRowData[] = timelineMilestones.map((m: any) => {
      let role = "Specialist";
      try {
        const meta = JSON.parse(m.notes || "{}");
        if (meta.assigned_to_role) role = meta.assigned_to_role;
      } catch (e) {}

      let displayStatus = m.status;
      if (m.status === "on_hold") {
        displayStatus = "on_hold";
      } else if (m.status !== "achieved" && m.due_date && m.due_date < today) {
        displayStatus = "late";
      } else if (m.status === "achieved") {
        displayStatus = "achieved";
      } else if (m.status === "in_progress") {
        displayStatus = "in_progress";
      }

      if (m.start_date && m.due_date) {
        projectSegments.push({
          id: m.id,
          start: m.start_date,
          end: m.due_date,
          status: displayStatus,
          progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0
        });
      }

      return {
        id: m.id,
        label: m.requirement,
        subLabel: `Role: ${role}`,
        currentActivity: m.status === "in_progress" ? m.requirement : (m.status === "achieved" ? "Completed" : "Pending"),
        launchDate: projectLaunchDate,
        designStart: null,
        designEnd: null,
        constrStartPlan: null,
        constrEndFcst: null,
        constrEndAct: null,
        planDuration: "—",
        actDuration: "—",
        planStart: m.start_date,
        planEnd: m.due_date,
        actualStart: m.status !== "pending" ? m.start_date : null,
        actualEnd: m.completed_date || null,
        progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
        status: displayStatus,
      } as GanttRowData;
    });

    const totalAchieved = timelineMilestones.filter((m: any) => m.status === 'achieved').length;
    const overallProgress = timelineMilestones.length > 0 ? Math.round((totalAchieved / timelineMilestones.length) * 100) : 0;
    
    const firstStartDate = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort()[0] || projectLaunchDate;

    const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
    const summaryActivity = activeMilestone ? activeMilestone.requirement : (project.status === "certificato" ? "Completed" : "Pending");

    const summaryRow: GanttRowData = {
      id: "summary",
      label: "PROJECT TOTAL",
      subLabel: "Overall Progress",
      currentActivity: summaryActivity,
      launchDate: projectLaunchDate,
      designStart: null,
      designEnd: null,
      constrStartPlan: null,
      constrEndFcst: null,
      constrEndAct: null,
      planDuration: "—",
      actDuration: "—",
      planStart: firstStartDate,
      planEnd: project.handover_date,
      actualStart: overallProgress > 0 ? firstStartDate : null,
      actualEnd: project.status === "certificato" ? today : null,
      progress: overallProgress,
      status: project.status === "certificato" ? "achieved" : (project.handover_date < today ? "late" : "in_progress"),
      segments: projectSegments
    };

    return [summaryRow, ...phases];
  }, [timelineMilestones, project]);

  const handleRequestHardware = async () => {
    if (!requestForm.productId || !requestForm.quantity) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    setIsRequesting(true);
    try {
      // Find the product in our local list to get its category
      const selectedProduct = products.find((p: any) => p.id === requestForm.productId) as any;
      const productCategory = selectedProduct?.category || (selectedProduct?.name?.toLowerCase().includes("energy") ? "Energy" : "AIR");

      const { error } = await supabase.from("project_allocations").insert({
        certification_id: projectId,
        product_id: requestForm.productId,
        quantity: parseInt(requestForm.quantity),
        requested_quantity: parseInt(requestForm.quantity),
        target_date: requestForm.targetDate || null,
        status: "Requested",
        category: productCategory
      });

      if (error) throw error;
      toast({ title: "Hardware requested successfully" });
      setRequestForm({ productId: "", quantity: "1", targetDate: "" });
      queryClient.invalidateQueries({ queryKey: ["certification-allocations", projectId] });
    } catch (err: any) {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    } finally {
      setIsRequesting(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="Loading...">
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout title="Project not found">
        <div className="text-center py-20 text-muted-foreground">
          Project not found.
          <Button variant="link" onClick={() => navigate("/projects")}>Back to projects</Button>
        </div>
      </MainLayout>
    );
  }

  const hasCert = (project as any).project_type === "LEED" || (project as any).project_type === "WELL";
  const pmName = (project as any).profiles?.display_name || (project as any).profiles?.full_name || (project as any).profiles?.email || "—";
  const siteName = (project as any).sites?.name;
  const siteCity = (project as any).sites?.city;
  const siteCountry = (project as any).sites?.country;

  return (
    <MainLayout
      title={project.name}
      subtitle={`${project.client} — ${project.region}`}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </Button>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Site</p>
              <p className="font-medium text-sm text-foreground">{siteName || "Not assigned"}</p>
              {siteCity && <p className="text-xs text-muted-foreground">{siteCity}{siteCountry ? `, ${siteCountry}` : ""}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Handover</p>
              <p className="font-medium text-sm text-foreground">{format(new Date(project.handover_date), "dd MMM yyyy")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">PM</p>
              <p className="font-medium text-sm text-foreground">{pmName}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Status / Type</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn("border text-xs", statusColors[project.status])}>{project.status}</Badge>
                {(project as any).project_type && <Badge variant="secondary" className="text-xs">{(project as any).project_type}</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="planner">Planner (Phases)</TabsTrigger>
          {hasCert && <TabsTrigger value="scorecard">Scorecard {(project as any).project_type}</TabsTrigger>}
          <TabsTrigger value="wbs">Schedule</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProjectOverview
            certificationId={projectId!}
            project={project}
            timelineMilestones={timelineMilestones}
          />
        </TabsContent>

        <TabsContent value="planner">
          <Card>
            <CardContent className="p-0 border-none">
              {plannerData.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No timeline initialized. Configure the project from the PM dashboard.
                </div>
              ) : (
                <div className="h-[600px] flex flex-col">
                  <FGBPlanner data={plannerData} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Tabs defaultValue="allocated" className="space-y-4">
            <TabsList>
              <TabsTrigger value="allocated">Hardware Request Log</TabsTrigger>
              <TabsTrigger value="energy">Energy Monitoring</TabsTrigger>
            </TabsList>
            <TabsContent value="allocated" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Demand: Allocation Requests */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4 text-[#009193]" /> Hardware Request Log
                    </h3>
                  </div>
                  {!allocations || allocations.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground text-xs">
                        No hardware requests found for this project.
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="pt-6">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground uppercase text-[10px] font-bold">
                              <th className="text-left p-3">Product</th>
                              <th className="text-left p-3">Certification</th>
                              <th className="text-center p-3">Qty</th>
                              <th className="text-center p-3">Target Date</th>
                              <th className="text-center p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allocations.map((a: any) => (
                              <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <div className="font-medium text-foreground">{a.products?.name || "—"}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{a.products?.sku}</div>
                                </td>
                                <td className="p-3"><Badge variant="outline" className="text-[9px] uppercase">{a.products?.certification}</Badge></td>
                                <td className="p-3 text-center font-bold text-sm text-[#009193]">{a.quantity}</td>
                                <td className="p-3 text-center text-muted-foreground">
                                  {a.target_date ? format(new Date(a.target_date), "dd MMM yyyy") : "—"}
                                </td>
                                <td className="p-3 text-center">
                                  <Badge 
                                    variant="outline" 
                                    className={cn(
                                      "text-[9px] uppercase font-black",
                                      a.status === 'Requested' ? "bg-blue-50 text-blue-600 border-blue-200" :
                                      a.status === 'Allocated' ? "bg-emerald-50 text-emerald-600 border-emerald-200" : ""
                                    )}
                                  >
                                    {a.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Supply: Physical On-Site Hardware */}
                  <div className="pt-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <History className="h-4 w-4 text-emerald-600" /> Assigned Hardwares
                    </h3>
                    {!physicalHw || physicalHw.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="py-8 text-center text-muted-foreground text-xs">
                          No hardware has been physically assigned to this site ID yet.
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="pt-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground uppercase text-[10px] font-bold">
                                <th className="text-left p-2">Device ID</th>
                                <th className="text-left p-2">MAC Address</th>
                                <th className="text-left p-2">Type</th>
                                <th className="text-center p-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {physicalHw.map((h: any) => (
                                <tr key={h.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                  <td className="p-2 font-mono font-bold text-[#009193]">{h.device_id}</td>
                                  <td className="p-2 font-mono text-muted-foreground">{h.mac_address || "—"}</td>
                                  <td className="p-2">{h.hardware_type || "—"}</td>
                                  <td className="p-2 text-center">
                                    <Badge variant="secondary" className="text-[9px] uppercase font-bold bg-emerald-100 text-emerald-700">
                                      {h.status}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                {/* Sidebar: Request Form */}
                <div className="space-y-4">
                  <Card className="bg-slate-50/50 border-primary/10">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center gap-2 text-[#009193]">
                        <Plus className="h-4 w-4" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">New Request</h4>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase text-slate-400">Select Product</Label>
                          <Select value={requestForm.productId} onValueChange={(v)=>setRequestForm({...requestForm, productId: v})}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select device..." />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-slate-400">Quantity</Label>
                            <Input 
                              type="number" 
                              className="h-9 text-xs" 
                              value={requestForm.quantity} 
                              onChange={(e)=>setRequestForm({...requestForm, quantity: e.target.value})} 
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-slate-400">Handover Date</Label>
                            <Input 
                              type="date" 
                              className="h-9 text-xs" 
                              value={requestForm.targetDate} 
                              onChange={(e)=>setRequestForm({...requestForm, targetDate: e.target.value})} 
                            />
                          </div>
                        </div>
                        <Button 
                          className="w-full h-9 text-xs font-bold gap-2 mt-2" 
                          onClick={handleRequestHardware}
                          disabled={isRequesting}
                        >
                          {isRequesting ? "Requesting..." : "Submit Request"}
                        </Button>
                      </div>
                      <div className="pt-2 flex items-start gap-2 text-[10px] text-muted-foreground italic">
                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                        Requests will appear in the procurement ledger for fulfillment.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="energy">
              <EnergyMonitoringPanel
                certificationId={projectId!}
                isAdmin={role === "ADMIN"}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {hasCert && (
          <TabsContent value="scorecard">
            {certification ? (
              <ScorecardEditor
                certificationId={certification.id}
                currentScore={Number(certification.score)}
                targetScore={Number(certification.target_score)}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No scorecard found for this project.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="wbs">
          <ProjectWBS projectId={projectId!} role={role} />
        </TabsContent>

        <TabsContent value="payments">
          <ProjectPayments projectId={projectId!} />
        </TabsContent>

        <TabsContent value="canvas">
          <ProjectCanvas certificationId={projectId!} />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
