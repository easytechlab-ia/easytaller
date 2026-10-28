// EasyTaller — Presupuestos. Every quote in one place, by where it is: to send,
// waiting for the customer (with how many days), accepted (fully or in part)
// and rejected. From each card: open the repair, send or remind by WhatsApp
// and print / save the quote as PDF. Quotes are written inside each repair.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, ChevronRight, FileText, Printer, Send } from "lucide-react";
import { PageHeader } from "@/components/base/PageHeader";
import { EmptyState } from "@/components/base/EmptyState";
import { Button } from "@/components/ui/button";
import { QuotePrintDialog, quoteNumber } from "@/components/app/QuoteDocument";
import { QuoteWhatsAppDialog } from "@/components/app/QuoteWhatsAppDialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { customersRepo, vehiclesRepo, workOrdersRepo } from "@/lib/db";
import { quoteTotals } from "@/lib/orders";
import {
  QUOTE_STAGE_LABELS,
  approvedTotals,
  daysSince,
  quoteSentDate,
  quoteStage,
  sendQuote,
  type QuoteStage,
} from "@/lib/quotes";
import { formatCurrencyCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer, Vehicle, WorkOrder } from "@/types";

export const Route = createFileRoute("/app/presupuestos")({
  component: QuotesPage,
});

type Filter = "all" | "draft" | "sent" | "accepted" | "rejected";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "sent", label: "Esperando respuesta" },
  { value: "draft", label: "Por enviar" },
  { value: "accepted", label: "Aceptados" },
  { value: "rejected", label: "Rechazados" },
];

const STAGE_STYLE: Record<QuoteStage, string> = {
  draft: "bg-background-muted text-muted-foreground",
  sent: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[color-mix(in_srgb,var(--warning)_75%,black)]",
  approved: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
  partial: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
  rejected: "bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] text-[var(--destructive)]",
};

// Order in the list: what needs action first.
const STAGE_ORDER: Record<QuoteStage, number> = {
  sent: 0,
  draft: 1,
  partial: 2,
  approved: 3,
  rejected: 4,
};

interface Row {
  order: WorkOrder;
  stage: QuoteStage;
  customer?: Customer;
  vehicle?: Vehicle;
  total: number;
  accepted: number;
  sentAt?: string;
}

function matches(filter: Filter, stage: QuoteStage): boolean {
  if (filter === "all") return true;
  if (filter === "accepted") return stage === "approved" || stage === "partial";
  return filter === stage;
}

