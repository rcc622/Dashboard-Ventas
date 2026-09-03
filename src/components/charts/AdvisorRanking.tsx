"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { fmtCompactMoney, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { palette } from "@/lib/palette";

export interface RankingRow {
  name: string;
  wonValue: number;
  won: number;
  conversion: number | null;
}

/** Barras horizontales, una sola serie (slot 1), etiqueta directa en la punta. */
export function AdvisorRanking({ rows }: { rows: RankingRow[] }) {
  const height = Math.max(160, rows.length * 34 + 28);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={palette.grid} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => fmtCompactMoney(v)}
          tick={{ fill: palette.muted, fontSize: 12 }}
          axisLine={{ stroke: palette.axis }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fill: palette.text2, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={
            <ChartTooltip<RankingRow>
              title={(d) => d.name}
              rows={(d) => [
                { label: "Valor ganado", value: fmtMoney(d.wonValue) },
                { label: "Cierres", value: fmtInt(d.won) },
                { label: "Conversión", value: fmtPct(d.conversion) },
              ]}
            />
          }
        />
        <Bar dataKey="wonValue" fill={palette.series[0]} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="wonValue"
            position="right"
            fill={palette.text2}
            fontSize={12}
            formatter={(v: unknown) => fmtCompactMoney(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
