"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { FunnelRow } from "@/lib/metrics";
import { palette } from "@/lib/palette";

/** Leads abiertos por etapa. El orden lo da la posición (arriba = primera etapa). */
export function FunnelBars({ rows }: { rows: FunnelRow[] }) {
  const height = Math.max(160, rows.length * 40 + 28);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={palette.grid} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: palette.muted, fontSize: 12 }}
          axisLine={{ stroke: palette.axis }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={118}
          tick={{ fill: palette.text2, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={
            <ChartTooltip<FunnelRow>
              title={(d) => d.name}
              rows={(d) => [
                { label: "Leads", value: fmtInt(d.count) },
                { label: "Valor", value: fmtMoney(d.value) },
              ]}
            />
          }
        />
        <Bar dataKey="count" fill={palette.series[0]} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="count"
            position="right"
            fill={palette.text2}
            fontSize={12}
            formatter={(v: unknown) => fmtInt(Number(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
