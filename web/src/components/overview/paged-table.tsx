"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DataTable, type SortKey, type SortState, type TableRow } from "./data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
/** Client-side search + column sort + "show more" paging over the server-filtered rows. */
export function PagedTable({ rows, caption, pageSize = 25 }: { rows: TableRow[]; caption: string; pageSize?: number }) {
  const [n, setN] = useState(pageSize);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = needle ? rows.filter((r) => [r.name, r.sector, r.region, r.b_capital_role, r.estimate_confidence].some((v) => (v ?? "").toLowerCase().includes(needle))) : rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...hit].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sign; });
  }, [rows, q, sort]);
  const onSort = (key: SortKey) => { setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" })); };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label htmlFor="table-search" className="sr-only">Search companies</label>
        <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden /><Input id="table-search" type="search" data-testid="table-search" placeholder="Search name, sector, region, role…" className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); setN(pageSize); }} /></div>
        {q && <Button size="sm" variant="ghost" onClick={() => setQ("")}>Clear search</Button>}
      </div>
      <DataTable rows={visible.slice(0, n)} caption={caption} sort={sort} onSort={onSort} />
      <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted" role="status" data-testid="table-status">
        Showing {Math.min(n, visible.length)} of {visible.length} rows{q && ` matching “${q}”`}
        {n < visible.length && <><Button size="sm" variant="secondary" data-testid="table-show-all" onClick={() => setN(visible.length)}>Show all {visible.length}</Button><Button size="sm" variant="ghost" data-testid="table-next" onClick={() => setN(n + pageSize)}>Next {pageSize}</Button></>}
      </p>
    </div>
  );
}
