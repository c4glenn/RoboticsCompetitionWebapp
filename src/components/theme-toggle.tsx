"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
      aria-label="Toggle dark mode"
    >
      {resolvedTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
    </button>
  );
}
