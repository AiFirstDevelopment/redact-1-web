/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional slate blue theme - WCAG compliant
        'pastel-blue': '#F1F5F9',    // Slate-100 for main backgrounds
        'pastel-peach': '#F8FAFC',   // Slate-50 for right panel
        'pastel-mint': '#1E3A5F',    // Deep navy blue for header
        'pastel-cream': '#E2E8F0',   // Slate-200 for tabs area
        'card-white': '#FFFFFF',     // Pure white for cards
      },
    },
  },
  plugins: [],
}
