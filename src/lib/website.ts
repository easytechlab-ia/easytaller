// EasyTaller — "Mi web": what the shop shows on its public website.
// Settings live in their own per-shop collection ("website"), next to the
// tenant data. Contact details, address and opening hours are NOT stored here:
// they stay on the tenant (single source of truth shared with Configuración).
// Everything is local & simulated; access goes through the storage layer.

import { read, write } from "@/lib/db/storage";
import { formatCurrency } from "@/lib/format";
import type { Service, Tenant } from "@/types";

/** How a service price is shown on the public website. */
export type PriceMode = "from" | "exact" | "hidden";

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  from: "Desde",
  exact: "Precio exacto",
  hidden: "Sin precio",
};

/** Blocks of the public website that the owner can show or hide. */
export type WebsiteBlock =
  | "services"
  | "prices"
  | "hours"
  | "phone"
  | "whatsapp"
  | "address"
  | "reviews"
  | "booking";

export const WEBSITE_BLOCKS: Array<{
  key: WebsiteBlock;
  label: string;
  description: string;
}> = [
  { key: "booking", label: "Pedir cita online", description: "Botón y formulario para reservar cita." },
  { key: "services", label: "Servicios", description: "Lista de servicios del taller." },
  { key: "prices", label: "Precios", description: "Muestra el precio de cada servicio (según cómo lo configures)." },
  { key: "hours", label: "Horario", description: "Horario de apertura y si ahora está abierto." },
  { key: "phone", label: "Teléfono", description: "Botón para llamar al taller." },
  { key: "whatsapp", label: "WhatsApp", description: "Botón para escribir al taller por WhatsApp." },
  { key: "address", label: "Dirección y mapa", description: "Dónde está el taller y cómo llegar." },
  { key: "reviews", label: "Opiniones de clientes", description: "Valoraciones que dejan tus clientes al recoger el coche." },
];

export interface WebsiteServiceSettings {
  showOnWeb: boolean;
  priceMode: PriceMode;
  description?: string;
}

export type HeroBackground = "color" | "photo";

export interface WebsiteSettings {
  id: string; // = tenantId (one record per shop)
  tagline: string;
  about: string;
  // Header (hero) of the website: a solid colour or a photo with a dark veil.
  heroBackground: HeroBackground;
  heroColor: string;
  heroPhoto?: string; // compressed base64 image
  heroOverlay: number; // 0–80 (% of black over the photo, keeps text readable)
  whatsapp?: string; // empty → uses the shop phone
  show: Record<WebsiteBlock, boolean>;
  services: Record<string, WebsiteServiceSettings>; // by service id
  updatedAt?: string;
}

const COLLECTION = "website";

// Short default descriptions for the standard catalogue (by service name).
const DEFAULT_SERVICE_DESCRIPTIONS: Record<string, string> = {
  "Cambio de aceite y filtro": "Aceite de calidad, filtro nuevo y revisión de niveles.",
  "Revisión de frenos": "Pastillas, discos y líquido de frenos. Tu seguridad, primero.",
  "Cambio de embrague": "Kit de embrague completo con garantía.",
  "Diagnóstico electrónico": "Leemos la centralita y te explicamos qué pasa.",
  "Alineación y equilibrado": "Menos desgaste de neumáticos y una conducción más estable.",
  "Cambio de batería": "Comprobamos la carga y cambiamos la batería en el momento.",
  "Distribución (correa)": "Correa, tensores y bomba de agua cuando toca.",
  "Cambio de pastillas delanteras": "Pastillas nuevas y comprobación de discos.",
};

export function defaultWebsiteSettings(tenant: Tenant): WebsiteSettings {
  return {
    id: tenant.id,
    tagline: "Tu taller de confianza, sin sorpresas",
    heroBackground: "color",
    heroColor: "#0e2a47",
    heroOverlay: 55,
    about: `En ${tenant.name} cuidamos de tu coche como si fuera nuestro: te explicamos qué necesita, te damos presupuesto antes de empezar y te avisamos en cuanto está listo.`,
    whatsapp: "",
    show: {
      services: true,
      prices: true,
      hours: true,
      phone: true,
      whatsapp: true,
      address: true,
      reviews: true,
      booking: true,
    },
    services: {},
  };
}

/** Settings for a shop, filled with defaults for anything not saved yet. */
export function getWebsiteSettings(tenant: Tenant): WebsiteSettings {
  const saved = read<WebsiteSettings>(COLLECTION, tenant.id)[0];
  const defaults = defaultWebsiteSettings(tenant);
  if (!saved) return defaults;
  return {
    ...defaults,
    ...saved,
    show: { ...defaults.show, ...(saved.show ?? {}) },
    services: { ...(saved.services ?? {}) },
  };
}

export function saveWebsiteSettings(tenantId: string, settings: WebsiteSettings): void {
  write<WebsiteSettings>(COLLECTION, tenantId, [
    { ...settings, id: tenantId, updatedAt: new Date().toISOString() },
  ]);
}

/** Per-service web settings, with defaults (shown, price "desde"). */
export function serviceWebSettings(
  settings: WebsiteSettings,
  service: Service,
): WebsiteServiceSettings {
  const saved = settings.services[service.id];
  return {
    showOnWeb: saved?.showOnWeb ?? true,
    priceMode: saved?.priceMode ?? "from",
    description: saved?.description ?? DEFAULT_SERVICE_DESCRIPTIONS[service.name] ?? "",
  };
}

/** Price text for the public website, or null when it must not be shown. */
export function servicePriceLabel(
  service: Service,
  mode: PriceMode,
  currency = "EUR",
): string | null {
  if (mode === "hidden" || !service.basePrice) return null;
  const amount = formatCurrency(service.basePrice, currency);
  return mode === "from" ? `Desde ${amount}` : amount;
}

/** The WhatsApp number used on the website (falls back to the shop phone). */
export function websiteWhatsapp(tenant: Tenant, settings: WebsiteSettings): string | undefined {
  return settings.whatsapp?.trim() || tenant.phone || tenant.locations[0]?.phone;
}

/** Suggested header colours (dark ones keep white text; the last is light). */
export const HERO_COLOR_PRESETS = [
  "#0e2a47", // azul marino
  "#1877d6", // azul EasyTech
  "#18181b", // negro
  "#374151", // gris grafito
  "#7f1d1d", // rojo oscuro
  "#14532d", // verde oscuro
  "#f4f4f5", // gris claro
];

/** Suggested main colours for buttons, links and the panel. */
export const ACCENT_COLOR_PRESETS = [
  "#1877d6", // azul EasyTech
  "#c8102e", // rojo
  "#e8590c", // naranja
  "#15803d", // verde
  "#6d28d9", // morado
  "#18181b", // negro
];
