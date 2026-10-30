// EasyTaller — public website of a shop: /t/:slug, and "/" in demo mode.
// No login. What it shows (services, prices, hours, phone, WhatsApp, address,
// reviews, online booking) is decided by the owner in "Mi web" (/app/web).
// Contact details, address and hours come from the shop; the booking wizard
// creates an online appointment that lands in the shop agenda. Everything is
// local & simulated.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IS_DEMO } from "@/lib/mode";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
} from "lucide-react";
import { PublicLoading } from "@/components/PublicLoading";
import { useAuth } from "@/lib/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { customersRepo, findTenantBySlug, servicesRepo } from "@/lib/db";
import { requestOnlineAppointment } from "@/lib/appointments";
import { isModuleEnabled } from "@/lib/permissions";
import { listReviews } from "@/lib/reviews";
import {
  getWebsiteSettings,
  serviceWebSettings,
  servicePriceLabel,
  websiteWhatsapp,
} from "@/lib/website";
import { whatsappUrl } from "@/lib/whatsapp";
import { accentVars, isDark, useAccentOnRoot } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { BusinessDay, Service, Tenant } from "@/types";

const DAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const STEPS = ["Servicio", "Vehículo", "Fecha", "Tus datos", "Resumen"] as const;

/** Public website of a shop (also the home page "/" in demo mode). */
export function PublicBookingPage({ slug }: { slug: string }) {
  const { ready } = useAuth();
  const tenant = useMemo(
    () => (ready ? findTenantBySlug(slug) : null),
    [ready, slug],
  );

  if (!ready) {
    return <PublicLoading />;
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background-subtle px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <AlertCircle strokeWidth={1.5} className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Taller no encontrado</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          No existe ningún taller en esta dirección. Comprueba el enlace.
        </p>
      </div>
    );
  }

  return <ShopWebsite tenant={tenant} />;
}

// ---- helpers ----------------------------------------------------------------

