/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/menu/catalog.js holds every category's history colours. Without this
    // glob Tailwind never sees them, and a category whose classes happen not to
    // appear anywhere else renders with no background at all.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // The public menu site (/menu), matched to the printed menu board.
        moon: {
          cream: "#F8EFE3",
          paper: "#FDF8F1",
          caramel: "#C8964F", // a fill: put moon-ink text on it, never white
          orange: "#9E5618", // 4.9:1+ on every cream, 5.5:1 under white text
          ink: "#241810",
          muted: "#6E5A48", // 5.7:1+ on every cream
        },
      },
      fontFamily: {
        // Set by next/font in app/menu/layout.jsx; only defined on /menu.
        display: ["var(--font-display)", "Georgia", "serif"],
        script: ["var(--font-script)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
