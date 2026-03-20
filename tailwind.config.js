/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rich harmonious theme - better contrast
        'pastel-blue': '#CBBAB0',    // Dusty rose/taupe for login backgrounds
        'pastel-peach': '#D4B8A8',   // Dusty rose for right drawer (matches tabs)
        'pastel-mint': '#9B2D30',    // True brick red for header
        'pastel-cream': '#D4B8A8',   // Warm dusty rose for tabs (bridges red/teal)
        'card-white': '#FFF0DC',     // Warm peach/apricot for cards
      },
    },
  },
  plugins: [],
}