/** Monday = 0 … Sunday = 6 (same order as businessHours). */
function todayIndex(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

function hhmm(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "Abierto ahora, hasta las 19:00" / "Cerrado. Abrimos mañana a las 08:00". */
function openStatus(hours?: BusinessDay[]): { open: boolean; text: string } | null {
  if (!hours || hours.length !== 7) return null;
  const now = new Date();
  const i = todayIndex(now);
  const t = hhmm(now);
  const today = hours[i];
  if (today.open && t >= today.from && t < today.to) {
    return { open: true, text: `Abierto ahora, hasta las ${today.to}` };
  }
  if (today.open && t < today.from) {
    return { open: false, text: `Cerrado. Abrimos hoy a las ${today.from}` };
  }
  for (let k = 1; k <= 7; k++) {
    const day = hours[(i + k) % 7];
    if (day.open) {
      const when = k === 1 ? "mañana" : `el ${DAY_LABELS[(i + k) % 7].toLowerCase()}`;
      return { open: false, text: `Cerrado. Abrimos ${when} a las ${day.from}` };
    }
  }
  return { open: false, text: "Cerrado" };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w && w[0] === w[0].toUpperCase())
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

// ---- the website --------------------------------------------------------------

function ShopWebsite({ tenant }: { tenant: Tenant }) {
  const settings = useMemo(() => getWebsiteSettings(tenant), [tenant]);
  const show = settings.show;
  const location = tenant.locations[0];
  const phone = tenant.phone ?? location?.phone;
  const whatsapp = websiteWhatsapp(tenant, settings);
  const address = location?.address;
  const status = openStatus(tenant.businessHours);
  const bookingOn = show.booking && isModuleEnabled(tenant, "reserva_online");

  const allServices = useMemo<Service[]>(
    () => servicesRepo.list(tenant.id).sort((a, b) => a.name.localeCompare(b.name)),
    [tenant.id],
  );
  const webServices = useMemo(
    () => allServices.filter((s) => serviceWebSettings(settings, s).showOnWeb),
    [allServices, settings],
  );

  const accentStyle = accentVars(tenant.accentColor);
  useAccentOnRoot(tenant.accentColor);

  // Header: a solid colour or a photo with a dark veil. Text and outline
  // buttons switch to white or dark depending on the background.
  const heroPhoto = settings.heroBackground === "photo" && settings.heroPhoto;
  const heroDark = heroPhoto ? true : isDark(settings.heroColor);
  const heroStyle: React.CSSProperties = heroPhoto
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,${settings.heroOverlay / 100}), rgba(0,0,0,${settings.heroOverlay / 100})), url(${settings.heroPhoto})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: settings.heroColor };
  const heroOutline = heroDark
    ? "h-12 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
    : "h-12 border-slate-900/20 bg-transparent text-slate-900 hover:bg-slate-900/5 hover:text-slate-900";

  const waLink = whatsapp
    ? whatsappUrl(whatsapp, `Hola ${tenant.name}, os escribo desde vuestra web.`)
    : undefined;

  const actions = {
    booking: bookingOn,
    phone: show.phone && !!phone,
    whatsapp: show.whatsapp && !!waLink,
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0" style={accentStyle}>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <a href="#inicio" className="flex min-w-0 items-center gap-2.5">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
                {initials(tenant.name)}
              </span>
            )}
            <span className="truncate font-display text-lg font-bold tracking-tight text-foreground">
              {tenant.name}
            </span>
          </a>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {show.services && webServices.length > 0 && (
              <a href="#servicios" className="hover:text-foreground">Servicios</a>
            )}
            {show.reviews && <a href="#opiniones" className="hover:text-foreground">Opiniones</a>}
            {(show.address || show.hours) && (
              <a href="#donde" className="hover:text-foreground">Dónde estamos</a>
            )}
            {bookingOn && (
              <Button asChild size="sm">
                <a href="#cita">Pedir cita</a>
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        id="inicio"
        className={cn("relative overflow-hidden", heroDark ? "text-white" : "text-slate-900")}
        style={heroStyle}
      >
        <div className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:pb-20 sm:pt-16">
          {show.hours && status && (
            <p
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                heroDark ? "bg-white/10" : "bg-slate-900/5",
                !status.open && "opacity-80",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  status.open ? "bg-[#22c55e]" : heroDark ? "bg-white/40" : "bg-slate-900/30",
                )}
              />
              {status.text}
            </p>
          )}
          <h1 className="mt-5 max-w-2xl font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl">
            {settings.tagline || tenant.name}
          </h1>
          <p className={cn("mt-4 max-w-xl text-base sm:text-lg", heroDark ? "text-white/80" : "text-slate-700")}>
            Taller mecánico{address ? ` en ${address.split(",").pop()?.replace(/\d{5}/, "").trim()}` : ""}.
            {bookingOn ? " Pide cita online en un minuto y te avisamos en cuanto tu coche esté listo." : ""}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {actions.booking && (
              <Button asChild size="lg" className="h-12 shadow-sm">
                <a href="#cita">
                  <CalendarCheck strokeWidth={1.75} />
                  Pedir cita
                </a>
              </Button>
            )}
            {actions.phone && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className={heroOutline}
              >
                <a href={`tel:${phone!.replace(/\s/g, "")}`}>
                  <Phone strokeWidth={1.75} />
                  Llamar al {phone}
                </a>
              </Button>
            )}
            {actions.whatsapp && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className={heroOutline}
              >
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle strokeWidth={1.75} />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
        {/* Road marking: the one decorative element of the page */}
        <div
          aria-hidden="true"
          className="h-1.5 w-full bg-[repeating-linear-gradient(90deg,var(--brand-sky)_0_48px,transparent_48px_88px)] opacity-80"
        />
      </section>

      <main className="mx-auto max-w-5xl px-5">
        {/* Services */}
        {show.services && webServices.length > 0 && (
          <section id="servicios" className="scroll-mt-20 py-14">
            <SectionTitle
              title="Servicios"
              text={
                show.prices
                  ? "Precios orientativos con IVA. Te damos el presupuesto cerrado antes de empezar."
                  : "Pregúntanos por el precio: te damos presupuesto antes de empezar."
              }
            />
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {webServices.map((s) => {
                const ws = serviceWebSettings(settings, s);
                const price = show.prices
                  ? servicePriceLabel(s, ws.priceMode, tenant.currency)
                  : null;
                return (
                  <li key={s.id} className="flex items-baseline justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{s.name}</p>
                      {ws.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{ws.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-right font-display text-lg font-bold tabular-nums text-foreground">
                      {price ?? (
                        <span className="font-sans text-sm font-medium text-muted-foreground">
                          Consúltanos
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Booking */}
        {bookingOn && (
          <section id="cita" className="scroll-mt-20 py-6">
            <div className="rounded-2xl bg-brand-soft p-1.5">
              <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
                <BookingForm
                  tenant={tenant}
                  services={webServices.length ? webServices : allServices}
                />
              </div>
            </div>
          </section>
        )}

        {/* Reviews */}
        {show.reviews && <Reviews tenant={tenant} />}

        {/* Where + hours */}
        {(show.address || show.hours) && (
          <section id="donde" className="scroll-mt-20 py-14">
            <SectionTitle title="Dónde estamos" />
            <div className="mt-6 grid gap-6 md:grid-cols-5">
              {show.address && address && (
                <div className="overflow-hidden rounded-xl border border-border md:col-span-3">
                  <iframe
                    title={`Ubicación de ${tenant.name}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-60 w-full border-0 md:h-full md:min-h-72"
                  />
                </div>
              )}
              <div className={cn("space-y-5", show.address && address ? "md:col-span-2" : "md:col-span-5")}>
                {show.address && address && (
                  <div>
                    <p className="flex items-start gap-2 text-foreground">
                      <MapPin strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {address}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <Navigation strokeWidth={1.5} className="h-4 w-4" />
                      Cómo llegar
                    </a>
                  </div>
                )}
                {show.hours && tenant.businessHours?.length === 7 && (
                  <HoursTable hours={tenant.businessHours} />
                )}
              </div>
            </div>
          </section>
        )}

        {/* About */}
        {settings.about && (
          <section className="border-t border-border py-14">
            <SectionTitle title={`Sobre ${tenant.name}`} />
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {settings.about}
            </p>
          </section>
        )}
      </main>

      <footer className="border-t border-border bg-background-subtle">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">{tenant.name}</p>
            <p className="mt-0.5">
              {[show.phone ? phone : null, tenant.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs">Web hecha con EasyTaller</span>
            {IS_DEMO && (
              <Link to="/app" className="text-xs font-medium text-primary hover:underline">
                Acceso taller
              </Link>
            )}
          </div>
        </div>
      </footer>

      {/* Mobile action bar */}
      {(actions.booking || actions.phone || actions.whatsapp) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          <div className="flex gap-2">
            {actions.phone && (
              <Button asChild variant="outline" className="h-11 flex-1">
                <a href={`tel:${phone!.replace(/\s/g, "")}`} aria-label="Llamar">
                  <Phone strokeWidth={1.75} />
                  Llamar
                </a>
              </Button>
            )}
            {actions.whatsapp && (
              <Button asChild variant="outline" className="h-11 flex-1">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle strokeWidth={1.75} />
                  WhatsApp
                </a>
              </Button>
            )}
            {actions.booking && (
              <Button asChild className="h-11 flex-[1.4]">
                <a href="#cita">
                  <CalendarCheck strokeWidth={1.75} />
                  Pedir cita
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, text }: { title: string; text?: string }) {
  return (
    <div>
      <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

function HoursTable({ hours }: { hours: BusinessDay[] }) {
  const today = todayIndex();
  return (
    <div>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Clock strokeWidth={1.5} className="h-4 w-4 text-primary" />
        Horario
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {hours.map((day, i) => (
          <li
            key={i}
            className={cn(
              "flex justify-between gap-4 rounded-md px-2 py-1",
              i === today ? "bg-brand-soft font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <span>{DAY_LABELS[i]}</span>
            <span className="tabular-nums">{day.open ? `${day.from} – ${day.to}` : "Cerrado"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reviews({ tenant }: { tenant: Tenant }) {
  const reviews = useMemo(() => {
    const byId = new Map(customersRepo.list(tenant.id).map((c) => [c.id, c]));
    return listReviews(tenant.id)
      .filter((r) => r.comment && r.rating >= 4)
      .slice(0, 3)
      .map((r) => {
        const name = byId.get(r.customerId)?.name ?? "Cliente";
        const [first, last] = name.split(" ");
        return { ...r, author: last ? `${first} ${last[0]}.` : first };
      });
  }, [tenant.id]);
  const all = useMemo(() => listReviews(tenant.id), [tenant.id]);
  if (reviews.length === 0) return null;
  const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;

  return (
    <section id="opiniones" className="scroll-mt-20 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle title="Opiniones" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Stars value={avg} />
          <span className="font-medium text-foreground">{avg.toFixed(1).replace(".", ",")}</span>
          de {all.length} valoraciones
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {reviews.map((r) => (
          <figure key={r.id} className="rounded-xl border border-border p-5">
            <Stars value={r.rating} />
            <blockquote className="mt-3 text-foreground">{r.comment}</blockquote>
            <figcaption className="mt-3 text-sm text-muted-foreground">{r.author}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5 text-[#f5a524]" aria-label={`${value.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i < Math.round(value) ? "fill-current" : "opacity-30")}
          strokeWidth={0}
        />
      ))}
    </span>
  );
}

// ---- booking --------------------------------------------------------------------

// For recording videos: open the page with ?video=1 and the booking form comes
// already filled in (the service is still chosen by hand).
const VIDEO_PREFILL =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("video") === "1"
    ? {
        plate: "1234 ABC",
        make: "Seat",
        model: "Ibiza",
        date: "2026-11-04",
        time: "10:00",
        name: "Juan García López",
        phone: "605322426",
        email: "juangarcia@demo.com",
        notes: "Le cuesta arrancar",
      }
    : null;

function BookingForm({ tenant, services }: { tenant: Tenant; services: Service[] }) {
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0);

  // Persistent wizard state (kept across steps).
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [unsure, setUnsure] = useState(false);
  const [plate, setPlate] = useState(VIDEO_PREFILL?.plate ?? "");
  const [make, setMake] = useState(VIDEO_PREFILL?.make ?? "");
  const [model, setModel] = useState(VIDEO_PREFILL?.model ?? "");
  const [date, setDate] = useState(VIDEO_PREFILL?.date ?? "");
  const [time, setTime] = useState(VIDEO_PREFILL?.time ?? "");
  const [name, setName] = useState(VIDEO_PREFILL?.name ?? "");
  const [phone, setPhone] = useState(VIDEO_PREFILL?.phone ?? "");
  const [email, setEmail] = useState(VIDEO_PREFILL?.email ?? "");
  const [notes, setNotes] = useState(VIDEO_PREFILL?.notes ?? "");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleService = (id: string) => {
    setUnsure(false);
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const chooseUnsure = () => {
    setServiceIds([]);
    setUnsure((u) => !u);
  };

  // Per-step validation. Returns true if the current step is complete.
  const validateStep = (s: number): boolean => {
    const next: Record<string, string> = {};
    if (s === 0 && serviceIds.length === 0 && !unsure) {
      next.services = "Elige al menos un servicio o «No estoy seguro».";
    }
    if (s === 1 && !plate.trim()) {
      next.plate = "La matrícula es obligatoria.";
    }
    if (s === 2) {
      if (!date) next.date = "Elige una fecha.";
      if (!time) next.time = "Elige una hora.";
    }
    if (s === 3) {
      if (!name.trim()) next.name = "Indica tu nombre.";
      if (!phone.trim()) next.phone = "Indica un teléfono de contacto.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = () => {
    for (let s = 0; s < 4; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    if (!consent) {
      setErrors({ consent: "Necesitamos tu permiso para guardar tus datos y darte la cita." });
      return;
    }
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    requestOnlineAppointment(tenant, {
      name,
      phone,
      email: email || undefined,
      plate: plate || undefined,
      make: make || undefined,
      model: model || undefined,
      serviceIds,
      scheduledAt,
      notes: notes || undefined,
    });
    setDone(true);
  };

  if (done) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]">
          <Check strokeWidth={2} className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
          Solicitud enviada
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {tenant.name} ha recibido tu petición. Te confirmamos la cita por WhatsApp lo antes
          posible.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Pide cita
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sin llamadas: elige qué necesitas y cuándo te va bien.
      </p>

      <Progress step={step} />

      <div className="mt-5">
        {step === 0 && (
          <StepServices
            services={services}
            serviceIds={serviceIds}
            unsure={unsure}
            onToggle={toggleService}
            onUnsure={chooseUnsure}
            error={errors.services}
          />
        )}
        {step === 1 && (
          <StepVehicle
            plate={plate}
            make={make}
            model={model}
            setPlate={setPlate}
            setMake={setMake}
            setModel={setModel}
            error={errors.plate}
          />
        )}
        {step === 2 && (
          <StepDate
            tenant={tenant}
            date={date}
            time={time}
            setDate={setDate}
            setTime={setTime}
            errors={errors}
          />
        )}
        {step === 3 && (
          <StepDetails
            name={name}
            phone={phone}
            email={email}
            notes={notes}
            setName={setName}
            setPhone={setPhone}
            setEmail={setEmail}
            setNotes={setNotes}
            errors={errors}
          />
        )}
        {step === 4 && (
          <StepSummary
            tenant={tenant}
            services={services}
            serviceIds={serviceIds}
            unsure={unsure}
            plate={plate}
            make={make}
            model={model}
            date={date}
            time={time}
            name={name}
            phone={phone}
            email={email}
            notes={notes}
            consent={consent}
            setConsent={(v) => {
              setConsent(v);
              setErrors({});
            }}
            error={errors.consent}
          />
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <Button variant="outline" className="h-11 flex-1" onClick={goBack}>
            <ArrowLeft strokeWidth={1.5} className="h-4 w-4" />
            Atrás
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="h-11 flex-1" onClick={goNext}>
            Siguiente
            <ArrowRight strokeWidth={1.5} className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-11 flex-1" onClick={submit}>
            Enviar solicitud
          </Button>
        )}
      </div>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Paso {step + 1} de {STEPS.length} · {STEPS[step]}
      </p>
    </div>
  );
}

function StepServices({
  services,
  serviceIds,
  unsure,
  onToggle,
  onUnsure,
  error,
}: {
  services: Service[];
  serviceIds: string[];
  unsure: boolean;
  onToggle: (id: string) => void;
  onUnsure: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          ¿Qué necesitas?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige uno o varios servicios. Si no lo tienes claro, no pasa nada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {services.map((s) => {
          const active = serviceIds.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong",
              )}
            >
              {s.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onUnsure}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors",
            unsure
              ? "border-primary bg-primary text-primary-foreground"
              : "border-dashed border-border text-muted-foreground hover:border-border-strong",
          )}
        >
          No estoy seguro
        </button>
      </div>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}

function StepVehicle({
  plate,
  make,
  model,
  setPlate,
  setMake,
  setModel,
  error,
}: {
  plate: string;
  make: string;
  model: string;
  setPlate: (v: string) => void;
  setMake: (v: string) => void;
  setModel: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-4">
      <Field label="Matrícula *" error={error}>
        <Input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="1234 ABC"
          maxLength={15}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Marca">
          <Input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="opcional"
            maxLength={40}
          />
        </Field>
        <Field label="Modelo">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="opcional"
            maxLength={40}
          />
        </Field>
      </div>
    </div>
  );
}

function StepDate({
  tenant,
  date,
  time,
  setDate,
  setTime,
  errors,
}: {
  tenant: Tenant;
  date: string;
  time: string;
  setDate: (v: string) => void;
  setTime: (v: string) => void;
  errors: Record<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Fecha preferida *" error={errors.date}>
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Hora preferida *" error={errors.time}>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>
      <HoursHint tenant={tenant} />
    </div>
  );
}

function HoursHint({ tenant }: { tenant: Tenant }) {
  const hours = tenant.businessHours;
  if (!hours || hours.length !== 7) return null;
  return (
    <div className="rounded-md border border-border bg-background-subtle p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
        <Clock strokeWidth={1.5} className="h-3.5 w-3.5" />
        Horario del taller
      </p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {hours.map((day, i) => (
          <li key={i} className="flex justify-between">
            <span>{DAY_LABELS[i]}</span>
            <span>{day.open ? `${day.from} – ${day.to}` : "Cerrado"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepDetails({
  name,
  phone,
  email,
  notes,
  setName,
  setPhone,
  setEmail,
  setNotes,
  errors,
}: {
  name: string;
  phone: string;
  email: string;
  notes: string;
  setName: (v: string) => void;
  setPhone: (v: string) => void;
  setEmail: (v: string) => void;
  setNotes: (v: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <Field label="Nombre *" error={errors.name}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre y apellidos"
          maxLength={120}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Teléfono *" error={errors.phone}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="600 000 000"
            maxLength={30}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
            maxLength={150}
          />
        </Field>
      </div>
      <Field label="Descripción">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cuéntanos qué necesitas…"
          maxLength={500}
        />
      </Field>
    </div>
  );
}

function StepSummary({
  tenant,
  services,
  serviceIds,
  unsure,
  plate,
  make,
  model,
  date,
  time,
  name,
  phone,
  email,
  notes,
  consent,
  setConsent,
  error,
}: {
  consent: boolean;
  setConsent: (v: boolean) => void;
  error?: string;
  tenant: Tenant;
  services: Service[];
  serviceIds: string[];
  unsure: boolean;
  plate: string;
  make: string;
  model: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}) {
  const serviceNames = services
    .filter((s) => serviceIds.includes(s.id))
    .map((s) => s.name);
  const dateLabel =
    date && time
      ? new Date(`${date}T${time}`).toLocaleString("es-ES", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const vehicleLabel = [plate, [make, model].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">Revisa tu solicitud</h2>
      <dl className="divide-y divide-border rounded-md border border-border">
        <SummaryRow
          label="Servicio"
          value={
            unsure
              ? "No estoy seguro"
              : serviceNames.length
                ? serviceNames.join(", ")
                : "—"
          }
        />
        <SummaryRow label="Vehículo" value={vehicleLabel || "—"} />
        <SummaryRow label="Fecha y hora" value={dateLabel} />
        <SummaryRow label="Nombre" value={name || "—"} />
        <SummaryRow label="Teléfono" value={phone || "—"} />
        {email && <SummaryRow label="Email" value={email} />}
        {notes && <SummaryRow label="Descripción" value={notes} />}
      </dl>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-accent)]"
        />
        <span className="text-sm text-foreground">
          Acepto que {tenant.name} guarde mis datos para gestionar la cita y avisarme de mi coche.{" "}
          <Link to="/privacidad" target="_blank" className="text-primary underline-offset-2 hover:underline">
            Política de privacidad
          </Link>
        </span>
      </label>
      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Tu cita queda pendiente hasta que {tenant.name} te la confirme por WhatsApp.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
