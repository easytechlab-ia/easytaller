// EasyTaller — presupuesto de un coche, pensado para hacerse en un minuto.
// Two blocks, as the customer will see them: MANO DE OBRA (hours × the shop's
// hourly rate) and RECAMBIOS (units × price). "Añadir servicio" fills both at
// once from the catalog; every line can be changed or removed. Then one button
// sends it by WhatsApp, with the link where the customer accepts and signs.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Package,
  Pencil,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { DataCard } from "@/components/base/DataCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { customersRepo, partsRepo, servicesRepo, vehiclesRepo } from "@/lib/db";
import { QuotePrintDialog } from "@/components/app/QuoteDocument";
import { QuoteWhatsAppDialog } from "@/components/app/QuoteWhatsAppDialog";
import {
  QUOTE_STAGE_LABELS,
  addQuoteItems,
  approvedTotals,
  daysSince,
  diagnosisLine,
  lineAmount,
  quoteBreakdown,
  quoteSentDate,
  quoteStage,
  quoteStockShortages,
  removeQuoteItem,
  sendQuote,
  updateQuoteItem,
  warrantyLabel,
  type QuoteItemInput,
} from "@/lib/quotes";
import { hoursLabel, laborRate, serviceQuoteLines } from "@/lib/catalog";
import { formatCurrencyCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuoteItem, Tenant, WorkOrder } from "@/types";

