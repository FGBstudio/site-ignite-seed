import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, MailQuestion, PhoneCall, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCreditiCliente } from "@/hooks/useCreditiCliente";
import {
  GIORNI_FERMA,
  GIORNI_PRIMO_SOLLECITO,
  giorniDallInvio,
  riepilogoOfferte,
  valoreInEuro,
  type OffertaInAttesa,
} from "@/lib/quotationFollowup";
import { formatMoney } from "@/lib/currency";

/**
 * Dashboard di Quotations — su quale offerta telefonare oggi.
 *
 * «Trentatré offerte pendenti, di cui non so quali siano state approvate.»
 * Contarle lo fa già la scheda Pending; questa dice cosa farne, e la differenza
 * la fanno i giorni dall'invio.
 *
 * Quattro fasce, e la quarta è quella che i dati hanno mostrato: **17 di quelle
 * 33 non hanno una data di invio**. Non si sollecitano — si guarda se sono uscite.
 * Metterle insieme alle altre avrebbe voluto dire telefonare a un cliente che non
 * ha mai visto l'offerta.
 */

const d = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM", { locale: it }) : "—");

export function DashboardQuotazioni({
  offerte,
  approvateQuestoMese,
  oggi = new Date().toISOString().slice(0, 10),
  onApri,
}: {
  /** Le offerte ancora in attesa: `quotation` e `potential` senza approvazione. */
  offerte: OffertaInAttesa[];
  approvateQuestoMese: number;
  /** Si passa per poter provare la schermata a una data fissa. */
  oggi?: string;
  onApri?: (id: string) => void;
}) {
  const r = useMemo(() => riepilogoOfferte(offerte, oggi), [offerte, oggi]);
  const { data: crediti = [] } = useCreditiCliente();
  const creditiAperti = crediti.filter((c) => c.stato === "aperto");

  return (
    <div className="space-y-4">
      {/* ── I quattro numeri ────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Riquadro
          etichetta="In attesa"
          valore={String(r.in_attesa)}
          sotto={`${r.fresche.length} ancora fresche`}
        />
        <Riquadro
          etichetta="Da sollecitare"
          valore={String(r.da_sollecitare.length)}
          sotto={`più di ${GIORNI_PRIMO_SOLLECITO} giorni senza risposta`}
          tinta={r.da_sollecitare.length > 0 ? "amber" : undefined}
        />
        <Riquadro
          etichetta="Approvate questo mese"
          valore={String(approvateQuestoMese)}
          sotto="diventate progetti"
          tinta={approvateQuestoMese > 0 ? "teal" : undefined}
        />
        <Riquadro
          etichetta="Valore aperto"
          valore={formatMoney(r.valore_aperto, "EUR")}
          /* Il conteggio sta accanto alla cifra perché la spiega: «417.000 su 33
             offerte» e «417.000 su 24, 9 senza importo» sono due frasi diverse, e
             solo la seconda è vera. */
          sotto={
            r.senza_importo > 0
              ? `${r.in_attesa - r.senza_importo} offerte · ${r.senza_importo} senza importo`
              : `${r.in_attesa} offerte`
          }
        />
      </div>

      {/* ── Da sollecitare ──────────────────────────────────────────────────── */}
      <Elenco
        icona={<PhoneCall className="h-4 w-4" style={{ color: "hsl(38 92% 45%)" }} />}
        titolo="Da sollecitare"
        vuoto={`Nessuna offerta aspetta da più di ${GIORNI_PRIMO_SOLLECITO} giorni.`}
        righe={r.da_sollecitare}
        oggi={oggi}
        onApri={onApri}
      />

      {/* ── Ferme ────────────────────────────────────────────────────────────
          Due mesi di silenzio non sono un'offerta in attesa: sono un'offerta
          persa che nessuno ha chiuso. Tenerla fra le pendenti gonfia il valore
          aperto con soldi che non arriveranno. */}
      <Elenco
        icona={<AlertTriangle className="h-4 w-4 text-destructive" />}
        titolo={`Ferme da più di ${GIORNI_FERMA} giorni`}
        sottotitolo="Probabilmente perse: chiuderle libera il valore aperto da soldi che non arriveranno."
        vuoto="Nessuna offerta ferma."
        righe={r.ferme}
        oggi={oggi}
        onApri={onApri}
      />

      {/* ── Mai inviate ─────────────────────────────────────────────────────
          Non è una fascia peggiore delle altre: è un'altra cosa. Una si risolve
          telefonando al cliente, questa guardando nella posta inviata. */}
      <Elenco
        icona={<MailQuestion className="h-4 w-4 text-muted-foreground" />}
        titolo="Senza data di invio"
        sottotitolo="Non si sa se sono uscite: finché la data manca, non si possono sollecitare."
        vuoto="Tutte le offerte in attesa hanno una data di invio."
        righe={r.mai_inviate}
        oggi={oggi}
        onApri={onApri}
        senzaGiorni
      />

      {/* ── I crediti da tenere a mente ─────────────────────────────────────── */}
      {creditiAperti.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <Wallet className="h-4 w-4" style={{ color: "hsl(38 92% 45%)" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Crediti dei clienti da tenere a mente
              </h2>
            </header>
            <ul className="divide-y">
              {creditiAperti.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-semibold">{c.cliente}</span>
                  <span className="tabular-nums font-semibold" style={{ color: "hsl(38 92% 40%)" }}>
                    {formatMoney(Number(c.importo), c.valuta)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.motivo}
                    {c.progetto_origine && ` — da «${c.progetto_origine}»`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Compaiono anche in cima al wizard quando l'offerta è per quel cliente. Tenerne conto
              non scala niente da sé: l'importo lo scrivi tu.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Riquadro({
  etichetta,
  valore,
  sotto,
  tinta,
}: {
  etichetta: string;
  valore: string;
  sotto: string;
  tinta?: "amber" | "teal";
}) {
  const colore =
    tinta === "amber" ? "hsl(38 92% 40%)" : tinta === "teal" ? "hsl(181 98% 29%)" : undefined;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {etichetta}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: colore }}>
          {valore}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sotto}</p>
      </CardContent>
    </Card>
  );
}

function Elenco({
  icona,
  titolo,
  sottotitolo,
  vuoto,
  righe,
  oggi,
  onApri,
  senzaGiorni,
}: {
  icona: React.ReactNode;
  titolo: string;
  sottotitolo?: string;
  vuoto: string;
  righe: OffertaInAttesa[];
  oggi: string;
  onApri?: (id: string) => void;
  senzaGiorni?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <header className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {icona}
            <h2 className="text-sm font-semibold uppercase tracking-wide">{titolo}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{righe.length}</span>
          </div>
          {sottotitolo && <p className="mt-0.5 text-[11px] text-muted-foreground">{sottotitolo}</p>}
        </header>

        {righe.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">{vuoto}</p>
        ) : (
          <ul className="divide-y">
            {righe.map((o) => {
              const g = giorniDallInvio(o.quotation_sent_date, oggi);
              const v = valoreInEuro(o);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold">
                      {o.client ? `${o.client} — ` : ""}
                      {o.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {senzaGiorni
                        ? o.status === "potential"
                          ? "Potenziale: non è ancora un'offerta inviata"
                          : "Offerta pendente senza data di invio"
                        : `inviata ${d(o.quotation_sent_date)} · ${g} giorni`}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums">
                    {v > 0 ? (
                      formatMoney(v, "EUR")
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">
                        senza importo
                      </span>
                    )}
                  </p>
                  {onApri && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onApri(o.id)}>
                      Apri
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
