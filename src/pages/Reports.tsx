import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

const monthlyData = [
  { month: "Gen", inbound: 45, outbound: 32 },
  { month: "Feb", inbound: 52, outbound: 41 },
  { month: "Mar", inbound: 38, outbound: 35 },
  { month: "Apr", inbound: 65, outbound: 48 },
  { month: "Mag", inbound: 58, outbound: 52 },
  { month: "Giu", inbound: 72, outbound: 61 },
];

const categoryData = [
  { name: "Elettronica", value: 35 },
  { name: "Accessori", value: 45 },
  { name: "Audio", value: 12 },
  { name: "Componenti", value: 8 },
];

const stockTrend = [
  { day: "Lun", stock: 420 },
  { day: "Mar", stock: 435 },
  { day: "Mer", stock: 410 },
  { day: "Gio", stock: 445 },
  { day: "Ven", stock: 460 },
  { day: "Sab", stock: 455 },
  { day: "Dom", stock: 470 },
];

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 71%, 45%)", "hsl(25, 95%, 53%)", "hsl(280, 65%, 60%)"];

export default function Reports() {
  return (
    <MainLayout title="Reportistica" subtitle="Analisi e statistiche">
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Orders by Month */}
          <Card>
            <CardHeader>
              <CardTitle>Ordini per Mese</CardTitle>
              <CardDescription>Confronto inbound vs outbound</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-muted-foreground" />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Bar dataKey="inbound" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="Inbound" />
                    <Bar dataKey="outbound" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} name="Outbound" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuzione per Categoria</CardTitle>
              <CardDescription>Percentuale prodotti per categoria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Stock Trend */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Andamento Stock Settimanale</CardTitle>
              <CardDescription>Trend delle unità totali in magazzino</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stockTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-muted-foreground" />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="stock" 
                      stroke="hsl(217, 91%, 50%)" 
                      strokeWidth={3}
                      dot={{ fill: 'hsl(217, 91%, 50%)', strokeWidth: 2 }}
                      name="Stock Totale"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
