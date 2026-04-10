import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CheckCircle2, Clock, Circle, PauseCircle } from "lucide-react";

interface ProjectOverviewProps {
  certificationId: string;
  project: any;
  timelineMilestones: any[];
}

const statusIcon = (status: string) => {
  switch (status) {
    case "achieved":
      return <CheckCircle2 className="h-5 w-5 text-primary" />;
    case "in_progress":
      return <Clock className="h-5 w-5 text-warning animate-pulse" />;
    case "on_hold":
      return <PauseCircle className="h-5 w-5 text-destructive" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "achieved": return "Completed";
    case "in_progress": return "In Progress";
    case "on_hold": return "On Hold";
    default: return "Pending";
  }
};

export function ProjectOverview({ certificationId, project, timelineMilestones }: ProjectOverviewProps) {
  // Fetch scorecard milestones for credits summary
  const { data: scorecardMilestones = [] } = useQuery({
    queryKey: ["scorecard-milestones", certificationId],
    enabled: !!certificationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certificationId)
        .eq("milestone_type", "scorecard")
        .order("category")
        .order("requirement");
      if (error) throw error;
      return data || [];
    },
  });

  // Group scorecard by category
  const creditCategories = useMemo(() => {
    const groups: Record<string, { score: number; maxScore: number; count: number }> = {};
    scorecardMilestones.forEach((m: any) => {
      if (!groups[m.category]) groups[m.category] = { score: 0, maxScore: 0, count: 0 };
      groups[m.category].score += Number(m.score || 0);
      groups[m.category].maxScore += Number(m.max_score || 0);
      groups[m.category].count += 1;
    });
    return Object.entries(groups).map(([name, data]) => ({ name, ...data }));
  }, [scorecardMilestones]);

  const totalScore = creditCategories.reduce((s, c) => s + c.score, 0);
  const totalMaxScore = creditCategories.reduce((s, c) => s + c.maxScore, 0);

  const totalAchieved = timelineMilestones.filter((m: any) => m.status === "achieved").length;
  const overallProgress = timelineMilestones.length > 0 ? Math.round((totalAchieved / timelineMilestones.length) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Vertical Timeline */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Project Timeline</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{project.cert_type}</Badge>
              <span className="text-sm text-muted-foreground">{overallProgress}% complete</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timelineMilestones.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No timeline configured yet.</p>
          ) : (
            <div className="relative pl-8">
              {/* Vertical line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-primary/30" />

              {timelineMilestones.map((milestone: any, idx: number) => {
                const isLeft = idx % 2 === 0;
                const dateStr = milestone.due_date
                  ? format(new Date(milestone.due_date), "MMM yyyy")
                  : "TBD";

                return (
                  <div key={milestone.id} className="relative flex items-start mb-6 last:mb-0">
                    {/* Node dot */}
                    <div className="absolute left-[-17px] top-0.5 z-10 bg-background rounded-full p-0.5">
                      {statusIcon(milestone.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 ml-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                          {dateStr}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] border",
                            milestone.status === "achieved" && "bg-primary/10 text-primary border-primary/20",
                            milestone.status === "in_progress" && "bg-warning/10 text-warning border-warning/20",
                            milestone.status === "on_hold" && "bg-destructive/10 text-destructive border-destructive/20",
                            milestone.status === "pending" && "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {statusLabel(milestone.status)}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground">{milestone.requirement}</p>
                      {milestone.start_date && milestone.due_date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(milestone.start_date), "dd MMM yyyy")} → {format(new Date(milestone.due_date), "dd MMM yyyy")}
                        </p>
                      )}
                      {milestone.completed_date && (
                        <p className="text-xs text-primary">
                          ✓ Completed {format(new Date(milestone.completed_date), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credits Summary */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Credits Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {creditCategories.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">No scorecard data available.</p>
            ) : (
              <div className="space-y-4">
                {/* Total score */}
                <div className="text-center pb-3 border-b">
                  <p className="text-3xl font-bold text-primary">{totalScore}</p>
                  <p className="text-xs text-muted-foreground">of {totalMaxScore} possible points</p>
                  <Progress value={totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0} className="mt-2 h-2" />
                </div>

                {/* Per-category */}
                {creditCategories.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground truncate">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">{cat.score}/{cat.maxScore}</span>
                    </div>
                    <Progress value={cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Info Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Project Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium text-foreground">{project.client}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Region</span>
              <span className="font-medium text-foreground">{project.region}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Certification</span>
              <Badge variant="secondary">{project.cert_type}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Handover</span>
              <span className="font-medium text-foreground">{format(new Date(project.handover_date), "dd MMM yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{project.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-foreground">{overallProgress}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