export function QuoteEditor({
  order,
  tenant,
  onSaved,
  hidePrices = false,
}: {
  order: WorkOrder;
  tenant: Tenant;
  onSaved: () => void;
  /** Mechanic without price access: adds lines (priced from the catalog) but sees no amounts. */
  hidePrices?: boolean;
}) {
  const [editing, setEditing] = useState<{ type: QuoteItem["type"]; item: QuoteItem | null } | null>(
    null,
  );
  const [waOpen, setWaOpen] = useState(false);
  const [waReminder, setWaReminder] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const customer = customersRepo.getById(tenant.id, order.customerId);
  const vehicle = vehiclesRepo.getById(tenant.id, order.vehicleId);
  const services = useMemo(
    () => servicesRepo.list(tenant.id).sort((a, b) => a.name.localeCompare(b.name)),
    [tenant.id],
  );

  const stage = quoteStage(order);
  const answered = !!order.quoteApproval && stage !== "draft" && stage !== "sent";
  const totals = quoteBreakdown(order.items, tenant.taxRate);
  const accepted = approvedTotals(order.items, tenant.taxRate);
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);
  const labor = order.items.filter((i) => i.type === "labor");
  const parts = order.items.filter((i) => i.type === "part");
  const waitingDays = stage === "sent" ? daysSince(quoteSentDate(order)) : undefined;
  const unpriced = order.items.filter((i) => i.needsPrice).length;
  const shortages = quoteStockShortages(tenant.id, order.items);
  // Hide amounts for a mechanic without price access.
  const amount = (n: number) => (hidePrices ? "" : money(n));

  const addService = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    // The first lines of a quote bring the diagnosis fee with them.
    addQuoteItems(tenant.id, order, [
      ...diagnosisLine(tenant, order),
      ...serviceQuoteLines(tenant, service),
    ]);
    toast.success(`«${service.name}» añadido`);
    onSaved();
  };

  const submit = (input: QuoteItemInput) => {
    if (editing?.item) updateQuoteItem(tenant.id, order, editing.item.id, input);
    else addQuoteItems(tenant.id, order, [...diagnosisLine(tenant, order), input]);
    setEditing(null);
    onSaved();
  };

  const remove = (item: QuoteItem) => {
    removeQuoteItem(tenant.id, order, item.id);
    onSaved();
  };

  const send = () => {
    sendQuote(tenant, order);
    onSaved();
    setWaReminder(false);
    setWaOpen(true);
  };

  return (
    <DataCard title="Presupuesto">
      {/* Where it is */}
      {stage && (
        <p className="-mt-1 mb-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{QUOTE_STAGE_LABELS[stage]}</span>
          {waitingDays !== undefined &&
            ` · ${waitingDays === 0 ? "enviado hoy" : `hace ${waitingDays} ${waitingDays === 1 ? "día" : "días"}`}`}
          {answered && ` · aceptado ${money(accepted.total)} de ${money(totals.total)}`}
        </p>
      )}

      {/* Quick start: a whole service */}
      {services.length > 0 && (
        <Select value="" onValueChange={addService}>
          <SelectTrigger className="mb-4 h-10 gap-2 border-dashed">
            <Plus strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left text-sm text-muted-foreground">
              Añadir un servicio (mano de obra + recambios)
            </span>
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Block
        icon={Wrench}
        title="Mano de obra"
        subtotal={amount(totals.labor)}
        empty="Sin horas de mano de obra."
        addLabel="Añadir horas"
        onAdd={() => setEditing({ type: "labor", item: null })}
      >
        {labor.map((it) => (
          <Line
            key={it.id}
            item={it}
            detail={
              it.diagnosis && tenant.diagnosisWaived && it.unitPrice > 0
                ? "Se descuenta si acepta la reparación"
                : hidePrices
                  ? hoursLabel(it.qty)
                  : `${hoursLabel(it.qty)} × ${money(it.unitPrice)}/h`
            }
            amount={amount(lineAmount(it))}
            showApproval={answered || stage === "sent"}
            onEdit={() => setEditing({ type: "labor", item: it })}
            onRemove={() => remove(it)}
          />
        ))}
      </Block>

      <Block
        icon={Package}
        title="Recambios"
        subtotal={amount(totals.parts)}
        empty="Sin recambios."
        addLabel="Añadir recambio"
        onAdd={() => setEditing({ type: "part", item: null })}
      >
        {parts.map((it) => (
          <Line
            key={it.id}
            item={it}
            detail={hidePrices ? `${it.qty} ud.` : `${it.qty} × ${money(it.unitPrice)}`}
            amount={amount(lineAmount(it))}
            showApproval={answered || stage === "sent"}
            onEdit={() => setEditing({ type: "part", item: it })}
            onRemove={() => remove(it)}
          />
        ))}
      </Block>

      {/* Not enough parts in stock for this quote */}
      {shortages.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg border border-[var(--warning)]/40 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-sm text-foreground">
          {shortages.map((sh) => (
            <p key={sh.partId} className="flex items-start gap-2">
              <AlertTriangle strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
              <span>
                {sh.name}: quedan {sh.have} y necesitas {sh.need}.
                {sh.supplier ? ` Pídelo a ${sh.supplier}.` : " Hay que pedirlo."}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Lines added without a price (by a mechanic) */}
      {unpriced > 0 && !hidePrices && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-sm text-foreground">
          <AlertTriangle strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
          {unpriced === 1 ? "Falta poner precio a 1 línea" : `Falta poner precio a ${unpriced} líneas`}{" "}
          antes de enviar el presupuesto.
        </p>
      )}

      {/* Totals */}
      {order.items.length > 0 && !hidePrices && (
        <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          <Row label="Base imponible" value={money(totals.subtotal)} />
          <Row label={`IVA (${Math.round(tenant.taxRate * 100)}%)`} value={money(totals.tax)} />
          <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{money(totals.total)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      {order.items.length > 0 && !hidePrices && (
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setPrintOpen(true)}>
            <Printer strokeWidth={1.5} />
            Ver PDF
          </Button>
          {stage === "sent" ? (
            <Button
              onClick={() => {
                setWaReminder(true);
                setWaOpen(true);
              }}
            >
              <BellRing strokeWidth={1.5} />
              Recordar por WhatsApp
            </Button>
          ) : stage === "draft" ? (
            <Button onClick={send} disabled={unpriced > 0}>
              <Send strokeWidth={1.5} />
              {order.quoteApproval ? "Enviar los cambios por WhatsApp" : "Enviar al cliente por WhatsApp"}
            </Button>
          ) : null}
        </div>
      )}

      <LineDialog
        key={`${editing?.type}-${editing?.item?.id ?? "new"}`}
        state={editing}
        tenant={tenant}
        hidePrices={hidePrices}
        onClose={() => setEditing(null)}
        onSubmit={submit}
      />
      <QuoteWhatsAppDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        order={order}
        tenant={tenant}
        customer={customer}
        vehicle={vehicle}
        reminder={waReminder}
      />
      <QuotePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        order={order}
        tenant={tenant}
        customer={customer}
        vehicle={vehicle}
      />
    </DataCard>
  );
}

function Block({
  icon: Icon,
  title,
  subtotal,
  empty,
  addLabel,
  onAdd,
  children,
}: {
  icon: typeof Wrench;
  title: string;
  subtotal: string;
  empty: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode[];
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
          {title}
        </h3>
        <span className="text-sm font-medium tabular-nums text-foreground">{subtotal}</span>
      </div>
      <div className="space-y-1.5">
        {children.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {children}
      </div>
      <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-primary" onClick={onAdd}>
        <Plus strokeWidth={1.5} />
        {addLabel}
      </Button>
    </section>
  );
}

const APPROVAL_TAG: Record<QuoteItem["approval"], { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "text-[var(--warning)]" },
  approved: { label: "Aceptado", className: "text-[var(--success)]" },
  rejected: { label: "No lo quiere", className: "text-[var(--destructive)]" },
};

function Line({
  item,
  detail,
  amount,
  showApproval,
  onEdit,
  onRemove,
}: {
  item: QuoteItem;
  detail: string;
  amount: string;
  showApproval: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const warranty = warrantyLabel(item);
  const tag = APPROVAL_TAG[item.approval];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border px-3 py-2",
        item.approval === "rejected" && "opacity-60",
      )}
    >
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className={cn("truncate text-sm text-foreground", item.approval === "rejected" && "line-through")}>
          {item.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {detail}
          {warranty && (
            <span className="ml-2 inline-flex items-center gap-0.5">
              <ShieldCheck strokeWidth={1.5} className="h-3 w-3" />
              {warranty}
            </span>
          )}
          {item.needsPrice && (
            <span className="ml-2 font-medium text-[var(--warning)]">Falta precio</span>
          )}
          {showApproval && <span className={cn("ml-2 font-medium", tag.className)}>{tag.label}</span>}
        </p>
      </button>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{amount}</span>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onEdit} aria-label="Editar línea">
        <Pencil strokeWidth={1.5} className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-[var(--destructive)]"
        onClick={onRemove}
        aria-label="Quitar línea"
      >
        <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const OTHER = "__other__";

function num(v: string): number {
  return Number(v.replace(",", ".")) || 0;
}

/** Add / edit one line. Labor: hours × price per hour. Part: from the catalog. */
function LineDialog({
  state,
  tenant,
  hidePrices,
  onClose,
  onSubmit,
}: {
  state: { type: QuoteItem["type"]; item: QuoteItem | null } | null;
  tenant: Tenant;
  hidePrices: boolean;
  onClose: () => void;
  onSubmit: (input: QuoteItemInput) => void;
}) {
  const type = state?.type ?? "labor";
  const item = state?.item ?? null;
  const parts = useMemo(
    () => partsRepo.list(tenant.id).sort((a, b) => a.name.localeCompare(b.name)),
    [tenant.id],
  );
  const [partId, setPartId] = useState<string>(item?.partId ?? (item ? OTHER : ""));
  const [description, setDescription] = useState(item?.description ?? "");
  const [qty, setQty] = useState(String(item?.qty ?? 1).replace(".", ","));
  const [price, setPrice] = useState(
    String(item?.unitPrice ?? (type === "labor" ? laborRate(tenant) : "")).replace(".", ","),
  );
  const [months, setMonths] = useState(item?.warrantyMonths ? String(item.warrantyMonths) : "");
  const [km, setKm] = useState(item?.warrantyKm ? String(item.warrantyKm) : "");

  const pickPart = (id: string) => {
    setPartId(id);
    const p = parts.find((x) => x.id === id);
    if (p) {
      setDescription(p.name);
      setPrice(String(p.price).replace(".", ","));
    }
  };

  const q = num(qty);
  const pr = num(price);
  // A mechanic writing a part by hand can't price it: someone else will.
  const leavesUnpriced = hidePrices && type === "part" && (partId === OTHER || !!item?.needsPrice);
  const valid = description.trim().length > 0 && q > 0 && (leavesUnpriced || pr >= 0);
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);

  const submit = () => {
    if (!valid) return;
    onSubmit({
      type,
      description: description.trim(),
      qty: q,
      unitPrice: leavesUnpriced ? 0 : pr,
      needsPrice: leavesUnpriced,
      warrantyMonths: num(months) > 0 ? Math.round(num(months)) : undefined,
      warrantyKm: num(km) > 0 ? Math.round(num(km)) : undefined,
      partId: type === "part" && partId && partId !== OTHER ? partId : undefined,
    });
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar" : "Añadir"} {type === "labor" ? "mano de obra" : "recambio"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {type === "part" && (
            <div className="space-y-1.5">
              <Label>Recambio</Label>
              <Select value={partId} onValueChange={pickPart}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige de tu almacén" />
                </SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {hidePrices ? "" : ` · ${money(p.price)}`}
                      {p.stockQty != null ? ` · quedan ${p.stockQty}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Otro (escribir a mano)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(type === "labor" || partId === OTHER || item) && (
            <div className="space-y-1.5">
              <Label htmlFor="l-desc">{type === "labor" ? "Trabajo" : "Descripción"}</Label>
              <Input
                id="l-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "labor" ? "Cambio de pastillas" : "Nombre del recambio"}
                maxLength={160}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="l-qty">{type === "labor" ? "Horas" : "Cantidad"}</Label>
              <Input id="l-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            {!hidePrices && (
              <div className="space-y-1.5">
                <Label htmlFor="l-price">{type === "labor" ? "Precio por hora" : "Precio por unidad"}</Label>
                <Input id="l-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Garantía (opcional)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="Meses" />
              <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Kilómetros" />
            </div>
          </div>

          {hidePrices ? (
            <p className="rounded-lg bg-background-subtle px-3 py-2 text-sm text-muted-foreground">
              {leavesUnpriced
                ? "Recepción le pondrá el precio antes de enviarlo."
                : "El precio sale solo de tu catálogo."}
            </p>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-background-subtle px-3 py-2 text-sm">
              <span className="text-muted-foreground">Importe (sin IVA)</span>
              <span className="font-medium tabular-nums text-foreground">{money(q * pr)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {item ? "Guardar" : "Añadir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
