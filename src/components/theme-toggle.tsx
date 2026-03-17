"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-zinc-500 hover:text-violet-700 dark:hover:text-violet-600"
      aria-label="Toggle dark mode"
    >
      {resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
    </button>
  );
}
