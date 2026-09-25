import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMioBadge } from "@/hooks/useHr";

/**
 * Il mio badge.
 *
 * Il QR deve poter vivere sul telefono di chi lo usa: chi lo salva nelle foto
 * la mattina non deve aprire niente, e chi non l'ha salvato lo ritrova qui.
 * Per questo la pagina e' aperta a chiunque abbia un accesso, non solo a chi
 * governa HR: il badge di una persona riguarda quella persona.
 */
export default function HrMioBadge() {
  const { user } = useAuth();
  const { data: token, isLoading, error } = useMioBadge();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pronto, setPronto] = useState(false);

  const nome =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Badge";

  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, { width: 260, margin: 1 }).then(() => setPronto(true));
  }, [token]);

  const scarica = () => {
    if (!token) return;
    // Il file che finisce nelle foto del telefono: il QR, e sotto il nome, per
    // quando qualcuno lo mostra e chi guarda deve sapere di chi e'.
    const LATO = 720;
    const MARGINE = 60;
    const codice = document.createElement("canvas");
    QRCode.toCanvas(codice, token, { width: LATO - MARGINE * 2, margin: 0 }).then(() => {
      const foglio = document.createElement("canvas");
      foglio.width = LATO;
      foglio.height = LATO + 110;
      const ctx = foglio.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, foglio.width, foglio.height);
      ctx.drawImage(codice, MARGINE, MARGINE);
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.font = "600 40px 'DM Sans', system-ui, sans-serif";
      ctx.fillText(nome, foglio.width / 2, LATO + 10);
      ctx.fillStyle = "#777777";
      ctx.font = "24px 'DM Sans', system-ui, sans-serif";
      ctx.fillText("FGB Studio · attendance badge", foglio.width / 2, LATO + 55);
      const link = document.createElement("a");
      link.href = foglio.toDataURL("image/png");
      link.download = `badge-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      link.click();
    });
  };

  return (
    <MainLayout title="My Badge" subtitle="Your personal QR for the attendance kiosk.">
      <div className="max-w-md mx-auto">
        <Card className="p-8 flex flex-col items-center gap-5 text-center">
          {isLoading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}

          {error && (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertCircle className="w-6 h-6" />
              <p className="text-sm">{(error as Error).message}</p>
            </div>
          )}

          {token && (
            <>
              <canvas ref={canvasRef} className="rounded-lg" />
              <div>
                <div className="font-medium">{nome}</div>
                <p className="text-xs text-muted-foreground mt-1">FGB Studio · attendance badge</p>
              </div>
              <Button onClick={scarica} disabled={!pronto} className="w-full">
                <Download className="w-4 h-4 mr-2" /> Save the image
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Save it to your photos: at the kiosk you just hold up your phone, no need to open
                anything. Screen brightness up helps the camera read it.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This code identifies you and nothing else — it carries no name and no personal data.
                If you lose your phone, ask HR to issue a new one: the old code stops working the
                moment they do.
              </p>
            </>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
