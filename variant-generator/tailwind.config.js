/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sber palette
        sber: {
          50: "#E8F7EC",
          100: "#C5EAD0",
          200: "#9FDDB3",
          300: "#74CF93",
          400: "#4DC078",
          500: "#21A038", // primary
          600: "#1A8A2E",
          700: "#147325",
          800: "#0E5C1C",
          900: "#0A4716",
          gradientFrom: "#21A038",
          gradientTo: "#00BF42",
        },
        accent: {
          blue: "#2199F6",
        },
        ink: {
          900: "#1A1A1A",
          700: "#4F5358",
          500: "#80868B",
          300: "#C7CACE",
        },
        surface: {
          base: "#F7F7F8",
          card: "#FFFFFF",
          subtle: "#F1F2F4",
        },
        border: {
          DEFAULT: "#E5E7EB",
          subtle: "#EEF0F2",
        },
        danger: "#E63757",
      },
      fontFamily: {
        // подключим SB Sans, если найдёшь ссылку — заменим
        sans: ["'SB Sans Text'", "Manrope", "system-ui", "sans-serif"],
        display: ["'SB Sans Display'", "Manrope", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.04)",
        cardHover:
          "0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 20px rgba(16, 24, 40, 0.08)",
        focus: "0 0 0 3px rgba(33, 160, 56, 0.18)",
      },
      borderRadius: {
        xl2: "14px",
      },
      backgroundImage: {
        "sber-gradient":
          "linear-gradient(135deg, #21A038 0%, #00BF42 100%)",
        "sber-gradient-hover":
          "linear-gradient(135deg, #1A8A2E 0%, #00A538 100%)",
      },
    },
  },
  plugins: [],
};
