"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { fmtInt, fmtPct } from "@/lib/format";
import type { ChannelRow } from "@/lib/metrics";
import { palette } from "@/lib/palette";

/** Leads nuevos por canal de origen (una serie, slot 1). */
export function ChannelBars({ rows }: { rows: ChannelRow[] }) {
  const height = Math.max(160, rows.length * 36 + 28);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
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
          width={96}
          tick={{ fill: palette.text2, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={
            <ChartTooltip<ChannelRow>
              title={(d) => d.name}
              rows={(d) => [
                { label: "Leads", value: fmtInt(d.leads) },
                { label: "Ganados", value: fmtInt(d.won) },
                { label: "Tasa de cierre", value: fmtPct(d.leads ? d.won / d.leads : null) },
              ]}
            />
          }
        />
        <Bar dataKey="leads" fill={palette.series[0]} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="leads"
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
