// EasyTaller — shared frame for the pages a shop's customers see outside the
// website: the live repair view (/c/:code) and the car's record (/v/:code).
// Same look as the shop website: the shop's main colour, its header colour or
// photo (from "Mi web"), the top bar with its name and an EasyTaller footer.

import { useMemo, type ReactNode } from "react";
import { Phone } from "lucide-react";
import { IS_DEMO } from "@/lib/mode";
import { accentVars, isDark, useAccentOnRoot } from "@/lib/colors";
import { getWebsiteSettings } from "@/lib/website";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";

/** Two initials for the shop monogram ("Taller EasyTech" → "TE"). */
export function shopInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w && w[0] === w[0].toUpperCase())
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

/** Link to the shop's public website. */
export function shopWebUrl(tenant: Tenant): string {
  return IS_DEMO ? "/" : `/t/${tenant.slug}`;
}

/** Page frame: shop colours, top bar, content and footer. */
export function ShopPage({
  tenant,
  hero,
  children,
}: {
  tenant: Tenant;
  hero?: ReactNode;
  children: ReactNode;
}) {
  useAccentOnRoot(tenant.accentColor);
  const phone = tenant.phone ?? tenant.locations[0]?.phone;

  return (
    <div className="min-h-screen bg-background-subtle" style={accentVars(tenant.accentColor)}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 py-3">
          <a href={shopWebUrl(tenant)} className="flex min-w-0 items-center gap-2.5">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
                {shopInitials(tenant.name)}
              </span>
            )}
            <span className="truncate font-display text-lg font-bold tracking-tight text-foreground">
              {tenant.name}
            </span>
          </a>
          {phone && (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary"
            >
              <Phone strokeWidth={1.75} className="h-4 w-4" />
              Llamar
            </a>
          )}
        </div>
      </header>

      {hero}

      <main className="mx-auto max-w-lg space-y-4 px-5 py-6">{children}</main>

      <footer className="mx-auto max-w-lg px-5 pb-10 pt-2 text-center text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{tenant.name}</p>
        {tenant.locations[0]?.address && <p className="mt-0.5">{tenant.locations[0].address}</p>}
        <p className="mt-3">Con la tecnología de EasyTaller</p>
      </footer>
    </div>
  );
}

/**
 * Header band with the shop's header colour or photo (as set in "Mi web").
 * Text switches to white or dark so it always reads well.
 */
export function ShopHero({
  tenant,
  eyebrow,
  title,
  children,
}: {
  tenant: Tenant;
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  const settings = useMemo(() => getWebsiteSettings(tenant), [tenant]);
  const photo = settings.heroBackground === "photo" && settings.heroPhoto;
  const dark = photo ? true : isDark(settings.heroColor);
  const veil = settings.heroOverlay / 100;

  return (
    <section
      className={cn("relative overflow-hidden", dark ? "text-white" : "text-slate-900")}
      style={
        photo
          ? {
              backgroundImage: `linear-gradient(rgba(0,0,0,${veil}), rgba(0,0,0,${veil})), url(${settings.heroPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: settings.heroColor }
      }
    >
      <div className="mx-auto max-w-lg px-5 pb-8 pt-7">
        {eyebrow && (
          <div className={cn("text-sm", dark ? "text-white/75" : "text-slate-600")}>{eyebrow}</div>
        )}
        <h1 className="mt-1 font-display text-[2rem] font-bold leading-[1.05] tracking-tight">
          {title}
        </h1>
        {children && (
          <div className={cn("mt-3 text-sm", dark ? "text-white/85" : "text-slate-700")}>
            {children}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="h-1.5 w-full bg-[repeating-linear-gradient(90deg,var(--brand-sky)_0_48px,transparent_48px_88px)] opacity-80"
      />
    </section>
  );
}

/** Small pill for the hero (e.g. the current repair status). */
export function HeroPill({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
  const settings = useMemo(() => getWebsiteSettings(tenant), [tenant]);
  const photo = settings.heroBackground === "photo" && settings.heroPhoto;
  const dark = photo ? true : isDark(settings.heroColor);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        dark ? "bg-white/15 text-white" : "bg-slate-900/5 text-slate-900",
      )}
    >
      {children}
    </span>
  );
}
