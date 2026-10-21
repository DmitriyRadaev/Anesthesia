/** @type {import('tailwindcss').Config} */
// Палитра перенесена из исходного интерфейса (App.css): основной цвет #5068A5, приглушённый #91A0C6,
// линии #D0DAF7, фон блоков #EAEFF4. Шкала slate переопределена, чтобы все страницы получили исходные оттенки.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          50: "#f4f6fc",
          100: "#eaeff4",
          200: "#d0daf7",
          300: "#afbcdd",
          400: "#91a0c6",
          500: "#7a8bb8",
          600: "#6577ad",
          700: "#5068a5",
          800: "#445a92",
          900: "#3c4f80",
        },
        brand: {
          50: "#eef1fb",
          100: "#dfe5f8",
          200: "#c2ceef",
          500: "#6b74ec",
          600: "#444be7",
          700: "#3c41c4",
        },
      },
      fontFamily: {
        sans: ["Roboto", "Segoe UI", "Arial", "sans-serif"],
      },
      boxShadow: {
        app: "0 0 50px rgba(133, 162, 236, 0.3)",
        button: "1px 7px 20px rgb(119 142 239 / 30%)",
      },
      backgroundImage: {
        "app-page": "linear-gradient(92.04deg, #F9FCFF 17.38%, #F5F6FF 91.35%)",
        "app-block": "linear-gradient(92.04deg, #F2F5FC 17.38%, #EDF1FA 91.35%)",
        "app-primary": "linear-gradient(25.41deg, #9CBFF4 7.18%, #444BE7 79.43%)",
        "app-primary-hover": "linear-gradient(92.04deg, #C2CEEF 17.38%, #92A9E9 91.35%)",
        "app-secondary": "linear-gradient(105.79deg, #F4F7FE 11.88%, #E1E6F3 96.16%)",
        "app-input": "linear-gradient(180deg, #F9FBFD, #F6FBFF)",
      },
    },
  },
  plugins: [],
}
