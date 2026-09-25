import { useMemo, useState } from "react";
import { FiltroUfficio } from "@/components/hr/FiltroUfficio";
import { nomePersona } from "@/lib/nomePersona";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScanLine, QrCode, Printer, PenLine } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGiornate, useHrProfiles, useHrQrTokens, useRotateQrToken,
  useAggiungiLetture, useLettureDelGiorno, type HrProfile,
} from "@/hooks/useHr";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

/** L'ora di una lettura, o un trattino se quella lettura non c'e' mai stata. */
function ora(iso: string | null) {
  return iso ? format(new Date(iso), "HH:mm") : "—";
}

/** Minuti come li legge una persona. Zero e' un dato; assente e' un trattino. */
function durata(minuti: number | null) {
  if (minuti == null) return "—";
  const m = Number(minuti);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

export default function HrAttendance() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: tuttiIProfili = [] } = useHrProfiles();
  const [userFilter, setUserFilter] = useState<string>("all");
  const [ufficio, setUfficio] = useState<string | null>(null);
  const [from, setFrom] = useState<string>("");

  const perUfficio = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of tuttiIProfili) {
      if (p.office_id) m.set(p.office_id, (m.get(p.office_id) ?? 0) + 1);
    }
    return m;
  }, [tuttiIProfili]);

  // Scegliere un ufficio restringe l'elenco delle persone, non solo le righe:
  // altrimenti nel menu «Person» resterebbero nomi che non possono comparire.
  const profiles = useMemo(
    () => (ufficio ? tuttiIProfili.filter((p) => p.office_id === ufficio) : tuttiIProfili),
    [tuttiIProfili, ufficio]
  );
  const [to, setTo] = useState<string>("");

  const filters = useMemo(() => {
    const effectiveUser = isAdmin ? (userFilter === "all" ? undefined : userFilter) : user?.id;
    // Le date qui sono giorni, non istanti: la vista raggruppa per giornata di
    // Roma, e convertirle in ISO sposterebbe il confine di due ore.
    return { userId: effectiveUser, dal: from || undefined, al: to || undefined };
  }, [isAdmin, userFilter, user, from, to]);

  const { data: giornate = [] } = useGiornate(filters);
  /** La giornata di cui si stanno guardando le letture grezze. */
  const [lettureAperte, setLettureAperte] = useState<{ userId: string; giorno: string } | null>(null);
  const nameOf = (uid: string) => {
    const p = profiles.find((x) => x.id === uid);
    return p ? nomePersona(p) : uid.slice(0, 8);
  };

  return (
    <MainLayout title="Attendance Log" subtitle="Days worked out from the badge readings. What the kiosk missed can be added by hand.">
      <FiltroUfficio
        scelto={ufficio}
        onScegli={(id) => {
          setUfficio(id);
          // La persona scelta potrebbe non appartenere al nuovo ufficio: si
          // torna a «tutte» invece di mostrare un filtro che non filtra.
          setUserFilter("all");
        }}
        conteggi={perUfficio}
        className="mb-3"
      />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        {isAdmin && (
          <div>
            <label className="text-xs text-muted-foreground">Person</label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All people</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{nomePersona(p)}</SelectItem>
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
              <PresenzaManualeDialog profili={profiles} />
              <QrTokensDialog />
              <Button onClick={() => navigate("/hr/scanner")}>
                <ScanLine className="w-4 h-4 mr-2" /> Open Scanner
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="backdrop-blur-md bg-card/70 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Person</th>
              <th className="px-4 py-2 text-left">Day</th>
              <th className="px-4 py-2 text-left">In</th>
              <th className="px-4 py-2 text-left">Break</th>
              <th className="px-4 py-2 text-left">Back</th>
              <th className="px-4 py-2 text-left">Out</th>
              <th className="px-4 py-2 text-right">Worked</th>
              <th className="px-4 py-2 text-right">Break</th>
              <th className="px-4 py-2 text-left">Readings</th>
            </tr>
          </thead>
          <tbody>
            {giornate.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">No days recorded yet.</td>
              </tr>
            )}
            {giornate.map((g) => (
              <tr key={`${g.user_id}-${g.giorno}`} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2">{nameOf(g.user_id)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{format(new Date(g.giorno + "T12:00:00"), "dd MMM yyyy")}</td>
                <td className="px-4 py-2 tabular-nums">{ora(g.ingresso)}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{ora(g.pausa)}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{ora(g.ripresa)}</td>
                <td className="px-4 py-2 tabular-nums">
                  {/* Ancora dentro non e' un errore: e' una giornata che non e'
                      ancora finita, e va detto cosi'. */}
                  {g.ancora_dentro ? <span className="text-amber-600">still in</span> : ora(g.uscita)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{durata(g.minuti_lavorati)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{durata(g.minuti_pausa)}</td>
                <td className="px-4 py-2">
                  {/* Le ore qui sopra sono dedotte: chi deve correggerle deve
                      poter vedere da cosa. */}
                  <button onClick={() => setLettureAperte({ userId: g.user_id, giorno: g.giorno })}>
                    <Badge variant="secondary" className="text-[10px] hover:bg-muted cursor-pointer">
                      {g.letture}
                    </Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <LettureDialog
        chiave={lettureAperte}
        nome={lettureAperte ? nameOf(lettureAperte.userId) : ""}
        onChiudi={() => setLettureAperte(null)}
      />
    </MainLayout>
  );
}

/**
 * Le letture grezze di una giornata.
 *
 * La riga del registro e' una deduzione; qui sotto c'e' quello su cui si
 * regge. Chi deve correggere una giornata storta deve poter vedere se la
 * lettura delle 13:02 c'e' e non e' stata interpretata, o se non c'e' proprio.
 */
function LettureDialog({
  chiave, nome, onChiudi,
}: {
  chiave: { userId: string; giorno: string } | null;
  nome: string;
  onChiudi: () => void;
}) {
  const { data: letture = [], isLoading } = useLettureDelGiorno(chiave?.userId ?? null, chiave?.giorno ?? null);

  return (
    <Dialog open={!!chiave} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {nome} · {chiave ? format(new Date(chiave.giorno + "T12:00:00"), "dd MMM yyyy") : ""}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ol className="space-y-2">
            {letture.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="font-medium tabular-nums">{format(new Date(l.ts), "HH:mm")}</span>
                <Badge variant={l.origine === "qr" ? "default" : "secondary"} className="text-[10px]">
                  {l.origine === "qr" ? "badge" : "by hand"}
                </Badge>
                {l.note && <span className="text-xs text-muted-foreground truncate">{l.note}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">
          In, break, back and out are not stored anywhere: they are the order of these readings.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * La giornata di chi il badge non l'ha passato.
 *
 * Il varco copre il caso normale, non tutti: chi ha dimenticato il badge a
 * casa, chi e' andato dritto in cantiere, chi ieri e' uscito senza timbrare.
 * Senza un modo di scriverle a mano, quelle ore semplicemente non esistono — e
 * il registro racconta meno di quello che e' successo.
 */
function PresenzaManualeDialog({ profili }: { profili: HrProfile[] }) {
  const { user } = useAuth();
  const aggiungi = useAggiungiLetture();
  const { toast } = useToast();
  const [aperto, setAperto] = useState(false);
  const [chi, setChi] = useState("");
  const [giorno, setGiorno] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [orari, setOrari] = useState<string[]>(["09:00", "", "", "18:00"]);
  const [nota, setNota] = useState("");

  const cambia = (i: number, v: string) => setOrari((o) => o.map((x, j) => (j === i ? v : x)));

  const salva = async () => {
    // Si scrivono le letture che mancano, non la giornata: che poi siano
    // ingresso, pausa, ripresa e uscita lo decide l'ordine, come per tutte le
    // altre. Le caselle lasciate vuote semplicemente non diventano letture.
    const istanti = orari
      .filter((o) => o)
      .sort()
      .map((o) => new Date(`${giorno}T${o}`).toISOString());
    if (!chi || istanti.length === 0) return;
    try {
      await aggiungi.mutateAsync({
        user_id: chi,
        istanti,
        note: nota.trim() || null,
        inserita_da: user?.id ?? null,
      });
      toast({
        title: `${istanti.length} readings recorded`,
        description: "Marked as manual, with your name on them. The day recomposes itself.",
      });
      setAperto(false);
      setNota("");
    } catch (e: any) {
      toast({ title: "Not recorded", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button variant="outline"><PenLine className="w-4 h-4 mr-2" /> Add by hand</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record a day without a badge scan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Person</label>
            <Select value={chi} onValueChange={setChi}>
              <SelectTrigger><SelectValue placeholder="Who was here" /></SelectTrigger>
              <SelectContent>
                {profili.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{nomePersona(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Day</label>
            <Input type="date" value={giorno} onChange={(e) => setGiorno(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["In", "Break", "Back", "Out"].map((etichetta, i) => (
              <div key={etichetta}>
                <label className="text-xs text-muted-foreground">{etichetta}</label>
                <Input type="time" value={orari[i]} onChange={(e) => cambia(i, e.target.value)} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Why it was not scanned</label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Badge left at home, straight to site…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty what did not happen — a day with no break is just two readings. They are
            saved as manual, with your name against them, so the register keeps apart what a badge
            read and what a person decided.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAperto(false)}>Cancel</Button>
          <Button onClick={salva} disabled={!chi || aggiungi.isPending}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrTokensDialog() {
  // Di norma il badge lo prende chi lavora qui, e l'indirizzo lo dice. Ma
  // qualcuno di casa ha un dominio suo — la titolare — e resterebbe fuori dalla
  // lista senza poter timbrare: l'interruttore serve a quello, non a dare un
  // badge ai clienti.
  const [tuttiGliAccount, setTuttiGliAccount] = useState(false);
  const { data: profiles = [] } = useHrProfiles(tuttiGliAccount);
  const { data: tokens = [] } = useHrQrTokens();
  const rotate = useRotateQrToken();
  const { toast } = useToast();
  const tokenFor = (uid: string) => tokens.find((t) => t.user_id === uid);
  const senzaBadge = profiles.filter((p) => !tokenFor(p.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline"><QrCode className="w-4 h-4 mr-2" /> Manage QR Codes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Badges — issue, print, hand over</DialogTitle></DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Button
            size="sm"
            disabled={senzaBadge.length === 0 || rotate.isPending}
            onClick={async () => {
              // Uno alla volta: sono al piu' una ventina, e una raffica di
              // upsert paralleli sulla stessa tabella non fa risparmiare
              // niente che valga il rischio di perderne uno per strada.
              let fatti = 0;
              for (const p of senzaBadge) {
                try {
                  await rotate.mutateAsync(p.id);
                  fatti++;
                } catch (e: any) {
                  toast({ title: `Failed for ${nomePersona(p)}`, description: e.message, variant: "destructive" });
                  break;
                }
              }
              if (fatti) toast({ title: `${fatti} badge issued`, description: "Now print them and hand them over." });
            }}
          >
            Issue the {senzaBadge.length} missing
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={tokens.length === 0}
            onClick={() =>
              stampaBadge(
                profiles
                  .map((p) => ({ nome: nomePersona(p), token: tokenFor(p.id)?.token }))
                  .filter((b): b is { nome: string; token: string } => !!b.token)
              )
            }
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Print all
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={tuttiGliAccount}
              onChange={(e) => setTuttiGliAccount(e.target.checked)}
            />
            Show every account, not only @fgb-studio.com
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {profiles.map((p) => {
            const t = tokenFor(p.id);
            return (
              <Card key={p.id} className="p-3 flex flex-col items-center gap-2">
                <div className="text-xs font-medium text-center truncate w-full">{nomePersona(p)}</div>
                {t ? <QrPreview value={t.token} /> : <div className="w-32 h-32 bg-muted rounded" />}
                <div className="flex w-full">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      try {
                        await rotate.mutateAsync(p.id);
                        // Ruotare invalida il foglio gia' consegnato: chi lo
                        // porta si trovera' respinto al varco finche' non ne
                        // riceve uno nuovo.
                        toast({
                          title: t ? "New badge issued" : "Badge issued",
                          description: t
                            ? `The previous badge of ${nomePersona(p)} no longer works. Print and hand over the new one.`
                            : `The badge of ${nomePersona(p)} is ready: they find it under their own name, in My Badge.`,
                        });
                      } catch (e: any) {
                        toast({ title: "Error", description: e.message, variant: "destructive" });
                      }
                    }}
                  >
                    {t ? "Rotate" : "Generate"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Il foglio da consegnare: tutti i badge, sei per pagina, da ritagliare.
 *
 * Aprire venti download uno per uno e poi stamparli a mano e' il genere di
 * lavoro che si fa una volta e poi non si rifa' piu' — e i badge nuovi restano
 * nel browser di chi li ha generati.
 */
async function stampaBadge(badge: { nome: string; token: string }[]) {
  const disegnati = await Promise.all(
    badge.map(async (b) => {
      const c = document.createElement("canvas");
      await QRCode.toCanvas(c, b.token, { width: 320, margin: 0 });
      return { nome: b.nome, png: c.toDataURL("image/png") };
    })
  );

  const finestra = window.open("", "_blank");
  if (!finestra) return;
  finestra.document.write(`<!doctype html><html><head><title>FGB Studio · badges</title><style>
    @page { size: A4; margin: 12mm; }
    body { font-family: 'DM Sans', system-ui, sans-serif; margin: 0; }
    .griglia { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
    .badge { border: 1px dashed #bbb; border-radius: 6px; padding: 8mm 4mm; text-align: center; break-inside: avoid; }
    .badge img { width: 58mm; height: 58mm; }
    .nome { font-size: 13pt; font-weight: 600; margin-top: 4mm; }
    .piede { font-size: 8pt; color: #777; margin-top: 1mm; letter-spacing: .06em; text-transform: uppercase; }
  </style></head><body><div class="griglia">${disegnati
    .map(
      (b) =>
        `<div class="badge"><img src="${b.png}" alt=""><div class="nome">${b.nome.replace(/[<>&]/g, "")}</div><div class="piede">FGB Studio · attendance badge</div></div>`
    )
    .join("")}</div></body></html>`);
  finestra.document.close();
  // La stampa parte quando le immagini ci sono: chiamarla subito stampa
  // riquadri vuoti.
  finestra.onload = () => finestra.print();
}

/** L'anteprima nel pannello: si guarda, non si porta via. */
function QrPreview({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, { width: 128, margin: 1 });
    }
  }, [value]);
  return <canvas ref={canvasRef} className="rounded select-none" onContextMenu={(e) => e.preventDefault()} />;
}
