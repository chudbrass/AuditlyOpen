"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export default function TrendChart({
  data,
  series,
  height = 220,
  yDomain,
}: {
  data: Record<string, string | number | null>[]; // each row: { label: "Jun 3", <seriesKey>: value }
  series: TrendSeries[];
  height?: number;
  yDomain?: [number, number];
}) {
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-gray-400">
        Not enough scan history to chart a trend yet
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} domain={yDomain ?? ["auto", "auto"]} allowDecimals={false} />
          <Tooltip />
          <Legend iconType="plainline" />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
