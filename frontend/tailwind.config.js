export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f3e8",
        ink: "#1f2937",
        forest: "#1e8b5f",
        amber: "#e6a23c",
        danger: "#d64545",
        steel: "#5f6f7f"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(20, 31, 43, 0.08)"
      }
    }
  },
  plugins: []
};
