import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Car,
  Camera,
  ScanLine,
  FileText,
  AlertCircle,
  AlertTriangle,
  X,
  MessageCircle,
  PenLine,
  Printer,
  ReceiptText,
  History,
  Star,
  ExternalLink,
} from "lucide-react";
import { HeroPill, ShopHero, ShopPage } from "@/components/public/ShopChrome";
import { PublicLoading } from "@/components/PublicLoading";
import { VehicleHistory } from "@/components/VehicleHistory";
import { useAuth } from "@/lib/auth/AuthContext";
import { customersRepo, findWorkOrderByAccessCode, vehiclesRepo } from "@/lib/db";
import {
  PHOTO_LABEL_TEXT,
  listOrdersByVehicleId,
} from "@/lib/orders";
import {
  acceptQuote,
  chosenLines,
  quoteBreakdown,
  rejectQuote,
  warrantyLabel,
} from "@/lib/quotes";
import { QuotePrintDialog } from "@/components/app/QuoteDocument";
import { getInvoiceByWorkOrderId } from "@/lib/invoices";
import { createReview, getReviewByOrderId } from "@/lib/reviews";
import { inspectionSummary } from "@/lib/inspection";
import { isModuleEnabled } from "@/lib/permissions";
import { getWebsiteSettings, websiteWhatsapp } from "@/lib/website";
import { customerToShopMessage, whatsappUrl } from "@/lib/whatsapp";
import { formatCurrencyCents, formatDate, formatDateTime } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/base/SignaturePad";
import {
  InvoiceDocument,
  printInvoiceDocument,
} from "@/components/InvoiceDocument";
import type {
  InspectionItem,
  Photo,
  QuoteItem,
  Tenant,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
} from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$code")({
  component: GuestView,
});

// Customer-facing pipeline (cancelado handled separately).
const TIMELINE: Array<{ status: WorkOrderStatus; label: string }> = [
  { status: "recibido", label: "Recibido" },
  { status: "diagnostico", label: "Diagnóstico" },
  { status: "presupuesto_enviado", label: "Presupuesto enviado" },
  { status: "aprobado", label: "Aprobado" },
  { status: "en_reparacion", label: "En reparación" },
  { status: "listo", label: "Listo" },
  { status: "entregado", label: "Entregado" },
];

// Big line at the top of the page for each repair status.
const STATUS_HEADLINE: Partial<Record<WorkOrderStatus, string>> = {
  recibido: "Hemos recibido tu coche",
  diagnostico: "Estamos revisando tu coche",
  presupuesto_enviado: "Tienes un presupuesto para revisar",
  aprobado: "Presupuesto aprobado",
  en_reparacion: "Tu coche está en reparación",
  listo: "¡Tu coche está listo para recoger!",
  entregado: "Coche entregado. ¡Gracias!",
};

const SEMAPHORE: Record<
  InspectionItem["status"],
  { label: string; color: string; icon: typeof Check }
> = {
  ok: { label: "OK", color: "var(--success)", icon: Check },
  atencion: { label: "Atención", color: "var(--warning)", icon: AlertTriangle },
  critico: { label: "Crítico", color: "var(--destructive)", icon: X },
};

