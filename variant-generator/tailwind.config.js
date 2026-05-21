/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sber: {
          50: "#E8F7EC",
          100: "#C5EAD0",
          200: "#9FDDB3",
          300: "#74CF93",
          400: "#4DC078",
          500: "#21A038",
          600: "#1A8A2E",
          700: "#147325",
          800: "#0E5C1C",
          900: "#0A4716",
          gradientFrom: "#21A038",
          gradientTo: "#00BF42",
        },
        accent: {
          DEFAULT: "#23A038",
          ink: "#0F5520",
          soft: "#D4EFB0",
          blue: "#2199F6",
        },
        ink: {
          900: "#15200E",
          700: "#4D5740",
          500: "#9CA28A",
          300: "#C7CACE",
        },
        surface: {
          base: "#FCFFE8",
          card: "#FFFFFF",
          subtle: "#F1F2F4",
        },
        glass: {
          card: "rgba(255,255,255,0.82)",
          cardBorder: "rgba(255,255,255,0.95)",
          soft: "rgba(255,255,255,0.6)",
          header: "rgba(255,255,255,0.55)",
          headerBorder: "rgba(255,255,255,0.7)",
          input: "rgba(255,255,255,0.75)",
          drop: "rgba(255,255,255,0.55)",
          toolbar: "rgba(255,255,255,0.4)",
        },
        border: {
          DEFAULT: "rgba(31,138,45,0.22)",
          subtle: "rgba(255,255,255,0.8)",
          legacy: "#E5E7EB",
        },
        danger: "#D03A1A",
        warn: {
          bg: "#FFF1EE",
          border: "#FBC7BC",
          ink: "#9A2A0C",
        },
      },
      fontFamily: {
        sans: [
          "Onest",
          "'SB Sans Text'",
          "Manrope",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Onest",
          "'SB Sans Display'",
          "Manrope",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      letterSpacing: {
        labelMono: "0.13em",
        tighter2: "-0.035em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.04)",
        cardHover:
          "0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 20px rgba(16, 24, 40, 0.08)",
        focus: "0 0 0 4px rgba(35, 160, 56, 0.18)",
        glass:
          "0 1px 0 rgba(255,255,255,0.95) inset, 0 22px 60px -26px rgba(31,138,45,0.28)",
        glassHover:
          "0 1px 0 rgba(255,255,255,0.95) inset, 0 28px 70px -22px rgba(31,138,45,0.34)",
        soft: "0 6px 16px -6px rgba(35,160,56,0.45)",
        softHover: "0 12px 28px -10px rgba(35,160,56,0.55)",
      },
      borderRadius: {
        xl2: "14px",
        xl3: "20px",
        glass: "24px",
      },
      backgroundImage: {
        "sber-gradient":
          "linear-gradient(135deg, #21A038 0%, #00BF42 100%)",
        "sber-gradient-hover":
          "linear-gradient(135deg, #1A8A2E 0%, #00A538 100%)",
        canvas: "linear-gradient(180deg, #FCFFE8 0%, #F2FBE2 100%)",
        "title-gradient":
          "linear-gradient(135deg, #0F5A1A 0%, #23A038 45%, #4DC078 100%)",
        "soft-hover":
          "linear-gradient(180deg, #D4EFB0 0%, #FFFFFF 100%)",
      },
      backdropBlur: {
        glass: "26px",
        header: "20px",
      },
    },
  },
  plugins: [],
};
