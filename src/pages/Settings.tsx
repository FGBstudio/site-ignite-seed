import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  return (
    <MainLayout title="Impostazioni" subtitle="Configura il sistema">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Azienda</CardTitle>
            <CardDescription>Dati della tua organizzazione</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Nome Azienda</Label>
              <Input id="company" placeholder="La tua azienda" defaultValue="StockFlow SRL" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="info@azienda.it" defaultValue="info@stockflow.it" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Nome Magazzino</Label>
              <Input id="warehouse" placeholder="Magazzino principale" defaultValue="Magazzino Milano" />
            </div>
            <Button>Salva Modifiche</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifiche</CardTitle>
            <CardDescription>Gestisci le preferenze di notifica</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Allerta Stock Basso</p>
                <p className="text-sm text-muted-foreground">Ricevi notifiche quando un prodotto scende sotto la soglia</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Nuovi Ordini</p>
                <p className="text-sm text-muted-foreground">Notifica per ogni nuovo ordine ricevuto</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Report Settimanali</p>
                <p className="text-sm text-muted-foreground">Riepilogo settimanale via email</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Soglie Stock</CardTitle>
            <CardDescription>Configura le soglie di allerta predefinite</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="minStock">Soglia Minima Predefinita</Label>
              <Input id="minStock" type="number" defaultValue="10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="criticalStock">Soglia Critica</Label>
              <Input id="criticalStock" type="number" defaultValue="5" />
            </div>
            <Button>Aggiorna Soglie</Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
