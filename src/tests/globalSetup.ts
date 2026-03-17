import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * Vitest globalSetup — loads .env.local into process.env before workers start.
 * Workers inherit the environment, so DATABASE_URL etc. are available in tests.
 */
export default function setup() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const raw = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes if present
    const value = raw.replace(/^(["'`])(.*)\1$/, "$2");
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
