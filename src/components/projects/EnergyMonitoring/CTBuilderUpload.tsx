import { useRef, useState } from "react";
import { Upload, FileText, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { parseSldCsv } from "./lib/csvParser";
import { RawRow } from "./types";
import { asset } from "@/lib/assetUrl";

interface Props {
  fileName: string | null;
  rowCount: number;
  onUpload: (rows: RawRow[], fileName: string) => void;
  onClear: () => void;
}

export function CTBuilderUpload({ fileName, rowCount, onUpload, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    try {
      const text = await file.text();
      const { rows } = parseSldCsv(text);
      if (rows.length === 0) {
        toast({ title: "Empty CSV", description: "No data rows found.", variant: "destructive" });
        return;
      }
      onUpload(rows, file.name);
      toast({ title: "CSV loaded", description: `${rows.length} rows from ${file.name}` });
    } catch (e) {
      toast({
        title: "Parse error",
        description: e instanceof Error ? e.message : "Could not parse CSV.",
        variant: "destructive",
      });
    }
  };

  if (fileName) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">{rowCount} rows loaded</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            Replace
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 border-dashed transition-colors px-6 py-10 text-center cursor-pointer ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
    >
      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-foreground">Drop the SLD input CSV here</p>
      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <a
          href={asset("templates/ct-builder-sample.csv")}
          download
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Download className="h-3.5 w-3.5" /> Download template
        </a>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
