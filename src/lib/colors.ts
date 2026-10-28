// EasyTaller — colour helpers so any colour a shop picks stays readable.

import { useEffect, type CSSProperties } from "react";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True when white text reads better than dark text on this background. */
export function isDark(hex: string): boolean {
  // Contrast of white vs. dark ink (#0f172a ≈ 0.0089 luminance).
  const l = luminance(hex);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0589);
}

/** Text colour to use on top of a background colour. */
export function readableText(hex: string): string {
  return isDark(hex) ? "#ffffff" : "#0f172a";
}

/**
 * CSS variables for a shop's main colour, set on a wrapper element. Buttons,
 * links, focus rings and soft highlights follow it, and the text on top of it
 * switches between white and dark automatically.
 *
 * Every derived variable is set here explicitly: a variable defined on :root
 * as var(--brand-accent) is resolved there, so overriding only --brand-accent
 * on a wrapper would not reach buttons or the sidebar.
 */
export function accentVars(hex?: string): CSSProperties | undefined {
  if (!hex) return undefined;
  const soft = `color-mix(in srgb, ${hex} 10%, #ffffff)`;
  return {
    ["--brand-accent" as string]: hex,
    ["--primary" as string]: hex,
    ["--primary-foreground" as string]: readableText(hex),
    ["--ring" as string]: hex,
    ["--brand-soft" as string]: soft,
    ["--accent" as string]: `color-mix(in srgb, ${hex} 6%, #ffffff)`,
    ["--sidebar-primary" as string]: hex,
    ["--sidebar-primary-foreground" as string]: readableText(hex),
    ["--sidebar-accent" as string]: soft,
    ["--sidebar-ring" as string]: hex,
  } as CSSProperties;
}

/**
 * Also sets the shop colour on <html> while a screen is open, so dialogs,
 * sheets and dropdowns (rendered outside the page, in a portal) match it.
 */
export function useAccentOnRoot(hex?: string): void {
  useEffect(() => {
    const vars = accentVars(hex) as Record<string, string> | undefined;
    if (!vars) return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [hex]);
}
