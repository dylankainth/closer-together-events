import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fb: { blue: "#1877F2", bg: "#F0F2F5", ink: "#1C1E21", sub: "#65676B", line: "#DADDE1" },
        muse: { 500: "#7C3AED", 600: "#6D28D9", 100: "#EDE9FE" },
      },
    },
  },
  plugins: [],
};
export default config;
