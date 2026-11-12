import { supabaseBackend } from "./supabaseBackend";
import { demoBackend } from "./demoBackend";
import type { Backend } from "./types";

const DEMO_KEY = "migdal-demo-mode";

/**
 * Demo mode = the whole app runs on 1,400 synthetic students stored in this
 * browser only. Turn on with `?demo=1`, off with `?demo=0` (or "יציאה").
 * Real data is never touched in demo mode.
 */
export const isDemoMode = (): boolean => {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_DEMO === "1") return true;
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") localStorage.setItem(DEMO_KEY, "1");
    if (q === "0") localStorage.removeItem(DEMO_KEY);
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }
};

export const api: Backend = isDemoMode() ? demoBackend : supabaseBackend;

export * from "./types";
