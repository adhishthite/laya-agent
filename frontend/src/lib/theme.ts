import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "bench-theme";

/** Matches the values in `index.css`, so the browser chrome tracks the page. */
const CHROME_COLOR: Record<Theme, string> = {
  light: "#f5f7f9",
  dark: "#0d1116",
};

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The stored choice if there is one, otherwise whatever the OS asks for. */
export function resolveTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME_COLOR[theme]);
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(resolveTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow the OS only while the user has not made a choice of their own.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!isTheme(localStorage.getItem(STORAGE_KEY))) setTheme(event.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [theme, toggle];
}
