import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Reusable Excel-style filter button.
 * - Sort A-Z / Z-A
 * - Search values
 * - Multi-select checklist (undefined selectedValues = all)
 *
 * Used in Monitor tables to keep a consistent filter modality across
 * Air, Energy and Water.
 */
export interface ExcelFilterState {
  selectedValues: string[] | undefined;
  sort: "asc" | "desc" | null;
}

interface Props {
  label: string;
  values: string[]; // unique domain values
  state: ExcelFilterState;
  onChange: (next: ExcelFilterState) => void;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
}

export function ExcelFilterButton({
  label,
  values,
  state,
  onChange,
  buttonClassName,
  align = "start",
}: Props) {
  const [search, setSearch] = useState("");

  const uniqueValues = useMemo(() => {
    return [...values].sort((a, b) => {
      if (a === "(Blanks)") return 1;
      if (b === "(Blanks)") return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [values]);

  const filteredChecklist = useMemo(
    () => uniqueValues.filter((v) => v.toLowerCase().includes(search.toLowerCase())),
    [uniqueValues, search],
  );

  const isFiltered = state.selectedValues !== undefined;
  const isSortAsc = state.sort === "asc";
  const isSortDesc = state.sort === "desc";
  const isActive = isFiltered || isSortAsc || isSortDesc;

  const setSort = (dir: "asc" | "desc") => onChange({ ...state, sort: dir });

  const toggleAll = (checked: boolean) => {
    onChange({ ...state, selectedValues: checked ? undefined : [] });
  };

  const toggleValue = (value: string, checked: boolean) => {
    let next: string[];
    if (state.selectedValues === undefined) {
      next = [...uniqueValues];
    } else {
      next = [...state.selectedValues];
    }
    if (checked) {
      if (!next.includes(value)) next.push(value);
    } else {
      next = next.filter((v) => v !== value);
    }
    onChange({
      ...state,
      selectedValues: next.length === uniqueValues.length ? undefined : next,
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium uppercase tracking-wide transition-colors",
            isActive
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            buttonClassName,
          )}
        >
          <span>{label}</span>
          {isSortAsc && <ArrowUp className="w-3 h-3" />}
          {isSortDesc && <ArrowDown className="w-3 h-3" />}
          {!isSortAsc && !isSortDesc && <ArrowUpDown className="w-3 h-3 opacity-50" />}
          {isFiltered && <Filter className="w-2.5 h-2.5 fill-indigo-600" />}
        </button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-56 p-2 bg-white border border-slate-200 shadow-xl rounded-xl z-50">
        <div className="space-y-1 text-xs">
          <button
            onClick={() => setSort("asc")}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortAsc && "bg-indigo-50/50 text-indigo-700 font-bold",
            )}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Sort A to Z
          </button>
          <button
            onClick={() => setSort("desc")}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortDesc && "bg-indigo-50/50 text-indigo-700 font-bold",
            )}
          >
            <ArrowDown className="w-3.5 h-3.5" /> Sort Z to A
          </button>

          <div className="border-t border-slate-100 my-1.5" />

          <div className="relative px-1 mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search values..."
              className="pl-8 pr-2 h-7 text-xs bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-1 space-y-1.5">
            <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none">
              <Checkbox
                checked={state.selectedValues === undefined}
                onCheckedChange={(checked) => toggleAll(!!checked)}
              />
              <span className="font-semibold text-slate-700">(Select All)</span>
            </label>

            {filteredChecklist.map((val) => {
              const isChecked =
                state.selectedValues === undefined || state.selectedValues.includes(val);
              return (
                <label
                  key={val}
                  className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none truncate"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => toggleValue(val, !!checked)}
                  />
                  <span className="text-slate-600 truncate">{val}</span>
                </label>
              );
            })}
            {filteredChecklist.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-400 italic">No matches</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
