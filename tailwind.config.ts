import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#030712",
        foreground: "#f8fafc",
        panel: "#0b1120",
        "panel-hover": "#0f172a",
        border: "#1e293b",
        "border-subtle": "#172338",
        terminal: {
          green: "#10b981",
          red: "#ef4444",
          amber: "#f59e0b",
          cyan: "#06b6d4",
          blue: "#3b82f6",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      animation: {
        "pulse-subtle": "pulse-subtle 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-red": "glow-red 2s infinite ease-in-out",
      },
      keyframes: {
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "glow-red": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(239, 68, 68, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(239, 68, 68, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

