import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { X, LogIn, LogOut, AlertCircle, Clock } from "lucide-react";
import { timbraConBadge, type EsitoQr } from "@/hooks/useHr";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Il varco.
 *
 * Sta appeso all'ingresso tutto il giorno e non ha nessuno che lo guardi: ogni
 * cosa qui e' pensata per chi passa di corsa alle otto e mezza con il caffe'
 * in mano. Nessun bottone da premere prima — entrata e uscita le decide il
 * database — e una risposta grande abbastanza da leggerla camminando.
 */

/** Quanto resta a schermo l'esito, prima di tornare in attesa. */
const DURATA_ESITO = 6000;

interface Passata {
  chiave: number;
  esito: EsitoQr;
}

function oraDi(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Come si chiama la lettura appena fatta.
 *
 * E' un'ipotesi, e lo resta finche' la giornata non e' finita: la seconda
 * lettura e' una pausa se poi si rientra, ed e' l'uscita se si va a casa.
 * Quello che il varco puo' dire con certezza e' che si sta uscendo o entrando
 * — il nome giusto glielo dara' il registro stasera.
 */
function etichettaLettura(ordinale: number, verso: "in" | "out") {
  if (ordinale === 1) return "Checked in";
  if (ordinale === 2) return "Out — break or end of day";
  if (ordinale === 3) return "Back in";
  return verso === "in" ? "Back in" : "Out";
}

export default function HrScanner() {
  const navigate = useNavigate();
  // Serve solo a sapere se c'e' una via d'uscita da mostrare: il varco
  // funziona identico con o senza sessione.
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lockRef = useRef<{ token: string; ts: number } | null>(null);
  const [passata, setPassata] = useState<Passata | null>(null);
  const [storico, setStorico] = useState<Passata[]>([]);
  const [error, setError] = useState<string | null>(null);

  // L'esito sbiadisce da solo: chi arriva dopo non deve vedere il nome di chi
  // l'ha preceduto e credere di aver timbrato lui.
  useEffect(() => {
    if (!passata) return;
    const t = setTimeout(() => setPassata(null), DURATA_ESITO);
    return () => clearTimeout(t);
  }, [passata]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let fermato = false;

    (async () => {
      try {
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
          if (!result || fermato) return;
          const token = result.getText();
          // La telecamera legge lo stesso codice molte volte al secondo: una
          // sola passata per badge ogni tre secondi.
          if (lockRef.current && lockRef.current.token === token && Date.now() - lockRef.current.ts < 3000) return;
          lockRef.current = { token, ts: Date.now() };

          // La posizione e' un di piu': se il permesso non c'e' o tarda, si
          // timbra lo stesso. Nessuno resta fuori perche' il GPS non risponde.
          const location = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve(null),
              { timeout: 2000 },
            );
          });

          const esito = await timbraConBadge(token, {
            location,
            device: navigator.userAgent.slice(0, 80),
          });
          if (fermato) return;
          const p: Passata = { chiave: Date.now(), esito };
          setPassata(p);
          if (esito.esito === "ok") setStorico((s) => [p, ...s].slice(0, 6));
        });
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e.message || "Camera not available");
      }
    })();

    return () => {
      fermato = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div>
          <div className="text-sm uppercase tracking-widest opacity-70">HR Kiosk</div>
          <div className="text-lg font-medium">Scan your badge</div>
        </div>
        {/* La via d'uscita esiste solo per chi e' entrato da dentro: sul
            tablet dell'ingresso non c'e' nessuna sessione, e un bottone che
            porta alla schermata di login e' solo un modo di far uscire il
            varco da se' stesso. */}
        {user && (
          <Button variant="ghost" onClick={() => navigate("/hr/attendance")} className="text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 grid md:grid-cols-2 gap-6 p-6 min-h-0">
        <div className="relative rounded-xl overflow-hidden bg-black border border-white/10">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-0 pointer-events-none border-[3px] border-emerald-400/40 m-12 rounded-lg" />
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-300 text-center px-6">
              <AlertCircle className="w-8 h-8 mb-2" />
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <Esito passata={passata} />

          {storico.length > 0 && (
            <Card className="p-4 bg-white/5 border-white/10 text-white/80 overflow-y-auto">
              <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Today at the door</div>
              <ul className="space-y-1.5 text-sm">
                {storico.map((p) => {
                  if (p.esito.esito !== "ok") return null;
                  return (
                    <li key={p.chiave} className="flex items-center gap-2">
                      {p.esito.verso === "in" ? (
                        <LogIn className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <LogOut className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <span className="truncate">{p.esito.nome}</span>
                      <span className="ml-auto tabular-nums opacity-60">{oraDi(p.esito.quando)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * La risposta al varco.
 *
 * Ogni esito ha il suo colore e la sua riga: chi passa deve capire in un
 * secondo, da lontano, se puo' andare avanti o se deve fermarsi a chiedere.
 */
function Esito({ passata }: { passata: Passata | null }) {
  if (!passata) {
    return (
      <Card className="p-10 bg-white/5 border-white/10 text-white/60 flex-1 flex flex-col justify-center">
        <div className="text-xs uppercase tracking-widest opacity-60">Ready</div>
        <div className="text-3xl font-medium mt-2 text-white/80">Hold your badge up</div>
        <p className="text-sm mt-3 leading-relaxed">
          Nothing to press. Scan when you arrive, when you go out, when you come back and when you
          leave: the register works out the day from the readings.
        </p>
      </Card>
    );
  }

  const e = passata.esito;

  if (e.esito === "ok") {
    const entrata = e.verso === "in";
    return (
      <Card
        className={`p-10 flex-1 flex flex-col justify-center text-white ${
          entrata ? "bg-emerald-500/15 border-emerald-500/40" : "bg-sky-500/15 border-sky-500/40"
        }`}
      >
        <div className={`text-xs uppercase tracking-widest ${entrata ? "text-emerald-300" : "text-sky-300"}`}>
          {etichettaLettura(e.ordinale, e.verso)}
        </div>
        <div className="text-5xl font-medium mt-2 leading-tight">{e.nome}</div>
        <div className="text-2xl mt-4 flex items-center gap-2 tabular-nums">
          {entrata ? <LogIn className="w-6 h-6" /> : <LogOut className="w-6 h-6" />}
          {oraDi(e.quando)}
          <span className="text-base opacity-70">· reading {e.ordinale} of the day</span>
        </div>
      </Card>
    );
  }

  if (e.esito === "ripetuto") {
    return (
      <Card className="p-10 flex-1 flex flex-col justify-center bg-amber-500/15 border-amber-500/40 text-white">
        <div className="text-xs uppercase tracking-widest text-amber-300">Already recorded</div>
        <div className="text-5xl font-medium mt-2 leading-tight">{e.nome}</div>
        <div className="text-xl mt-4 flex items-center gap-2 tabular-nums">
          <Clock className="w-5 h-5" />
          Last reading at {oraDi(e.quando)}
        </div>
        <p className="text-sm mt-3 opacity-80">Nothing was recorded twice. You can go.</p>
      </Card>
    );
  }

  const guasti: Record<
    "non_badge" | "sconosciuto" | "revocato" | "scaduto" | "firma_non_valida" | "non_leggibile",
    { titolo: string; spiega: string }
  > = {
    non_badge: {
      titolo: "Not a badge",
      spiega: "This QR does not come from HR. Open My Badge on your phone and show the live code.",
    },
    sconosciuto: {
      titolo: "Badge not recognised",
      spiega: "No active badge matches this code. It may have been re-issued: ask HR for a fresh one.",
    },
    revocato: {
      titolo: "Badge revoked",
      spiega: "This badge has been deactivated. A new one has to be issued before it can be used.",
    },
    scaduto: {
      // Il caso piu' comune, e per questo detto senza allarme: uno screenshot,
      // o una pagina rimasta aperta da ieri.
      titolo: "Code expired",
      spiega: "Codes last one minute. Reopen My Badge so it renews, then show it again.",
    },
    firma_non_valida: {
      titolo: "Code not valid",
      spiega: "This code was not produced by that badge. Reopen My Badge and show the live one.",
    },
    non_leggibile: {
      titolo: "Could not record",
      spiega: "messaggio" in e ? e.messaggio : "",
    },
  };
  const g = guasti[e.esito];

  return (
    <Card className="p-10 flex-1 flex flex-col justify-center bg-rose-500/15 border-rose-500/40 text-white">
      <div className="text-xs uppercase tracking-widest text-rose-300">Not recorded</div>
      <div className="text-4xl font-medium mt-2 leading-tight">{g.titolo}</div>
      <p className="text-base mt-4 opacity-80 leading-relaxed">{g.spiega}</p>
    </Card>
  );
}
