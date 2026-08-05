import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "orbitworks_theme";

const lightColors = {
  background: "#ffffff",
  card: "#f9fafb",
  text: "#0f172a",
  subtext: "#64748b",
  border: "#e5e7eb",
  accent: "#3b6fe0",
  green: "#22c55e",
  red: "#ef4444",
  dotOff: "#d1d5db",
};

const darkColors = {
  background: "#0b0b0f",
  card: "#18181b",
  text: "#f4f4f5",
  subtext: "#a1a1aa",
  border: "#27272a",
  accent: "#5b8def",
  green: "#22c55e",
  red: "#f87171",
  dotOff: "#3f3f46",
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === "dark" || stored === "light") setTheme(stored);
      setReady(true);
    });
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  };

  const value = {
    theme,
    isDark: theme === "dark",
    colors: theme === "dark" ? darkColors : lightColors,
    toggleTheme,
  };

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
