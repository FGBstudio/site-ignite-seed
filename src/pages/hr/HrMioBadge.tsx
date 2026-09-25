import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertCircle, Maximize2, X } from "lucide-react";
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
  const { user, profile } = useAuth();
  const { data: token, isLoading, error } = useMioBadge();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pronto, setPronto] = useState(false);
  const [aSchermoPieno, setASchermoPieno] = useState(false);

  const nome = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Badge";

  useEffect(() => {
    if (!token || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, { width: 240, margin: 1 }).then(() => setPronto(true));
  }, [token]);

  const scarica = () => {
    if (!token) return;
    disegnaBadge(nome, token).then((dataUrl) => {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `badge-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      link.click();
    });
  };

  return (
    <MainLayout title="My Badge" subtitle="Your personal QR. Hold it up to the kiosk camera.">
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
              {/* Il QR sta qui dentro, non e' un link a qualcos'altro: la
                  pagina serve proprio a mostrarlo al lettore. */}
              <canvas ref={canvasRef} className="rounded-lg" />
              <div>
                <div className="font-medium">{nome}</div>
                <p className="text-xs text-muted-foreground mt-1">FGB Studio · attendance badge</p>
              </div>

              <div className="flex w-full gap-2">
                <Button onClick={() => setASchermoPieno(true)} disabled={!pronto} className="flex-1">
                  <Maximize2 className="w-4 h-4 mr-2" /> Show to the reader
                </Button>
                <Button onClick={scarica} disabled={!pronto} variant="outline" className="flex-1">
                  <Download className="w-4 h-4 mr-2" /> Save image
                </Button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Show to the reader</strong> fills the screen and keeps it awake, which is
                what the camera needs. <strong>Save image</strong> puts it in your photos, so in the
                morning you do not have to open anything at all.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This code identifies you and nothing else — no name, no personal data travels in it.
                If you lose your phone, ask HR for a new one: the old code stops working the moment
                they issue it.
              </p>
            </>
          )}
        </Card>
      </div>

      {aSchermoPieno && token && (
        <BadgeGrande token={token} nome={nome} onChiudi={() => setASchermoPieno(false)} />
      )}
    </MainLayout>
  );
}

/**
 * Il badge davanti alla telecamera.
 *
 * Un QR piccolo dentro una pagina scura e' quello che il lettore fatica di
 * piu' a vedere: qui il codice prende tutto lo schermo su fondo bianco, e lo
 * schermo non si spegne mentre si e' in fila.
 */
function BadgeGrande({ token, nome, onChiudi }: { token: string; nome: string; onChiudi: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, token, { width: 1000, margin: 1 });
    }

    // Lo schermo che si spegne mentre si aspetta il proprio turno e' il modo
    // piu' banale di non riuscire a timbrare. Dove il blocco veglia non c'e',
    // si rinuncia in silenzio: non e' un motivo per non mostrare il codice.
    let veglia: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<any> } };
    nav.wakeLock?.request("screen").then((s) => { veglia = s; }).catch(() => {});

    const esci = (e: KeyboardEvent) => { if (e.key === "Escape") onChiudi(); };
    window.addEventListener("keydown", esci);
    return () => {
      window.removeEventListener("keydown", esci);
      veglia?.release().catch(() => {});
    };
  }, [token, onChiudi]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-center gap-6 p-6"
      onClick={onChiudi}
    >
      <canvas ref={canvasRef} className="w-[min(78vw,78vh)] h-[min(78vw,78vh)]" />
      <div className="text-center">
        <div className="text-xl font-medium text-black">{nome}</div>
        <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest">
          FGB Studio · attendance badge
        </p>
      </div>
      <button
        onClick={onChiudi}
        className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <p className="absolute bottom-6 text-[11px] text-neutral-400">Tap anywhere to close</p>
    </div>
  );
}

/** Il PNG da tenere nelle foto: il QR, e sotto il nome di chi lo porta. */
async function disegnaBadge(nome: string, token: string): Promise<string> {
  const LATO = 720;
  const MARGINE = 60;
  const codice = document.createElement("canvas");
  await QRCode.toCanvas(codice, token, { width: LATO - MARGINE * 2, margin: 0 });

  const foglio = document.createElement("canvas");
  foglio.width = LATO;
  foglio.height = LATO + 110;
  const ctx = foglio.getContext("2d");
  if (!ctx) return "";
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
  return foglio.toDataURL("image/png");
}