function GuestView() {
  const { code } = Route.useParams();
  const { ready } = useAuth();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "invalid" }
    | { kind: "ok"; order: WorkOrder; tenant: Tenant; vehicle?: Vehicle }
  >({ kind: "loading" });

  const load = useCallback(() => {
    const found = findWorkOrderByAccessCode(code);
    if (!found) {
      setState({ kind: "invalid" });
      return;
    }
    const vehicle = vehiclesRepo.getById(found.tenant.id, found.order.vehicleId);
    setState({ kind: "ok", ...found, vehicle });
  }, [code]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  if (state.kind === "loading") {
    return <PublicLoading />;
  }


  if (state.kind === "invalid") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background-subtle px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-[var(--destructive)]">
          <AlertCircle strokeWidth={1.5} className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Código no válido</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          No encontramos ninguna reparación con el código{" "}
          <span className="font-mono font-medium text-foreground">{code}</span>.
          Comprueba el código con tu taller.
        </p>
      </div>
    );
  }

  const { order, tenant, vehicle } = state;
  const currentIdx = TIMELINE.findIndex((s) => s.status === order.status);

  const photos = order.photos;

  const statusLine =
    order.status === "cancelado"
      ? "Reparación cancelada"
      : STATUS_HEADLINE[order.status] ?? TIMELINE[currentIdx]?.label;

  return (
    <ShopPage
      tenant={tenant}
      hero={
        <ShopHero
          tenant={tenant}
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Car strokeWidth={1.75} className="h-4 w-4" />
              {vehicle ? `${vehicle.make} ${vehicle.model}` : "Tu vehículo"}
              {vehicle?.plate && <span className="font-mono">· {vehicle.plate}</span>}
            </span>
          }
          title={statusLine}
        >
          {order.problemDescription && <p>{order.problemDescription}</p>}
          <p className="mt-3">
            <HeroPill tenant={tenant}>Código {order.accessCode}</HeroPill>
          </p>
        </ShopHero>
      }
    >
        {/* Timeline */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Estado de tu reparación
          </h2>
          <ol className="mt-4 space-y-0">
            {TIMELINE.map((step, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              const last = i === TIMELINE.length - 1;
              return (
                <li key={step.status} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        (done || current) && "border-transparent bg-primary text-primary-foreground",
                        !done && !current &&
                          "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {done ? <Check strokeWidth={2} className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    {!last && (
                      <span
                        className={cn(
                          "w-px flex-1",
                          i < currentIdx ? "bg-primary" : "bg-border",
                        )}
                      />
                    )}
                  </div>
                  <div className={cn("pb-6", last && "pb-0")}>
                    <p
                      className={cn(
                        "text-sm",
                        current
                          ? "font-semibold text-foreground"
                          : done
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    {current && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Paso actual
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Quote — accept (or not) and sign */}
        <QuoteSection order={order} tenant={tenant} vehicle={vehicle} onChanged={load} />

        {/* Photos — real gallery, read only */}
        <PhotoGallery photos={photos} />

        {/* Inspection (DVI) — read only */}
        <InspectionSection order={order} />


        {/* Invoice for this order (read only, printable) */}
        <OrderInvoiceSection order={order} tenant={tenant} vehicle={vehicle} />

        {/* Post-delivery review (only when delivered) */}
        {order.status === "entregado" && isModuleEnabled(tenant, "resenas") && (
          <ReviewSection
            order={order}
            tenant={tenant}
            accent={tenant.accentColor}
            onChanged={load}
          />
        )}

        {/* Vehicle service history */}
        <VehicleHistorySection
          order={order}
          tenant={tenant}
          vehicle={vehicle}
        />

        {/* Questions → straight to the shop's WhatsApp, saying which car */}
        <ContactShop order={order} tenant={tenant} vehicle={vehicle} />

    </ShopPage>
  );
}

/* ----------------------------- Photo gallery ----------------------------- */

function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [active, setActive] = useState<Photo | null>(null);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Camera strokeWidth={1.5} className="h-4 w-4" />
        <h2 className="text-sm font-semibold text-foreground">Fotos del vehículo</h2>
      </div>

      {photos.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Tu taller aún no ha subido fotos.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActive(photo)}
              className="group flex flex-col gap-1.5 text-left"
            >
              <span className="block aspect-square overflow-hidden rounded-lg border border-border bg-background-muted">
                <img
                  src={photo.url}
                  alt={PHOTO_LABEL_TEXT[photo.label]}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {PHOTO_LABEL_TEXT[photo.label]}
              </span>
            </button>
          ))}
        </div>
      )}

      <PhotoDialog active={active} onClose={() => setActive(null)} />
    </section>
  );
}

