"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/ui/colors";

const SERIES_KEYS = ["critical", "serious", "moderate", "minor"] as const;

export default function StackedIssuesArea({
  data,
  height = 140,
}: {
  data: Record<string, string | number | null>[];
  height?: number;
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
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend iconType="plainline" />
          {SERIES_KEYS.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={SEVERITY_LABELS[key]}
              stackId="issues"
              stroke={SEVERITY_COLORS[key]}
              fill={SEVERITY_COLORS[key]}
              fillOpacity={0.25}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
