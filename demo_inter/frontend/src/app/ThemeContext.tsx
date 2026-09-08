import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Kullanıcının tema tercihini localStorage'da saklar. Kullanıcı hiç seçim
 * yapmamışsa işletim sistemi temasını (prefers-color-scheme) dinler ve
 * canlı olarak takip eder; kullanıcı bir kez elle seçim yaptığında (toggle
 * veya setTheme) o tercih kalıcı olur ve sistem değişikliklerini artık
 * izlemeyi bırakır.
 *
 * index.html içindeki blocking inline script bu Provider mount olmadan
 * ÖNCE aynı localStorage anahtarını okuyup <html> üzerine "dark" class'ını
 * uygular — bu sayede sayfa ilk boyamada bile doğru temada açılır (FOUC
 * / "tema değişince metin kayboluyor" sorununun kök nedeni buydu).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const hasExplicitChoice = window.localStorage.getItem(STORAGE_KEY) !== null;
    if (hasExplicitChoice) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function setTheme(t: Theme) {
    window.localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme, ThemeProvider içinde kullanılmalıdır");
  return ctx;
}
