import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminPlannerData } from "@/hooks/useAdminPlannerData";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Circle,
  PauseCircle,
  Building2,
  Calendar,
  BarChart3,
  Award,
  TrendingUp,
  Cpu,
  Radio,
  Activity,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";

export const isGreenBuildingCert = (certType?: string | null): boolean => {
  if (!certType) return false;
  const t = certType.trim().toUpperCase();
  return t === "LEED" || t === "BREEAM" || t === "WELL";
};

export const isEnergyOrAir = (certType?: string | null): boolean => {
  if (!certType) return false;
  const t = certType.trim().toLowerCase();
  return t.includes("energy") || t.includes("air");
};

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

const safeFormatDate = (dateVal?: string | null, formatStr = "dd MMM yyyy") => {
  if (!dateVal) return null;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return format(d, formatStr);
  } catch {
    return null;
  }
};

function ScoreGauge({
  score,
  targetScore,
  certType,
  certLevel,
}: {
  score: number;
  targetScore: number;
  certType?: string;
  certLevel?: string;
}) {
  const maxScore = certType?.toUpperCase().includes("WELL") ? 100 : 110;
  const clampedScore = Math.min(Math.max(score, 0), maxScore);
  const percentage = Math.round((clampedScore / maxScore) * 100);

  const radius = 54;
  const stroke = 9;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const thresholds = [
    { label: "Certified", pts: 40 },
    { label: "Silver", pts: 50 },
    { label: "Gold", pts: 60 },
    { label: "Platinum", pts: 80 },
  ];

  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative flex items-center justify-center">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            className="text-muted/20"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            className="text-primary transition-all duration-700 ease-out"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-foreground">{score}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">
            / {maxScore} pts
          </span>
        </div>
      </div>

      <div className="mt-2.5 text-center">
        {certLevel && (
          <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 mb-1 bg-primary/5 border-primary/20">
            🏅 {certLevel}
          </Badge>
        )}
        <p className="text-xs text-muted-foreground">
          {targetScore > 0 ? (
            <span>Target: <strong className="text-foreground">{targetScore} pts</strong></span>
          ) : (
            <span>Score tracking</span>
          )}
          {score > 0 && targetScore > 0 && (
            <span className="ml-1 text-[11px] text-muted-foreground">
              ({Math.round((score / targetScore) * 100)}% of goal)
            </span>
          )}
        </p>
      </div>

      {/* Threshold indicator bar */}
      <div className="w-full mt-3 pt-3 border-t">
        <div className="text-[10px] font-medium text-muted-foreground mb-1.5 flex justify-between">
          <span>Standard Benchmarks</span>
          <span>Max {maxScore} pts</span>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          {thresholds.map((th) => (
            <div
              key={th.label}
              className={cn(
                "rounded px-1 py-1 text-[10px] border transition-colors",
                score >= th.pts
                  ? "bg-primary/10 border-primary/30 font-semibold text-foreground"
                  : "bg-muted/20 border-border/50 text-muted-foreground opacity-70"
              )}
            >
              <div className="truncate">{th.label}</div>
              <div className="text-[9px] opacity-80">{th.pts}+</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MilestoneStepper({ project }: { project: any }) {
  const isHw = isEnergyOrAir(project.cert_type);
  const { data: hwData } = useHardwareMonitoring(project.site_id, project.cert_type);

  const poDate = safeFormatDate(project.po_sign_date);
  const quoteDate = safeFormatDate(project.quotation_approved_at);
  const plannedDate = safeFormatDate(project.planned_handover_date || project.handover_date || project.baseline_handover_date);
  const actualHandoverDate = safeFormatDate(project.actual_handover_date);
  const certDate = safeFormatDate(project.issued_date);

  // Exact Supabase truth: strictly achieved ONLY if the database record actually exists!
  const poAchieved = Boolean(project.po_sign_date);
  const quoteAchieved = Boolean(project.quotation_approved_at);
  const handoverAchieved = Boolean(project.actual_handover_date);
  const certAchieved = Boolean(project.issued_date);

  // Hardware-specific dates and status
  const installDateStr = safeFormatDate(hwData?.installDate);
  const installDateObj = hwData?.installDate ? new Date(hwData.installDate) : null;
  const isInstallPastOrToday = installDateObj
    ? installDateObj.setHours(0, 0, 0, 0) <= new Date().setHours(0, 0, 0, 0)
    : false;
  const isInstalled = Boolean(hwData?.installDate && isInstallPastOrToday);
  const isOnline = Boolean(hwData?.isOnline);
  const deviceCount = hwData?.devices?.length || 0;
  const onlineCount = hwData?.onlineDevicesCount || 0;
  const lastSeenSummary = hwData?.overallLastSeenText;
  const isOffline = !isOnline && deviceCount > 0;

  const steps = isHw
    ? [
        {
          id: "po",
          title: "PO Signed",
          column: "po_sign_date",
          date: poDate || "Not recorded",
          status: poAchieved ? "achieved" : "pending",
        },
        {
          id: "quote",
          title: "Quotation Approved",
          column: "quotation_approved_at",
          date: quoteDate || "Not recorded",
          status: quoteAchieved ? "achieved" : (poAchieved ? "in_progress" : "pending"),
        },
        {
          id: "installed",
          title: "Installation Date",
          column: "installation_date",
          date: hwData?.installDate
            ? (isInstalled ? `${installDateStr} (Done)` : `Planned: ${installDateStr}`)
            : (plannedDate ? `Planned: ${plannedDate}` : "Date pending"),
          status: isInstalled ? "achieved" : (hwData?.installDate ? "in_progress" : (quoteAchieved || poAchieved ? "in_progress" : "pending")),
        },
        {
          id: "online",
          title: "Online Status",
          column: "online_status",
          date: isOnline
            ? `● Online (${onlineCount}/${deviceCount} dev)`
            : (deviceCount > 0
                ? (lastSeenSummary ? `○ Offline (Last seen ${lastSeenSummary})` : `○ Offline (${deviceCount} dev)`)
                : "Pending setup"),
          status: isOnline ? "achieved" : (isInstalled ? "in_progress" : "pending"),
          isOfflineRed: isOffline,
        },
      ]
    : [
        {
          id: "po",
          title: "PO Signed",
          column: "po_sign_date",
          date: poDate || "Not recorded",
          status: poAchieved ? "achieved" : "pending",
        },
        {
          id: "quote",
          title: "Quotation Approved",
          column: "quotation_approved_at",
          date: quoteDate || "Not recorded",
          status: quoteAchieved ? "achieved" : (poAchieved ? "in_progress" : "pending"),
        },
        {
          id: "handover",
          title: "Handover",
          column: "actual_handover_date",
          date: actualHandoverDate || (plannedDate ? `Target: ${plannedDate}` : "Not recorded"),
          status: handoverAchieved ? "achieved" : (quoteAchieved || poAchieved ? "in_progress" : "pending"),
        },
        {
          id: "certified",
          title: "Certification",
          column: "issued_date",
          date: certDate || (project.status === "certificato" ? "Certified (Date pending)" : "Pending"),
          status: certAchieved ? "achieved" : (project.status === "certificato" ? "in_progress" : "pending"),
        },
      ];

  return (
    <div className="py-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 relative">
        {steps.map((step, idx) => {
          const isDone = step.status === "achieved";
          const isActive = step.status === "in_progress";
          const isOfflineRed = (step as any).isOfflineRed;
          return (
            <div
              key={step.id}
              className={cn(
                "relative flex flex-col p-3 rounded-lg border transition-all",
                isDone && "bg-emerald-500/5 border-emerald-500/30",
                isOfflineRed && "bg-rose-500/5 border-rose-500/30 ring-1 ring-rose-500/30",
                isActive && !isOfflineRed && "bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/30",
                !isDone && !isActive && !isOfflineRed && "bg-muted/15 border-border/70"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={cn(
                    "flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold",
                    isDone && "bg-emerald-600 text-white",
                    isOfflineRed && "bg-rose-600 text-white",
                    isActive && !isOfflineRed && "bg-amber-500 text-white animate-pulse",
                    !isDone && !isActive && !isOfflineRed && "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  {isDone ? "✓" : isOfflineRed ? "!" : idx + 1}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    isDone && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold",
                    isOfflineRed && "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold",
                    isActive && !isOfflineRed && "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    !isDone && !isActive && !isOfflineRed && "text-muted-foreground bg-muted/30"
                  )}
                >
                  {isDone ? (step.id === "online" ? "Active" : "Completed") : isOfflineRed ? "Offline" : isActive ? "Active" : "Pending"}
                </Badge>
              </div>
              <p className="font-semibold text-xs text-foreground">{step.title}</p>
              <p className={cn("text-[11px] mt-0.5", isDone ? "text-foreground font-medium" : isOfflineRed ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-muted-foreground")}>
                {step.date}
              </p>
              <span className="text-[9px] text-muted-foreground/60 font-mono mt-1">
                db: {step.column}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2.5 text-center">
        {isHw ? (
          <>Milestone status derived strictly from database records (<code className="text-[10px]">po_sign_date</code>, <code className="text-[10px]">quotation_approved_at</code>, <code className="text-[10px]">installation_date</code>, <code className="text-[10px]">online_status</code>).</>
        ) : (
          <>Milestone status derived strictly from database records (<code className="text-[10px]">po_sign_date</code>, <code className="text-[10px]">quotation_approved_at</code>, <code className="text-[10px]">actual_handover_date</code>, <code className="text-[10px]">issued_date</code>).</>
        )}
      </p>
    </div>
  );
}

function PortfolioBenchmarkCard({
  project,
  allProjects,
}: {
  project: any;
  allProjects: any[];
}) {
  if (!isGreenBuildingCert(project.cert_type)) return null;

  const certType = project.cert_type?.trim() || "LEED";
  const certRating = project.cert_rating?.trim();

  // Strict like-for-like comparison:
  // Never mix WELL and LEED.
  // Within LEED/BREEAM, strictly compare O+M with O+M, ID+C with ID+C, BD+C with BD+C.
  const peers = useMemo(() => {
    return allProjects.filter((p: any) => {
      if (p.id === project.id) return false;
      if (p.cert_type?.trim().toUpperCase() !== certType.toUpperCase()) return false;
      if (certRating && p.cert_rating) {
        return p.cert_rating.trim().toLowerCase() === certRating.toLowerCase();
      }
      return true;
    });
  }, [allProjects, certType, certRating, project.id]);

  const peerCount = peers.length;
  if (peerCount === 0) return null;

  const ratingLabel = certRating ? `${certType} ${certRating}` : certType;

  // 1. Score & Standing Comparison
  const peerScores = peers
    .map((p: any) => Number(p.score || p.target_score))
    .filter((s: number) => !isNaN(s) && s > 0);

  const avgScore = peerScores.length > 0
    ? Math.round(peerScores.reduce((sum, s) => sum + s, 0) / peerScores.length)
    : 0;

  const currentScore = Number(project.score) || Number(project.target_score) || 0;
  const scoreDiff = currentScore && avgScore ? currentScore - avgScore : 0;

  let percentile = 50;
  if (peerScores.length > 0 && currentScore > 0) {
    const lowerCount = peerScores.filter((s) => s <= currentScore).length;
    percentile = Math.round((lowerCount / peerScores.length) * 100);
  }

  // 2. Level Breakdown
  const levelCounts: Record<string, number> = {
    Platinum: 0,
    Gold: 0,
    Silver: 0,
    Certified: 0,
  };
  peers.forEach((p: any) => {
    if (p.cert_level && levelCounts[p.cert_level] !== undefined) {
      levelCounts[p.cert_level]++;
    }
  });
  const totalWithLevel = Object.values(levelCounts).reduce((a, b) => a + b, 0);

  // 3. Area (sqm) Comparison
  const peerAreas = peers
    .map((p: any) => Number(p.sqm))
    .filter((a: number) => !isNaN(a) && a > 0);

  const avgArea = peerAreas.length > 0
    ? Math.round(peerAreas.reduce((sum, a) => sum + a, 0) / peerAreas.length)
    : null;
  const currentArea = Number(project.sqm) || 0;
  const areaDiffPercent = avgArea && currentArea
    ? Math.round(((currentArea - avgArea) / avgArea) * 100)
    : null;

  // 4. Progress Pace
  let daysToHandover: number | null = null;
  const handoverDateVal = project.actual_handover_date || project.handover_date || project.planned_handover_date;
  if (handoverDateVal) {
    daysToHandover = Math.ceil(
      (new Date(handoverDateVal).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
  }

  const currentLevel = project.cert_level || project.level || "Pending";
  const handoverDateStr = safeFormatDate(handoverDateVal);

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Portfolio Benchmark: {ratingLabel}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparing this project against <strong className="text-foreground">{peerCount}</strong> other {ratingLabel} projects in FGB database
            </p>
          </div>

          <Badge variant="secondary" className="text-xs font-semibold px-2.5 py-1 w-fit bg-primary/10 text-primary border border-primary/20">
            🏅 {ratingLabel} Cohort
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        {/* 1. Score & Standing Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/20 border">
          {/* Project Score */}
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Project Score
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-foreground tracking-tight">
                {currentScore > 0 ? currentScore : "—"}
              </span>
              <span className="text-xs text-muted-foreground">pts</span>
              <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 ml-1">
                🏅 {currentLevel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {project.status === "certificato" ? "Certified Score" : "Target / Active Score"}
            </p>
          </div>

          {/* Peer Rating Average Comparison -> Story-Driven: Performance vs Peers */}
          <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-border/60 md:pl-4 pt-3 md:pt-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Performance vs. Peers
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              {currentScore > 0 && avgScore > 0 ? (
                scoreDiff > 0 ? (
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center gap-1">
                    <TrendingUp className="h-5 w-5" /> +{scoreDiff} pts Outperforming
                  </span>
                ) : scoreDiff < 0 ? (
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
                    {Math.abs(scoreDiff)} pts Below Average
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-foreground tracking-tight">
                    Equal to Peer Avg
                  </span>
                )
              ) : (
                <span className="text-2xl font-bold text-muted-foreground tracking-tight">
                  {avgScore ? `${avgScore} pts avg` : "—"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {currentScore > 0 && avgScore > 0
                ? scoreDiff > 0
                  ? `This project scored ${currentScore} pts compared to the ${ratingLabel} peer average of ${avgScore}.`
                  : scoreDiff < 0
                  ? `This project scored ${currentScore} pts compared to the ${ratingLabel} peer average of ${avgScore}.`
                  : `This project matches the ${ratingLabel} standard peer average of ${avgScore} pts.`
                : `Benchmark standard average across ${peerScores.length} recorded ${ratingLabel} projects.`}
            </p>
          </div>

          {/* Portfolio Standing / Percentile -> Story-Driven: Peer Ranking */}
          <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-border/60 md:pl-4 pt-3 md:pt-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Peer Ranking
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              {currentScore > 0 && peerScores.length > 0 ? (
                <span className="text-2xl font-bold text-primary tracking-tight">
                  {percentile >= 80
                    ? `Top Tier (Top ${Math.max(1, 100 - percentile)}%)`
                    : `Outscored ${percentile}% of Peers`}
                </span>
              ) : (
                <span className="text-xl font-semibold text-muted-foreground tracking-tight">
                  Pending Score
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {currentScore > 0 && peerScores.length > 0
                ? `This project outperformed ${percentile}% of similar projects (placing it in the top ${Math.max(1, 100 - percentile)}% of the ${ratingLabel} database).`
                : `Awaiting score evaluation to rank against ${peerCount} ${ratingLabel} projects.`}
            </p>
          </div>
        </div>

        {/* 2. Portfolio Level Distribution */}
        {totalWithLevel > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-foreground">
                Certification Level Distribution across {peerCount} {ratingLabel} Projects
              </span>
              <span className="text-muted-foreground text-[11px]">
                This Project: <strong className="text-primary">{currentLevel}</strong>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["Certified", "Silver", "Gold", "Platinum"] as const).map((lvl) => {
                const count = levelCounts[lvl] || 0;
                const pct = totalWithLevel > 0 ? Math.round((count / totalWithLevel) * 100) : 0;
                const isCurrent = lvl.toLowerCase() === currentLevel.toLowerCase();

                return (
                  <div
                    key={lvl}
                    className={cn(
                      "p-2.5 rounded-lg border text-center transition-all",
                      isCurrent
                        ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40"
                        : "bg-muted/10 border-border/60"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1 mb-1">
                      {isCurrent && <span className="text-xs">📍</span>}
                      <span className={cn("text-xs font-semibold", isCurrent ? "text-primary" : "text-foreground")}>
                        {lvl}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-foreground">{pct}%</div>
                    <div className="text-[10px] text-muted-foreground">{count} {ratingLabel} projects</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Scale (GFA) & Schedule Benchmarks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t text-xs">
          {/* Space / GFA Scale */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Gross Floor Area (GFA)</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {currentArea > 0 ? `${currentArea.toLocaleString()} m²` : "—"}
              </p>
              {avgArea && currentArea > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Peer average: {avgArea.toLocaleString()} m²
                  {areaDiffPercent !== null && (
                    <span className="ml-1 font-medium">
                      ({areaDiffPercent >= 0 ? `+${areaDiffPercent}%` : `${areaDiffPercent}%`})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Delivery & Timeline Schedule */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Delivery Schedule</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {handoverDateStr || "Date not recorded"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {project.status === "certificato" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Project Certified</span>
                ) : project.status === "completato" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Project Completed</span>
                ) : daysToHandover !== null ? (
                  daysToHandover >= 0 ? (
                    <span className="text-primary font-medium">{daysToHandover} days remaining</span>
                  ) : (
                    <span className="text-destructive font-medium">{Math.abs(daysToHandover)} days overdue</span>
                  )
                ) : (
                  <span>Status: {project.status || "Active"}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function useHardwareMonitoring(siteId: string | null, certType: string) {
  return useQuery({
    queryKey: ["project-hardware-status", siteId, certType],
    enabled: !!siteId,
    queryFn: async () => {
      if (!siteId) return null;

      // 1. Query devices table using site_id / site_uuid
      let devicesList: any[] = [];
      try {
        const { data: d1 } = await (supabase as any)
          .from("devices")
          .select("*")
          .eq("site_id", siteId);
        if (d1 && d1.length > 0) {
          devicesList = d1;
        } else {
          const { data: d2 } = await (supabase as any)
            .from("devices")
            .select("*")
            .eq("site_uuid", siteId);
          if (d2 && d2.length > 0) devicesList = d2;
        }
      } catch (e) {
        console.warn("Could not query devices table:", e);
      }

      // 2. Query hardwares table for assigned devices & serial numbers
      let hardwaresList: any[] = [];
      try {
        const { data: hw } = await (supabase as any)
          .from("hardwares")
          .select("*")
          .eq("site_id", siteId)
          .neq("status", "In Stock");
        hardwaresList = hw || [];
      } catch (e) {}

      // 3. Query site_energy_records or site_air_records for installation_date and online_status
      let monitorRecord: any = null;
      try {
        const isEnergy = certType.toLowerCase().includes("energy");
        if (isEnergy) {
          const { data: en } = await (supabase as any)
            .from("site_energy_records")
            .select("installation_date, online_status, handover_date, notes")
            .eq("site_id", siteId)
            .maybeSingle();
          monitorRecord = en;
        } else {
          const { data: air } = await (supabase as any)
            .from("site_air_records")
            .select("online_status, handover_date, latest_shipment_date, notes")
            .eq("site_id", siteId)
            .maybeSingle();
          monitorRecord = air;
        }
      } catch (e) {}

      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      // Merge devices information
      const mergedDevices = devicesList.length > 0
        ? devicesList.map((d: any) => {
            const hwMatch = hardwaresList.find((h: any) => String(h.device_id) === String(d.device_id));
            const lastSeenRaw = d.last_seen || null;
            let isDevOnline = false;
            let lastSeenText = "Never seen";
            let diffHours: number | null = null;

            if (lastSeenRaw) {
              const lastSeenMs = new Date(lastSeenRaw).getTime();
              const diffMs = now - lastSeenMs;
              diffHours = diffMs / (1000 * 60 * 60);
              // Online if last_seen is less than 24 hours ago
              isDevOnline = diffMs >= 0 && diffMs < ONE_DAY_MS;
              if (diffMs < 60 * 1000) lastSeenText = "just now";
              else if (diffMs < 60 * 60 * 1000) lastSeenText = `${Math.floor(diffMs / 60000)}m ago`;
              else if (diffMs < ONE_DAY_MS) lastSeenText = `${Math.floor(diffHours)}h ago`;
              else lastSeenText = `${Math.floor(diffHours / 24)}d ago`;
            } else if (String(d.status).toLowerCase() === "online") {
              isDevOnline = true;
              lastSeenText = "active";
            }

            return {
              device_id: d.device_id || hwMatch?.device_id || "—",
              status: isDevOnline ? "online" : "offline",
              isOnline: isDevOnline,
              last_seen: lastSeenRaw,
              lastSeenText,
              diffHours,
              installation_date: d.installation_date || d.installed_at || hwMatch?.installation_date || monitorRecord?.installation_date || null,
              hardware_type: d.device_type || d.type || hwMatch?.hardware_type || "Sensor",
            };
          })
        : hardwaresList.map((h: any) => ({
            device_id: h.device_id,
            status: "offline",
            isOnline: false,
            last_seen: null,
            lastSeenText: "Never seen",
            diffHours: null,
            installation_date: h.installation_date || monitorRecord?.installation_date || null,
            hardware_type: h.hardware_type || "Sensor",
          }));

      const onlineDevicesCount = mergedDevices.filter((d: any) => d.isOnline).length;
      const isAnyOnline = onlineDevicesCount > 0;

      // Overall last seen
      const allSeenTimes = mergedDevices.map((d: any) => d.last_seen ? new Date(d.last_seen).getTime() : 0).filter(Boolean);
      const mostRecentLastSeenMs = allSeenTimes.length > 0 ? Math.max(...allSeenTimes) : null;
      let overallLastSeenText: string | null = null;
      if (mostRecentLastSeenMs) {
        const diffMs = now - mostRecentLastSeenMs;
        if (diffMs < 60 * 1000) overallLastSeenText = "just now";
        else if (diffMs < 60 * 60 * 1000) overallLastSeenText = `${Math.floor(diffMs / 60000)}m ago`;
        else if (diffMs < ONE_DAY_MS) overallLastSeenText = `${Math.floor(diffMs / 3600000)}h ago`;
        else overallLastSeenText = `${Math.floor(diffMs / 86400000)}d ago`;
      }

      const resolvedInstallDate = monitorRecord?.installation_date ||
        mergedDevices.find((d: any) => d.installation_date)?.installation_date || null;

      return {
        devices: mergedDevices,
        installDate: resolvedInstallDate,
        isOnline: isAnyOnline,
        onlineDevicesCount,
        overallLastSeenText,
        onlineStatus: isAnyOnline ? "online" : (mergedDevices.length > 0 ? "offline" : "pending"),
      };
    },
  });
}

function HardwareMonitoringCard({
  siteId,
  certType,
}: {
  siteId: string | null;
  certType: string;
}) {
  const { data: hwData } = useHardwareMonitoring(siteId, certType);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingDate, setEditingDate] = useState(false);
  const [newDateVal, setNewDateVal] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  const installDateStr = safeFormatDate(hwData?.installDate);
  const installDateObj = hwData?.installDate ? new Date(hwData.installDate) : null;
  const isInstallPastOrToday = installDateObj
    ? installDateObj.setHours(0, 0, 0, 0) <= new Date().setHours(0, 0, 0, 0)
    : false;
  const isInstalled = Boolean(hwData?.installDate && isInstallPastOrToday);
  const deviceCount = hwData?.devices?.length || 0;
  const onlineCount = hwData?.onlineDevicesCount || 0;
  const isOnline = hwData?.isOnline;
  const lastSeenSummary = hwData?.overallLastSeenText;

  const handleStartEdit = () => {
    setNewDateVal(hwData?.installDate ? hwData.installDate.slice(0, 10) : "");
    setEditingDate(true);
  };

  const handleSaveInstallDate = async () => {
    if (!siteId) return;
    setSavingDate(true);
    try {
      const isEnergy = certType.toLowerCase().includes("energy");
      if (isEnergy) {
        // Upsert or update site_energy_records
        const { data: existing } = await (supabase as any)
          .from("site_energy_records")
          .select("id")
          .eq("site_id", siteId)
          .maybeSingle();

        if (existing?.id) {
          await (supabase as any)
            .from("site_energy_records")
            .update({ installation_date: newDateVal || null })
            .eq("id", existing.id);
        } else {
          await (supabase as any)
            .from("site_energy_records")
            .insert({ site_id: siteId, installation_date: newDateVal || null });
        }
      } else {
        // Also sync to hardwares assigned to this site
        await (supabase as any)
          .from("hardwares")
          .update({ installation_date: newDateVal || null })
          .eq("site_id", siteId);
      }
      await queryClient.invalidateQueries({ queryKey: ["project-hardware-status", siteId] });
      toast({ title: "Installation date updated", description: `Saved as ${newDateVal || "cleared"}.` });
      setEditingDate(false);
    } catch (e: any) {
      toast({ title: "Error saving date", description: e.message, variant: "destructive" });
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Hardware & Monitoring Status
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-semibold px-2 py-0.5",
              isOnline
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : deviceCount > 0
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                : "bg-muted text-muted-foreground border-border"
            )}
          >
            {isOnline
              ? `● Online (${onlineCount}/${deviceCount})`
              : deviceCount > 0
              ? `○ Offline ${lastSeenSummary ? `(Last seen ${lastSeenSummary})` : ""}`
              : "Pending Setup"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        {/* Quick Highlights */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/20 border">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                Installation Date
              </span>
              {!editingDate && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-primary hover:underline text-[10px] inline-flex items-center gap-0.5"
                  title="Update installation date"
                >
                  <Pencil className="h-2.5 w-2.5" /> Edit
                </button>
              )}
            </div>
            {editingDate ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  type="date"
                  value={newDateVal}
                  onChange={(e) => setNewDateVal(e.target.value)}
                  className="h-7 text-xs px-2 py-0 w-36"
                />
                <Button
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleSaveInstallDate}
                  disabled={savingDate}
                  title="Save date"
                >
                  {savingDate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingDate(false)}
                  disabled={savingDate}
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <p className="text-sm font-bold text-foreground mt-0.5 flex items-center gap-1.5">
                {installDateStr || "Date pending"}
                {isInstalled && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-700 border-emerald-500/20 font-semibold">
                    Done
                  </Badge>
                )}
                {hwData?.installDate && !isInstalled && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-700 border-amber-500/20 font-semibold">
                    Planned
                  </Badge>
                )}
              </p>
            )}
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
              Active Sensors / Devices
            </span>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {onlineCount} / {deviceCount} Online
            </p>
          </div>
        </div>

        {/* Assigned Devices List */}
        <div>
          <span className="font-semibold text-foreground text-xs block mb-2">
            Site Telemetry & Hardware ({deviceCount})
          </span>
          {deviceCount === 0 ? (
            <div className="p-3 text-center text-muted-foreground border border-dashed rounded-lg">
              No hardware assigned to this site yet.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {hwData?.devices.map((d: any, idx: number) => {
                return (
                  <div
                    key={d.device_id || idx}
                    className={cn(
                      "flex items-center justify-between p-2 rounded border text-[11px] transition-colors",
                      d.isOnline ? "bg-card border-border" : "bg-rose-500/5 border-rose-500/20"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", d.isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                      <div className="truncate">
                        <span className="font-mono font-semibold text-foreground">{d.device_id}</span>
                        <span className="text-muted-foreground ml-1.5 text-[10px] truncate">({d.hardware_type})</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 capitalize shrink-0 ml-2 font-medium",
                        d.isOnline
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold"
                      )}
                    >
                      {d.isOnline ? `Online (${d.lastSeenText})` : `Offline (Last seen ${d.lastSeenText})`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreditCategoryBreakdownChart({
  categories,
}: {
  categories: { name: string; score: number; maxScore: number }[];
}) {
  if (categories.length === 0) return null;

  const catData = categories.map((c) => ({
    name: c.name.length > 18 ? `${c.name.slice(0, 16)}...` : c.name,
    fullName: c.name,
    score: c.score,
    maxScore: c.maxScore,
  }));

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Credit Category Scorecard Breakdown
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {categories.length} Categories
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={catData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
              <XAxis type="number" domain={[0, 'dataMax + 2']} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: any, name: string) => [
                  `${value} pts`,
                  name === "score" ? "Achieved" : "Max Possible",
                ]}
                labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
              />
              <Bar dataKey="maxScore" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} barSize={12} opacity={0.5} />
              <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectOverview({ certificationId, project, timelineMilestones }: ProjectOverviewProps) {
  const pmName = project.profiles?.display_name || project.profiles?.full_name || project.profiles?.email || "—";
  const { data: allProjects = [] } = useAdminPlannerData();

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

  const isCert = isGreenBuildingCert(project.cert_type);
  const isHw = isEnergyOrAir(project.cert_type);
  const { data: hwData } = useHardwareMonitoring(project.site_id, project.cert_type);

  const totalAchieved = timelineMilestones.filter((m: any) => m.status === "achieved").length;
  const recordedMilestoneCount = isHw
    ? [
        project.po_sign_date,
        project.quotation_approved_at,
        hwData?.installDate,
        hwData?.isOnline ? "online" : null,
      ].filter(Boolean).length
    : [
        project.po_sign_date,
        project.quotation_approved_at,
        project.actual_handover_date,
        project.issued_date,
      ].filter(Boolean).length;

  const overallProgress = timelineMilestones.length > 0
    ? Math.round((totalAchieved / timelineMilestones.length) * 100)
    : Math.round((recordedMilestoneCount / 4) * 100);

  const effectiveScore = scorecardMilestones.length > 0 ? totalScore : (Number(project.score) || 0);
  const effectiveTarget = Number(project.target_score) || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left 2 columns: Project Timeline + Aesthetic Cards below */}
      <div className="lg:col-span-2 space-y-6">
        {/* Project Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Project Timeline</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{project.cert_type}</Badge>
                {timelineMilestones.length > 0 ? (
                  <span className="text-sm text-muted-foreground">{overallProgress}% complete</span>
                ) : isHw ? (
                  <span className="text-xs text-muted-foreground">
                    {recordedMilestoneCount}/4 telemetry milestones ({overallProgress}%)
                  </span>
                ) : project.status === "certificato" ? (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    Certified · {recordedMilestoneCount}/4 dates in DB
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {recordedMilestoneCount}/4 milestones recorded ({overallProgress}%)
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {timelineMilestones.length === 0 ? (
              <MilestoneStepper project={project} />
            ) : (
              <div className="relative pl-8 py-2">
                {/* Vertical line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-primary/30" />

                {timelineMilestones.map((milestone: any) => {
                  const dateStr = milestone.due_date
                    ? safeFormatDate(milestone.due_date, "MMM yyyy")
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
                            {safeFormatDate(milestone.start_date)} → {safeFormatDate(milestone.due_date)}
                          </p>
                        )}
                        {milestone.completed_date && (
                          <p className="text-xs text-primary">
                            ✓ Completed {safeFormatDate(milestone.completed_date)}
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

        {/* Portfolio Benchmark & Peer Comparison Card (Certifications Only) */}
        {isCert && (
          <PortfolioBenchmarkCard project={project} allProjects={allProjects} />
        )}

        {/* Category Breakdown if checklist items exist (Certifications Only) */}
        {isCert && creditCategories.length > 0 && (
          <CreditCategoryBreakdownChart categories={creditCategories} />
        )}
      </div>

      {/* Right Column: Credits Overview (Certifications) OR Hardware Status (Energy & Air) + Project Specification */}
      <div className="space-y-4">
        {/* Credits Overview: ONLY for Certifications */}
        {isCert && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Credits Overview</CardTitle>
                {project.cert_level && (
                  <Badge variant="outline" className="text-xs">
                    {project.cert_level}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {creditCategories.length === 0 ? (
                <ScoreGauge
                  score={effectiveScore}
                  targetScore={effectiveTarget}
                  certType={project.cert_type}
                  certLevel={project.cert_level}
                />
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
        )}

        {/* Hardware & Monitoring Status: ONLY for Energy & Air projects */}
        {isHw && (
          <HardwareMonitoringCard siteId={project.site_id} certType={project.cert_type} />
        )}

        {/* Project Specification Sheet: Adaptive based on Cert vs Service */}
        <Card>
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Project Specification
              </CardTitle>
              <Badge variant="outline" className="text-[11px] capitalize">
                {project.status || "Active"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-3 text-xs">
            <div className="flex justify-between py-1 border-b border-muted/50">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium text-foreground">{project.client || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-muted/50">
              <span className="text-muted-foreground">Project Manager</span>
              <span className="font-medium text-foreground">{pmName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-muted/50">
              <span className="text-muted-foreground">{isCert ? "Rating System" : "Service Type"}</span>
              <span className="font-medium text-foreground">
                {[project.cert_type, project.cert_rating, project.cert_version ? `v${project.cert_version}` : null].filter(Boolean).join(" ") || project.cert_type || "—"}
              </span>
            </div>
            {project.project_subtype && (
              <div className="flex justify-between py-1 border-b border-muted/50">
                <span className="text-muted-foreground">Subtype / Scope</span>
                <span className="font-medium text-foreground">{project.project_subtype}</span>
              </div>
            )}
            {isCert ? (
              <>
                <div className="flex justify-between py-1 border-b border-muted/50">
                  <span className="text-muted-foreground">Target Level</span>
                  <span className="font-medium text-foreground">
                    {project.cert_level || "—"}{project.target_score ? ` (${project.target_score} pts)` : ""}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-muted/50">
                  <span className="text-muted-foreground">Certified Score</span>
                  <span className="font-medium text-foreground">
                    {project.score ? `${project.score} pts` : "Pending"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-muted/50">
                  <span className="text-muted-foreground">Certified Date</span>
                  <span className="font-medium text-foreground">
                    {safeFormatDate(project.issued_date) || "Pending"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Recertification Due</span>
                  <span className="font-medium text-foreground">
                    {safeFormatDate(project.expiry_date) || "—"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between py-1 border-b border-muted/50">
                  <span className="text-muted-foreground">Site / Region</span>
                  <span className="font-medium text-foreground">
                    {[project.sites?.name, project.sites?.city, project.region].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-muted/50">
                  <span className="text-muted-foreground">Delivery / Handover</span>
                  <span className="font-medium text-foreground">
                    {safeFormatDate(project.actual_handover_date || project.handover_date || project.planned_handover_date) || "Pending"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Service Status</span>
                  <span className="font-medium text-foreground capitalize">
                    {project.status || "Active"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


