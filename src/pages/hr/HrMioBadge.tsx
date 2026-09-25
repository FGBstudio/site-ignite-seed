import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Maximize2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMioBadge } from "@/hooks/useHr";
import { codiceBadge, minutoCorrente } from "@/lib/badgeFirma";

/**
 * Il mio badge.
 *
 * Il codice cambia ogni minuto, e non contiene il segreto: contiene una firma
 * che solo questo telefono, dopo il login, sa produrre. Uno screenshot mandato
 * a un collega e' quindi la fotografia di una firma scaduta — e il registro
 * degli ingressi continua a dire chi era in ufficio, non chi aveva la foto
 * giusta.
 *
 * La pagina e' aperta a chiunque abbia un accesso, non solo a chi governa HR:
 * il badge di una persona riguarda quella persona.
 */

/** Il codice vivo, e quanti secondi gli restano. */
function useCodiceVivo(badge: { id: string; segreto: string } | undefined) {
  const [codice, setCodice] = useState<string | null>(null);
  const [secondi, setSecondi] = useState(60);

  useEffect(() => {
    if (!badge) return;
    let vivo = true;
    let minutoDisegnato = -1;

    const battito = async () => {
      const m = minutoCorrente();
      if (m !== minutoDisegnato) {
        const c = await codiceBadge(badge, m);
        if (!vivo) return;
        minutoDisegnato = m;
        setCodice(c);
      }
      // Il conto alla rovescia e' quello vero del minuto in corso, non un
      // timer nostro: chi apre la pagina a meta' minuto vede i secondi che
      // gli restano davvero.
      setSecondi(60 - Math.floor((Date.now() % 60000) / 1000));
    };

    battito();
    const t = setInterval(battito, 1000);
    return () => { vivo = false; clearInterval(t); };
  }, [badge]);

  return { codice, secondi };
}

export default function HrMioBadge() {
  const { user, profile } = useAuth();
  const { data: badge, isLoading, error } = useMioBadge();
  const { codice, secondi } = useCodiceVivo(badge);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aSchermoPieno, setASchermoPieno] = useState(false);

  const nome = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Badge";

  useEffect(() => {
    if (!codice || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, codice, { width: 240, margin: 1 });
  }, [codice]);

  return (
    <MainLayout title="My Badge" subtitle="Your code, renewed every minute. Hold it up to the kiosk camera.">
      <div className="max-w-md mx-auto">
        <Card className="p-8 flex flex-col items-center gap-5 text-center">
          {isLoading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}

          {error && (
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertCircle className="w-6 h-6" />
              <p className="text-sm">{(error as Error).message}</p>
            </div>
          )}

          {badge && (
            <>
              <canvas
                ref={canvasRef}
                className="rounded-lg select-none"
                onContextMenu={(e) => e.preventDefault()}
              />
              <div>
                <div className="font-medium">{nome}</div>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  Valid for {secondi}s · renews on its own
                </p>
              </div>

              <Button onClick={() => setASchermoPieno(true)} disabled={!codice} className="w-full">
                <Maximize2 className="w-4 h-4 mr-2" /> Show to the reader
              </Button>

              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Show to the reader</strong> fills the screen and keeps it awake, which is
                what the camera needs.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A screenshot of this code is worth nothing a minute later, and neither is a photo of
                someone else&apos;s screen. That is on purpose: the register has to say who was at
                the door, not who had the right picture.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The code carries no name and no personal data. If you lose your phone, ask HR for a
                new badge: the old one stops working the moment they issue it.
              </p>
            </>
          )}
        </Card>
      </div>

      {aSchermoPieno && codice && (
        <BadgeGrande
          codice={codice}
          nome={nome}
          secondi={secondi}
          onChiudi={() => setASchermoPieno(false)}
        />
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
function BadgeGrande({
  codice, nome, secondi, onChiudi,
}: {
  codice: string;
  nome: string;
  secondi: number;
  onChiudi: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, codice, { width: 1000, margin: 1 });
    }
  }, [codice]);

  useEffect(() => {
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
  }, [onChiudi]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-center gap-6 p-6"
      onClick={onChiudi}
    >
      <canvas
        ref={canvasRef}
        className="w-[min(78vw,78vh)] h-[min(78vw,78vh)] select-none"
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="text-center">
        <div className="text-xl font-medium text-black">{nome}</div>
        <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest tabular-nums">
          Valid for {secondi}s
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
