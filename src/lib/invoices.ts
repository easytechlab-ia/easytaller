// EasyTaller — billing data ("Facturación"). EasyTaller does NOT issue
// invoices: from 2027 invoicing software must comply with Verifactu, so the
// shop keeps invoicing with its gestoría or its own program. For each finished
// job we prepare the billing data (customer + NIF, approved lines, base, IVA,
// total, payment) and the shop sends it by email or as a spreadsheet. Records
// live in the "invoices" collection (kept for compatibility). All local.

import type { Customer, Invoice, PaymentMethod, Tenant, Vehicle, WorkOrder } from "@/types";
import {
  customersRepo,
  invoicesRepo,
  vehiclesRepo,
  workOrdersRepo,
} from "@/lib/db";
import { read, write } from "@/lib/db/storage";
import { notify } from "@/lib/notifications";
import { quoteTotals } from "@/lib/orders";

/** Find the billing record of a given work order, if any. */
export function getInvoiceByWorkOrderId(
  tenantId: string,
  workOrderId: string,
): Invoice | undefined {
  return invoicesRepo
    .list(tenantId)
    .find((i) => i.workOrderId === workOrderId);
}

/**
 * Next internal reference for the shop, per year: R-YYYY-NNNN. It is NOT an
 * invoice number (that one comes from the shop's invoicing program).
 */
