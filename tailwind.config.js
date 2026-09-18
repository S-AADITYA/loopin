/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#12151c",
        panel2: "#171b24",
        border: "#242938",
        accent: "#7c5cff",
        accent2: "#22d3aa",
        warn: "#ffb454",
        danger: "#ff6b6b"
      },
      borderRadius: { xl2: "16px" }
    }
  },
  plugins: []
};
