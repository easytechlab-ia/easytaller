// EasyTaller — "Mi web". The owner decides how the public website looks and
// what it shows: main colour (also used by the panel), header colour or photo,
// blocks on/off, presentation texts, contact details and address, opening
// hours and, per service, whether it appears and how its price is shown.
// Contact, address and hours are saved on the tenant (shared with
// Configuración); the rest in the website settings. Everything is local.

import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/base/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthContext";
import { servicesRepo, tenantsRepo } from "@/lib/db";
import { IS_DEMO } from "@/lib/mode";
import { compressImage } from "@/lib/image";
import { accentVars, isDark, readableText } from "@/lib/colors";
import {
  ACCENT_COLOR_PRESETS,
  HERO_COLOR_PRESETS,
  PRICE_MODE_LABELS,
  WEBSITE_BLOCKS,
  getWebsiteSettings,
  saveWebsiteSettings,
  serviceWebSettings,
  servicePriceLabel,
  type HeroBackground,
  type PriceMode,
  type WebsiteBlock,
  type WebsiteServiceSettings,
} from "@/lib/website";
import { cn } from "@/lib/utils";
import type { BusinessDay, Service } from "@/types";

export const Route = createFileRoute("/app/web")({
  component: MyWebsitePage,
});

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface ServiceDraft extends WebsiteServiceSettings {
  id: string;
  name: string;
  price: string; // edited as text
  isNew?: boolean;
  removed?: boolean;
}

function defaultHours(): BusinessDay[] {
  return DAY_LABELS.map((_, i) => ({ open: i < 5, from: "09:00", to: "18:00" }));
}

