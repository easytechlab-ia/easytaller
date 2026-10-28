// EasyTaller — app mode.
//
//   demo (default): a single shop ("Taller EasyTech"), no login and no
//                   superadmin. "/" is the shop's public website. This is the
//                   version shown to prospects and published on Vercel.
//   saas:           multi-shop SaaS — login, superadmin, plans, several shops
//                   and the product landing page at "/".
//
// Switch with the VITE_APP_MODE environment variable ("demo" | "saas"), e.g. in
// a .env.local file or in Vercel → Settings → Environment Variables.

export type AppMode = "demo" | "saas";

export const APP_MODE: AppMode =
  import.meta.env.VITE_APP_MODE === "saas" ? "saas" : "demo";

export const IS_DEMO = APP_MODE === "demo";

/** The shop used in demo mode (also seeded in SaaS mode). */
export const DEMO_TENANT_ID = "tnt_easytech";
export const DEMO_TENANT_SLUG = "easytech";
