import type { Config } from "tailwindcss";
import { colors, semanticColors } from "./src/design-tokens/colors";

// The brand palette lives in ONE place — src/design-tokens/colors.ts, the source
// the Remotion compositions import directly. Tailwind consumes the same object
// here so class-based colors (bg-accent-500, …) and inline token styles can
// never drift apart, which is exactly how ClipReel's branding diverged before.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ...colors,
        background: semanticColors.background,
        surface: semanticColors.surface,
        success: semanticColors.success,
        warning: semanticColors.warning,
        error: semanticColors.error,
        info: semanticColors.info,
      },
      fontFamily: {
        heading: ["Geist Sans", "system-ui", "sans-serif"],
        body: ["Geist Sans", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "monospace"],
        display: ["Fredoka", "system-ui", "sans-serif"],
      },
      borderRadius: {
        none: "0",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        full: "9999px",
      },
      boxShadow: {
        xs: "1px 1px 0 #C2BAAC",
        sm: "2px 2px 0 #C2BAAC",
        md: "3px 3px 0 #A49C8E",
        lg: "4px 4px 0 #857D70",
        xl: "6px 6px 0 #6B6459",
        "soft-sm": "0 1px 3px rgba(45, 42, 36, 0.1)",
        "soft-md": "0 4px 6px rgba(45, 42, 36, 0.1)",
        "soft-lg": "0 10px 15px rgba(45, 42, 36, 0.1)",
        accent: "3px 3px 0 #E5573F",
        primary: "3px 3px 0 #1D525F",
      },
    },
  },
  plugins: [],
};

export default config;
