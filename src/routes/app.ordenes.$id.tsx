// EasyTaller — ficha de orden (hub central). Cabecera, control de estado, notas,
// fotos, presupuesto, inspección, check-in y compartir. En los momentos clave
// (coche recibido, listo y entregado) se ofrece avisar al cliente por WhatsApp
// con el mensaje ya escrito; en el resto hay un botón para avisar si hace falta.
// Enlace wa.me: el envío lo hace el taller desde su WhatsApp.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Car,
  User,
  Wrench,
  Camera,
  Copy,
  Loader2,
  Trash2,
  Receipt,
  BellRing,
  MessageCircle,
  PartyPopper,
  Handshake,
} from "lucide-react";
import { PageHeader } from "@/components/base/PageHeader";
import { EmptyState } from "@/components/base/EmptyState";
import { DataCard } from "@/components/base/DataCard";
import { StatusBadge } from "@/components/base/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthContext";
import { customersRepo, vehiclesRepo, workOrdersRepo } from "@/lib/db";
import {
  PHOTO_LABELS,
  PHOTO_LABEL_TEXT,
  STATUS_LABELS,
  addOrderPhoto,
  changeOrderStatus,
  listMechanics,
  nextStatuses,
  removeOrderPhoto,
  updateOrder,
} from "@/lib/orders";
import { QuoteEditor } from "@/components/app/QuoteEditor";
import { InspectionEditor } from "@/components/app/InspectionEditor";
import { CheckInEditor } from "@/components/app/CheckInEditor";
import { ReminderFormDialog } from "@/components/app/ReminderFormDialog";
import {
  generateInvoiceFromOrder,
  getInvoiceByWorkOrderId,
  BILLING_STAGE_LABELS,
  PAYMENT_METHOD_LABELS,
  billingStage,
  updateBilling,
} from "@/lib/invoices";
import { compressImage } from "@/lib/image";
import { formatDate } from "@/lib/format";
import { can, canEdit, isModuleEnabled } from "@/lib/permissions";
import {
  deliveredMessage,
  progressMessage,
  readyMessage,
  receivedMessage,
  whatsappUrl,
} from "@/lib/whatsapp";
import type { Customer, PaymentMethod, Photo, Tenant, Vehicle, WorkOrder } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ordenes/$id")({
  // ?avisar=recibido|listo|entregado → offer the WhatsApp message for that
  // moment (new order, or a status changed from the board).
  validateSearch: (search: Record<string, unknown>): { avisar?: AvisarKind } =>
    search.avisar === "recibido" || search.avisar === "listo" || search.avisar === "entregado"
      ? { avisar: search.avisar }
      : {},
  component: OrderDetail,
});

type AvisarKind = "recibido" | "listo" | "entregado";
type NotifyKind = AvisarKind | "avance";

/** Which message fits the car's current status. */
function notifyKindFor(status: WorkOrder["status"]): NotifyKind {
  if (status === "recibido" || status === "listo" || status === "entregado") return status;
  return "avance";
}

const MAX_PHOTOS = 12;

