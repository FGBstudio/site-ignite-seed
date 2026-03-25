import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CsvRow {
  Project_Name: string;
  Client: string;
  Region: string;
  PM_Email: string;
  Handover_Date: string;
  Product_SKU: string;
  Quantity: string;
}

interface ValidatedRow {
  rowIndex: number;
  projectName: string;
  client: string;
  region: string;
  pmEmail: string;
  handoverDate: string; // ISO
  productSku: string;
  quantity: number;
}

interface ImportError {
  row: number;
  message: string;
}

const VALID_REGIONS = ["Europe", "America", "APAC", "ME"];
const BATCH_SIZE = 50;

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Try ISO first
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const euMatch = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (euMatch) {
    const d = new Date(`${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  // MM/DD/YYYY
  const usMatch = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (usMatch) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString().split("T")[0];
}

export function DataImporter() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ projects: number; allocations: number; errors: number } | null>(null);

  const resetState = () => {
    setFileName(null);
    setValidatedRows([]);
    setErrors([]);
    setProgress(0);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validateAndParse = useCallback((file: File) => {
    resetState();
    setFileName(file.name);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows: ValidatedRow[] = [];
        const errs: ImportError[] = [];

        results.data.forEach((row, i) => {
          const idx = i + 2; // 1-indexed + header
          const missing: string[] = [];
          if (!row.Project_Name?.trim()) missing.push("Project_Name");
          if (!row.Client?.trim()) missing.push("Client");
          if (!row.Region?.trim()) missing.push("Region");
          if (!row.Handover_Date?.trim()) missing.push("Handover_Date");
          if (!row.Product_SKU?.trim()) missing.push("Product_SKU");
          if (!row.Quantity?.trim()) missing.push("Quantity");

          if (missing.length) {
            errs.push({ row: idx, message: `Campi mancanti: ${missing.join(", ")}` });
            return;
          }

          const region = row.Region.trim();
          if (!VALID_REGIONS.includes(region)) {
            errs.push({ row: idx, message: `Region non valida: "${region}". Valide: ${VALID_REGIONS.join(", ")}` });
            return;
          }

          const handoverDate = parseDate(row.Handover_Date.trim());
          if (!handoverDate) {
            errs.push({ row: idx, message: `Data Handover non valida: "${row.Handover_Date}"` });
            return;
          }

          const qty = parseInt(row.Quantity.trim(), 10);
          if (isNaN(qty) || qty <= 0) {
            errs.push({ row: idx, message: `Quantità non valida: "${row.Quantity}"` });
            return;
          }

          rows.push({
            rowIndex: idx,
            projectName: row.Project_Name.trim(),
            client: row.Client.trim(),
            region,
            pmEmail: row.PM_Email?.trim() || "",
            handoverDate,
            productSku: row.Product_SKU.trim(),
            quantity: qty,
          });
        });

        setValidatedRows(rows);
        setErrors(errs);
      },
      error(err) {
        setErrors([{ row: 0, message: `Errore parsing CSV: ${err.message}` }]);
      },
    });
  }, []);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Formato non supportato", description: "Carica un file .csv", variant: "destructive" });
      return;
    }
    validateAndParse(file);
  };

  const processImport = async () => {
    if (!user) return;
    setImporting(true);
    setProgress(0);
    setImportResult(null);

    const importErrors: ImportError[] = [];
    let projectsCreated = 0;
    let allocationsCreated = 0;

    try {
      // Phase A: Resolve PM emails → ids
      const uniqueEmails = [...new Set(validatedRows.map((r) => r.pmEmail).filter(Boolean))];
      const { data: profiles } = await supabase.from("profiles").select("id, email");
      const emailToId: Record<string, string> = {};
      (profiles || []).forEach((p) => { emailToId[p.email.toLowerCase()] = p.id; });

      // Phase A: Resolve SKUs → product ids
      const uniqueSkus = [...new Set(validatedRows.map((r) => r.productSku))];
      const { data: products } = await supabase.from("products").select("id, sku");
      const skuToId: Record<string, string> = {};
      (products || []).forEach((p) => { skuToId[p.sku.toLowerCase()] = p.id; });

      // Group rows by unique project
      const projectMap = new Map<string, ValidatedRow[]>();
      validatedRows.forEach((row) => {
        const key = row.projectName;
        if (!projectMap.has(key)) projectMap.set(key, []);
        projectMap.get(key)!.push(row);
      });

      const totalSteps = projectMap.size;
      let completed = 0;

      // Process in batches
      const projectEntries = Array.from(projectMap.entries());

      for (let batchStart = 0; batchStart < projectEntries.length; batchStart += BATCH_SIZE) {
        const batch = projectEntries.slice(batchStart, batchStart + BATCH_SIZE);

        await Promise.all(
          batch.map(async ([projectName, rows]) => {
            const firstRow = rows[0];
            const pmId = emailToId[firstRow.pmEmail.toLowerCase()] || user.id;

            // Phase B: Upsert project
            const { data: projectData, error: projectError } = await supabase
              .from("projects")
              .upsert(
                {
                  name: projectName,
                  client: firstRow.client,
                  region: firstRow.region as any,
                  pm_id: pmId,
                  handover_date: firstRow.handoverDate,
                  status: "Design" as const,
                },
                { onConflict: "name" }
              )
              .select("id")
              .single();

            if (projectError || !projectData) {
              rows.forEach((r) =>
                importErrors.push({ row: r.rowIndex, message: `Errore progetto "${projectName}": ${projectError?.message || "unknown"}` })
              );
              completed++;
              setProgress(Math.round((completed / totalSteps) * 100));
              return;
            }

            projectsCreated++;

            // Phase C: Insert allocations
            for (const row of rows) {
              const productId = skuToId[row.productSku.toLowerCase()];
              if (!productId) {
                importErrors.push({ row: row.rowIndex, message: `SKU non trovato: "${row.productSku}"` });
                continue;
              }

              const { error: allocError } = await supabase.from("project_allocations").insert({
                project_id: projectData.id,
                product_id: productId,
                quantity: row.quantity,
                status: "Requested" as const,
                target_date: row.handoverDate,
              });

              if (allocError) {
                importErrors.push({ row: row.rowIndex, message: `Errore allocazione: ${allocError.message}` });
              } else {
                allocationsCreated++;
              }
            }

            completed++;
            setProgress(Math.round((completed / totalSteps) * 100));
          })
        );
      }
    } catch (err: any) {
      importErrors.push({ row: 0, message: `Errore critico: ${err.message}` });
    }

    setImporting(false);
    setProgress(100);
    setErrors((prev) => [...prev, ...importErrors]);
    setImportResult({ projects: projectsCreated, allocations: allocationsCreated, errors: importErrors.length });

    toast({
      title: "Importazione completata",
      description: `${projectsCreated} Progetti creati, ${allocationsCreated} Allocazioni generate, ${importErrors.length} Errori`,
      variant: importErrors.length > 0 ? "destructive" : "default",
    });
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" /> Import Massivo CSV
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Trascina qui il file CSV oppure <span className="text-primary font-medium">clicca per selezionare</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Colonne richieste: Project_Name, Client, Region, PM_Email, Handover_Date, Product_SKU, Quantity
            </p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>

          {fileName && (
            <div className="flex items-center gap-2 mt-4 p-3 bg-muted/50 rounded-md">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium flex-1">{fileName}</span>
              <Badge variant="outline" className="text-xs">{validatedRows.length} righe valide</Badge>
              {errors.length > 0 && <Badge variant="destructive" className="text-xs">{errors.length} errori</Badge>}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resetState}><X className="h-4 w-4" /></Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Table */}
      {validatedRows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Anteprima Dati ({validatedRows.length} righe)</CardTitle>
            <Button onClick={processImport} disabled={importing} className="gap-2">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? "Importazione..." : "Conferma Importazione"}
            </Button>
          </CardHeader>
          <CardContent>
            {importing && (
              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Progresso importazione</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Progetto</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">PM Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedRows.slice(0, 100).map((row) => (
                    <tr key={row.rowIndex} className="border-b last:border-b-0 hover:bg-muted/50">
                      <td className="p-3 text-muted-foreground">{row.rowIndex}</td>
                      <td className="p-3 font-medium">{row.projectName}</td>
                      <td className="p-3">{row.client}</td>
                      <td className="p-3"><Badge variant="outline">{row.region}</Badge></td>
                      <td className="p-3 text-muted-foreground">{row.pmEmail || "—"}</td>
                      <td className="p-3">{row.handoverDate}</td>
                      <td className="p-3"><Badge variant="secondary">{row.productSku}</Badge></td>
                      <td className="p-3 text-right font-mono">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validatedRows.length > 100 && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Mostrando le prime 100 righe su {validatedRows.length}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Result */}
      {importResult && (
        <Card className={cn("border-l-4", importResult.errors > 0 ? "border-l-destructive" : "border-l-success")}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {importResult.errors > 0 ? (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-medium">Importazione completata</p>
                <p className="text-sm text-muted-foreground">
                  {importResult.projects} Progetti creati • {importResult.allocations} Allocazioni generate • {importResult.errors} Errori
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Log */}
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertCircle className="h-5 w-5" /> Log Errori ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {errors.map((err, i) => (
                <div key={i} className="flex gap-2 text-sm p-2 bg-destructive/5 rounded">
                  <Badge variant="destructive" className="text-xs shrink-0">
                    {err.row > 0 ? `Riga ${err.row}` : "Globale"}
                  </Badge>
                  <span className="text-muted-foreground">{err.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
