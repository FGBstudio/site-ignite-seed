import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColFilterState = {
  search: string;
  selectedValues: string[] | null | undefined;
};
export type ColFiltersMap = Record<string, ColFilterState>;
export type SortConfig = { key: string; direction: "asc" | "desc" } | null;

interface ColumnFilterProps<T> {
  title: string;
  colKey: string;
  rows: T[];
  getValue: (row: T) => string;
  colFilters: ColFiltersMap;
  setColFilters: React.Dispatch<React.SetStateAction<ColFiltersMap>>;
  sortConfig: SortConfig;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
  className?: string;
}

export function ColumnFilter<T>({
  title,
  colKey,
  rows,
  getValue,
  colFilters,
  setColFilters,
  sortConfig,
  setSortConfig,
  className,
}: ColumnFilterProps<T>) {
  const uniqueValues = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = getValue(r);
      set.add(v && v.trim() !== "" ? v : "(Blanks)");
    });
    return Array.from(set).sort((a, b) => {
      if (a === "(Blanks)") return 1;
      if (b === "(Blanks)") return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [rows, getValue]);

  const columnFilter = colFilters[colKey] || { search: "", selectedValues: undefined };
  const popoverSearch = columnFilter.search ?? "";

  const filteredChecklist = useMemo(
    () => uniqueValues.filter((v) => v.toLowerCase().includes(popoverSearch.toLowerCase())),
    [uniqueValues, popoverSearch]
  );

  const isSortedAsc = sortConfig?.key === colKey && sortConfig?.direction === "asc";
  const isSortedDesc = sortConfig?.key === colKey && sortConfig?.direction === "desc";
  const isFiltered =
    (columnFilter.selectedValues !== undefined && columnFilter.selectedValues !== null) ||
    !!columnFilter.search;

  const handleSelectAll = (checked: boolean) => {
    setColFilters((prev) => ({
      ...prev,
      [colKey]: { ...prev[colKey], search: prev[colKey]?.search ?? "", selectedValues: checked ? undefined : [] },
    }));
  };

  const handleValueToggle = (value: string, checked: boolean) => {
    setColFilters((prev) => {
      const current = prev[colKey] || { search: "", selectedValues: undefined };
      let next: string[];
      if (current.selectedValues === undefined || current.selectedValues === null) {
        next = [...uniqueValues];
      } else {
        next = [...current.selectedValues];
      }
      if (checked) {
        if (!next.includes(value)) next.push(value);
      } else {
        next = next.filter((v) => v !== value);
      }
      if (next.length === uniqueValues.length) {
        return { ...prev, [colKey]: { ...current, selectedValues: undefined } };
      }
      return { ...prev, [colKey]: { ...current, selectedValues: next } };
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 hover:text-slate-800 transition-colors uppercase font-semibold text-[10px] tracking-wider py-1.5 select-none outline-none text-muted-foreground",
            (isSortedAsc || isSortedDesc || isFiltered) && "text-indigo-600 font-bold",
            className
          )}
        >
          <span>{title}</span>
          {isSortedAsc && <ArrowUp className="w-3.5 h-3.5 shrink-0" />}
          {isSortedDesc && <ArrowDown className="w-3.5 h-3.5 shrink-0" />}
          {!isSortedAsc && !isSortedDesc && (
            <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0 hover:opacity-100" />
          )}
          {isFiltered && <Filter className="w-2.5 h-2.5 fill-indigo-600 shrink-0" />}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-2 bg-white border border-slate-200 shadow-xl rounded-xl z-50">
        <div className="space-y-1 text-xs">
          <button
            onClick={() => setSortConfig({ key: colKey, direction: "asc" })}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedAsc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Sort A to Z
          </button>
          <button
            onClick={() => setSortConfig({ key: colKey, direction: "desc" })}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedDesc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowDown className="w-3.5 h-3.5" /> Sort Z to A
          </button>

          <div className="border-t border-slate-100 my-1.5" />

          <div className="relative px-1 mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={popoverSearch}
              onChange={(e) =>
                setColFilters((prev) => ({
                  ...prev,
                  [colKey]: {
                    ...(prev[colKey] || { search: "", selectedValues: undefined }),
                    search: e.target.value,
                  },
                }))
              }
              placeholder="Search values..."
              className="pl-8 pr-2 h-7 text-xs bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-1 space-y-1.5">
            <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none">
              <Checkbox
                checked={columnFilter.selectedValues === undefined || columnFilter.selectedValues === null}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
              <span className="font-semibold text-slate-700">(Select All)</span>
            </label>

            {filteredChecklist.map((val) => {
              const isChecked =
                columnFilter.selectedValues === undefined ||
                columnFilter.selectedValues === null ||
                columnFilter.selectedValues.includes(val);
              return (
                <label
                  key={val}
                  className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none truncate"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => handleValueToggle(val, !!checked)}
                  />
                  <span className="text-slate-600 truncate">{val}</span>
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Helper to apply filters + sort to a row set. */
export function applyColumnFiltersAndSort<T>(
  rows: T[],
  colFilters: ColFiltersMap,
  sortConfig: SortConfig,
  resolvers: Record<string, (row: T) => string>
): T[] {
  const filtered = rows.filter((r) => {
    for (const key of Object.keys(colFilters)) {
      const f = colFilters[key];
      if (!f) continue;
      const resolver = resolvers[key];
      if (!resolver) continue;
      const raw = resolver(r);
      const val = raw && raw.trim() !== "" ? raw : "(Blanks)";
      if (f.selectedValues !== undefined && f.selectedValues !== null) {
        if (!f.selectedValues.includes(val)) return false;
      }
    }
    return true;
  });
  if (!sortConfig) return filtered;
  const resolver = resolvers[sortConfig.key];
  if (!resolver) return filtered;
  const sorted = [...filtered].sort((a, b) => {
    const av = resolver(a) || "";
    const bv = resolver(b) || "";
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
  });
  return sortConfig.direction === "asc" ? sorted : sorted.reverse();
}