export function nextInvoiceNumber(tenantId: string): string {
  const year = new Date().getFullYear();
  const prefix = `R-${year}-`;
  const existing = invoicesRepo
    .list(tenantId)
    .filter((i) => i.number.startsWith(prefix));
  let max = 0;
  for (const inv of existing) {
    const n = parseInt(inv.number.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function vehicleLabel(tenantId: string, vehicleId: string): string {
  const v = vehiclesRepo.getById(tenantId, vehicleId);
  return v ? `${v.make} ${v.model} · ${v.plate}` : "Vehículo";
}

/**
 * Prepare the billing data of a work order with its approved lines (base,
 * IVA and total with the shop's rate). Returns undefined if nothing was
 * approved. Starts as "to send" and "not collected".
 */
export function generateInvoiceFromOrder(
  tenant: Tenant,
  order: WorkOrder,
): Invoice | undefined {
  const approved = order.items.filter((i) => i.approval === "approved");
  if (approved.length === 0) return undefined;

  const { subtotal, tax, total } = quoteTotals(approved, tenant.taxRate);
  const now = new Date().toISOString();

  const invoice = invoicesRepo.create(tenant.id, {
    tenantId: tenant.id,
    workOrderId: order.id,
    number: nextInvoiceNumber(tenant.id),
    items: approved.map((i) => ({ ...i })),
    subtotal,
    tax,
    total,
    // Paid when the car was handed back? Carry it over.
    status: order.paymentMethod ? "paid" : "pending",
    paymentMethod: order.paymentMethod,
    paidAmount: order.paymentMethod ? total : undefined,
    createdAt: now,
  });

  notify(tenant.id, {
    type: "presupuesto",
    title: "Datos para facturar listos",
    body: `${vehicleLabel(tenant.id, order.vehicleId)} — listos para enviar a la gestoría.`,
    link: `/app/facturacion/${invoice.id}`,
  });

  return invoice;
}

/** Change the payment status of a record. */
export function setInvoiceStatus(
  tenantId: string,
  invoiceId: string,
  status: Invoice["status"],
): Invoice | undefined {
  return invoicesRepo.update(tenantId, invoiceId, { status });
}

/** Update payment / billing fields of a record. */
export function updateBilling(
  tenantId: string,
  invoiceId: string,
  patch: Partial<Pick<Invoice, "status" | "paymentMethod" | "paidAmount" | "sentAt" | "externalNumber">>,
): Invoice | undefined {
  return invoicesRepo.update(tenantId, invoiceId, patch);
}

/** Mark several records as sent to the gestoría now. */
export function markSent(tenantId: string, ids: string[]): void {
  const now = new Date().toISOString();
  for (const id of ids) invoicesRepo.update(tenantId, id, { sentAt: now });
}

export const INVOICE_STATUS_LABELS: Record<Invoice["status"], string> = {
  pending: "Sin cobrar",
  partial: "Cobro parcial",
  paid: "Cobrado",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  transferencia: "Transferencia",
};

// ---- where each record is ---------------------------------------------------

export type BillingStage = "to_send" | "sent" | "invoiced";

export const BILLING_STAGE_LABELS: Record<BillingStage, string> = {
  to_send: "Por enviar",
  sent: "Enviado a la gestoría",
  invoiced: "Facturado",
};

export function billingStage(inv: Invoice): BillingStage {
  if (inv.externalNumber?.trim()) return "invoiced";
  if (inv.sentAt) return "sent";
  return "to_send";
}

// ---- settings: who receives the data ----------------------------------------

export interface BillingSettings {
  id: string; // = tenantId
  gestoriaEmail?: string;
  gestoriaName?: string;
}

const SETTINGS = "billing";

export function getBillingSettings(tenantId: string): BillingSettings {
  return read<BillingSettings>(SETTINGS, tenantId)[0] ?? { id: tenantId };
}

export function saveBillingSettings(tenantId: string, settings: BillingSettings): void {
  write<BillingSettings>(SETTINGS, tenantId, [{ ...settings, id: tenantId }]);
}

// ---- records with their customer / car --------------------------------------

export interface BillingRow {
  invoice: Invoice;
  order?: WorkOrder;
  customer?: Customer;
  vehicle?: Vehicle;
}

export function billingRows(tenantId: string): BillingRow[] {
  return invoicesRepo
    .list(tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((invoice) => {
      const order = workOrdersRepo.getById(tenantId, invoice.workOrderId);
      return {
        invoice,
        order,
        customer: order ? customersRepo.getById(tenantId, order.customerId) : undefined,
        vehicle: order ? vehiclesRepo.getById(tenantId, order.vehicleId) : undefined,
      };
    });
}

// ---- export: email text and spreadsheet --------------------------------------

function money(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

/** Plain-text block with everything needed to issue the invoice. */
export function billingText(tenant: Tenant, row: BillingRow): string {
  const { invoice: inv, customer, vehicle } = row;
  const taxPct = Math.round(tenant.taxRate * 100);
  const block = (type: "labor" | "part") =>
    inv.items
      .filter((it) => it.type === type)
      .map(
        (it) =>
          `  - ${it.description}: ${it.qty.toLocaleString("es-ES")} ${type === "labor" ? "h" : "ud."} x ${money(it.unitPrice)} € = ${money(it.qty * it.unitPrice)} €`,
      );
  const labor = inv.items.filter((i) => i.type === "labor").reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const parts = inv.items.filter((i) => i.type === "part").reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const lines = [
    `Mano de obra (sin IVA): ${money(labor)} €`,
    ...block("labor"),
    `Recambios (sin IVA): ${money(parts)} €`,
    ...block("part"),
  ];
  const paid =
    inv.status === "paid"
      ? "Cobrado"
      : inv.status === "partial"
        ? `Cobrado en parte (${money(inv.paidAmount ?? 0)} €)`
        : "Sin cobrar";
  return [
    `Ref. ${inv.number} · ${day(inv.createdAt)}`,
    `Cliente: ${customer?.name ?? "—"}`,
    `NIF/CIF: ${customer?.taxId?.trim() || "— (particular, sin NIF)"}`,
    ...(customer?.address?.trim() ? [`Dirección: ${customer.address.trim()}`] : []),
    `Teléfono: ${customer?.phone ?? "—"}${customer?.email ? ` · ${customer.email}` : ""}`,
    `Vehículo: ${vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : "—"}`,
    ...lines,
    `Base imponible: ${money(inv.subtotal)} €`,
    `IVA ${taxPct}%: ${money(inv.tax)} €`,
    `TOTAL: ${money(inv.total)} €`,
    `Pago: ${paid}${inv.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[inv.paymentMethod]}` : ""}`,
  ].join("\n");
}

/** mailto: link to send the data of one or more jobs to the gestoría. */
export function billingEmailUrl(tenant: Tenant, rows: BillingRow[], to?: string): string {
  const n = rows.length;
  const subject =
    n === 1
      ? `Datos para facturar · ${tenant.name} · ${rows[0].invoice.number}`
      : `Datos para facturar · ${tenant.name} · ${n} trabajos`;
  const intro =
    n === 1
      ? "Hola,\n\nOs pasamos los datos para hacer la factura de este trabajo:"
      : `Hola,\n\nOs pasamos los datos para hacer las facturas de estos ${n} trabajos:`;
  const blocks = rows.map((r) => billingText(tenant, r)).join("\n\n────────────\n\n");
  const body = `${intro}\n\n${blocks}\n\nGracias,\n${tenant.name}`;
  return `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Spreadsheet (CSV for Excel, Spanish format) with one row per job. */
export function billingCsv(tenant: Tenant, rows: BillingRow[]): string {
  const taxPct = Math.round(tenant.taxRate * 100);
  const head = [
    "Referencia",
    "Fecha",
    "Cliente",
    "NIF/CIF",
    "Dirección",
    "Teléfono",
    "Email",
    "Vehículo",
    "Matrícula",
    "Conceptos",
    "Mano de obra",
    "Recambios",
    "Base imponible",
    "IVA %",
    "Cuota IVA",
    "Total",
    "Forma de pago",
    "Cobrado",
    "Nº factura",
  ];
  const cell = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map(({ invoice: inv, customer, vehicle }) =>
    [
      inv.number,
      day(inv.createdAt),
      customer?.name,
      customer?.taxId,
      customer?.address,
      customer?.phone,
      customer?.email,
      vehicle ? `${vehicle.make} ${vehicle.model}` : "",
      vehicle?.plate,
      inv.items.map((it) => `${it.qty} x ${it.description}`).join(" | "),
      money(inv.items.filter((i) => i.type === "labor").reduce((s, i) => s + i.qty * i.unitPrice, 0)),
      money(inv.items.filter((i) => i.type === "part").reduce((s, i) => s + i.qty * i.unitPrice, 0)),
      money(inv.subtotal),
      taxPct,
      money(inv.tax),
      money(inv.total),
      inv.paymentMethod ? PAYMENT_METHOD_LABELS[inv.paymentMethod] : "",
      money(inv.status === "paid" ? inv.total : inv.paidAmount ?? 0),
      inv.externalNumber,
    ]
      .map(cell)
      .join(";"),
  );
  return [head.join(";"), ...body].join("\r\n");
}

/** Download the spreadsheet in the browser. */
export function downloadBillingCsv(tenant: Tenant, rows: BillingRow[], name: string): void {
  const blob = new Blob(["﻿" + billingCsv(tenant, rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