function PhotoDialog({
  active,
  onClose,
  caption,
}: {
  active: Photo | null;
  onClose: () => void;
  caption?: string;
}) {
  return (
    <Dialog open={!!active} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        {active && (
          <figure className="space-y-0">
            <img
              src={active.url}
              alt={caption ?? PHOTO_LABEL_TEXT[active.label]}
              className="max-h-[70vh] w-full bg-background-muted object-contain"
            />
            <figcaption className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <span className="text-sm font-medium text-foreground">
                {caption ?? PHOTO_LABEL_TEXT[active.label]}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(active.createdAt)}
              </span>
            </figcaption>
            {active.note && (
              <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {active.note}
              </p>
            )}
          </figure>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Inspection ----------------------------- */

function InspectionSection({ order }: { order: WorkOrder }) {
  const [active, setActive] = useState<Photo | null>(null);
  const inspection = order.inspection;

  if (!inspection || inspection.items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ScanLine strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">Inspección</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Aún no hay inspección disponible.
        </p>
      </section>
    );
  }

  const summary = inspectionSummary(inspection.items);
  const photoFor = (id?: string) =>
    id ? order.photos.find((p) => p.id === id) : undefined;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <ScanLine strokeWidth={1.5} className="h-4 w-4" />
        <h2 className="text-sm font-semibold text-foreground">Inspección</h2>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <SummaryTile label="OK" count={summary.ok} color="var(--success)" />
        <SummaryTile
          label="Atención"
          count={summary.atencion}
          color="var(--warning)"
        />
        <SummaryTile
          label="Crítico"
          count={summary.critico}
          color="var(--destructive)"
        />
      </div>

      {/* Points */}
      <ul className="mt-4 space-y-3">
        {inspection.items.map((item) => {
          const s = SEMAPHORE[item.status];
          const photo = photoFor(item.photoId);
          const Icon = s.icon;
          return (
            <li
              key={item.id}
              className="flex gap-3 rounded-lg border border-border p-3"
            >
              {photo ? (
                <button
                  type="button"
                  onClick={() => setActive(photo)}
                  className="shrink-0"
                >
                  <img
                    src={photo.url}
                    alt={item.name}
                    loading="lazy"
                    className="h-14 w-14 rounded-md border border-border object-cover"
                  />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{
                      color: s.color,
                      backgroundColor: `color-mix(in oklab, ${s.color} 12%, transparent)`,
                    }}
                  >
                    <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
                    {s.label}
                  </span>
                </div>
                {item.note && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <PhotoDialog
        active={active}
        onClose={() => setActive(null)}
        caption={active ? "Detalle de inspección" : undefined}
      />
    </section>
  );
}

function SummaryTile({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-foreground">{count}</p>
    </div>
  );
}

/* ----------------------------- Quote approval ----------------------------- */

/**
 * The customer's side of the quote: everything is included by default; they
 * untick what they don't want, see the total change, and accept with their
 * finger. Or they say no to the whole repair.
 */
function QuoteSection({
  order,
  tenant,
  vehicle,
  onChanged,
}: {
  order: WorkOrder;
  tenant: Tenant;
  vehicle?: Vehicle;
  onChanged: () => void;
}) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [signature, setSignature] = useState<string | undefined>();

  const items = order.items;
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">Presupuesto</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Tu taller aún no ha preparado un presupuesto.
        </p>
      </section>
    );
  }

  const deciding = items.some((i) => i.approval === "pending");
  const counted = chosenLines(tenant, items, excluded);
  const t = quoteBreakdown(counted, tenant.taxRate);
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);
  // Repair lines kept (the diagnosis fee isn't a repair).
  const repairsChosen = items.some(
    (i) =>
      !i.diagnosis &&
      (i.approval === "approved" || (i.approval === "pending" && !excluded.includes(i.id))),
  );
  const nothingChosen = deciding && !repairsChosen;
  const repairsAccepted = items.some((i) => !i.diagnosis && i.approval === "approved");
  const customer = customersRepo.getById(tenant.id, order.customerId);

  const toggle = (id: string) =>
    setExcluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const accept = () => {
    if (!signature) {
      toast.error("Firma con el dedo para aceptar.");
      return;
    }
    acceptQuote(tenant, order, excluded, signature);
    setSignOpen(false);
    setSignature(undefined);
    setExcluded([]);
    toast.success("¡Presupuesto aceptado! El taller ya lo tiene.");
    onChanged();
  };

  const reject = () => {
    rejectQuote(tenant, order);
    setRejectOpen(false);
    toast.success("Le hemos dicho al taller que no quieres la reparación.");
    onChanged();
  };

  const block = (kind: QuoteItem["type"]) => {
    const lines = items.filter((i) => i.type === kind);
    if (lines.length === 0) return null;
    return (
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{kind === "labor" ? "Mano de obra" : "Recambios"}</span>
          <span className="tabular-nums text-foreground">
            {money(kind === "labor" ? t.labor : t.parts)}
          </span>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {lines.map((it) => {
            const pending = it.approval === "pending";
            const waivedNow = !!it.diagnosis && !!tenant.diagnosisWaived && repairsChosen;
            const on = it.diagnosis
              ? !waivedNow && it.unitPrice > 0
              : pending
                ? !excluded.includes(it.id)
                : it.approval === "approved";
            const warranty = warrantyLabel(it);
            const detail =
              kind === "labor"
                ? `${it.qty.toLocaleString("es-ES", { maximumFractionDigits: 2 })} h × ${money(it.unitPrice)}/h`
                : `${it.qty} × ${money(it.unitPrice)}`;
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm text-foreground", !on && "text-muted-foreground line-through")}>
                    {it.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {it.diagnosis
                      ? tenant.diagnosisWaived
                        ? "Gratis si haces la reparación con nosotros"
                        : "Se cobra aunque no hagas la reparación"
                      : detail}
                    {warranty ? ` · Garantía ${warranty}` : ""}
                    {!pending && !it.diagnosis &&
                      (it.approval === "approved" ? " · Aceptado" : " · No lo quieres")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium tabular-nums",
                    on ? "text-foreground" : "text-muted-foreground line-through",
                  )}
                >
                  {money(it.qty * it.unitPrice)}
                </span>
              </>
            );
            return (
              <li key={it.id}>
                {pending && !it.diagnosis ? (
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(it.id)}
                      className="h-5 w-5 shrink-0 accent-[var(--brand-accent)]"
                      aria-label={`Incluir ${it.description}`}
                    />
                    {body}
                  </label>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">Presupuesto</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPdfOpen(true)}>
          <Printer strokeWidth={1.5} />
          PDF
        </Button>
      </div>

      {deciding && (
        <p className="mt-2 text-sm text-muted-foreground">
          Esto es lo que vamos a hacer. Si hay algo que no quieres, desmárcalo y el total se
          actualiza. Precios sin IVA; el IVA se suma abajo.
        </p>
      )}

      {block("labor")}
      {block("part")}

      <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
        <Row label="Base imponible" value={money(t.subtotal)} />
        <Row label={`IVA (${Math.round(tenant.taxRate * 100)}%)`} value={money(t.tax)} />
        <div className="flex items-center justify-between pt-1 text-lg font-bold text-foreground">
          <span>{deciding ? "Total" : "Total a pagar"}</span>
          <span className="tabular-nums">{money(t.total)}</span>
        </div>
      </div>

      {deciding ? (
        <div className="mt-4 space-y-2">
          {nothingChosen ? (
            <Button variant="outline" className="h-12 w-full" onClick={() => setRejectOpen(true)}>
              No quiero hacer la reparación
            </Button>
          ) : (
            <>
              <Button className="h-12 w-full text-base" onClick={() => setSignOpen(true)}>
                <PenLine strokeWidth={1.5} />
                Aceptar y firmar · {money(t.total)}
              </Button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="w-full py-1 text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                No quiero hacer la reparación
              </button>
            </>
          )}
        </div>
      ) : order.quoteApproval ? (
        <div className="mt-4 rounded-lg border border-border bg-background-subtle p-4">
          {repairsAccepted ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Check strokeWidth={2} className="h-4 w-4" style={{ color: "var(--success)" }} />
                Aceptaste el presupuesto el {formatDate(order.quoteApproval.decidedAt)}
              </p>
              {order.quoteApproval.signature && (
                <img
                  src={order.quoteApproval.signature}
                  alt="Tu firma"
                  className="mt-3 w-full max-w-[220px] rounded-md border border-border bg-background"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-foreground">
              Dijiste que no a este presupuesto el {formatDate(order.quoteApproval.decidedAt)}. Si
              cambias de idea, escribe al taller.
            </p>
          )}
        </div>
      ) : null}

      {/* Sign */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Firma para aceptar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aceptas el presupuesto por {money(t.total)} (IVA incluido). Firma con el dedo aquí
            debajo.
          </p>
          <SignaturePad initial={signature} onChange={setSignature} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={accept} disabled={!signature}>
              Aceptar presupuesto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Say no */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿No quieres hacer la reparación?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Avisaremos al taller. Si tienes dudas, puedes escribirles por WhatsApp antes de decidir.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={reject}>
              No la quiero
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuotePrintDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        order={order}
        tenant={tenant}
        customer={customer}
        vehicle={vehicle}
      />
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/* ----------------------------- Contact ----------------------------- */

function ContactShop({
  order,
  tenant,
  vehicle,
}: {
  order: WorkOrder;
  tenant: Tenant;
  vehicle?: Vehicle;
}) {
  const number = websiteWhatsapp(tenant, getWebsiteSettings(tenant));
  const text = customerToShopMessage({
    vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : undefined,
    plate: vehicle?.plate,
    code: order.accessCode,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">¿Tienes alguna duda?</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Escríbenos por WhatsApp. El mensaje ya lleva tu coche y tu código, así sabemos enseguida
        de qué nos hablas.
      </p>
      <Button asChild className="mt-4 h-11 w-full bg-[#25D366] text-white hover:bg-[#1ebe5b] sm:w-auto">
        <a href={whatsappUrl(number, text)} target="_blank" rel="noreferrer">
          <MessageCircle strokeWidth={1.75} />
          Escríbenos por WhatsApp
        </a>
      </Button>
    </section>
  );
}

/* ----------------------------- Review ----------------------------- */

function StarRating({
  value,
  onChange,
  size = "lg",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star
            strokeWidth={1.5}
            className={cn(dim, filled ? "text-foreground" : "text-muted-foreground")}
            fill={filled ? "currentColor" : "none"}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            className="transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

function ReviewSection({
  order,
  tenant,
  accent,
  onChanged,
}: {
  order: WorkOrder;
  tenant: Tenant;
  accent: string;
  onChanged: () => void;
}) {
  const existing = getReviewByOrderId(tenant.id, order.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [googleOpen, setGoogleOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Already rated (now or before) → thanks, and if it was 4–5 stars, the
  // invitation to leave it on Google too.
  const rated = sent ?? existing?.rating ?? null;
  if (rated != null) {
    const high = rated >= 4;
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Star strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">
            ¡Gracias por tu valoración!
          </h2>
        </div>
        <div className="mt-3">
          <StarRating value={rated} size="sm" />
        </div>
        {high ? (
          tenant.googleReviewUrl ? (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                ¿Nos ayudas a crecer? Comparte tu experiencia en Google.
              </p>
              <Button
                asChild
                className="mt-3 w-full text-primary-foreground"
                style={{ backgroundColor: accent }}
              >
                <a
                  href={tenant.googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Star strokeWidth={1.5} />
                  Déjanos una reseña en Google
                </a>
              </Button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              ¡Nos alegra que tu experiencia haya sido positiva!
            </p>
          )
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Gracias por tu sinceridad. El taller revisará tu valoración para
            mejorar.
          </p>
        )}

        {/* Right after a 4–5 star rating: a window that asks for the Google review. */}
        <Dialog open={googleOpen} onOpenChange={setGoogleOpen}>
          <DialogContent className="max-w-sm text-center">
            <DialogHeader className="items-center text-center sm:text-center">
              <div className="mx-auto mb-1 flex items-center gap-1 text-[#f5b301]">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} strokeWidth={1.5} className="h-8 w-8" fill="currentColor" />
                ))}
              </div>
              <DialogTitle className="text-xl">¡Gracias, nos alegra mucho!</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              ¿Nos ayudas con tu opinión en Google? Es lo que más ayuda a un taller de barrio y te
              lleva menos de un minuto.
            </p>
            {copied && (
              <p className="rounded-lg bg-background-subtle px-3 py-2 text-sm text-foreground">
                Hemos copiado tu comentario: solo tienes que pegarlo.
              </p>
            )}
            <div className="mt-1 grid gap-2">
              <Button
                asChild
                className="h-12 text-base text-primary-foreground"
                style={{ backgroundColor: accent }}
              >
                <a
                  href={tenant.googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setGoogleOpen(false)}
                >
                  <Star strokeWidth={1.5} />
                  Dejar mi reseña en Google
                </a>
              </Button>
              <Button variant="ghost" onClick={() => setGoogleOpen(false)}>
                Ahora no
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    );
  }

  const submit = () => {
    if (rating < 1) {
      toast.error("Elige una valoración de 1 a 5 estrellas.");
      return;
    }
    createReview(tenant.id, {
      orderId: order.id,
      customerId: order.customerId,
      vehicleId: order.vehicleId,
      rating,
      comment,
    });
    toast.success("¡Gracias por tu valoración!");
    // Happy customer → open the Google window (and copy their comment so they
    // only have to paste it).
    if (rating >= 4 && tenant.googleReviewUrl) {
      if (comment.trim()) {
        navigator.clipboard?.writeText(comment.trim()).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }
      setGoogleOpen(true);
    }
    setSent(rating);
    onChanged();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Star strokeWidth={1.5} className="h-4 w-4" />
        <h2 className="text-sm font-semibold text-foreground">
          ¿Cómo fue tu experiencia?
        </h2>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Tu opinión ayuda al taller a mejorar.
      </p>

      <div className="mt-4">
        <StarRating value={rating} onChange={setRating} />
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Cuéntanos qué tal fue (opcional)…"
        className="mt-4 min-h-[80px]"
        maxLength={500}
      />

      <Button
        className="mt-4 w-full text-primary-foreground"
        style={{ backgroundColor: accent }}
        onClick={submit}
      >
        Enviar valoración
      </Button>
    </section>
  );
}

/* ----------------------------- Invoice (this order) ----------------------------- */

function OrderInvoiceSection({
  order,
  tenant,
  vehicle,
}: {
  order: WorkOrder;
  tenant: Tenant;
  vehicle?: Vehicle;
}) {
  const invoice = getInvoiceByWorkOrderId(tenant.id, order.id);
  // No invoice yet → hide the section entirely.
  if (!invoice) return null;

  const customer = customersRepo.getById(tenant.id, order.customerId);
  const location =
    tenant.locations.find((l) => l.id === order.locationId) ??
    tenant.locations[0];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ReceiptText strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">Resumen del trabajo</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => printInvoiceDocument("invoice-customer")}
        >
          <Printer strokeWidth={1.5} />
          Imprimir / PDF
        </Button>
      </div>

      <div className="mt-4">
        <InvoiceDocument
          invoice={invoice}
          tenant={tenant}
          customer={customer}
          vehicle={vehicle}
          location={location}
          printId="invoice-customer"
          variant="customer"
        />
      </div>
    </section>
  );
}

/* ----------------------------- Vehicle history ----------------------------- */

function VehicleHistorySection({
  order,
  tenant,
  vehicle,
}: {
  order: WorkOrder;
  tenant: Tenant;
  vehicle?: Vehicle;
}) {
  // Other orders for this vehicle (most recent first), excluding the current one.
  const history = vehicle
    ? listOrdersByVehicleId(tenant.id, vehicle.id).filter(
        (o) => o.id !== order.id,
      )
    : [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <History strokeWidth={1.5} className="h-4 w-4" />
          <h2 className="text-sm font-semibold text-foreground">
            Historial del vehículo
          </h2>
        </div>
        {vehicle?.accessCode && (
          <Link
            to="/v/$code"
            params={{ code: vehicle.accessCode }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Ver cartilla del coche
            <ExternalLink strokeWidth={1.5} className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <div className="mt-4">
        <VehicleHistory
          orders={history}
          tenant={tenant}
          vehicle={vehicle}
          emptyText="Esta es la primera visita registrada de este vehículo."
        />
      </div>
    </section>
  );
}

