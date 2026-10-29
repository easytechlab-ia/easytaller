// EasyTaller — printable quote (presupuesto) and its preview dialog. Shows the
// shop's details, customer, car, lines (with warranty), totals and, once the
// customer has answered, what was accepted and their signature.

import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approvedTotals,
  lineAmount,
  quoteBreakdown,
  quoteSentDate,
  warrantyLabel,
} from "@/lib/quotes";
import { formatCurrencyCents, formatDate } from "@/lib/format";
import { printElement } from "@/lib/print";
import type { Customer, QuoteItem, Tenant, Vehicle, WorkOrder } from "@/types";

const APPROVAL_LABEL: Record<QuoteItem["approval"], string> = {
  pending: "Pendiente",
  approved: "Aceptada",
  rejected: "Rechazada",
};

/** Quote number shown to the customer (stable, from the repair code). */
export function quoteNumber(order: WorkOrder): string {
  return `P-${order.accessCode}`;
}

export function QuoteDocument({
  order,
  tenant,
  customer,
  vehicle,
}: {
  order: WorkOrder;
  tenant: Tenant;
  customer?: Customer;
  vehicle?: Vehicle;
}) {
  const loc = tenant.locations[0];
  const totals = quoteBreakdown(order.items, tenant.taxRate);
  const answered = !!order.quoteApproval;
  const accepted = approvedTotals(order.items, tenant.taxRate);
  const date = quoteSentDate(order) ?? new Date().toISOString();
  const taxPct = Math.round(tenant.taxRate * 100);
  const money = (cents: number) => formatCurrencyCents(cents, tenant.currency);

  return (
    <div className="bg-white p-6 text-[13px] leading-relaxed text-slate-800 sm:p-8">
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: tenant.accentColor }} />

      {/* Shop + document */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          {tenant.logoUrl && (
            <img src={tenant.logoUrl} alt="" className="mb-2 h-10 w-auto object-contain" />
          )}
          <p className="font-display text-lg font-bold text-slate-900">
            {tenant.legalName?.trim() || tenant.name}
          </p>
          {tenant.taxId && <p>NIF {tenant.taxId}</p>}
          {loc?.address && <p>{loc.address}</p>}
          <p>{[tenant.phone || loc?.phone, tenant.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-slate-900">Presupuesto</p>
          <p className="font-mono">{quoteNumber(order)}</p>
          <p>Fecha: {formatDate(date)}</p>
          <p>Válido 30 días</p>
        </div>
      </div>

      {/* Customer + car */}
      <div className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">Cliente</p>
          <p className="font-medium text-slate-900">{customer?.name ?? "—"}</p>
          {customer?.phone && <p>{customer.phone}</p>}
          {customer?.email && <p>{customer.email}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">Vehículo</p>
          <p className="font-medium text-slate-900">
            {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
          </p>
          {vehicle?.plate && <p className="font-mono">{vehicle.plate}</p>}
          {vehicle?.km ? <p>{vehicle.km.toLocaleString("es-ES")} km</p> : null}
        </div>
      </div>

      {order.problemDescription && (
        <p className="mt-4">
          <span className="font-semibold text-slate-900">Motivo: </span>
          {order.problemDescription}
        </p>
      )}

      {/* Lines: labor and parts, each with its subtotal */}
      {(["labor", "part"] as const).map((kind) => {
        const lines = order.items.filter((it) => it.type === kind);
        if (lines.length === 0) return null;
        return (
          <table key={kind} className="mt-5 w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-2 font-semibold">
                  {kind === "labor" ? "Mano de obra" : "Recambios"}
                </th>
                <th className="w-20 py-2 pr-2 text-right font-semibold">
                  {kind === "labor" ? "Horas" : "Cant."}
                </th>
                <th className="w-24 py-2 pr-2 text-right font-semibold">
                  {kind === "labor" ? "€/hora" : "Precio"}
                </th>
                <th className="w-24 py-2 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((it) => {
                const warranty = warrantyLabel(it);
                const note = [
                  warranty ? `Garantía ${warranty}` : "",
                  answered ? APPROVAL_LABEL[it.approval] : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={it.id}
                    className={
                      it.approval === "rejected"
                        ? "border-b border-slate-100 align-top text-slate-400 line-through"
                        : "border-b border-slate-100 align-top"
                    }
                  >
                    <td className="py-2 pr-2">
                      <p className="text-slate-900">{it.description}</p>
                      {note && <p className="text-xs text-slate-500">{note}</p>}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {it.qty.toLocaleString("es-ES", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(it.unitPrice)}</td>
                    <td className="py-2 text-right tabular-nums">{money(lineAmount(it))}</td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="py-2 pr-2 text-right text-xs font-semibold text-slate-500">
                  Subtotal {kind === "labor" ? "mano de obra" : "recambios"}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                  {money(kind === "labor" ? totals.labor : totals.parts)}
                </td>
              </tr>
            </tbody>
          </table>
        );
      })}

      {/* Totals */}
      <div className="ml-auto mt-4 w-full max-w-xs space-y-1">
        <div className="flex justify-between">
          <span>Base imponible</span>
          <span className="tabular-nums">{money(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>IVA ({taxPct}%)</span>
          <span className="tabular-nums">{money(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900">
          <span>Total</span>
          <span className="tabular-nums">{money(totals.total)}</span>
        </div>
        {answered && (
          <div className="flex justify-between font-semibold text-emerald-700">
            <span>Total aceptado</span>
            <span className="tabular-nums">{money(accepted.total)}</span>
          </div>
        )}
      </div>

      {/* Signature / note */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <p className="max-w-sm text-xs text-slate-500">
          Presupuesto sin compromiso. Si al desmontar encontramos algo más, te avisamos antes de
          hacer ningún trabajo que no esté aprobado.
        </p>
        {order.quoteApproval?.signature && (
          <div className="text-center">
            <img
              src={order.quoteApproval.signature}
              alt="Firma del cliente"
              className="h-16 w-auto"
            />
            <p className="border-t border-slate-300 pt-1 text-xs text-slate-500">
              Firmado el {formatDate(order.quoteApproval.decidedAt)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Preview of the quote with a button to print it or save it as PDF. */
export function QuotePrintDialog({
  open,
  onOpenChange,
  order,
  tenant,
  customer,
  vehicle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: WorkOrder;
  tenant: Tenant;
  customer?: Customer;
  vehicle?: Vehicle;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Presupuesto {quoteNumber(order)}</DialogTitle>
        </DialogHeader>
        <div ref={sheet} className="overflow-hidden rounded-lg border border-border">
          <QuoteDocument order={order} tenant={tenant} customer={customer} vehicle={vehicle} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            onClick={() =>
              printElement(
                sheet.current?.firstElementChild as HTMLElement | null,
                `Presupuesto ${quoteNumber(order)}`,
              )
            }
          >
            <Printer strokeWidth={1.5} />
            Imprimir / Guardar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
