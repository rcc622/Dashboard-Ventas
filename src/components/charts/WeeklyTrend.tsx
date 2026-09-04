"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { fmtInt } from "@/lib/format";
import type { WeekPoint } from "@/lib/metrics";
import { palette } from "@/lib/palette";

const SERIES = [
  { key: "nuevos", label: "Nuevos", color: palette.series[0] },
  { key: "ganados", label: "Ganados", color: palette.series[1] },
  { key: "perdidos", label: "Perdidos", color: palette.series[2] },
] as const;

const LABEL_GAP = 14;

/**
 * Etiquetas directas al final de cada línea. Si dos líneas terminan muy juntas,
 * las etiquetas se separan y una línea guía las conecta con su punto.
 */
function EndLabels({ rows }: { rows: WeekPoint[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || rows.length === 0) return null;

  const last = rows[rows.length - 1];
  const x = xScale(last.label);
  if (x === undefined) return null;

  const points = SERIES.flatMap((s) => {
    const y = yScale(last[s.key]);
    return y === undefined ? [] : [{ key: s.key, label: s.label, y, labelY: y }];
  }).sort((a, b) => a.y - b.y);

  // Separar etiquetas que chocan, manteniendo el grupo centrado sobre sus puntos.
  for (let i = 1; i < points.length; i++) {
    if (points[i].labelY - points[i - 1].labelY < LABEL_GAP) {
      points[i].labelY = points[i - 1].labelY + LABEL_GAP;
    }
  }
  if (points.length > 1) {
    const meanY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
    const meanLabel = points.reduce((acc, p) => acc + p.labelY, 0) / points.length;
    const offset = meanLabel - meanY;
    for (const p of points) p.labelY -= offset;
  }
  const top = plot.y + 6;
  const bottom = plot.y + plot.height - 6;
  for (let i = 0; i < points.length; i++) {
    if (points[i].labelY < top) points[i].labelY = top;
    if (i > 0 && points[i].labelY - points[i - 1].labelY < LABEL_GAP) {
      points[i].labelY = points[i - 1].labelY + LABEL_GAP;
    }
  }
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].labelY > bottom) points[i].labelY = bottom;
    if (i < points.length - 1 && points[i + 1].labelY - points[i].labelY < LABEL_GAP) {
      points[i].labelY = points[i + 1].labelY - LABEL_GAP;
    }
  }

  return (
    <g aria-hidden>
      {points.map((p) => (
        <g key={p.key}>
          {Math.abs(p.labelY - p.y) > 1 && (
            <line x1={x + 6} y1={p.y} x2={x + 12} y2={p.labelY} stroke={palette.muted} strokeWidth={1} />
          )}
          <text x={x + 14} y={p.labelY} dy={4} fill={palette.text2} fontSize={12}>
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export function WeeklyTrend({ rows }: { rows: WeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 76, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={palette.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: palette.muted, fontSize: 12 }}
          axisLine={{ stroke: palette.axis }}
          tickLine={false}
        />
        <YAxis allowDecimals={false} width={36} tick={{ fill: palette.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ stroke: palette.axis, strokeWidth: 1 }}
          content={
            <ChartTooltip<WeekPoint>
              title={(d) => `Semana del ${d.label}`}
              rows={(d) => SERIES.map((s) => ({ label: s.label, value: fmtInt(d[s.key]), color: s.color }))}
            />
          }
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => <span style={{ color: palette.text2 }}>{value}</span>}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 4, fill: s.color, stroke: palette.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: s.color, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
        <EndLabels rows={rows} />
      </LineChart>
    </ResponsiveContainer>
  );
}