function MyWebsitePage() {
  const { tenant, refresh } = useAuth();

  const initial = useMemo(() => (tenant ? getWebsiteSettings(tenant) : null), [tenant]);
  const location = tenant?.locations[0];

  const [show, setShow] = useState<Record<WebsiteBlock, boolean>>(
    () => initial?.show ?? ({} as Record<WebsiteBlock, boolean>),
  );
  const [accent, setAccent] = useState(tenant?.accentColor ?? "#1877d6");
  const [heroBackground, setHeroBackground] = useState<HeroBackground>(
    initial?.heroBackground ?? "color",
  );
  const [heroColor, setHeroColor] = useState(initial?.heroColor ?? "#0e2a47");
  const [heroPhoto, setHeroPhoto] = useState<string | undefined>(initial?.heroPhoto);
  const [heroOverlay, setHeroOverlay] = useState(initial?.heroOverlay ?? 55);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const [about, setAbout] = useState(initial?.about ?? "");
  const [phone, setPhone] = useState(tenant?.phone ?? location?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [email, setEmail] = useState(tenant?.email ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [hours, setHours] = useState<BusinessDay[]>(
    tenant?.businessHours?.length === 7 ? tenant.businessHours : defaultHours(),
  );
  const [services, setServices] = useState<ServiceDraft[]>(() => {
    if (!tenant || !initial) return [];
    return servicesRepo
      .list(tenant.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        price: String(s.basePrice ?? ""),
        ...serviceWebSettings(initial, s),
      }));
  });

  if (!tenant || !initial) return null;

  const webUrl = IS_DEMO ? "/" : `/t/${tenant.slug}`;

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      setHeroPhoto(await compressImage(file));
      setHeroBackground("photo");
    } catch {
      toast.error("No se ha podido usar esa imagen. Prueba con otra foto (JPG o PNG).");
    } finally {
      setUploading(false);
    }
  };

  const setDay = (i: number, patch: Partial<BusinessDay>) =>
    setHours((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const patchService = (id: string, patch: Partial<ServiceDraft>) =>
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addService = () =>
    setServices((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        name: "",
        price: "",
        showOnWeb: true,
        priceMode: "from",
        description: "",
        isNew: true,
      },
    ]);

  const save = () => {
    const visible = services.filter((s) => !s.removed);
    if (visible.some((s) => !s.name.trim())) {
      toast.error("Cada servicio necesita un nombre.");
      return;
    }

    // 1) Contact, address and hours live on the shop (shared with Configuración).
    tenantsRepo.update(tenant.id, {
      accentColor: accent,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      businessHours: hours,
      locations: tenant.locations.map((loc, idx) =>
        idx === 0
          ? { ...loc, address: address.trim() || undefined, phone: phone.trim() || undefined }
          : loc,
      ),
    });

    // 2) Services: create / update / remove from the catalogue.
    const serviceSettings: Record<string, WebsiteServiceSettings> = {};
    for (const s of services) {
      const basePrice = Math.max(0, Math.round(Number(s.price.replace(",", ".")) || 0));
      if (s.removed) {
        if (!s.isNew) servicesRepo.remove(tenant.id, s.id);
        continue;
      }
      let id = s.id;
      if (s.isNew) {
        id = servicesRepo.create(tenant.id, {
          tenantId: tenant.id,
          name: s.name.trim(),
          basePrice,
          estimatedMinutes: 60,
        } as Omit<Service, "id">).id;
      } else {
        servicesRepo.update(tenant.id, s.id, { name: s.name.trim(), basePrice });
      }
      serviceSettings[id] = {
        showOnWeb: s.showOnWeb,
        priceMode: s.priceMode,
        description: s.description?.trim() ?? "",
      };
    }

    // 3) Website settings.
    saveWebsiteSettings(tenant.id, {
      ...initial,
      tagline: tagline.trim(),
      about: about.trim(),
      heroBackground: heroBackground === "photo" && heroPhoto ? "photo" : "color",
      heroColor,
      heroPhoto,
      heroOverlay,
      whatsapp: whatsapp.trim(),
      show,
      services: serviceSettings,
    });

    refresh();
    // New services now have real ids: reload the list from storage.
    setServices(
      servicesRepo
        .list(tenant.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((svc) => ({
          id: svc.id,
          name: svc.name,
          price: String(svc.basePrice ?? ""),
          ...(serviceSettings[svc.id] ?? { showOnWeb: true, priceMode: "from" as PriceMode }),
        })),
    );
    toast.success("Web actualizada. Los cambios ya se ven en tu página.");
  };

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" asChild>
        <a href={webUrl} target="_blank" rel="noreferrer">
          <ExternalLink strokeWidth={1.5} />
          Ver mi web
        </a>
      </Button>
      <Button onClick={save}>
        <Check strokeWidth={1.5} />
        Guardar
      </Button>
    </div>
  );

  return (
    <div style={accentVars(accent)}>
      <PageHeader
        title="Mi web"
        description="Decide qué ve tu cliente en la web del taller. Los cambios se publican al guardar."
        actions={actions}
      />

      <div className="space-y-5">
        <Section
          title="Diseño"
          description="El color principal se usa en los botones de tu web y en este panel."
        >
          <Field label="Color principal">
            <ColorPicker value={accent} presets={ACCENT_COLOR_PRESETS} onChange={setAccent} />
          </Field>

          <Field label="Fondo de la cabecera">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["color", "photo"] as HeroBackground[]).map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setHeroBackground(bg)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    heroBackground === bg
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {bg === "color" ? "Color" : "Foto"}
                </button>
              ))}
            </div>
          </Field>

          {heroBackground === "color" ? (
            <ColorPicker value={heroColor} presets={HERO_COLOR_PRESETS} onChange={setHeroColor} />
          ) : (
            <div className="space-y-3">
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => photoInput.current?.click()} disabled={uploading}>
                  {uploading ? (
                    <Loader2 strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <ImagePlus strokeWidth={1.5} />
                  )}
                  {heroPhoto ? "Cambiar foto" : "Subir foto"}
                </Button>
                {heroPhoto && (
                  <Button variant="ghost" onClick={() => setHeroPhoto(undefined)}>
                    <Trash2 strokeWidth={1.5} />
                    Quitar foto
                  </Button>
                )}
              </div>
              {heroPhoto && (
                <label className="block max-w-sm space-y-1.5">
                  <span className="text-sm text-muted-foreground">
                    Oscurecer la foto para que el texto se lea bien ({heroOverlay}%)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={heroOverlay}
                    onChange={(e) => setHeroOverlay(Number(e.target.value))}
                    className="w-full accent-[var(--brand-accent)]"
                  />
                </label>
              )}
              {!heroPhoto && (
                <p className="text-sm text-muted-foreground">
                  Una foto del taller o de la fachada queda genial. Mientras no subas ninguna, se usa el color.
                </p>
              )}
            </div>
          )}

          <HeroPreview
            tagline={tagline || tenant.name}
            accent={accent}
            background={heroBackground === "photo" && heroPhoto ? "photo" : "color"}
            color={heroColor}
            photo={heroPhoto}
            overlay={heroOverlay}
          />
        </Section>

        <Section
          title="Qué se muestra"
          description="Enciende o apaga cada parte de tu web."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {WEBSITE_BLOCKS.map((b) => (
              <label
                key={b.key}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.description}</span>
                </span>
                <Switch
                  checked={show[b.key]}
                  onCheckedChange={(v) => setShow((prev) => ({ ...prev, [b.key]: v }))}
                  aria-label={b.label}
                />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Presentación" description="Lo primero que lee el cliente al entrar.">
          <Field label="Eslogan">
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={80}
              placeholder="Tu taller de confianza, sin sorpresas"
            />
          </Field>
          <Field label="Quiénes somos">
            <Textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={400}
              rows={3}
            />
          </Field>
        </Section>

        <Section
          title="Contacto y dirección"
          description="Si cambiáis de local, cambia la dirección aquí y el mapa se actualiza solo."
        >
          <Field label="Dirección">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, número, código postal y ciudad"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Teléfono">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="El mismo que el teléfono"
              />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Horario" description="Días y horas de apertura.">
          <div className="space-y-2">
            {hours.map((day, i) => (
              <div
                key={DAY_LABELS[i]}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex w-32 items-center gap-2">
                  <Switch checked={day.open} onCheckedChange={(v) => setDay(i, { open: v })} />
                  <span className="text-sm font-medium text-foreground">{DAY_LABELS[i]}</span>
                </div>
                {day.open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.from}
                      onChange={(e) => setDay(i, { from: e.target.value })}
                      className="h-9 w-28"
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <Input
                      type="time"
                      value={day.to}
                      onChange={(e) => setDay(i, { to: e.target.value })}
                      className="h-9 w-28"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Cerrado</span>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Servicios y precios"
          description="Elige qué servicios aparecen y cómo se muestra el precio: «desde», exacto o sin precio."
        >
          <div className="space-y-3">
            {services
              .filter((s) => !s.removed)
              .map((s) => {
                const preview = servicePriceLabel(
                  { basePrice: Number(s.price) || 0 } as Service,
                  s.priceMode,
                  tenant.currency,
                );
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-lg border border-border p-3 transition-opacity",
                      !s.showOnWeb && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Switch
                        className="mt-2"
                        checked={s.showOnWeb}
                        onCheckedChange={(v) => patchService(s.id, { showOnWeb: v })}
                        aria-label={`Mostrar ${s.name} en la web`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={s.name}
                          onChange={(e) => patchService(s.id, { name: e.target.value })}
                          placeholder="Nombre del servicio"
                          className="font-medium"
                        />
                        <Input
                          value={s.description ?? ""}
                          onChange={(e) => patchService(s.id, { description: e.target.value })}
                          placeholder="Descripción corta (opcional)"
                          maxLength={120}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={s.priceMode}
                            onValueChange={(v) => patchService(s.id, { priceMode: v as PriceMode })}
                          >
                            <SelectTrigger className="h-9 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(PRICE_MODE_LABELS) as PriceMode[]).map((m) => (
                                <SelectItem key={m} value={m}>
                                  {PRICE_MODE_LABELS[m]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {s.priceMode !== "hidden" && (
                            <div className="relative">
                              <Input
                                inputMode="decimal"
                                value={s.price}
                                onChange={(e) => patchService(s.id, { price: e.target.value })}
                                className="h-9 w-28 pr-7"
                                aria-label="Precio"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                €
                              </span>
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground">
                            En la web: {s.showOnWeb ? (show.prices ? preview ?? "Consúltanos" : "sin precios") : "oculto"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchService(s.id, { removed: true })}
                        className="mt-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-[var(--destructive)]"
                        aria-label="Eliminar servicio"
                      >
                        <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
          <Button variant="outline" onClick={addService}>
            <Plus strokeWidth={1.5} />
            Añadir servicio
          </Button>
        </Section>

        <div className="flex justify-end pb-4">{actions}</div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  presets,
  onChange,
}: {
  value: string;
  presets: string[];
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-9 w-9 rounded-lg border-2 transition-transform hover:scale-105",
            value.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-border",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
        />
      ))}
      <label className="relative flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground">
        <span className="h-5 w-5 rounded" style={{ backgroundColor: value }} />
        Otro color
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** Small live preview of the website header with the chosen design. */
function HeroPreview({
  tagline,
  accent,
  background,
  color,
  photo,
  overlay,
}: {
  tagline: string;
  accent: string;
  background: HeroBackground;
  color: string;
  photo?: string;
  overlay: number;
}) {
  const darkBg = background === "photo" ? true : isDark(color);
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">Vista previa</p>
      <div
        className="relative overflow-hidden rounded-xl border border-border px-5 py-6"
        style={
          background === "photo" && photo
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,${overlay / 100}), rgba(0,0,0,${overlay / 100})), url(${photo})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { backgroundColor: color }
        }
      >
        <p
          className="max-w-xs font-display text-2xl font-bold leading-tight"
          style={{ color: darkBg ? "#ffffff" : "#0f172a" }}
        >
          {tagline}
        </p>
        <span
          className="mt-4 inline-flex rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ backgroundColor: accent, color: readableText(accent) }}
        >
          Pedir cita
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
