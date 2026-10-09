"use client";
import { useState } from "react";
import { DataTable, type TableRow } from "./data-table";
import { Button } from "@/components/ui/button";
export function PagedTable({ rows, caption, pageSize = 25 }: { rows: TableRow[]; caption: string; pageSize?: number }) {
  const [n, setN] = useState(pageSize);
  return (
    <div>
      <DataTable rows={rows.slice(0, n)} caption={caption} />
      <p className="mt-3 flex items-center gap-3 text-sm text-muted" role="status">Showing {Math.min(n, rows.length)} of {rows.length} rows{n < rows.length && <><Button size="sm" variant="secondary" onClick={() => setN(rows.length)}>Show all {rows.length}</Button><Button size="sm" variant="ghost" onClick={() => setN(n + pageSize)}>Next {pageSize}</Button></>}</p>
    </div>
  );
}
