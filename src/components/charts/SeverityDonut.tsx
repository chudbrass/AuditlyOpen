"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/ui/colors";

export default function SeverityDonut({
  counts,
  height = 180,
}: {
  counts: Record<string, number>; // { critical, serious, moderate, minor }
  height?: number;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: SEVERITY_LABELS[k] ?? k, key: k, value: v }));

  if (total === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-gray-400">
        No open issues
      </div>
    );
  }

  return (
    <div style={{ height }} className="relative w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="65%"
            outerRadius="90%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={SEVERITY_COLORS[entry.key] ?? "#9ca3af"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-gray-900">{total.toLocaleString()}</div>
        <div className="text-xs text-gray-500">Total issues</div>
      </div>
    </div>
  );
}
