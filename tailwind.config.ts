import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.04)",
      },
      colors: {
        audit: {
          navy: "#071225",
          rail: "#091a36",
          blue: "#2563eb",
          sky: "#60a5fa",
          surface: "#f5f7fb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
