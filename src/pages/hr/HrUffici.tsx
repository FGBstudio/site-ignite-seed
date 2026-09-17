import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Clock, Search } from "lucide-react";
import {
  oraLocale,
  scartoOre,
  stessoGiorno,
  useAssegnaUfficio,
  usePersoneConUfficio,
  useUffici,
} from "@/hooks/useUffici";
import { inizialiPersona } from "@/lib/nomePersona";
import { RigaTotali } from "@/components/common/RigaTotali";

/**
 * Uffici — chi lavora dove, e che ore sono lì.
 *
 * Due cose in una schermata, e stanno insieme per un motivo: finché nessuno è
 * assegnato a un ufficio, qualunque filtro per ufficio nelle altre viste
 * restituisce liste vuote. L'assegnazione non è la conseguenza della divisione
 * per ufficio — è la sua precondizione, e metterla altrove significherebbe
 * chiedere a chi cerca il filtro di andarlo a riempire da un'altra parte.
 *
 * Il riquadro con l'ora locale in alto non è decorazione: è la verifica che il
 * fuso di quell'ufficio sia quello giusto. Un fuso sbagliato in tabella non si
 * nota mai; un orologio che segna un'ora impossibile sì.
 */
export default function HrUffici() {
  const { toast } = useToast();
  const { data: uffici = [], isLoading: caricaUffici } = useUffici();
  const { data: persone = [], isLoading: caricaPersone } = usePersoneConUfficio();
  const assegna = useAssegnaUfficio();

  const [cerca, setCerca] = useState("");
  const [soloUfficio, setSoloUfficio] = useState<string | null>(null);

  const adesso = new Date();

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return persone.filter((p) => {
      if (soloUfficio === "__nessuno") {
        if (p.office_id) return false;
      } else if (soloUfficio && p.office_id !== soloUfficio) return false;
      if (!q) return true;
      return `${p.nome} ${p.email ?? ""}`.toLowerCase().includes(q);
    });
  }, [persone, cerca, soloUfficio]);

  const senzaUfficio = persone.filter((p) => !p.office_id).length;

  return (
    <MainLayout title="Uffici" subtitle="Chi lavora dove — e che ore sono lì adesso">
      {/* ── Gli orologi: cinque uffici, tre continenti ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {uffici.map((u) => {
          const quanti = persone.filter((p) => p.office_id === u.id).length;
          const acceso = soloUfficio === u.id;
          const altroGiorno = !stessoGiorno(u.timezone, adesso);
          return (
            <Card
              key={u.id}
              onClick={() => setSoloUfficio(acceso ? null : u.id)}
              className={cn(
                "cursor-pointer p-3 transition-colors",
                acceso ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide">{u.name}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{u.country}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-lg font-semibold tabular-nums">
                  {oraLocale(u.timezone, adesso)}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {scartoOre(u.timezone, adesso)}
                </span>
              </p>
              {/* A Shanghai può essere già domani, a Los Angeles ancora ieri:
                  senza dirlo, un turno letto qui finisce sul giorno sbagliato. */}
              {altroGiorno && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">altro giorno</p>
              )}
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {quanti === 0 ? "nessuno assegnato" : `${quanti} person${quanti === 1 ? "a" : "e"}`}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <span className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca una persona…"
              className="h-8 w-56 pl-8 text-xs"
              aria-label="Cerca una persona"
            />
          </span>

          {soloUfficio && (
            <button
              type="button"
              onClick={() => setSoloUfficio(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              mostra tutti
            </button>
          )}

          {/* Chi non ha ufficio è il lavoro da fare: si arriva con un click,
              invece di cercarlo a occhio in una lista di trenta nomi. */}
          {senzaUfficio > 0 && (
            <button
              type="button"
              onClick={() => setSoloUfficio(soloUfficio === "__nessuno" ? null : "__nessuno")}
              className={cn(
                "ml-auto rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                soloUfficio === "__nessuno"
                  ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  : "text-amber-700 hover:bg-muted dark:text-amber-400"
              )}
            >
              {senzaUfficio} senza ufficio
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Persona</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Email</th>
                <th className="px-3 py-2 text-left font-medium">Ufficio</th>
                <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Ora locale</th>
              </tr>
            </thead>
            <tbody>
              {(caricaUffici || caricaPersone) && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-xs text-muted-foreground">
                    Caricamento…
                  </td>
                </tr>
              )}

              {filtrate.map((p) => {
                const u = uffici.find((x) => x.id === p.office_id);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {inizialiPersona(p)}
                        </span>
                        <span className="font-medium">{p.nome}</span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                      {p.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={p.office_id ?? ""}
                        onChange={async (e) => {
                          const id = e.target.value || null;
                          try {
                            await assegna.mutateAsync({ personaId: p.id, ufficioId: id });
                            toast({
                              title: id
                                ? `${p.nome} → ${uffici.find((x) => x.id === id)?.name}`
                                : `${p.nome} senza ufficio`,
                            });
                          } catch (err) {
                            toast({
                              variant: "destructive",
                              title: "Non sono riuscito a salvare",
                              description: err instanceof Error ? err.message : undefined,
                            });
                          }
                        }}
                        aria-label={`Ufficio di ${p.nome}`}
                        className={cn(
                          "h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          !p.office_id && "border-dashed text-muted-foreground"
                        )}
                      >
                        <option value="">— nessun ufficio</option>
                        {uffici.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {u ? (
                        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                          {oraLocale(u.timezone, adesso)}
                          <Badge variant="outline" className="text-[10px]">
                            {scartoOre(u.timezone, adesso)}
                          </Badge>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!caricaPersone && filtrate.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-xs text-muted-foreground">
                    Nessuna persona con questi filtri.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <RigaTotali
          totale={filtrate.length}
          suTotale={persone.length}
          nome="persone"
          voci={uffici.map((u) => ({
            label: u.name,
            valore: filtrate.filter((p) => p.office_id === u.id).length,
          }))}
        />
      </Card>
    </MainLayout>
  );
}
