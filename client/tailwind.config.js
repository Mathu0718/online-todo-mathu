/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        calm1: '#e0f2fe', // light blue
        calm2: '#bae6fd', // blue
        calm3: '#a7f3d0', // mint
        calm4: '#f1f5f9', // light gray
        calm5: '#64748b', // slate
      },
    },
  },
  plugins: [],
}
