/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#010E80",
          hover: "#0057B8",
          active: "#0431d4",
        },
        accent: "#FFE600",
        ink: "#050814",
        // Dark mode surfaces
        surface: "#0B112C",
        surface2: "#111A42",
        // Light mode surfaces
        paper: "#F8FAFC",
        paper2: "#FFFFFF",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
