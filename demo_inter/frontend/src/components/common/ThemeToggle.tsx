import { useTheme } from "../../app/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title="Tema"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/30 bg-transparent text-[15px] text-white"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
