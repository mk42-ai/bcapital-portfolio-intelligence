"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
export default function SentimentLine({ data, ariaLabel }: { data: { t: string; score: number; model?: string | null }[]; ariaLabel: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(v) => String(v).slice(5, 16).replace("T", " ")} stroke="var(--border)" />
          <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tick={{ fill: "var(--muted)", fontSize: 11 }} stroke="var(--border)" />
          <ReferenceLine y={0} stroke="var(--muted-2)" />
          <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 12 }} formatter={(v) => [(Number(v) > 0 ? "+" : "") + Number(v).toFixed(2), "score"]} labelFormatter={(l) => `${l}`} />
          <Line type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--chart-1)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
