import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScanLine, QrCode } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHrAttendance, useHrProfiles, useHrQrTokens, useRotateQrToken } from "@/hooks/useHr";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export default function HrAttendance() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: profiles = [] } = useHrProfiles();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const filters = useMemo(() => {
    const effectiveUser = isAdmin ? (userFilter === "all" ? undefined : userFilter) : user?.id;
    return {
      userId: effectiveUser,
      fromISO: from ? new Date(from).toISOString() : undefined,
      toISO: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    };
  }, [isAdmin, userFilter, user, from, to]);

  const { data: records = [] } = useHrAttendance(filters);
  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };

  return (
    <MainLayout title="Attendance Log" subtitle="Automatic check-ins via QR scanner. Manual overrides require manager approval.">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {isAdmin && (
          <div>
            <label className="text-xs text-muted-foreground">Person</label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All people</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <>
              <QrTokensDialog />
              <Button onClick={() => navigate("/hr/scanner")}>
                <ScanLine className="w-4 h-4 mr-2" /> Open Scanner
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="backdrop-blur-md bg-card/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Person</th>
              <th className="px-4 py-2 text-left">Check-in</th>
              <th className="px-4 py-2 text-left">Check-out</th>
              <th className="px-4 py-2 text-left">Duration</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Location</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">No records.</td>
              </tr>
            )}
            {records.map((r) => {
              const dur = r.timestamp_out
                ? Math.round((new Date(r.timestamp_out).getTime() - new Date(r.timestamp_in).getTime()) / 60000)
                : null;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2">{nameOf(r.user_id)}</td>
                  <td className="px-4 py-2">{format(new Date(r.timestamp_in), "dd MMM yyyy HH:mm")}</td>
                  <td className="px-4 py-2">
                    {r.timestamp_out ? format(new Date(r.timestamp_out), "dd MMM yyyy HH:mm") : <span className="text-amber-600">open</span>}
                  </td>
                  <td className="px-4 py-2">
                    {dur != null ? `${Math.floor(dur / 60)}h ${dur % 60}m` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={r.status === "auto_qr" ? "default" : "secondary"} className="text-[10px]">
                      {r.status === "auto_qr" ? "QR" : "Manual"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.location_lat && r.location_lng ? `${r.location_lat.toFixed(4)}, ${r.location_lng.toFixed(4)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </MainLayout>
  );
}

function QrTokensDialog() {
  const { data: allProfiles = [] } = useHrProfiles();
  const { data: tokens = [] } = useHrQrTokens();
  const rotate = useRotateQrToken();
  const { toast } = useToast();

  const profiles = useMemo(
    () => allProfiles.filter((p) => p.email?.toLowerCase().endsWith("@fgb-studio.com")),
    [allProfiles]
  );
  const tokenFor = (uid: string) => tokens.find((t) => t.user_id === uid);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline"><QrCode className="w-4 h-4 mr-2" /> Manage QR Codes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>QR Tokens — print and distribute</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {profiles.map((p) => {
            const t = tokenFor(p.id);
            return (
              <Card key={p.id} className="p-3 flex flex-col items-center gap-2">
                <div className="text-xs font-medium text-center truncate w-full">{p.full_name || p.email}</div>
                {t ? <QrPreview value={t.token} /> : <div className="w-32 h-32 bg-muted rounded" />}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await rotate.mutateAsync(p.id);
                      toast({ title: "Token rotated" });
                    } catch (e: any) {
                      toast({ title: "Error", description: e.message, variant: "destructive" });
                    }
                  }}
                >
                  {t ? "Rotate" : "Generate"}
                </Button>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QrPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, { width: 128, margin: 1 });
    }
  }, [value]);
  return <canvas ref={canvasRef} className="rounded" />;
}
