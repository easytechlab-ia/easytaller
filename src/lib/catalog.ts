// EasyTaller — Servicios y recambios. A quote is always: labor (hours × the
// shop's hourly rate) + parts. A service is a shortcut: its labor hours and the
// parts it usually needs, so adding it to a quote fills both blocks at once.
// Its price on the website (IVA included) is computed from those. All data
// access goes through the repos. Everything is local & simulated.

import type { Part, Service, ServicePart, Tenant } from "@/types";
import { appointmentsRepo, partsRepo, servicesRepo } from "@/lib/db";
import type { QuoteItemInput } from "@/lib/quotes";

/** Neutral label shown when a service id no longer exists in the catalog. */
export const MISSING_SERVICE_LABEL = "Servicio eliminado";

/** Hourly labor rate used when the shop hasn't set one yet. */
export const DEFAULT_LABOR_RATE = 45;

/** The shop's labor price per hour (without IVA). */
export function laborRate(tenant: Pick<Tenant, "laborRate">): number {
  return tenant.laborRate && tenant.laborRate > 0 ? tenant.laborRate : DEFAULT_LABOR_RATE;
}

/**
 * Count appointments that still reference a given service and whose date is in
 * the future. Used to warn before deleting a service that's booked.
 */
export function futureAppointmentsUsingService(
  tenantId: string,
  serviceId: string,
): number {
  const now = Date.now();
  return appointmentsRepo
    .list(tenantId)
    .filter(
      (a) =>
        a.serviceIds.includes(serviceId) &&
        new Date(a.scheduledAt).getTime() >= now &&
        a.status !== "completada" &&
        a.status !== "no_show",
    ).length;
}

/** List services sorted by name. */
export function listServices(tenantId: string): Service[] {
  return servicesRepo.list(tenantId).sort((a, b) => a.name.localeCompare(b.name));
}

/** List parts sorted by name. */
export function listParts(tenantId: string): Part[] {
  return partsRepo.list(tenantId).sort((a, b) => a.name.localeCompare(b.name));
}

/** Labor + parts of a service, without IVA. */
export function servicePrice(
  tenant: Pick<Tenant, "laborRate" | "taxRate">,
  hours: number,
  parts: ServicePart[],
  partsById: Map<string, Part>,
): { labor: number; parts: number; net: number; gross: number } {
  const labor = round2(Math.max(0, hours) * laborRate(tenant));
  const partsTotal = round2(
    parts.reduce((s, p) => s + (partsById.get(p.partId)?.price ?? 0) * p.qty, 0),
  );
  const net = round2(labor + partsTotal);
  return { labor, parts: partsTotal, net, gross: round2(net * (1 + tenant.taxRate)) };
}

/** Keep every service's website price in line after prices or the rate change. */
export function refreshServicePrices(tenant: Pick<Tenant, "id" | "laborRate" | "taxRate">): void {
  const partsById = new Map(partsRepo.list(tenant.id).map((p) => [p.id, p]));
  for (const s of servicesRepo.list(tenant.id)) {
    if (s.laborHours == null) continue; // old-style service with a fixed price
    const { gross } = servicePrice(tenant, s.laborHours, s.parts ?? [], partsById);
    if (gross !== s.basePrice) servicesRepo.update(tenant.id, s.id, { basePrice: gross });
  }
}

/** Quote lines for a service: one labor line + one line per part. */
export function serviceQuoteLines(
  tenant: Pick<Tenant, "id" | "laborRate">,
  service: Service,
): QuoteItemInput[] {
  const lines: QuoteItemInput[] = [];
  const hours = service.laborHours ?? 0;
  if (hours > 0) {
    lines.push({
      type: "labor",
      description: service.name,
      qty: hours,
      unitPrice: laborRate(tenant),
    });
  }
  const partsById = new Map(partsRepo.list(tenant.id).map((p) => [p.id, p]));
  for (const sp of service.parts ?? []) {
    const part = partsById.get(sp.partId);
    if (!part) continue;
    lines.push({
      type: "part",
      description: part.name,
      qty: sp.qty,
      unitPrice: part.price,
      partId: part.id,
    });
  }
  // Old-style service without hours or parts: a single line at its price.
  if (lines.length === 0) {
    lines.push({ type: "labor", description: service.name, qty: 1, unitPrice: service.basePrice });
  }
  return lines;
}

/** "1,5 h" style label for hours. */
export function hoursLabel(hours: number): string {
  return `${hours.toLocaleString("es-ES", { maximumFractionDigits: 2 })} h`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