function QuotesPage() {
  const { tenant } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [version, setVersion] = useState(0);
  const [wa, setWa] = useState<{ row: Row; reminder: boolean } | null>(null);
  const [printing, setPrinting] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!tenant) return [];
    return workOrdersRepo
      .list(tenant.id)
      .filter((o) => o.status !== "cancelado")
      .map((order) => {
        const stage = quoteStage(order);
        if (!stage) return null;
        return {
          order,
          stage,
          customer: customersRepo.getById(tenant.id, order.customerId),
          vehicle: vehiclesRepo.getById(tenant.id, order.vehicleId),
          total: quoteTotals(order.items, tenant.taxRate).total,
          accepted: approvedTotals(order.items, tenant.taxRate).total,
          sentAt: quoteSentDate(order),
        } as Row;
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => {
        const byStage = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
        if (byStage !== 0) return byStage;
        // Waiting longest first; otherwise most recent first.
        if (a.stage === "sent") return (a.sentAt ?? "").localeCompare(b.sentAt ?? "");
        return b.order.updatedAt.localeCompare(a.order.updatedAt);
      });
    // version: re-read after sending a quote from this page.
  }, [tenant, version]);

  if (!tenant) return null;

  const money = (cents: number) => formatCurrencyCents(cents, tenant.currency);
  const waiting = rows.filter((r) => r.stage === "sent");
  const answered = rows.filter((r) => r.order.quoteApproval);
  const acceptedRows = answered.filter((r) => r.stage === "approved" || r.stage === "partial");
  const acceptance = answered.length
    ? Math.round((acceptedRows.length / answered.length) * 100)
    : null;
  const shown = rows.filter((r) => matches(filter, r.stage));
  const count = (f: Filter) => rows.filter((r) => matches(f, r.stage)).length;

  const send = (row: Row) => {
    const updated = sendQuote(tenant, row.order);
    setVersion((v) => v + 1);
    setWa({ row: { ...row, order: updated ?? row.order }, reminder: false });
  };

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        description="Todos tus presupuestos: los que faltan por enviar, los que esperan respuesta y los aceptados."
      />

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Summary
          label="Esperando respuesta"
          value={money(waiting.reduce((s, r) => s + r.total, 0))}
          hint={
            waiting.length === 0
              ? "Ninguno pendiente"
              : `${waiting.length} ${waiting.length === 1 ? "presupuesto" : "presupuestos"}`
          }
          highlight={waiting.length > 0}
        />
        <Summary
          label="Aceptado"
          value={money(acceptedRows.reduce((s, r) => s + r.accepted, 0))}
          hint={`${acceptedRows.length} ${acceptedRows.length === 1 ? "presupuesto" : "presupuestos"}`}
        />
        <Summary
          label="Tasa de aceptación"
          value={acceptance === null ? "—" : `${acceptance}%`}
          hint={answered.length ? `De ${answered.length} respondidos` : "Aún sin respuestas"}
        />
      </div>

      {/* Filters */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className="ml-1.5 opacity-70">{count(f.value)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={rows.length === 0 ? "Aún no hay presupuestos" : "Nada por aquí"}
          description={
            rows.length === 0
              ? "Los presupuestos se preparan desde la ficha de cada coche en el taller (En taller → abre un coche → Presupuesto)."
              : "No hay presupuestos en este apartado."
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <QuoteCard
              key={row.order.id}
              row={row}
              money={money}
              onSend={() => send(row)}
              onRemind={() => setWa({ row, reminder: true })}
              onPrint={() => setPrinting(row)}
            />
          ))}
        </ul>
      )}

      {wa && (
        <QuoteWhatsAppDialog
          open
          onOpenChange={(o) => !o && setWa(null)}
          order={wa.row.order}
          tenant={tenant}
          customer={wa.row.customer}
          vehicle={wa.row.vehicle}
          reminder={wa.reminder}
        />
      )}
      {printing && (
        <QuotePrintDialog
          open
          onOpenChange={(o) => !o && setPrinting(null)}
          order={printing.order}
          tenant={tenant}
          customer={printing.customer}
          vehicle={printing.vehicle}
        />
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        highlight ? "border-primary/40 bg-brand-soft" : "border-border",
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function QuoteCard({
  row,
  money,
  onSend,
  onRemind,
  onPrint,
}: {
  row: Row;
  money: (cents: number) => string;
  onSend: () => void;
  onRemind: () => void;
  onPrint: () => void;
}) {
  const { order, stage, customer, vehicle } = row;
  const days = daysSince(row.sentAt);

  let when: React.ReactNode = null;
  if (stage === "sent" && days !== undefined) {
    const late = days >= 2;
    when = (
      <span className={late ? "font-medium text-[var(--destructive)]" : undefined}>
        {days === 0 ? "Enviado hoy" : `Enviado hace ${days} ${days === 1 ? "día" : "días"}`}
        {late ? " · conviene recordarlo" : ""}
      </span>
    );
  } else if (stage === "draft") {
    when = <span>Preparado, sin enviar</span>;
  } else if (order.quoteApproval) {
    when = <span>Respondido el {formatDate(order.quoteApproval.decidedAt)}</span>;
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/app/ordenes/$id"
          params={{ id: order.id }}
          className="group min-w-0 flex-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground group-hover:underline">
              {vehicle ? `${vehicle.make} ${vehicle.model}` : "Vehículo"}
            </span>
            {vehicle?.plate && (
              <span className="font-mono text-xs text-muted-foreground">{vehicle.plate}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {customer?.name ?? "Cliente"} · {quoteNumber(order)}
          </p>
        </Link>
        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-bold tabular-nums text-foreground">
            {money(stage === "partial" ? row.accepted : row.total)}
          </p>
          {stage === "partial" && (
            <p className="text-xs text-muted-foreground">de {money(row.total)}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STAGE_STYLE[stage])}>
            {QUOTE_STAGE_LABELS[stage]}
          </span>
          {when}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onPrint} aria-label="Ver PDF">
            <Printer strokeWidth={1.5} />
            PDF
          </Button>
          {stage === "draft" && (
            <Button size="sm" onClick={onSend}>
              <Send strokeWidth={1.5} />
              Enviar
            </Button>
          )}
          {stage === "sent" && (
            <Button size="sm" variant="outline" onClick={onRemind}>
              <BellRing strokeWidth={1.5} />
              Recordar
            </Button>
          )}
          {stage !== "draft" && stage !== "sent" && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/app/ordenes/$id" params={{ id: order.id }}>
                Abrir
                <ChevronRight strokeWidth={1.5} />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
