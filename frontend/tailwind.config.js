/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand neutral scale
        neutral: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
          800: "#262626",
          900: "#171717",
          950: "#0a0a0a",
        },
        // Primary brand colors
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // Status colors
        success: {
          50: "#ecfdf5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
        warning: {
          50: "#fffbeb",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        error: {
          50: "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        // AI/Smart features
        ai: {
          50: "#faf5ff",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
        },
        // Warm accent colors
        "warm-orange": {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          DEFAULT: "hsl(var(--brand-warm-orange))",
        },
        "warm-amber": {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          DEFAULT: "hsl(var(--brand-warm-amber))",
        },
        "warm-coral": {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          DEFAULT: "hsl(var(--brand-warm-coral))",
        },
        "warm-peach": {
          50: "#fefcf8",
          100: "#fef7ec",
          200: "#fdebd0",
          300: "#fcdbaa",
          400: "#f9c574",
          500: "#f6a94c",
          DEFAULT: "hsl(var(--brand-warm-peach))",
        },
        // shadcn/ui system colors
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      // Enhanced typography scale
      fontSize: {
        display: ["2.5rem", { lineHeight: "1.1", fontWeight: "600" }],
        h1: ["2rem", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["1.25rem", { lineHeight: "1.4", fontWeight: "500" }],
        lg: ["1.125rem", { lineHeight: "1.6" }],
        base: ["1rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.4" }],
        xs: ["0.75rem", { lineHeight: "1.3" }],
      },
      // Enhanced spacing system
      spacing: {
        0.5: "0.125rem", // 2px
        1.5: "0.375rem", // 6px
        2.5: "0.625rem", // 10px
        3.5: "0.875rem", // 14px
        4.5: "1.125rem", // 18px
        5.5: "1.375rem", // 22px
        6.5: "1.625rem", // 26px
        7: "1.75rem", // 28px
        7.5: "1.875rem", // 30px
        8.5: "2.125rem", // 34px
        9: "2.25rem", // 36px
        9.5: "2.375rem", // 38px
        11: "2.75rem", // 44px
        13: "3.25rem", // 52px
        15: "3.75rem", // 60px
        17: "4.25rem", // 68px
        18: "4.5rem", // 72px
        19: "4.75rem", // 76px
        21: "5.25rem", // 84px
        22: "5.5rem", // 88px
        23: "5.75rem", // 92px
      },
      // Enhanced animations
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "fade-in-slow": "fadeIn 300ms ease-out",
        "slide-up": "slideUp 200ms ease-out",
        "slide-up-slow": "slideUp 300ms ease-out",
        "slide-down": "slideDown 200ms ease-out",
        "slide-left": "slideLeft 200ms ease-out",
        "slide-right": "slideRight 200ms ease-out",
        "scale-in": "scaleIn 150ms ease-out",
        "scale-out": "scaleOut 150ms ease-in",
        "bounce-gentle": "bounceGentle 500ms ease-out",
        "pulse-gentle": "pulseGentle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideLeft: {
          "0%": { transform: "translateX(20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideRight: {
          "0%": { transform: "translateX(-20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        scaleOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        bounceGentle: {
          "0%, 20%, 53%, 80%, 100%": { transform: "translate3d(0,0,0)" },
          "40%, 43%": { transform: "translate3d(0,-5px,0)" },
          "70%": { transform: "translate3d(0,-3px,0)" },
          "90%": { transform: "translate3d(0,-1px,0)" },
        },
        pulseGentle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
      },
      // Enhanced border radius
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      // Enhanced shadows
      boxShadow: {
        soft: "0 2px 8px 0 rgb(0 0 0 / 0.06)",
        medium: "0 4px 12px 0 rgb(0 0 0 / 0.08)",
        hard: "0 8px 24px 0 rgb(0 0 0 / 0.12)",
        brutal: "4px 4px 0px 0px rgb(0 0 0 / 1)",
        "inner-soft": "inset 0 2px 4px 0 rgb(0 0 0 / 0.04)",
      },
      // Enhanced transitions
      transitionDuration: {
        75: "75ms",
        175: "175ms",
        250: "250ms",
        400: "400ms",
        600: "600ms",
      },
      transitionTimingFunction: {
        bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      // Screen breakpoints for responsive design
      screens: {
        xs: "475px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      // Enhanced z-index scale
      zIndex: {
        1: "1",
        2: "2",
        3: "3",
        4: "4",
        5: "5",
        60: "60",
        70: "70",
        80: "80",
        90: "90",
        100: "100",
      },
      // Container configurations
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          sm: "1.5rem",
          lg: "2rem",
          xl: "2.5rem",
          "2xl": "3rem",
        },
        screens: {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
          "2xl": "1400px",
        },
      },
      // Aspect ratios for media
      aspectRatio: {
        card: "4 / 3",
        video: "16 / 9",
        square: "1 / 1",
        portrait: "3 / 4",
      },
      // Font families
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          '"Noto Sans"',
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
        mono: [
          '"SF Mono"',
          "Monaco",
          "Inconsolata",
          '"Roboto Mono"',
          '"Source Code Pro"',
          "monospace",
        ],
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // Custom utility classes
    function ({ addUtilities }) {
      const newUtilities = {
        ".text-balance": {
          textWrap: "balance",
        },
        ".text-pretty": {
          textWrap: "pretty",
        },
        // Touch-friendly minimum sizes
        ".touch-target": {
          minHeight: "44px",
          minWidth: "44px",
        },
        // Focus styles
        ".focus-brand": {
          "&:focus-visible": {
            outline: "2px solid hsl(var(--ring))",
            outlineOffset: "2px",
          },
        },
        // Glass morphism effect
        ".glass": {
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        },
        // Brutalist card effect
        ".brutal-card": {
          border: "2px solid black",
          boxShadow: "4px 4px 0px 0px rgb(0 0 0)",
        },
      };
      addUtilities(newUtilities);
    },
  ],
};
