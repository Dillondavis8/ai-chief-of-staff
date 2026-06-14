import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        paper: "#f7f5ef",
        line: "#ded8cc",
        signal: "#9f4f1e",
        mint: "#1f7a68"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 33, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
