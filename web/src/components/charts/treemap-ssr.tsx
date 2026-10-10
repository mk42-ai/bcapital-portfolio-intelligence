import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import { bestInk } from "@/lib/color";
/** Blend a hex colour over white at the given alpha (so the label ink is chosen against the colour actually painted). */
const over = (hex: string, a: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * a + 255 * (1 - a)).toString(16).padStart(2, "0")).join("");
export type TreeNode = { name: string; slug?: string; value?: number; score?: number; children?: TreeNode[] };
const PALETTE = ["#1f2937", "#4b5563", "#6b7280", "#9ca3af", "#047857", "#374151"];
const fmt = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${Math.round(v / 1e6)}M`;
/** Server-rendered squarified treemap (pure SVG, zero client JS). Every leaf is a real link → fully keyboard navigable. */
export function TreemapSSR({ data, mode, width = 960, height = 440 }: { data: TreeNode; mode: string; width?: number; height?: number }) {
  const root = treemap<TreeNode>().size([width, height]).paddingOuter(4).paddingTop(22).paddingInner(2).tile(treemapSquarify).round(true)(
    hierarchy<TreeNode>(data).sum((d) => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
  ) as HierarchyRectangularNode<TreeNode>;
  const groups = root.children ?? [];
  const leaves = root.leaves();
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="group" aria-label={`Treemap of ${leaves.length} portfolio companies grouped by ${mode}; tile size is the estimated B Capital ticket. Each tile is a link to the company page.`} style={{ fontFamily: "var(--font-body)" }}>
        {groups.map((g, gi) => {
          const color = PALETTE[gi % PALETTE.length];
          return (
            <g key={g.data.name}>
              <rect x={g.x0} y={g.y0} width={g.x1 - g.x0} height={g.y1 - g.y0} fill="#f9fafb" stroke="#e5e7eb" rx={4} />
              <text x={g.x0 + 8} y={g.y0 + 15} fontSize={12} fontWeight={600} fill="#111827">{g.data.name} · {g.leaves().length}</text>
              {g.leaves().map((l) => {
                const w = l.x1 - l.x0, h = l.y1 - l.y0; const alpha = +(0.72 + 0.28 * ((l.data.score ?? 0) + 1) / 2).toFixed(3); const ink = bestInk(over(color, alpha));
                const label = w > 64 && h > 26; const small = w > 34 && h > 16 && !label;
                const shown = (label || small) ? (l.data.name.length * (label ? 6.2 : 5) > w - 8 ? l.data.name.slice(0, Math.max(3, Math.floor((w - 8) / (label ? 6.2 : 5)) - 1)) + "…" : l.data.name) : "";
                const showValue = label && h > 40; const val = fmt(l.value ?? 0);
                // WCAG 2.5.3: the accessible name must contain the visible label — so the aria-label starts with exactly the rendered text.
                const visible = [shown, showValue ? val : ""].filter(Boolean).join(" ");
                const detail = `${l.data.name}, est. ticket ${val}${typeof l.data.score === "number" ? `, sentiment ${l.data.score > 0 ? "+" : ""}${l.data.score.toFixed(2)}` : ""}`;
                return (
                  <a key={l.data.slug ?? l.data.name} href={`/company/${l.data.slug}`} aria-label={visible ? undefined : detail} aria-describedby={visible ? `tm-${l.data.slug}` : undefined} className="outline-none focus-visible:[&>rect]:stroke-[var(--ring)] focus-visible:[&>rect]:stroke-[3px]">
                    <title id={`tm-${l.data.slug}`}>{detail}</title>
                    <rect x={l.x0} y={l.y0} width={w} height={h} fill={color} fillOpacity={alpha} stroke="#ffffff" strokeWidth={1} rx={2} />
                    {shown && <text x={l.x0 + 5} y={l.y0 + (label ? 15 : 12)} fontSize={label ? 11 : 9} fontWeight={600} fill={ink} style={{ pointerEvents: "none" }}>{shown}</text>}
                    {showValue && <text x={l.x0 + 5} y={l.y0 + 29} fontSize={10} fill={ink} fillOpacity={0.85} style={{ pointerEvents: "none" }}>{val}</text>}
                  </a>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">Grey tones distinguish groups; tile opacity encodes sentiment (more opaque = more positive). Tab through tiles with the keyboard; Enter opens the company.</figcaption>
    </figure>
  );
}
