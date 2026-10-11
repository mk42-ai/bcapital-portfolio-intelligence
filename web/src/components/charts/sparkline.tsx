/**
 * sparkline.tsx — dependency-free, server-renderable SVG sparkline (a23).
 * Pure SVG `<path>` polyline normalised to the box; last point as an accent dot; optional soft area fill.
 * `sparklinePath` is a pure helper (unit-tested in tests/unit/sparkline.test.ts).
 */
import * as React from "react";

export const SPARKLINE_INK = "#1F2937";
export const SPARKLINE_ACCENT = "#0AC985";

export type SparklinePoint = { x: number; y: number };

/** Drop non-finite values (NaN, ±Infinity, null-ish coerced) so a single bad sample never breaks the path. */
export function cleanValues(values: ReadonlyArray<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  return out;
}

/** Map a series into SVG box coordinates. min/max fit with `pad` px padding; a flat series sits on the centre line. */
export function sparklinePoints(values: ReadonlyArray<number | null | undefined>, w: number, h: number, pad = 2): SparklinePoint[] {
  const vs = cleanValues(values);
  const n = vs.length;
  if (n === 0 || !(w > 0) || !(h > 0)) return [];
  const innerW = Math.max(0, w - pad * 2);
  const innerH = Math.max(0, h - pad * 2);
  let min = Infinity, max = -Infinity;
  for (const v of vs) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min;
  const cy = h / 2;
  return vs.map((v, i) => {
    const x = n === 1 ? w / 2 : pad + (innerW * i) / (n - 1);
    const y = span === 0 ? cy : pad + innerH * (1 - (v - min) / span);
    return { x: round2(x), y: round2(y) };
  });
}

/** Polyline `d` attribute. "" for an empty series; a single point yields "" (the component draws the centre dot only). */
export function sparklinePath(values: ReadonlyArray<number | null | undefined>, w: number, h: number, pad = 2): string {
  const pts = sparklinePoints(values, w, h, pad);
  if (pts.length < 2) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** Closed area under the polyline, for the optional soft fill. "" when there is no line. */
export function sparklineAreaPath(values: ReadonlyArray<number | null | undefined>, w: number, h: number, pad = 2): string {
  const pts = sparklinePoints(values, w, h, pad);
  if (pts.length < 2) return "";
  const base = round2(h - pad);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return `${line} L${pts[pts.length - 1].x} ${base} L${pts[0].x} ${base} Z`;
}

/** Default accessible summary: first → last and signed delta. */
export function sparklineSummary(values: ReadonlyArray<number | null | undefined>, digits = 2): string {
  const vs = cleanValues(values);
  if (vs.length === 0) return "No data";
  const first = vs[0], last = vs[vs.length - 1];
  if (vs.length === 1) return `Single value ${first.toFixed(digits)}`;
  const d = last - first;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return `${vs.length} points, ${first.toFixed(digits)} to ${last.toFixed(digits)}, change ${sign}${Math.abs(d).toFixed(digits)}`;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export type SparklineProps = {
  values: ReadonlyArray<number | null | undefined>;
  width?: number;
  height?: number;
  /** Line colour (charcoal ink by default). */
  stroke?: string;
  /** Last-point dot and area fill colour (brand green by default). */
  accent?: string;
  /** Soft area fill under the line (accent at 12% opacity). */
  fill?: boolean;
  ariaLabel?: string;
  strokeWidth?: number;
  pad?: number;
  className?: string;
  /** Render a tabular `<title>` caption inside the SVG (hover tooltip in browsers). */
  caption?: boolean;
};

export function Sparkline({
  values, width = 120, height = 28, stroke = SPARKLINE_INK, accent = SPARKLINE_ACCENT,
  fill = false, ariaLabel, strokeWidth = 1.5, pad = 2, className, caption = false,
}: SparklineProps) {
  const pts = sparklinePoints(values, width, height, pad);
  const d = sparklinePath(values, width, height, pad);
  const area = fill ? sparklineAreaPath(values, width, height, pad) : "";
  const last = pts.length ? pts[pts.length - 1] : null;
  const label = ariaLabel ?? `Sparkline: ${sparklineSummary(values)}`;
  return (
    <svg
      role="img"
      aria-label={label}
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      focusable="false"
      style={{ shapeRendering: "geometricPrecision", display: "inline-block", verticalAlign: "middle", overflow: "visible" }}
      data-testid="sparkline"
    >
      {caption && <title>{label}</title>}
      {area && <path d={area} fill={accent} fillOpacity={0.12} stroke="none" />}
      {d && (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && <circle cx={last.x} cy={last.y} r={3} fill={accent} stroke="#FFFFFF" strokeWidth={1} />}
    </svg>
  );
}

export default Sparkline;
