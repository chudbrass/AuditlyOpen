import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
};

export default nextConfig;
