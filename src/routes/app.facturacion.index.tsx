// EasyTaller — Facturación. EasyTaller doesn't issue invoices (Verifactu): it
// keeps, for every finished job, the data the gestoría needs to invoice it.
// Here the shop sees what is still to send, sends it by email (one or many
// jobs at once) or downloads it as a spreadsheet, and tracks what has already
// been invoiced and collected. Everything local.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Download, Info, Mail, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/base/PageHeader";
import { EmptyState } from "@/components/base/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  BILLING_STAGE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  billingEmailUrl,
  billingRows,
  billingStage,
  downloadBillingCsv,
  getBillingSettings,
  markSent,
  saveBillingSettings,
  type BillingRow,
  type BillingStage,
} from "@/lib/invoices";
import { formatCurrencyCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/facturacion/")({
  component: BillingPage,
});

type Filter = "all" | BillingStage;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "to_send", label: "Por enviar" },
  { value: "sent", label: "Enviados" },
  { value: "invoiced", label: "Facturados" },
  { value: "all", label: "Todos" },
];

const STAGE_STYLE: Record<BillingStage, string> = {
  to_send: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[color-mix(in_srgb,var(--warning)_75%,black)]",
  sent: "bg-brand-soft text-primary",
  invoiced: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
};

function BillingPage() {
  const { ready, tenant } = useAuth();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState(() =>
    tenant ? getBillingSettings(tenant.id) : { id: "" },
  );
  const [emailDraft, setEmailDraft] = useState(settings.gestoriaEmail ?? "");

  const rows = useMemo<BillingRow[]>(
    () => (ready && tenant ? billingRows(tenant.id) : []),
    // version: re-read after marking records as sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, tenant, version],
  );

  if (!tenant) return null;

  const toSend = rows.filter((r) => billingStage(r.invoice) === "to_send");
  const sent = rows.filter((r) => billingStage(r.invoice) === "sent");
  const uncollected = rows.filter((r) => r.invoice.status !== "paid");
  const active: Filter = filter ?? (toSend.length ? "to_send" : "all");
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (active !== "all" && billingStage(r.invoice) !== active) return false;
    if (!q) return true;
    return (
      r.invoice.number.toLowerCase().includes(q) ||
      (r.invoice.externalNumber ?? "").toLowerCase().includes(q) ||
      (r.customer?.name ?? "").toLowerCase().includes(q) ||
      (r.vehicle?.plate ?? "").toLowerCase().includes(q)
    );
  });
  const count = (f: Filter) =>
    f === "all" ? rows.length : rows.filter((r) => billingStage(r.invoice) === f).length;
  const money = (n: number) => formatCurrencyCents(n, tenant.currency);

  // What the bulk buttons act on: the ticked jobs, or all those still to send.
  const picked = rows.filter((r) => selected.has(r.invoice.id));
  const target = picked.length ? picked : toSend;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveEmail = () => {
    const next = { ...settings, gestoriaEmail: emailDraft.trim() };
    saveBillingSettings(tenant.id, next);
    setSettings(next);
    toast.success("Email de la gestoría guardado");
  };

  const sendEmail = () => {
    if (target.length === 0) return;
    window.location.href = billingEmailUrl(tenant, target, settings.gestoriaEmail);
    markSent(tenant.id, target.filter((r) => !r.invoice.sentAt).map((r) => r.invoice.id));
    setSelected(new Set());
    setVersion((v) => v + 1);
    toast.success(
      target.length === 1
        ? "Email preparado. Lo marcamos como enviado a la gestoría."
        : `Email preparado con ${target.length} trabajos. Los marcamos como enviados.`,
    );
  };

  const download = () => {
    if (target.length === 0) return;
    const month = new Date().toISOString().slice(0, 7);
    downloadBillingCsv(tenant, target, `datos-facturar-${month}.csv`);
  };

  return (
    <div>
      <PageHeader
        title="Facturación"
        description="Los datos de cada trabajo, listos para que tu gestoría o tu programa hagan la factura."
      />

      {/* Why there are no invoices here */}
      <div className="mb-5 flex gap-3 rounded-xl border border-primary/30 bg-brand-soft p-4 text-sm">
        <Info strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-foreground">
          EasyTaller no emite facturas: desde 2027 los programas de facturación tienen que
          cumplir <span className="font-medium">Verifactu</span>, así que la factura la sigue
          haciendo tu gestoría o tu programa de siempre. Aquí tienes los datos de cada trabajo
          para enviárselos en un clic.
        </p>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Summary
          label="Por enviar a la gestoría"
          value={String(toSend.length)}
          hint={toSend.length ? money(toSend.reduce((s, r) => s + r.invoice.total, 0)) : "Todo enviado"}
          highlight={toSend.length > 0}
        />
        <Summary
          label="Enviados, sin factura aún"
          value={String(sent.length)}
          hint={sent.length ? "Apunta el nº de factura cuando te lo pasen" : "Nada pendiente"}
        />
        <Summary
          label="Sin cobrar"
          value={money(
            uncollected.reduce(
              (s, r) => s + r.invoice.total - (r.invoice.paidAmount ?? 0),
              0,
            ),
          )}
          hint={`${uncollected.length} ${uncollected.length === 1 ? "trabajo" : "trabajos"}`}
        />
      </div>

      {/* Gestoría + bulk actions */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="gestoria" className="text-sm text-muted-foreground">
              Email de tu gestoría
            </label>
            <div className="flex max-w-md gap-2">
              <Input
                id="gestoria"
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="facturas@tugestoria.es"
              />
              <Button
                variant="outline"
                onClick={saveEmail}
                disabled={emailDraft.trim() === (settings.gestoriaEmail ?? "")}
              >
                <Check strokeWidth={1.5} />
                Guardar
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={download} disabled={target.length === 0}>
              <Download strokeWidth={1.5} />
              Descargar Excel
              {target.length > 0 && ` (${target.length})`}
            </Button>
            <Button onClick={sendEmail} disabled={target.length === 0}>
              <Mail strokeWidth={1.5} />
              Enviar a la gestoría
              {target.length > 0 && ` (${target.length})`}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {picked.length
            ? `${picked.length} seleccionados.`
            : toSend.length
              ? "Sin seleccionar nada, se envían todos los que están por enviar."
              : "Marca los trabajos que quieras enviar o descargar."}
        </p>
      </div>

      {/* Filters + search */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">{count(f.value)}</span>
            </button>
          ))}
        </div>
        <div className="relative max-w-md">
          <Search
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, matrícula o referencia…"
            className="pl-9"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={rows.length === 0 ? "Aún no hay trabajos para facturar" : "Nada por aquí"}
          description={
            rows.length === 0
              ? "Cuando termines un trabajo, pulsa «Preparar datos para facturar» en la ficha del coche."
              : "No hay trabajos en este apartado."
          }
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => {
            const { invoice: inv, customer, vehicle } = row;
            const stage = billingStage(inv);
            const isPicked = selected.has(inv.id);
            return (
              <li
                key={inv.id}
                className={cn(
                  "flex gap-3 rounded-xl border bg-card p-4 transition-colors",
                  isPicked ? "border-primary" : "border-border",
                )}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  onChange={() => toggle(inv.id)}
                  aria-label={`Seleccionar ${inv.number}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-accent)]"
                />
                <Link
                  to="/app/facturacion/$id"
                  params={{ id: inv.id }}
                  className="group min-w-0 flex-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground group-hover:underline">
                        {customer?.name ?? "Cliente"}
                        {customer?.taxId && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {customer.taxId}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : "—"}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-lg font-bold tabular-nums text-foreground">
                      {money(inv.total)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2.5 py-0.5 font-medium", STAGE_STYLE[stage])}>
                      {BILLING_STAGE_LABELS[stage]}
                      {stage === "invoiced" && ` · ${inv.externalNumber}`}
                    </span>
                    <span>
                      {INVOICE_STATUS_LABELS[inv.status]}
                      {inv.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[inv.paymentMethod]}` : ""}
                    </span>
                    <span>· {formatDate(inv.createdAt)}</span>
                    <span className="font-mono">· {inv.number}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
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