function OrderDetail() {
  const { id } = Route.useParams();
  const { avisar } = Route.useSearch();
  const navigate = useNavigate();
  const { ready, user, tenant } = useAuth();
  const [version, setVersion] = useState(0);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [notify, setNotify] = useState<NotifyKind | null>(null);
  const bump = () => setVersion((v) => v + 1);

  // Arrived for a key moment (new order, car received from an appointment, or
  // status changed on the board): offer the message, then clean the URL.
  useEffect(() => {
    if (!avisar) return;
    setNotify(avisar);
    navigate({ to: "/app/ordenes/$id", params: { id }, search: {}, replace: true });
  }, [avisar, id, navigate]);

  const order = useMemo(() => {
    if (!ready || !tenant) return null;
    return workOrdersRepo.getById(tenant.id, id) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tenant, id, version]);

  if (!tenant || !user) return null;
  if (!order) {
    return (
      <div>
        <BackLink />
        <EmptyState
          title="Orden no encontrada"
          description="Es posible que se haya eliminado."
        />
      </div>
    );
  }

  const vehicle = vehiclesRepo.getById(tenant.id, order.vehicleId);
  const customer = customersRepo.getById(tenant.id, order.customerId);
  const mechanics = listMechanics(tenant.id);
  const transitions = nextStatuses(order.status);
  // Mechanics only see the quote if the shop allows it (Equipo), and then maybe
  // without prices.
  const canQuote =
    can(user.role, "presupuestos") || (user.role === "mechanic" && !!tenant.mechanicCanAddLines);
  const hidePrices = user.role === "mechanic" && !tenant.mechanicCanSeePrices;
  const canBill = can(user.role, "facturacion") && isModuleEnabled(tenant, "facturacion");
  const canScheduleReminder =
    order.status === "entregado" &&
    !!vehicle &&
    canEdit(user.role, "recordatorios");

  const move = (next: string) => {
    changeOrderStatus(tenant, order, next as WorkOrder["status"]);
    toast.success(`Estado: ${STATUS_LABELS[next as WorkOrder["status"]]}`);
    bump();
    // Key moments: tell the customer on WhatsApp (ready to pick up / handed back).
    if (next === "listo" || next === "entregado") setNotify(next);
  };

  const setMechanic = (mid: string) => {
    updateOrder(tenant.id, order.id, { mechanicId: mid });
    bump();
  };

  return (
    <div>
      <BackLink />
      <PageHeader
        title={
          vehicle ? `${vehicle.make} ${vehicle.model}` : "Orden de reparación"
        }
        description={`Código ${order.accessCode}`}
        actions={<StatusBadge status={order.status} className="px-3 py-1 text-sm" />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Header info */}
          <DataCard title="Resumen">
            <div className="grid gap-4 sm:grid-cols-3">
              <InfoRow icon={Car} label="Vehículo">
                {vehicle ? (
                  <Link
                    to="/app/vehiculos/$id"
                    params={{ id: vehicle.id }}
                    className="text-foreground hover:underline"
                  >
                    {vehicle.make} {vehicle.model}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {vehicle.plate}
                    </span>
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow icon={User} label="Cliente">
                {customer ? (
                  <Link
                    to="/app/clientes/$id"
                    params={{ id: customer.id }}
                    className="text-foreground hover:underline"
                  >
                    {customer.name}
                    <span className="block text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow icon={Wrench} label="Mecánico">
                <Select
                  value={order.mechanicId ?? ""}
                  onValueChange={setMechanic}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {mechanics.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InfoRow>
            </div>
          </DataCard>

          {/* Pipeline control */}
          <DataCard title="Estado del coche">
            <p className="text-sm text-muted-foreground">
              Estado actual:{" "}
              <span className="font-medium text-foreground">
                {STATUS_LABELS[order.status]}
              </span>
            </p>
            {transitions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Esta orden está en un estado final.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {transitions.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "cancelado" ? "outline" : "default"}
                    className={
                      s === "cancelado"
                        ? "text-[var(--destructive)]"
                        : undefined
                    }
                    onClick={() => move(s)}
                  >
                    {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 px-2 text-muted-foreground"
              onClick={() => setNotify(notifyKindFor(order.status))}
            >
              <MessageCircle strokeWidth={1.5} />
              Avisar al cliente por WhatsApp
            </Button>
          </DataCard>

          <ProblemNotes order={order} tenantId={tenant.id} onSaved={bump} />
          <Photos order={order} tenantId={tenant.id} onSaved={bump} />

          {/* Quote editor — hidden for roles without quote access (mechanic) */}
          {canQuote && (
            <QuoteEditor order={order} tenant={tenant} onSaved={bump} hidePrices={hidePrices} />
          )}



          {/* Digital inspection */}
          <InspectionEditor order={order} tenant={tenant} onSaved={bump} />

          {/* Reception check-in */}
          <CheckInEditor order={order} tenant={tenant} onSaved={bump} />
        </div>

        {/* Sidebar: billing + share */}
        <div className="space-y-4 lg:col-span-1">
          {canBill && <BillingCard order={order} tenant={tenant} onSaved={bump} />}
          {canScheduleReminder && (
            <DataCard title="Mantenimiento">
              <p className="text-sm text-muted-foreground">
                Programa la próxima revisión de este vehículo.
              </p>
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => setReminderOpen(true)}
              >
                <BellRing strokeWidth={1.5} />
                Programar próxima revisión
              </Button>
            </DataCard>
          )}
          <ShareCard order={order} />
        </div>
      </div>

      <NotifyDialog
        kind={notify}
        onClose={() => setNotify(null)}
        onPaid={bump}
        order={order}
        tenant={tenant}
        customer={customer}
        vehicle={vehicle}
      />

      {vehicle && (
        <ReminderFormDialog
          open={reminderOpen}
          onOpenChange={setReminderOpen}
          tenantId={tenant.id}
          vehicleId={vehicle.id}
          customerId={order.customerId}
          onSaved={bump}
        />
      )}
    </div>
  );
}

function ProblemNotes({
  order,
  tenantId,
  onSaved,
}: {
  order: WorkOrder;
  tenantId: string;
  onSaved: () => void;
}) {
  const [problem, setProblem] = useState(order.problemDescription);
  const [notes, setNotes] = useState(order.internalNotes ?? "");

  const save = () => {
    updateOrder(tenantId, order.id, {
      problemDescription: problem.trim(),
      internalNotes: notes.trim(),
    });
    toast.success("Cambios guardados");
    onSaved();
  };

  const dirty =
    problem !== order.problemDescription ||
    notes !== (order.internalNotes ?? "");

  return (
    <DataCard title="Descripción y notas">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Problema / motivo</Label>
          <Textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            maxLength={600}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notas internas (no visibles al cliente)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Solo para el equipo del taller…"
            maxLength={600}
          />
        </div>
        <Button size="sm" onClick={save} disabled={!dirty}>
          Guardar
        </Button>
      </div>
    </DataCard>
  );
}

function Photos({
  order,
  tenantId,
  onSaved,
}: {
  order: WorkOrder;
  tenantId: string;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState<Photo["label"]>("recepcion");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (order.photos.length >= MAX_PHOTOS) {
      toast.error(`Máximo ${MAX_PHOTOS} fotos por orden.`);
      return;
    }
    setBusy(true);
    try {
      const url = await compressImage(file);
      addOrderPhoto(tenantId, order, { url, label });
      toast.success("Foto añadida");
      onSaved();
    } catch {
      toast.error("No se pudo procesar la imagen.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (photoId: string) => {
    removeOrderPhoto(tenantId, order, photoId);
    onSaved();
  };

  return (
    <DataCard title={`Fotos (${order.photos.length}/${MAX_PHOTOS})`}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={label} onValueChange={(v) => setLabel(v as Photo["label"])}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHOTO_LABELS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Camera strokeWidth={1.5} />
          )}
          Añadir foto
        </Button>
      </div>

      {order.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {order.photos.map((p) => (
            <figure
              key={p.id}
              className="group relative overflow-hidden rounded-lg border border-border"
            >
              <img
                src={p.url}
                alt={PHOTO_LABEL_TEXT[p.label]}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                {PHOTO_LABEL_TEXT[p.label]}
              </figcaption>
              <button
                onClick={() => remove(p.id)}
                className="absolute right-1 top-1 hidden rounded-md bg-background/90 p-1 text-[var(--destructive)] group-hover:block"
                aria-label="Eliminar foto"
              >
                <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5" />
              </button>
            </figure>
          ))}
        </div>
      )}
    </DataCard>
  );
}

const BILLABLE_STATUSES = new Set(["aprobado", "listo", "entregado"]);

function BillingCard({
  order,
  tenant,
  onSaved,
}: {
  order: WorkOrder;
  tenant: Tenant;
  onSaved: () => void;
}) {
  const invoice = getInvoiceByWorkOrderId(tenant.id, order.id);
  const billable = BILLABLE_STATUSES.has(order.status);
  const approvedCount = order.items.filter(
    (i) => i.approval === "approved",
  ).length;

  const generate = () => {
    const created = generateInvoiceFromOrder(tenant, order);
    if (!created) {
      toast.error("No hay líneas aprobadas para facturar.");
      return;
    }
    toast.success("Datos para facturar listos");
    onSaved();
  };

  if (!invoice && !billable) return null;

  return (
    <DataCard title="Facturación">
      {invoice ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-medium text-foreground">
              Ref. {invoice.number}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {BILLING_STAGE_LABELS[billingStage(invoice)]}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/app/facturacion/$id" params={{ id: invoice.id }}>
              <Receipt strokeWidth={1.5} />
              Ver datos para facturar
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {approvedCount > 0
              ? `${approvedCount} ${approvedCount === 1 ? "línea aprobada" : "líneas aprobadas"}. Prepara los datos para que tu gestoría haga la factura.`
              : "No hay líneas aprobadas todavía."}
          </p>
          <Button size="sm" className="w-full" onClick={generate}>
            <Receipt strokeWidth={1.5} />
            Preparar datos para facturar
          </Button>
        </div>
      )}
    </DataCard>
  );
}

function trackingLink(order: WorkOrder): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/c/${order.accessCode}`;
}

const NOTIFY_COPY: Record<
  NotifyKind,
  { title: string; icon: typeof Car; tone: string }
> = {
  recibido: {
    title: "Coche recibido. ¿Le mandamos el enlace de seguimiento?",
    icon: Car,
    tone: "var(--primary)",
  },
  listo: { title: "¡Coche listo! ¿Avisamos al cliente?", icon: PartyPopper, tone: "var(--success)" },
  entregado: {
    title: "Coche entregado. ¿Le enviamos el resumen?",
    icon: Handshake,
    tone: "var(--success)",
  },
  avance: { title: "Avisar al cliente", icon: MessageCircle, tone: "var(--primary)" },
};

/** Prefilled WhatsApp message to the customer for a moment of the repair. */
function NotifyDialog({
  kind,
  onClose,
  onPaid,
  order,
  tenant,
  customer,
  vehicle,
}: {
  kind: NotifyKind | null;
  onClose: () => void;
  onPaid: () => void;
  order: WorkOrder;
  tenant: Tenant;
  customer?: Customer;
  vehicle?: Vehicle;
}) {
  const initial = useMemo(() => {
    if (!kind) return "";
    const base = {
      customerName: customer?.name,
      vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : undefined,
      plate: vehicle?.plate,
      tenantName: tenant.name,
      trackingUrl: trackingLink(order),
    };
    if (kind === "recibido") return receivedMessage(base);
    if (kind === "listo") return readyMessage(base);
    if (kind === "entregado")
      return deliveredMessage({ ...base, askReview: isModuleEnabled(tenant, "resenas") });
    const readyBy =
      order.estimatedReadyAt && (order.status === "aprobado" || order.status === "en_reparacion")
        ? formatDate(order.estimatedReadyAt)
        : undefined;
    return progressMessage({ ...base, status: order.status, readyBy });
  }, [kind, customer, vehicle, tenant, order]);
  const [text, setText] = useState(initial);

  // Fresh draft every time the dialog opens.
  useEffect(() => {
    if (kind) setText(initial);
    // Only when it opens: noting the payment must not wipe what they typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const send = () => {
    window.open(whatsappUrl(customer?.phone, text), "_blank");
    toast.success("WhatsApp abierto con el mensaje listo para enviar");
    onClose();
  };

  // Handing the car back is also when it's paid: note how.
  const pay = (method: PaymentMethod | null) => {
    const now = new Date().toISOString();
    updateOrder(tenant.id, order.id, {
      paymentMethod: method ?? undefined,
      paidAt: method ? now : undefined,
    });
    const invoice = getInvoiceByWorkOrderId(tenant.id, order.id);
    if (invoice) {
      updateBilling(
        tenant.id,
        invoice.id,
        method
          ? { status: "paid", paymentMethod: method, paidAmount: invoice.total }
          : { status: "pending", paymentMethod: undefined, paidAmount: undefined },
      );
    }
    onPaid();
  };

  const copy = NOTIFY_COPY[kind ?? "avance"];
  const Icon = copy.icon;

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div
            className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full sm:mx-0"
            style={{
              color: copy.tone,
              backgroundColor: `color-mix(in srgb, ${copy.tone} 14%, transparent)`,
            }}
          >
            <Icon strokeWidth={1.5} className="h-6 w-6" />
          </div>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {customer
              ? `Se abrirá WhatsApp con este mensaje para ${customer.name} (${customer.phone}). Solo tienes que darle a enviar.`
              : "Se abrirá WhatsApp con este mensaje. Solo tienes que elegir el contacto y enviar."}
          </DialogDescription>
        </DialogHeader>
        {kind === "entregado" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">¿Cómo ha pagado?</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={order.paymentMethod === m ? "default" : "outline"}
                  onClick={() => pay(m)}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </Button>
              ))}
              <Button
                size="sm"
                variant={order.paidAt ? "ghost" : "secondary"}
                onClick={() => pay(null)}
              >
                Aún no ha pagado
              </Button>
            </div>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="text-sm"
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>
            Ahora no
          </Button>
          <Button
            onClick={send}
            className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
          >
            <MessageCircle strokeWidth={1.75} />
            Enviar por WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareCard({ order }: { order: WorkOrder }) {
  const link = trackingLink(order);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  };

  return (
    <DataCard title="Compartir con el cliente">
      <p className="text-xs text-muted-foreground">Código de acceso</p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-foreground">
        {order.accessCode}
      </p>
      <p className="mt-3 break-all rounded-lg border border-border bg-background-subtle px-3 py-2 text-xs text-muted-foreground">
        {link}
      </p>
      <div className="mt-3 grid gap-2">
        <Button variant="outline" onClick={copy}>
          <Copy strokeWidth={1.5} />
          Copiar enlace
        </Button>
        <Link
          to="/c/$code"
          params={{ code: order.accessCode }}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Ver como cliente →
        </Link>
      </div>
    </DataCard>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Car;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
        {label}
      </p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}


function BackLink() {
  return (
    <Link
      to="/app/ordenes"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft strokeWidth={1.5} className="h-4 w-4" />
      En taller
    </Link>
  );
}
