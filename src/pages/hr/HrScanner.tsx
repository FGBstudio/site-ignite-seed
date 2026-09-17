import { useEffect, useRef, useState } from "react";
import { nomePersona } from "@/lib/nomePersona";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { X, LogIn, LogOut, AlertCircle } from "lucide-react";
import { resolveQrToken, useHrProfiles, useRegisterAttendance } from "@/hooks/useHr";
import { useToast } from "@/hooks/use-toast";

export default function HrScanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lockRef = useRef<{ token: string; ts: number } | null>(null);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [lastResult, setLastResult] = useState<{
    name: string;
    action: "in" | "out";
    time: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: profiles = [] } = useHrProfiles();
  const register = useRegisterAttendance();
  const { toast } = useToast();

  // Keep latest mode in ref to avoid restarting scanner
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    (async () => {
      try {
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
          if (!result || stopped) return;
          const token = result.getText();
          // Debounce duplicate scans (3 seconds)
          if (lockRef.current && lockRef.current.token === token && Date.now() - lockRef.current.ts < 3000) return;
          lockRef.current = { token, ts: Date.now() };

          const userId = await resolveQrToken(token);
          if (!userId) {
            toast({ title: "Unknown QR", variant: "destructive" });
            return;
          }
          const profile = profiles.find((p) => p.id === userId);
          const name = profile ? nomePersona(profile) : userId.slice(0, 8);

          // Get location best-effort
          const location = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve(null),
              { timeout: 2000 }
            );
          });

          try {
            const res = await register.mutateAsync({
              user_id: userId,
              mode: modeRef.current,
              location,
              device_label: navigator.userAgent.slice(0, 80),
              status: "auto_qr",
            });
            setLastResult({
              name,
              action: res.action,
              time: new Date().toLocaleTimeString(),
            });
          } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
          }
        });
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e.message || "Camera not available");
      }
    })();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
    };
  }, [profiles, register, toast]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div>
          <div className="text-sm uppercase tracking-widest opacity-70">HR Kiosk</div>
          <div className="text-lg font-medium">Scan your QR code</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "in" ? "default" : "outline"}
            onClick={() => setMode("in")}
            className={mode === "in" ? "" : "bg-transparent text-white border-white/20"}
          >
            <LogIn className="w-4 h-4 mr-2" /> Check-IN
          </Button>
          <Button
            variant={mode === "out" ? "default" : "outline"}
            onClick={() => setMode("out")}
            className={mode === "out" ? "" : "bg-transparent text-white border-white/20"}
          >
            <LogOut className="w-4 h-4 mr-2" /> Check-OUT
          </Button>
          <Button variant="ghost" onClick={() => navigate("/hr/attendance")} className="text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 grid md:grid-cols-2 gap-6 p-6">
        <div className="relative rounded-xl overflow-hidden bg-black border border-white/10">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-0 pointer-events-none border-[3px] border-emerald-400/40 m-12 rounded-lg" />
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-300">
              <AlertCircle className="w-8 h-8 mb-2" />
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-6 bg-white/5 border-white/10 text-white">
            <div className="text-xs uppercase tracking-widest opacity-60">Current mode</div>
            <div className="text-3xl font-medium mt-1">
              {mode === "in" ? "Check-IN" : "Check-OUT"}
            </div>
            <p className="text-xs opacity-60 mt-2">
              Point your personal QR at the camera. The latest check-in / check-out will be recorded automatically.
            </p>
          </Card>

          {lastResult ? (
            <Card className="p-8 bg-emerald-500/10 border-emerald-500/30 text-white">
              <div className="text-xs uppercase tracking-widest text-emerald-300">Last scan</div>
              <div className="text-4xl font-medium mt-2">{lastResult.name}</div>
              <div className="text-lg mt-2 flex items-center gap-2">
                {lastResult.action === "in" ? <LogIn className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
                {lastResult.action === "in" ? "Checked IN" : "Checked OUT"} · {lastResult.time}
              </div>
            </Card>
          ) : (
            <Card className="p-8 bg-white/5 border-white/10 text-white/70 text-sm">
              Waiting for first scan…
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
