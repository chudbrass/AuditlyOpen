"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export default function Sparkline({
  values,
  color = "#16a34a",
  height = 36,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ height }} className="flex items-center text-xs text-gray-400">not enough history</div>;
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
